import { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import { chatWithDocument } from '../api/scanApi.js';

// Configure marked for clean, deterministic HTML generation
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Builds contextual suggested questions tailored to the active tender document.
 */
function buildContextualSuggestions(doc) {
  if (!doc) return [];
  const fields = doc.tenderFields || {};
  const suggestions = [];

  const item = fields['Tab Name'] || fields['Item Category'] || '';
  if (item && item !== 'Not Found') {
    suggestions.push(`What equipment or tools are required?`);
  } else {
    suggestions.push('What equipment or tools are required?');
  }

  suggestions.push('What is the estimated bid value?');
  suggestions.push('What is the EMD (Earnest Money Deposit)?');
  suggestions.push('What are the opening and closing dates?');
  suggestions.push('What documents must the bidder submit?');
  suggestions.push('What are the technical qualification requirements?');
  suggestions.push('Where is the work / delivery location?');
  suggestions.push('Are there any corrigendum or amendment notices?');

  return suggestions;
}

export default function TenderChatDrawer({ document: doc, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeCitationPopover, setActiveCitationPopover] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const suggestions = useMemo(() => buildContextualSuggestions(doc), [doc]);

  // Document metadata helpers
  const docId = doc?.documentId || doc?.originalFileName || doc?.documentName;
  const docName = doc?.documentName || doc?.originalFileName || 'Tender Document';
  const tenderNo = doc?.tenderFields?.['Tender No'] || doc?.tenderFields?.['Tender ID'];
  const authority = doc?.tenderFields?.['Tender Authority'] || doc?.tenderFields?.['Purchaser Name'];
  const location = doc?.tenderFields?.['Location'];
  const tenderAmount = doc?.tenderFields?.['Tender Amount'];

  // Initialize or reset chat when document changes
  useEffect(() => {
    if (doc) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Welcome to **TenderIQ Copilot**. I have indexed the entire tender document for **${docName}**.\n\nAll answers are synthesized using **MongoDB Atlas Vector Search** and **Google Gemini**, with strict factual grounding and page-level source citations.\n\nSelect a suggested topic below or ask any specific question regarding equipment, commercial values, EMD, or bidder eligibility.`,
          citations: [],
          confidence: 'high',
        },
      ]);
      setError(null);
      setInputMessage('');
      setActiveCitationPopover(null);
    }
  }, [doc, docName]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen || !doc) return null;

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setError(null);
    setActiveCitationPopover(null);

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err.message || 'Failed to retrieve response from tender copilot.');
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

  const handleTextareaInput = (e) => {
    setInputMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const handleCopyAnswer = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Chat session reset. Ask any question about **${docName}**.`,
        citations: [],
        confidence: 'high',
      },
    ]);
    setError(null);
    setInputMessage('');
    setActiveCitationPopover(null);
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="enterprise-chat-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <header className="copilot-header">
          <div className="header-primary">
            <div className="brand-badge-row">
              <span className="brand-pill">
                <svg
                  className="spark-icon"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14" />
                </svg>
                TenderIQ Copilot
              </span>
              <span className="grounding-status-dot" title="Strict RAG grounding active">
                <span className="dot-pulse"></span>
                Grounded RAG
              </span>
            </div>

            <div className="header-actions">
              <button
                type="button"
                className="btn-header-action"
                onClick={handleResetChat}
                title="Reset conversation"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>Reset</span>
              </button>
              <button
                type="button"
                className="btn-drawer-close"
                onClick={onClose}
                aria-label="Close Chat Drawer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <div className="header-context-card">
            <h2 className="context-title" title={docName}>
              {docName}
            </h2>
            <div className="context-meta-row">
              {tenderNo && tenderNo !== 'Not Found' && (
                <span className="meta-tag">
                  <strong>ID:</strong> {tenderNo}
                </span>
              )}
              {authority && authority !== 'Not Found' && (
                <span className="meta-tag">
                  <strong>Authority:</strong> {authority}
                </span>
              )}
              {location && location !== 'Not Found' && (
                <span className="meta-tag">
                  <strong>Location:</strong> {location}
                </span>
              )}
              {tenderAmount && tenderAmount !== 'Not Found' && (
                <span className="meta-tag meta-tag-amount">
                  <strong>Amount:</strong> {tenderAmount}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Suggested Inquiries Carousel */}
        <nav className="copilot-suggestions-strip" aria-label="Suggested Questions">
          <span className="strip-label">Suggested:</span>
          <div className="strip-scroll-area">
            {suggestions.map((q, idx) => (
              <button
                key={`sugg-${idx}`}
                type="button"
                className="btn-suggestion-chip"
                onClick={() => handleSendMessage(q)}
                disabled={isLoading}
              >
                {q}
              </button>
            ))}
          </div>
        </nav>

        {/* Message Thread */}
        <main className="copilot-thread">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <article
                key={msg.id}
                className={`thread-row ${isUser ? 'row-user' : 'row-assistant'}`}
              >
                <div className="message-container">
                  {/* Assistant Meta Header */}
                  {!isUser && (
                    <div className="assistant-meta-header">
                      <div className="avatar-brand">
                        <span className="avatar-icon">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                          </svg>
                        </span>
                        <span className="author-name">TenderIQ Copilot</span>
                      </div>
                      {msg.confidence && msg.id !== 'welcome' && (
                        <span className={`confidence-pill pill-${msg.confidence}`}>
                          {msg.confidence === 'high' ? 'High Confidence' : msg.confidence}
                        </span>
                      )}
                      {msg.timestamp && <span className="timestamp">{msg.timestamp}</span>}
                    </div>
                  )}

                  {/* Body Text (Markdown or Plain User Query) */}
                  <div className="bubble-content">
                    {isUser ? (
                      <p className="user-text">{msg.content}</p>
                    ) : (
                      <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
                      />
                    )}
                  </div>

                  {/* Grounded Citations Shelf */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="citations-tray">
                      <div className="citations-tray-header">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <span>Evidence Passages Cited:</span>
                      </div>
                      <div className="citations-badges-row">
                        {msg.citations.map((cite, cIdx) => {
                          const popKey = `${msg.id}-${cIdx}`;
                          const isPopOpen = activeCitationPopover === popKey;
                          return (
                            <div key={popKey} className="citation-badge-wrapper">
                              <button
                                type="button"
                                className={`citation-pill-btn ${isPopOpen ? 'active' : ''}`}
                                onClick={() => setActiveCitationPopover(isPopOpen ? null : popKey)}
                                title="Click to view verbatim excerpt from document"
                              >
                                <span className="page-num">
                                  Page {cite.pageStart}
                                  {cite.pageEnd && cite.pageEnd !== cite.pageStart ? `–${cite.pageEnd}` : ''}
                                </span>
                              </button>

                              {isPopOpen && (
                                <div className="citation-popover">
                                  <div className="popover-header">
                                    <span className="popover-page">
                                      Document Page {cite.pageStart}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn-popover-close"
                                      onClick={() => setActiveCitationPopover(null)}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <blockquote className="popover-quote">
                                    &ldquo;{cite.quote}&rdquo;
                                  </blockquote>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Limitations or Caveats Banner */}
                  {!isUser && msg.limitations && msg.limitations.length > 0 && (
                    <div className="limitations-callout">
                      <div className="callout-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </div>
                      <div className="callout-text">
                        {msg.limitations.map((lim, lIdx) => (
                          <div key={`lim-${lIdx}`}>{lim}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assistant Footer Actions */}
                  {!isUser && msg.id !== 'welcome' && (
                    <div className="assistant-footer-bar">
                      <button
                        type="button"
                        className="btn-copy-answer"
                        onClick={() => handleCopyAnswer(msg.content, idx)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>{copiedIndex === idx ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="thread-row row-assistant row-loading">
              <div className="message-container">
                <div className="assistant-meta-header">
                  <div className="avatar-brand">
                    <span className="avatar-icon">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </span>
                    <span className="author-name">TenderIQ Copilot</span>
                  </div>
                </div>
                <div className="loading-shimmer-box">
                  <div className="pulse-bars">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-label">Searching vector embeddings &amp; synthesizing answer...</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="copilot-error-banner" role="alert">
              <span className="error-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              <span className="error-text">{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Bottom Input Area */}
        <footer className="copilot-input-dock">
          <form
            className="input-container"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              className="copilot-textarea"
              placeholder="Ask a question about equipment, eligibility, EMD, dates, or specifications..."
              value={inputMessage}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              aria-label="Tender Question Input"
            />
            <button
              type="submit"
              className="btn-send-message"
              disabled={isLoading || !inputMessage.trim()}
              aria-label="Send message"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </button>
          </form>
          <div className="copilot-footer-note">
            Grounded in active tender document &bull; Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for newline
          </div>
        </footer>
      </div>
    </div>
  );
}
