(function () {
  if (window.__PROMPTGUARD_LOADED__) {
    return;
  }
  window.__PROMPTGUARD_LOADED__ = true;

  const host = window.location.hostname;
  const isChatGptHost =
    host === 'chatgpt.com' ||
    host.endsWith('.chatgpt.com') ||
    host === 'chat.openai.com' ||
    host.endsWith('.openai.com');
  if (!isChatGptHost) {
    return;
  }

  const PATTERNS = {
    THAI_ID: /\b\d{13}\b/g,
    MOBILE: /\b0[689]\d{1}[-\s]?\d{3}[-\s]?\d{4}\b/g
  };

  const MATRIX_CHARS = ['@', '#', '0', '1', '&', '*', '%', '?'];

  const APP_STATE = {
    protect: true,
    decode: true
  };

  const TOKEN_PATTERN = /<(THAI_ID|MOBILE)(?:_\d+)?>/g;

  let isAnimating = false;
  let responseObserver = null;

  const getInputElement = () =>
    document.querySelector('#prompt-textarea') ||
    document.querySelector('div[contenteditable="true"][data-testid="prompt-textarea"]') ||
    document.querySelector('div[contenteditable="true"][id*="prompt"]');

  const getHiddenTextarea = () =>
    document.querySelector('textarea[aria-label="Message ChatGPT"]') ||
    document.querySelector('textarea[data-id="prompt-textarea"]') ||
    document.querySelector('textarea[placeholder*="Message"]');

  const getText = (element) => {
    if (!element) return '';
    if (element.tagName === 'TEXTAREA') return element.value || '';
    if (element.contentEditable === 'true') return element.innerText || '';
    return '';
  };

  const setNativeValue = (element, value) => {
    if (!element) return;
    const proto = element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
  };

  const syncTextareaValue = (value) => {
    const hidden = getHiddenTextarea();
    if (!hidden) return;
    setNativeValue(hidden, value);
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const setText = (element, value) => {
    if (!element) return;
    if (element.tagName === 'TEXTAREA') {
      setNativeValue(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (element.contentEditable === 'true') {
      element.focus();
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        if (document.queryCommandSupported?.('insertText')) {
          document.execCommand('insertText', false, value);
        } else {
          element.textContent = value;
        }
      } catch (error) {
        element.textContent = value;
      }
      element.textContent = value;
      element.innerText = value;
      try {
        element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertReplacementText', data: value }));
      } catch (error) {
        // ignore
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      syncTextareaValue(value);
    }
  };

  const forceApplyText = (element, value) => {
    setText(element, value);
    const delays = [0, 50, 100, 200, 400, 700, 1000];
    delays.forEach((delay) => {
      setTimeout(() => setText(element, value), delay);
    });
  };

  const buildMask = (text) => {
    let maskedText = text;
    const mapping = {};
    let idCounter = 0;
    let mobileCounter = 0;

    maskedText = maskedText.replace(PATTERNS.THAI_ID, (match) => {
      idCounter += 1;
      const suffix = idCounter === 1 ? '' : `_${idCounter}`;
      const token = `<THAI_ID${suffix}>`;
      mapping[token] = match;
      return token;
    });

    maskedText = maskedText.replace(PATTERNS.MOBILE, (match) => {
      mobileCounter += 1;
      const suffix = mobileCounter === 1 ? '' : `_${mobileCounter}`;
      const token = `<MOBILE${suffix}>`;
      mapping[token] = match;
      return token;
    });

    return { maskedText, mapping };
  };

  const saveMapping = async (mapping) => {
    try {
      if (!chrome?.storage?.local) return;
      const existing = await chrome.storage.local.get(['piiMapping']);
      const combined = { ...existing.piiMapping, ...mapping };
      await chrome.storage.local.set({ piiMapping: combined });
    } catch (error) {
      console.warn('PromptGuard: storage error', error);
    }
  };

  const loadMapping = async () => {
    try {
      if (!chrome?.storage?.local) return {};
      const result = await chrome.storage.local.get(['piiMapping']);
      return result.piiMapping || {};
    } catch (error) {
      console.warn('PromptGuard: load error', error);
      return {};
    }
  };

  const scrambleText = (original, matches) => {
    let scrambled = original;
    matches.forEach((pii) => {
      const randomChars = Array.from({ length: pii.length },
        () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
      ).join('');
      scrambled = scrambled.replace(pii, randomChars);
    });
    return scrambled;
  };

  const handleEncrypt = async () => {
    if (isAnimating || !APP_STATE.protect) return;
    const input = getInputElement();
    if (!input) return;
    const text = getText(input);
    if (!text.trim()) return;

    const hasId = PATTERNS.THAI_ID.test(text);
    const hasMobile = PATTERNS.MOBILE.test(text);
    PATTERNS.THAI_ID.lastIndex = 0;
    PATTERNS.MOBILE.lastIndex = 0;
    if (!hasId && !hasMobile) return;

    const { maskedText, mapping } = buildMask(text);
    await saveMapping(mapping);

    isAnimating = true;
    const wasContentEditable = input.getAttribute('contenteditable');
    if (wasContentEditable === 'true') {
      input.setAttribute('contenteditable', 'false');
    }
    const intervalId = setInterval(() => {
      const matches = (text.match(PATTERNS.THAI_ID) || []).concat(text.match(PATTERNS.MOBILE) || []);
      setText(input, scrambleText(text, matches));
    }, 50);

    setTimeout(() => {
      clearInterval(intervalId);
      if (wasContentEditable === 'true') {
        input.setAttribute('contenteditable', 'true');
      }
      forceApplyText(input, maskedText);
      isAnimating = false;
    }, 1000);
  };

  const handleSafeSend = async () => {
    if (!APP_STATE.protect) return;
    const input = getInputElement();
    if (!input) return;
    const text = getText(input);
    if (!text.trim()) return;

    const { maskedText, mapping } = buildMask(text);
    if (Object.keys(mapping).length > 0) {
      await saveMapping(mapping);
      forceApplyText(input, maskedText);
    }

    const sendButton = document.querySelector('[data-testid="send-button"]');
    if (sendButton) sendButton.click();
  };

  const injectButtons = () => {
    const input = getInputElement();
    if (!input || input.dataset.pgInjected) return;
    input.dataset.pgInjected = 'true';

    const container = document.createElement('div');
    container.id = 'pg-button-container';

    const encryptBtn = document.createElement('button');
    encryptBtn.id = 'pg-encrypt-btn';
    encryptBtn.type = 'button';
    encryptBtn.textContent = '🔒 Encrypt';
    encryptBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleEncrypt();
    });

    const safeSendBtn = document.createElement('button');
    safeSendBtn.id = 'pg-safe-send-btn';
    safeSendBtn.type = 'button';
    safeSendBtn.textContent = '🛡️ Safe Send';
    safeSendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSafeSend();
    });

    container.appendChild(encryptBtn);
    container.appendChild(safeSendBtn);
    input.parentNode.appendChild(container);
  };

  const decodeTextNode = async (textNode) => {
    if (!APP_STATE.decode) return;
    const text = textNode.textContent || '';
    const tokens = text.match(TOKEN_PATTERN);
    if (!tokens || tokens.length === 0) return;

    const mapping = await loadMapping();
    let updated = text;
    tokens.forEach((token) => {
      if (mapping[token]) {
        updated = updated.replaceAll(token, mapping[token]);
      }
    });

    if (updated !== text) {
      textNode.textContent = updated;
    }
  };

  const processElement = (element) => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      decodeTextNode(node);
    }
  };

  const startDecoder = () => {
    if (responseObserver) return;
    responseObserver = new MutationObserver((mutations) => {
      if (!APP_STATE.decode) return;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            decodeTextNode(node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            processElement(node);
          }
        });
      });
    });

    responseObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  const stopDecoder = () => {
    if (responseObserver) {
      responseObserver.disconnect();
      responseObserver = null;
    }
  };

  const runDecodeScan = () => {
    if (!APP_STATE.decode) return;
    processElement(document.body);
  };

  const injectControlPanel = () => {
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
        startDecoder();
        runDecodeScan();
      } else {
        stopDecoder();
      }
    });
  };

  const startUiWatcher = () => {
    const observer = new MutationObserver(() => {
      injectButtons();
      injectControlPanel();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtons();
    injectControlPanel();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startUiWatcher();
      startDecoder();
      runDecodeScan();
    });
  } else {
    startUiWatcher();
    startDecoder();
    runDecodeScan();
  }
})();