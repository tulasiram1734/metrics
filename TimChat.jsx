import React, { useState } from 'react';
import './TimChat.css';

export default function TimChat({ storeId }) {
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: `Hi, I’m Tim 🤖 — Pulse AI. Ask me about ${storeId}, peers, or DC rollups.` }
  ]);
  const [text, setText] = useState('');

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const q = text.trim();
    setMsgs(m => [...m, { role: 'user', text: q }]);
    setText('');

    // Mocked reply (replace later with your real backend)
    setTimeout(() => {
      const mock = q.toLowerCase().includes('health')
        ? 'Store health is 66. Peer avg 70, DC avg 73, National 76.'
        : 'I can answer health, inventory coverage, velocity, and returns. Try: "What is my L1 Batteries score vs DC?"';
      setMsgs(m => [...m, { role: 'ai', text: mock }]);
    }, 350);
  };

  return (
    <div className="panel panel--chat">
      <div className="chat-header">PulseAI — Tim</div>
      <div className="chat-body">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="bubble">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ask Tim about this store…"
        />
        <button type="submit">Ask</button>
      </form>
    </div>
  );
}
