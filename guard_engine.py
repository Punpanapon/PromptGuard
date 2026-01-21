import re
from typing import Dict, Tuple
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_anonymizer import AnonymizerEngine

class PromptGuardian:
    def __init__(self):
        # Initialize Presidio engines
        self.analyzer = AnalyzerEngine()
        self.anonymizer = AnonymizerEngine()
        
        # Add custom Thai National ID recognizer
        thai_id_pattern = Pattern(name="thai_id_pattern", regex=r"\b\d{13}\b", score=0.9)
        thai_id_recognizer = PatternRecognizer(
            supported_entity="THAI_ID",
            patterns=[thai_id_pattern]
        )
        self.analyzer.registry.add_recognizer(thai_id_recognizer)
    
    def mask(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Mask PII in text and return safe text with mapping dictionary.
        
        The mapping dict is crucial for state management - it allows us to:
        1. Keep original values secure on server-side
        2. Restore PII after AI processing
        3. Maintain context across async operations
        """
        # Analyze text for PII entities
        results = self.analyzer.analyze(
            text=text,
            entities=["PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD", "THAI_ID"],
            language="en"
        )
        
        # Create mapping dictionary and anonymize
        pii_mapping = {}
        entity_counters = {}
        safe_text = text
        
        # Sort by start position (reverse) to avoid index shifting
        for result in sorted(results, key=lambda x: x.start, reverse=True):
            entity_type = result.entity_type
            original_value = text[result.start:result.end]
            
            # Generate unique placeholder
            counter = entity_counters.get(entity_type, 0) + 1
            entity_counters[entity_type] = counter
            placeholder = f"<{entity_type}_{counter}>"
            
            # Store mapping and replace in text
            pii_mapping[placeholder] = original_value
            safe_text = safe_text[:result.start] + placeholder + safe_text[result.end:]
        
        return safe_text, pii_mapping
    
    def unmask(self, safe_text: str, mapping_dict: Dict[str, str]) -> str:
        """
        Restore original PII values from mapping dictionary.
        
        Iterates through mapping to replace placeholders with real values.
        This separation ensures PII never leaves our secure boundary.
        """
        restored_text = safe_text
        
        for placeholder, original_value in mapping_dict.items():
            restored_text = restored_text.replace(placeholder, original_value)
        
        return restored_text