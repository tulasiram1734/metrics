import React, { useMemo, useState } from 'react';
import '../styles/HierarchyCompare.css';

export default function HierarchyCompare({ categories, levels, hierarchy, me }) {
  const [cat, setCat] = useState(categories[0]);
  const [lvl, setLvl] = useState(levels[0]);

  const rollup = useMemo(() => hierarchy[cat][lvl], [hierarchy, cat, lvl]);

  const Bar = ({ label, value }) => (
    <div className="hc-bar">
      <div className="hc-bar-header">
        <span>{label}</span>
        <b>{Math.round(value)}</b>
      </div>
      <div className="hc-bar-track">
        <div className="hc-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );

  return (
    <div className="hc-root">
      <div className="panel-title">Hierarchy Comparison</div>

      <div className="hc-controls">
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={lvl} onChange={(e) => setLvl(e.target.value)}>
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="hc-bars">
        <Bar label={`${me.name}`} value={rollup.store} />
        <Bar label="Peer Avg" value={rollup.peers} />
        <Bar label="DC Avg" value={rollup.dc} />
        <Bar label="National" value={rollup.national} />
      </div>
    </div>
  );
}
