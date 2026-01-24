# 🛡️ PromptGuard: Zero-Trust AI Privacy Gateway

**PromptGuard** is a secure Chrome Extension designed to enable enterprises to use public AI tools (like ChatGPT) without violating privacy laws (PDPA/GDPR). It intercepts sensitive data *before* it leaves the browser, masks it with secure tokens, and automatically decodes the AI's response in real-time.

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![Privacy](https://img.shields.io/badge/privacy-Client--Side%20Only-green) ![Hackathon](https://img.shields.io/badge/Demo-Hackathon%20Ready-orange)

## 🚨 The Problem
Employees want to use AI for productivity, but pasting customer data (e.g., National IDs, Credit Cards) into public chatbots creates a massive data leak risk and violates privacy compliance regulations.

## ✅ The Solution
**PromptGuard** acts as a "Client-Side Firewall" living inside the browser.
1.  **Intercepts** sensitive patterns (Thai National IDs, Mobile Numbers) in real-time.
2.  **Masks** them with random tokens (e.g., `<ID_882>`) *before* sending to AI.
3.  **Restores** the real data automatically when the AI responds.
4.  **Zero-Trust:** The real data never leaves the user's laptop. The AI provider only ever sees the token.

---

## ✨ Key Features

### 🇹🇭 Localized for Thai Enterprise
* **Thai National ID Detection:** Custom Regex (`\b\d{13}\b`) specifically tuned for 13-digit Thai IDs.
* **Mobile Number Protection:** Handles standard Thai mobile formats (08x-xxx-xxxx).

### 🎛️ Dual-Mode Interface
We inject native controls directly into the ChatGPT interface:
* **🛡️ Safe Send (Green Button):** One-click speed mode. Instantly masks PII and sends the prompt to AI.
* **🔒 Encrypt (Blue Button):** Visual verification mode. Runs a "Matrix-style" glitch animation to scramble data before your eyes, allowing manual review before sending.

### 🔄 Auto-Unmasking (The "Matrix" Effect)
* When the AI replies using the token (e.g., "I checked <ID_882>..."), PromptGuard detects it and reveals the original data instantly.

---

## 🚀 Installation Guide

Since this is a specialized enterprise tool, it is installed via **Developer Mode**:

1.  **Download/Clone** this repository to your computer.
    ```bash
    git clone [https://github.com/Punpanapon/PromptGuard.git](https://github.com/Punpanapon/PromptGuard.git)
    ```
2.  Open Google Chrome and navigate to:
    `chrome://extensions/`
3.  Toggle **Developer mode** (top right corner).
4.  Click **Load unpacked**.
5.  Select the `PromptGuard_Extension` folder (ensure it contains `manifest.json`).
6.  **Refresh your ChatGPT tab.** You should see the PromptGuard buttons appear!

---

## 🎮 How to Demo (For Judges)

**Scenario:** You are a bank officer checking a customer's risk profile.

1.  **Open ChatGPT** (Ensure the page is refreshed).
2.  **Type sensitive data:**
    > "Please check the credit score for customer Somchai, ID 1100123456789."
3.  **Method A: Visual Demo (The "Wow" Factor)**
    * Click the **Blue 🔒 Encrypt** button.
    * *Watch the ID glitch and scramble into a token.*
    * Then click the normal Send button.
4.  **Method B: Speed Demo**
    * Click the **Green 🛡️ Safe Send** button.
    * *The message is masked and sent instantly.*
5.  **The Result:**
    * Inspect the chat history: You will see `<ID_...>` was sent to OpenAI.
    * Look at the AI response: It will automatically display the real ID `1100123456789`.

---

## 🛠️ Tech Stack

* **Frontend:** JavaScript (ES6+), HTML5, CSS3.
* **Engine:** Chrome Extension Manifest V3.
* **Security:** LocalStorage Vault (Client-Side Only).
* **React Integration:** Uses Prototype Injection (`Object.getOwnPropertyDescriptor`) to bypass React's Virtual DOM defenses for seamless input manipulation.

---

## 🔒 Privacy & Security

* **No External Servers:** This extension does NOT connect to any backend server.
* **Local Vault:** All mapping data (Token <-> Real ID) is stored in `chrome.storage.local` within your browser.
* **Ephemeral:** Clearing your browser cache wipes the vault.

---
