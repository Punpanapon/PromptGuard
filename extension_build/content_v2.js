// PromptGuard - Control Panel + Dual Mode (Rich Text Supported)
if (window.__PROMPTGUARD_LOADED__) {
  console.warn('PromptGuard: content script already loaded');
} else {
  window.__PROMPTGUARD_LOADED__ = true;

  const PATTERNS = {
    THAI_ID: /\b\d{13}\b/g,
    MOBILE: /\b0[689]\d{1}[-\s]?\d{3}[-\s]?\d{4}\b/g,
    NAME_WITH_TITLE: /\b(Mr\.|Ms\.|Mrs\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    NAME_PAIR: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g
  };
  const MATRIX_CHARS = ['@', '#', '0', '1', '&', '*', '%', '?'];

  const APP_STATE = {
    protect: true,
    decode: true
  };

  let piiMapping = {};
  let isAnimating = false;

  class PromptGuardDual {
    constructor() {
      this.responseObserver = null;
      this.init();
    }

    init() {
      this.loadSettings().then(() => {
        this.bindSendGuards();
        this.startButtonWatcher();
        this.injectControlPanel();
        if (APP_STATE.decode) {
          this.startResponseWatcher();
          this.runDecodeScan();
        }
      });
    }

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

    getText(element) {
      if (!element) return '';
      if (element.tagName === 'TEXTAREA') return element.value || '';
      if (element.contentEditable === 'true') return element.innerText || '';
      return '';
    }

    setText(element, newText) {
      if (!element) return;
      if (element.tagName === 'TEXTAREA') {
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        ).set;
        valueSetter.call(element, newText);
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
        return;
      }

      if (element.contentEditable === 'true') {
        element.focus();
        element.innerText = newText;
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
      }
    }

    bindSendGuards() {
      document.addEventListener('keydown', (event) => {
        if (!isAnimating) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);

      document.addEventListener('click', (event) => {
        if (!isAnimating) return;
        const sendButton = event.target?.closest?.('[data-testid="send-button"]');
        if (sendButton) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }

    startButtonWatcher() {
      const observer = new MutationObserver(() => {
        this.injectButtons();
        this.injectControlPanel();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.injectButtons();
      this.injectControlPanel();
    }

    injectControlPanel() {
      if (document.getElementById('pg-shield-icon')) return;

      const shield = document.createElement('div');
      shield.id = 'pg-shield-icon';
      shield.textContent = '🛡️';

      const menu = document.createElement('div');
      menu.id = 'pg-settings-menu';

      menu.innerHTML = `
        <div class="pg-setting-row">
          <span class="pg-setting-label">Mask Input</span>
          <label class="pg-switch">
            <input id="pg-toggle-protect" type="checkbox" ${APP_STATE.protect ? 'checked' : ''} />
            <span class="pg-slider"></span>
          </label>
        </div>
        <div class="pg-setting-row">
          <span class="pg-setting-label">Decode Response</span>
          <label class="pg-switch">
            <input id="pg-toggle-decode" type="checkbox" ${APP_STATE.decode ? 'checked' : ''} />
            <span class="pg-slider"></span>
          </label>
        </div>
      `;

      shield.addEventListener('click', () => {
        menu.classList.toggle('pg-open');
      });

      document.body.appendChild(shield);
      document.body.appendChild(menu);

      const protectToggle = menu.querySelector('#pg-toggle-protect');
      const decodeToggle = menu.querySelector('#pg-toggle-decode');

      protectToggle.addEventListener('change', (e) => {
        APP_STATE.protect = e.target.checked;
      });

      decodeToggle.addEventListener('change', (e) => {
        APP_STATE.decode = e.target.checked;
        if (APP_STATE.decode) {
          this.startResponseWatcher();
          this.runDecodeScan();
        } else {
          this.stopResponseWatcher();
        }
      });
    }

    injectButtons() {
      const inputBox = document.querySelector('#prompt-textarea');
      if (!inputBox || inputBox.dataset.pgInjected) return;

      inputBox.dataset.pgInjected = 'true';

      const buttonContainer = document.createElement('div');
      buttonContainer.id = 'pg-button-container';

      const encryptBtn = document.createElement('button');
      encryptBtn.id = 'pg-encrypt-btn';
      encryptBtn.innerHTML = '🔒 Encrypt';
      encryptBtn.type = 'button';
      encryptBtn.addEventListener('click', (e) => this.handleEncrypt(e));

      const safeSendBtn = document.createElement('button');
      safeSendBtn.id = 'pg-safe-send-btn';
      safeSendBtn.innerHTML = '🛡️ Safe Send';
      safeSendBtn.type = 'button';
      safeSendBtn.addEventListener('click', (e) => this.handleSafeSend(e));

      buttonContainer.appendChild(encryptBtn);
      buttonContainer.appendChild(safeSendBtn);

      inputBox.parentNode.appendChild(buttonContainer);
    }

    handleEncrypt(event) {
      event.preventDefault();
      event.stopPropagation();

      if (isAnimating) return;

      const inputBox = document.querySelector('#prompt-textarea');
      if (!inputBox) return;

      const text = this.getText(inputBox);
      if (!text.trim()) return;

      if (!APP_STATE.protect) {
        return;
      }

      const matches = this.findPiiMatches(text);
      if (!matches || matches.length === 0) return;

      isAnimating = true;
      const sendButton = document.querySelector('[data-testid="send-button"]');
      if (sendButton) sendButton.setAttribute('disabled', 'true');
      this.scrambleAnimation(inputBox, text, matches, () => {
        isAnimating = false;
        if (sendButton) sendButton.removeAttribute('disabled');
      });
    }

    scrambleAnimation(inputBox, originalText, piiMatches, callback) {
      let animationStep = 0;
      const maxSteps = 20;

      const animate = () => {
        if (animationStep < maxSteps) {
          let scrambledText = originalText;
          piiMatches.forEach((pii) => {
            const randomChars = Array.from({ length: pii.length },
              () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
            ).join('');
            scrambledText = scrambledText.replace(pii, randomChars);
          });

          this.setText(inputBox, scrambledText);
          animationStep++;
          setTimeout(animate, 50);
        } else {
          const { maskedText, mapping } = this.maskSensitiveData(originalText);
          this.savePIIMapping(mapping);
          this.setText(inputBox, maskedText);
          if (APP_STATE.decode) {
            this.runDecodeScan();
          }
          callback();
        }
      };

      animate();
    }

    handleSafeSend(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const inputBox = document.querySelector('#prompt-textarea');
      const sendButton = document.querySelector('[data-testid="send-button"]');

      if (!inputBox || !sendButton) return;

      const text = this.getText(inputBox);
      if (!text.trim()) {
        sendButton.click();
        return;
      }

      if (!APP_STATE.protect) {
        sendButton.click();
        return;
      }

      const matches = this.findPiiMatches(text);

      if (matches && matches.length > 0) {
        const { maskedText, mapping } = this.maskSensitiveData(text);
        this.savePIIMapping(mapping);
        this.setText(inputBox, maskedText);
        if (APP_STATE.decode) {
          this.runDecodeScan();
        }
        setTimeout(() => sendButton.click(), 100);
      } else {
        sendButton.click();
      }
    }

    findPiiMatches(text) {
      const matches = [];
      const idMatches = text.match(PATTERNS.THAI_ID) || [];
      const mobileMatches = text.match(PATTERNS.MOBILE) || [];
      const titledNames = text.match(PATTERNS.NAME_WITH_TITLE) || [];
      const namePairs = text.match(PATTERNS.NAME_PAIR) || [];
      matches.push(...idMatches, ...mobileMatches, ...titledNames, ...namePairs);
      return matches;
    }

    maskSensitiveData(text) {
      let maskedText = text;
      const mapping = {};
      const counters = {
        THAI_ID: 0,
        MOBILE: 0,
        NAME: 0
      };

      const replaceWithToken = (match, label, key) => {
        counters[key] += 1;
        const suffix = counters[key] === 1 ? '' : `_${counters[key]}`;
        const token = `<${label}${suffix}>`;
        mapping[token] = match;
        return token;
      };

      maskedText = maskedText.replace(PATTERNS.THAI_ID, (match) => replaceWithToken(match, 'Thai_ID', 'THAI_ID'));
      maskedText = maskedText.replace(PATTERNS.MOBILE, (match) => replaceWithToken(match, 'Phone_Number', 'MOBILE'));
      maskedText = maskedText.replace(PATTERNS.NAME_WITH_TITLE, (match) => replaceWithToken(match, 'Name', 'NAME'));
      maskedText = maskedText.replace(PATTERNS.NAME_PAIR, (match) => replaceWithToken(match, 'Name', 'NAME'));

      return { maskedText, mapping };
    }

    startResponseWatcher() {
      if (this.responseObserver) return;

      this.responseObserver = new MutationObserver((mutations) => {
        if (!APP_STATE.decode) return;
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

      this.responseObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    stopResponseWatcher() {
      if (this.responseObserver) {
        this.responseObserver.disconnect();
        this.responseObserver = null;
      }
    }

    runDecodeScan() {
      if (!APP_STATE.decode) return;
      this.processElement(document.body);
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
      if (!APP_STATE.decode) return;
      const text = textNode.textContent;
      const tokenPattern = /<(Thai_ID|Phone_Number|Name)(?:_\d+)?>/g;
      const tokens = text.match(tokenPattern);

      if (tokens && Object.keys(piiMapping).length > 0) {
        tokens.forEach((token) => {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PromptGuardDual());
  } else {
    new PromptGuardDual();
  }
}