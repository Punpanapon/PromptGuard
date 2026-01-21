// PromptGuard - Dual Mode: Encrypt + Safe Send

// Thai ID Pattern
const THAI_ID_PATTERN = /\b\d{13}\b/g;

// Global state
let piiMapping = {};
let isAnimating = false;

// Matrix animation characters
const MATRIX_CHARS = ['@', '#', '0', '1', '&', '*', '%', '?'];

class PromptGuardDual {
  constructor() {
    this.init();
  }

  init() {
    this.loadSettings();
    this.startButtonWatcher();
    this.startResponseWatcher();
  }

  // Robust Storage with Context Invalidation Protection
  async loadSettings() {
    try {
      if (!chrome?.runtime?.id) {
        console.warn('PromptGuard: Extension context invalidated');
        return;
      }
      const result = await chrome.storage.local.get(['piiMapping']);
      piiMapping = result.piiMapping || {};
    } catch (error) {
      console.warn('PromptGuard: Storage error:', error);
      piiMapping = {};
    }
  }

  async savePIIMapping(mapping) {
    try {
      if (!chrome?.runtime?.id) {
        piiMapping = { ...piiMapping, ...mapping };
        return;
      }
      const existing = await chrome.storage.local.get(['piiMapping']);
      const combined = { ...existing.piiMapping, ...mapping };
      await chrome.storage.local.set({ piiMapping: combined });
      piiMapping = combined;
    } catch (error) {
      console.warn('PromptGuard: Storage save error:', error);
      piiMapping = { ...piiMapping, ...mapping };
    }
  }

  // MutationObserver for Button Injection
  startButtonWatcher() {
    const observer = new MutationObserver(() => {
      this.injectButtons();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Initial injection
    this.injectButtons();
  }

  injectButtons() {
    const textarea = document.querySelector('#prompt-textarea');
    if (!textarea || textarea.dataset.pgInjected) return;
    
    textarea.dataset.pgInjected = 'true';
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'pg-button-container';
    
    // Create Encrypt button (Visual Mode)
    const encryptBtn = document.createElement('button');
    encryptBtn.id = 'pg-encrypt-btn';
    encryptBtn.innerHTML = '🔒 Encrypt';
    encryptBtn.type = 'button';
    encryptBtn.addEventListener('click', (e) => {
      this.handleEncrypt(e);
    });
    
    // Create Safe Send button (Speed Mode)
    const safeSendBtn = document.createElement('button');
    safeSendBtn.id = 'pg-safe-send-btn';
    safeSendBtn.innerHTML = '🛡️ Safe Send';
    safeSendBtn.type = 'button';
    safeSendBtn.addEventListener('click', (e) => {
      this.handleSafeSend(e);
    });
    
    // Add buttons to container
    buttonContainer.appendChild(encryptBtn);
    buttonContainer.appendChild(safeSendBtn);
    
    // Insert container next to textarea
    textarea.parentNode.appendChild(buttonContainer);
  }

  // Feature 1: Encrypt Button (Visual Mode)
  handleEncrypt(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (isAnimating) return;
    
    const textarea = document.querySelector('#prompt-textarea');
    if (!textarea) return;
    
    const text = textarea.value || '';
    if (!text.trim()) return;
    
    // Find Thai PII
    const matches = text.match(THAI_ID_PATTERN);
    if (!matches || matches.length === 0) return;
    
    isAnimating = true;
    
    // Start scrambling animation
    this.scrambleAnimation(textarea, text, matches, () => {
      isAnimating = false;
    });
  }

  // Scrambling Animation (1.0 second)
  scrambleAnimation(textarea, originalText, piiMatches, callback) {
    let animationStep = 0;
    const maxSteps = 20; // 20 steps × 50ms = 1.0 second
    let currentText = originalText;
    
    const animate = () => {
      if (animationStep < maxSteps) {
        // Replace PII with random matrix characters
        let scrambledText = currentText;
        piiMatches.forEach(pii => {
          const randomChars = Array.from({ length: pii.length }, 
            () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
          ).join('');
          scrambledText = scrambledText.replace(pii, randomChars);
        });
        
        // Update textarea continuously
        this.nuclearReactSetter(textarea, scrambledText);
        
        animationStep++;
        setTimeout(animate, 50);
      } else {
        // Finalize: Replace with safe tokens
        const { maskedText, mapping } = this.maskPII(originalText);
        this.savePIIMapping(mapping);
        this.nuclearReactSetter(textarea, maskedText);
        callback();
      }
    };
    
    animate();
  }

  // Feature 2: Safe Send Button (Speed Mode)
  handleSafeSend(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    const textarea = document.querySelector('#prompt-textarea');
    const sendButton = document.querySelector('[data-testid="send-button"]');
    
    if (!textarea || !sendButton) return;
    
    const text = textarea.value || '';
    if (!text.trim()) {
      sendButton.click();
      return;
    }
    
    // Check for Thai ID PII
    const matches = text.match(THAI_ID_PATTERN);
    
    if (matches && matches.length > 0) {
      // Instantly mask PII (no animation)
      const { maskedText, mapping } = this.maskPII(text);
      this.savePIIMapping(mapping);
      
      // Use Nuclear React Value Setter
      this.nuclearReactSetter(textarea, maskedText);
      
      // Click send immediately
      setTimeout(() => {
        sendButton.click();
      }, 100);
    } else {
      // No PII - send immediately
      sendButton.click();
    }
  }

  // Nuclear React Value Setter - CRITICAL for React state
  nuclearReactSetter(element, text) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 
      'value'
    ).set;
    
    valueSetter.call(element, text);
    
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
  }

  maskPII(text) {
    let maskedText = text;
    const mapping = {};
    
    maskedText = maskedText.replace(THAI_ID_PATTERN, (match) => {
      const random = Math.random().toString(36).substr(2, 6);
      const token = `<ID_${random}>`;
      mapping[token] = match;
      return token;
    });
    
    return { maskedText, mapping };
  }

  // Feature 3: Response Unmasking
  startResponseWatcher() {
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
      subtree: true
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
    const tokenPattern = /<ID_[a-z0-9]+>/g;
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
        const randomChars = Array.from({ length: realValue.length }, 
          () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        ).join('');
        
        const animatedText = currentText.replace(token, randomChars);
        textNode.textContent = animatedText;
        
        animationStep++;
        setTimeout(animate, 50);
      } else {
        textNode.textContent = currentText.replace(token, realValue);
      }
    };

    animate();
  }
}

// Initialize PromptGuard Dual Mode
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PromptGuardDual());
} else {
  new PromptGuardDual();
}