import re
from typing import Dict, Tuple
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_anonymizer import AnonymizerEngine

class PIIManager:
    def __init__(self):
        self.analyzer = AnalyzerEngine()
        self.anonymizer = AnonymizerEngine()
        
        # Custom Thai National ID recognizer
        thai_id_pattern = Pattern(name="thai_id", regex=r"\b\d{13}\b", score=0.9)
        thai_id_recognizer = PatternRecognizer(
            supported_entity="THAI_ID",
            patterns=[thai_id_pattern]
        )
        
        # Custom Crypto Wallet recognizer (Bitcoin/Ethereum patterns)
        crypto_patterns = [
            Pattern(name="btc_wallet", regex=r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b", score=0.8),
            Pattern(name="eth_wallet", regex=r"\b0x[a-fA-F0-9]{40}\b", score=0.8)
        ]
        crypto_recognizer = PatternRecognizer(
            supported_entity="CRYPTO_WALLET",
            patterns=crypto_patterns
        )
        
        # Register custom recognizers
        self.analyzer.registry.add_recognizer(thai_id_recognizer)
        self.analyzer.registry.add_recognizer(crypto_recognizer)
    
    def mask(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Mask PII in text and return sanitized text with mapping dictionary.
        
        Returns:
            Tuple of (safe_text, mapping_dict) where mapping_dict contains
            {token: original_value} for restoration after AI processing.
        """
        # Analyze for PII entities
        results = self.analyzer.analyze(
            text=text,
            entities=["PHONE_NUMBER", "EMAIL_ADDRESS", "CRYPTO_WALLET", "THAI_ID"],
            language="en"
        )
        
        # Create token mapping and sanitize text
        mapping_dict = {}
        entity_counters = {}
        safe_text = text
        
        # Process results in reverse order to maintain string indices
        for result in sorted(results, key=lambda x: x.start, reverse=True):
            entity_type = result.entity_type
            original_value = text[result.start:result.end]
            
            # Generate unique token
            counter = entity_counters.get(entity_type, 0) + 1
            entity_counters[entity_type] = counter
            token = f"<{entity_type}_{counter}>"
            
            # Store mapping and replace in text
            mapping_dict[token] = original_value
            safe_text = safe_text[:result.start] + token + safe_text[result.end:]
        
        return safe_text, mapping_dict
    
    def unmask(self, text: str, mapping_dict: Dict[str, str]) -> str:
        """
        Replace all tokens in AI response with original PII values.
        
        Ensures robust replacement of ALL occurrences of each token.
        """
        unmasked_text = text
        
        for token, original_value in mapping_dict.items():
            # Replace ALL occurrences of the token
            unmasked_text = unmasked_text.replace(token, original_value)
        
        return unmasked_text