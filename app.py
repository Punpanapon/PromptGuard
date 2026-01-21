import streamlit as st
import requests
import json

# Page config
st.set_page_config(
    page_title="PromptGuard Enterprise",
    page_icon="🛡️",
    layout="wide"
)

# Backend URL - Make sure your server.py is running on this port!
BACKEND_URL = "http://127.0.0.1:8000"

# Sidebar
with st.sidebar:
    st.title("🛡️ PromptGuard Enterprise")
    st.markdown("---")
    
    # Safety toggle
    enable_guard = st.toggle("🛡️ Activate Safety Layer", value=True)
    
    if enable_guard:
        st.success("✅ PII Protection ACTIVE")
        st.caption("Your sensitive data is being masked before AI processing")
    else:
        st.warning("⚠️ PII Protection DISABLED")
        st.caption("Raw data will be sent directly to AI")
    
    st.markdown("---")
    
    # Debug expander
    with st.expander("🔍 Behind the Scenes", expanded=False):
        st.caption("This section shows the internal processing steps for transparency")
        if "last_response" in st.session_state:
            response = st.session_state.last_response
            
            st.subheader("Original Input:")
            st.code(response.get("original", "N/A"), language="text")
            
            st.subheader("Masked Prompt (sent to AI):")
            st.code(response.get("masked_prompt", "N/A"), language="text")
            
            st.subheader("Raw AI Response:")
            st.code(response.get("ai_raw_response", "N/A"), language="text")
            
            st.subheader("Final Response (unmasked):")
            st.code(response.get("final_response", "N/A"), language="text")

# Main chat interface
st.title("💬 Secure AI Chat")
st.caption("Enterprise-grade AI with automatic PII protection")

# Initialize chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat input
if prompt := st.chat_input("Enter your message (try including sensitive data like: My ID is 1234567890123)"):
    # Add user message to chat history
    st.session_state.messages.append({"role": "user", "content": prompt})
    
    # Display user message
    with st.chat_message("user"):
        st.markdown(prompt)
    
    # Call backend API
    with st.chat_message("assistant"):
        with st.spinner("Processing with PromptGuard..."):
            try:
                response = requests.post(
                    f"{BACKEND_URL}/chat",
                    json={
                        "message": prompt,
                        "enable_guard": enable_guard
                    },
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    final_response = data["final_response"]
                    
                    # Store for debug view
                    st.session_state.last_response = data
                    
                    # Display AI response
                    st.markdown(final_response)
                    
                    # Add to chat history
                    st.session_state.messages.append({
                        "role": "assistant", 
                        "content": final_response
                    })
                    
                    # Show protection status (toast notification)
                    if enable_guard and data["masked_prompt"] != data["original"]:
                        st.toast("🛡️ PII Detected & Masked!", icon="✅")
                    
                else:
                    st.error(f"Backend error: {response.status_code}")
                    st.code(response.text)
                    
            except requests.exceptions.ConnectionError:
                st.error("❌ Cannot connect to backend.")
                st.caption("Make sure you ran: `uvicorn server:app --reload` in a separate terminal.")
            except Exception as e:
                st.error(f"❌ Error: {str(e)}")