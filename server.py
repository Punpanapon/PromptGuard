import os
from typing import Dict, Tuple
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_anonymizer import AnonymizerEngine

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(title="PromptGuard Enterprise Gateway")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Presidio
analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

# Add custom Thai ID recognizer
thai_id_pattern = Pattern(name="thai_id", regex=r"\b\d{13}\b", score=0.9)
thai_id_recognizer = PatternRecognizer(
    supported_entity="THAI_ID",
    patterns=[thai_id_pattern]
)
analyzer.registry.add_recognizer(thai_id_recognizer)

# Initialize Google Gemini
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in environment")
genai.configure(api_key=api_key)

class ChatRequest(BaseModel):
    message: str
    enable_guard: bool = True

class ChatResponse(BaseModel):
    original: str
    masked_prompt: str
    ai_raw_response: str
    final_response: str

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Main chat endpoint with PII protection."""
    try:
        original_message = request.message
        
        # Step 1: Check if guard is disabled
        if not request.enable_guard:
            ai_response = await call_gemini(original_message)
            return ChatResponse(
                original=original_message,
                masked_prompt=original_message,
                ai_raw_response=ai_response,
                final_response=ai_response
            )
        
        # Step 2: Mask PII
        masked_prompt, pii_mapping = mask_pii(original_message)
        
        # Step 3: Send to Gemini
        ai_raw_response = await call_gemini(masked_prompt)
        
        # Step 4: Unmask response
        final_response = unmask_pii(ai_raw_response, pii_mapping)
        
        return ChatResponse(
            original=original_message,
            masked_prompt=masked_prompt,
            ai_raw_response=ai_raw_response,
            final_response=final_response
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def mask_pii(text: str) -> Tuple[str, Dict[str, str]]:
    """Mask PII and return mapping for restoration."""
    results = analyzer.analyze(
        text=text,
        entities=["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "THAI_ID"],
        language="en"
    )
    
    pii_mapping = {}
    entity_counters = {}
    masked_text = text
    
    # Process in reverse order to maintain indices
    for result in sorted(results, key=lambda x: x.start, reverse=True):
        entity_type = result.entity_type
        original_value = text[result.start:result.end]
        
        # Generate placeholder
        counter = entity_counters.get(entity_type, 0) + 1
        entity_counters[entity_type] = counter
        placeholder = f"<{entity_type}_{counter}>"
        
        # Store mapping and replace
        pii_mapping[placeholder] = original_value
        masked_text = masked_text[:result.start] + placeholder + masked_text[result.end:]
    
    return masked_text, pii_mapping

def unmask_pii(text: str, mapping: Dict[str, str]) -> str:
    """Restore original PII from mapping."""
    unmasked_text = text
    for placeholder, original_value in mapping.items():
        unmasked_text = unmasked_text.replace(placeholder, original_value)
    return unmasked_text

async def call_gemini(prompt: str) -> str:
    """Call Google Gemini API."""
    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)