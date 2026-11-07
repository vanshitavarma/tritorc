import { useState, useRef, useEffect } from 'react';
import { chatWithDocument } from '../api/scanApi.js';

const DEFAULT_SUGGESTIONS = [
  'What equipment or tools are required?',
  'What are the technical qualification criteria?',
  'What is the EMD and financial turnover requirement?',
  'Are there any corrigendum or amendment notices?',
  'What is the delivery timeline and warranty period?',
];

export default function TenderChatDrawer({ document: doc, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize or reset chat when document changes
  useEffect(() => {
    if (doc) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello! I am your AI Tender Intelligence Assistant for **${doc.documentName || doc.originalFileName || 'this tender'}**. Ask me anything about required equipment, eligibility criteria, EMD, financial turnover, or corrigendum changes. All answers are strictly grounded with source citations.`,
          citations: [],
        },
      ]);
      setError(null);
    }
  }, [doc]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen || !doc) return null;

  const docId = doc.documentId || doc.id || doc.documentName;

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    setInputMessage('');
    setError(null);

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await chatWithDocument(docId, {
        message: text,
        conversationHistory: history,
      });

      const assistantMsg = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.answer || 'Not found in the provided document.',
        citations: response.citations || [],
        confidence: response.confidence || 'high',
        limitations: response.limitations || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err.message || 'Failed to get answer from tender chatbot.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="chat-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="chat-drawer-header">
          <div className="chat-header-info">
            <span className="chat-eyebrow">🤖 RAG TENDER COPILOT</span>
            <h3 className="chat-title" title={doc.documentName}>
              {doc.documentName || doc.originalFileName}
            </h3>
            {doc.originalFileName && doc.originalFileName !== doc.documentName && (
              <span className="chat-filename-tag">📄 {doc.originalFileName}</span>
            )}
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} aria-label="Close Chat">
            ✕
          </button>
        </div>

        {/* Suggested Quick Questions */}
        <div className="chat-suggestions-bar">
          <span className="suggestions-label">Suggested:</span>
          <div className="suggestions-scroll">
            {DEFAULT_SUGGESTIONS.map((q, idx) => (
              <button
                key={`sugg-${idx}`}
                type="button"
                className="btn-suggestion-pill"
                onClick={() => handleSendMessage(q)}
                disabled={isLoading}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Feed */}
        <div className="chat-messages-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message message-${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '⚡'}
              </div>
              <div className="message-body">
                <div className="message-text">{msg.content}</div>

                {/* Grounded Citations & Evidence Jump Cards */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="message-citations">
                    <span className="citations-header">📚 Cited Evidence:</span>
                    <div className="citations-list">
                      {msg.citations.map((cite, cIdx) => (
                        <div key={`cite-${cIdx}`} className="citation-chip">
                          <span className="citation-page">
                            Page {cite.pageStart}{cite.pageEnd && cite.pageEnd !== cite.pageStart ? `-${cite.pageEnd}` : ''}
                          </span>
                          {cite.quote && (
                            <span className="citation-quote" title={cite.quote}>
                              &ldquo;{cite.quote}&rdquo;
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {msg.limitations && msg.limitations.length > 0 && (
                  <div className="message-limitations">
                    <span className="limitations-note">⚠️ Note: {msg.limitations.join('; ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="chat-message message-assistant message-loading">
              <div className="message-avatar">⚡</div>
              <div className="message-body">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="loading-caption">Retrieving grounded passages from tender chunks...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="chat-error-banner">
              ⚠️ {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="chat-input-bar">
          <input
            type="text"
            className="chat-input"
            placeholder="Ask a specific question about this tender..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            type="button"
            className="btn-chat-send"
            onClick={() => handleSendMessage()}
            disabled={isLoading || !inputMessage.trim()}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
