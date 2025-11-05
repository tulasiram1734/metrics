import React, { useState } from 'react';

export default function TimChat() {
  const [q, setQ] = useState('');

  const askTim = () => {
    // TODO: wire up to your backend/LLM call
    if (!q.trim()) return;
    console.log('[TimChat] Ask:', q);
    setQ('');
  };

  return (
    <>
      <div className="ai-header">
        <span>PulseAI — Tim</span>
      </div>

      <div className="ai-intro">
        Hi, I’m Tim 🤖 — Pulse AI. Ask me about this store, its peers, or DC rollups.
      </div>

      <div className="ai-input-row">
        <input
          className="ai-input"
          placeholder="Ask Tim about this store…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' ? askTim() : null}
        />
        <button className="ai-ask-btn" onClick={askTim}>Ask</button>
      </div>
    </>
  );
}
