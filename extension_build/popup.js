// PII Detection Patterns - Critical for hackathon judges to understand
const PATTERNS = {
  // Standard email pattern: matches user@domain.com format
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Credit card pattern: 13-16 digits with optional spaces/dashes
  creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
  
  // Thai ID pattern: exactly 13 consecutive digits
  thaiId: /\b\d{13}\b/g,
  
  // Phone pattern: Thai format 0XX-XXX-XXXX with optional dashes
  phone: /\b0\d{2}[-]?\d{3}[-]?\d{4}\b/g
};

// Generate unique token for each PII type
function generateToken(type) {
  const uuid = Math.random().toString(36).substr(2, 9);
  return `<TOKEN_${type.toUpperCase()}_${uuid}>`;
}

// Main masking function
async function maskPII(text) {
  const tokenMap = {};
  let maskedText = text;

  // Process each PII pattern
  for (const [type, pattern] of Object.entries(PATTERNS)) {
    maskedText = maskedText.replace(pattern, (match) => {
      const token = generateToken(type);
      tokenMap[token] = match; // Store original value
      return token;
    });
  }

  // Save token mapping to storage
  if (Object.keys(tokenMap).length > 0) {
    await chrome.storage.local.set(tokenMap);
  }

  return maskedText;
}

// Inject masked text into active element on page
async function injectText(maskedText) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (text) => {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT' || activeElement.contentEditable === 'true')) {
        if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
          activeElement.value = text;
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          activeElement.textContent = text;
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    },
    args: [maskedText]
  });
}

// Show status message
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${isError ? 'error' : 'success'}`;
}

// Main event handler
document.addEventListener('DOMContentLoaded', () => {
  const inputText = document.getElementById('input-text');
  const maskBtn = document.getElementById('mask-btn');

  maskBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    
    if (!text) {
      showStatus('Please enter text to mask', true);
      return;
    }

    try {
      const maskedText = await maskPII(text);
      await injectText(maskedText);
      
      // Check if any PII was found
      const hasPII = maskedText !== text;
      showStatus(hasPII ? 'Secure! PII masked and injected' : 'No PII detected - text injected');
      
      // Clear input after successful injection
      inputText.value = '';
    } catch (error) {
      showStatus('Error: ' + error.message, true);
    }
  });
});