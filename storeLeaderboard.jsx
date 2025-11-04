import React from "react";
import "./StoreLeaderboard.css";

function medal(i) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
}

export default function StoreLeaderboard({ ranked = [], me }) {
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="lb-card">
      <div className="lb-title">Store Leaderboard</div>

      <div className="lb-podium">
        {top3.map((s, i) => (
          <div key={s.store_id} className={`lb-step step-${i + 1} ${me?.store_id === s.store_id ? "is-me" : ""}`}>
            <div className="lb-medal">{medal(i)}</div>
            <div className="lb-name" title={s.name}>{s.name}</div>
            <div className="lb-health">{Math.round(s.health)}</div>
          </div>
        ))}
      </div>

      <div className="lb-list">
        {rest.map((s, i) => (
          <div key={s.store_id} className={`lb-row ${me?.store_id === s.store_id ? "is-me" : ""}`}>
            <span className="lb-rank">{i + 4}</span>
            <span className="lb-row-name" title={s.name}>{s.name}</span>
            <span className="lb-chip">{s.division}</span>
            <span className="lb-chip">{s.dc_id}</span>
            <span className="lb-score">{Math.round(s.health)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
