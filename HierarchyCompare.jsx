import React, { useMemo, useState } from "react";
import "./HierarchyCompare.css";

function Bar({ label, value }) {
  return (
    <div className="hc-row">
      <div className="hc-label">{label}</div>
      <div className="hc-bar">
        <div className="hc-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }}>
          <span className="hc-val">{Math.round(value)}</span>
        </div>
      </div>
    </div>
  );
}

export default function HierarchyCompare({ categories, levels, hierarchy }) {
  const [cat, setCat] = useState(categories?.[0] ?? "Batteries");
  const [lvl, setLvl] = useState(levels?.[1] ?? "L2 Category");

  const data = useMemo(() => hierarchy?.[cat]?.[lvl] ?? { store: 0, peers: 0, dc: 0, national: 0 }, [cat, lvl, hierarchy]);

  return (
    <div className="hc-card">
      <div className="hc-head">
        <div className="hc-title">Hierarchy Comparison</div>
        <div className="hc-pickers">
          <select value={cat} onChange={e => setCat(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={lvl} onChange={e => setLvl(e.target.value)}>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="hc-body">
        <Bar label="This Store" value={data.store}/>
        <Bar label="Peer Avg"  value={data.peers}/>
        <Bar label="DC Avg"    value={data.dc}/>
        <Bar label="National"  value={data.national}/>
      </div>

      <div className="hc-note">Scores are normalized 0–100. Pick any category and hierarchy level to compare.</div>
    </div>
  );
}
