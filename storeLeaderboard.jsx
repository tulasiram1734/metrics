import React from 'react';
import '../styles/StoreLeaderboard.css';

export default function StoreLeaderboard({ ranked, me }) {
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const chip = (text) => <span className="chip">{text}</span>;

  return (
    <div className="sl-root">
      <div className="panel-title">Store Leaderboard</div>

      <div className="sl-top3">
        {top3.map((r, i) => (
          <div key={r.store_id} className={`sl-card ${i === 0 ? 'is-gold' : i === 1 ? 'is-silver' : 'is-bronze'}`}>
            <div className="sl-rank">{i + 1}</div>
            <div className="sl-name">{r.name}</div>
            <div className="sl-health">{Math.round(r.health)}</div>
          </div>
        ))}
      </div>

      <div className="sl-list">
        {rest.map((r, idx) => (
          <div key={r.store_id} className={`sl-row ${r.store_id === me.store_id ? 'is-me' : ''}`}>
            <div className="sl-row-rank">{idx + 4}</div>
            <div className="sl-row-name">
              {r.name}
              <div className="sl-sub">
                {chip(r.division)} {chip(r.dc_id)}
              </div>
            </div>
            <div className="sl-row-health">{Math.round(r.health)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
