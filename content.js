// ChatGPT-Specific PII Interceptor

// PII Detection Patterns
const THAI_ID_PATTERN = /\b\d{13}\b/g;
const PHONE_PATTERN = /0\d{2}[-]?\d{3}[-]?\d{4}/g;

// Global state
let piiMapping = {};
let isProcessing = false;

// Matrix animation characters
const MATRIX_CHARS = ['#', '?', 'x', '9', '@', '*', '%', '&'];

class ChatGPTPIIInterceptor {
  constructor() {
    this.init();
  }

  init() {
    this.setupChatGPTListener();
    this.startResponseWatcher();
    this.loadStoredMappings();
  }

  setupChatGPTListener() {
    // Capture phase listener to intercept BEFORE ChatGPT
    document.addEventListener('keydown', (e) => {
      this.chatGPTKeyHandler(e);
    }, { capture: true });
  }

  chatGPTKeyHandler(event) {
    // Only process Enter key (not Shift+Enter)
    if (event.key !== 'Enter' || event.shiftKey || isProcessing) {
      return;
    }

    const target = event.target;
    
    // Target ChatGPT's prompt textarea specifically
    if (!target.matches('#prompt-textarea')) {
      return;
    }

    // Kill ChatGPT's event immediately
    event.preventDefault();
    event.stopImmediatePropagation();
    
    // Get text from ChatGPT's input
    const text = target.innerText || '';
    if (!text.trim()) {
      // No text - let it pass through
      this.reDispatchEnter(target);
      return;
    }

    // Check for PII (Thai ID or Phone)
    const thaiIdMatches = text.match(THAI_ID_PATTERN);
    const phoneMatches = text.match(PHONE_PATTERN);
    
    if ((thaiIdMatches && thaiIdMatches.length > 0) || (phoneMatches && phoneMatches.length > 0)) {
      // PII FOUND - Intercept and mask!
      isProcessing = true;
      
      // Mask PII and store mapping
      const { maskedText, mapping } = this.maskPII(text);
      this.storePIIMapping(mapping);
      
      // The Swap: Replace content
      target.innerText = maskedText;
      
      // React Sync: Tell ChatGPT the text changed
      const inputEvent = new Event('input', { bubbles: true });
      target.dispatchEvent(inputEvent);
      
      // Auto-send after delay
      setTimeout(() => {
        this.chatGPTAutoSend();
        isProcessing = false;
      }, 100);
    } else {
      // No PII - let the event pass through normally
      this.reDispatchEnter(target);
    }
  }

  reDispatchEnter(target) {
    // Re-dispatch Enter event without our interceptor
    isProcessing = true;
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(enterEvent);
    setTimeout(() => { isProcessing = false; }, 100);
  }

  maskPII(text) {
    let maskedText = text;
    const mapping = {};
    let idCounter = 0;
    let phoneCounter = 0;

    // Replace Thai IDs with tokens
    maskedText = maskedText.replace(THAI_ID_PATTERN, (match) => {
      idCounter++;
      const token = `<ID_${idCounter}>`;
      mapping[token] = match;
      return token;
    });

    // Replace Phone numbers with tokens
    maskedText = maskedText.replace(PHONE_PATTERN, (match) => {
      phoneCounter++;
      const token = `<PHONE_${phoneCounter}>`;
      mapping[token] = match;
      return token;
    });

    return { maskedText, mapping };
  }

  async storePIIMapping(mapping) {
    try {
      if (!chrome?.storage?.local) {
        console.warn('Chrome storage not available');
        return;
      }
      
      const existing = await chrome.storage.local.get(['piiMapping']);
      const combined = { ...existing.piiMapping, ...mapping };
      await chrome.storage.local.set({ piiMapping: combined });
      piiMapping = combined;
    } catch (error) {
      console.warn('Storage error:', error);
      piiMapping = { ...piiMapping, ...mapping };
    }
  }

  async loadStoredMappings() {
    try {
      if (!chrome?.storage?.local) {
        return;
      }
      
      const result = await chrome.storage.local.get(['piiMapping']);
      piiMapping = result.piiMapping || {};
    } catch (error) {
      console.warn('Load storage error:', error);
      piiMapping = {};
    }
  }

  chatGPTAutoSend() {
    // ChatGPT's specific send button
    const sendButton = document.querySelector('button[data-testid="send-button"]');
    
    if (sendButton) {
      sendButton.click();
    }
  }

  startResponseWatcher() {
    // Watch for AI responses and animate token replacement
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            this.processTextNode(node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            this.processElement(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  processElement(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      this.processTextNode(node);
    }
  }

  processTextNode(textNode) {
    const text = textNode.textContent;
    const tokenPattern = /<(ID|PHONE)_\d+>/g;
    const tokens = text.match(tokenPattern);

    if (tokens && Object.keys(piiMapping).length > 0) {
      tokens.forEach(token => {
        if (piiMapping[token]) {
          this.animateUnmask(textNode, token, piiMapping[token]);
        }
      });
    }
  }

  animateUnmask(textNode, token, realValue) {
    let currentText = textNode.textContent;
    let animationStep = 0;
    const maxSteps = 10;
    
    const animate = () => {
      if (animationStep < maxSteps) {
        // Generate random characters for matrix effect
        const randomChars = Array.from({ length: realValue.length }, 
          () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        ).join('');
        
        // Replace token with random characters
        const animatedText = currentText.replace(token, randomChars);
        textNode.textContent = animatedText;
        
        animationStep++;
        setTimeout(animate, 50);
      } else {
        // Final reveal - replace with real PII
        textNode.textContent = currentText.replace(token, realValue);
      }
    };

    animate();
  }
}

// Initialize ChatGPT PII Interceptor
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ChatGPTPIIInterceptor());
} else {
  new ChatGPTPIIInterceptor();
}