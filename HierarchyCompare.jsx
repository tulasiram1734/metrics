import React, { useMemo, useState } from 'react';

/**
 * Replace the sample data/logic with your real values.
 * This component only changes structure/classes for alignment.
 */
export default function HierarchyCompare({
  // Optional props if you already compute these outside:
  bars: incomingBars,
  categories = ['Batteries', 'Filters', 'Brakes'],
  levels = ['L1 Family', 'L2 Category', 'L3 Sub-Category', 'L4 Segment', 'L5 SKU'],
}) {
  const [cat, setCat] = useState(categories[0]);
  const [lvl, setLvl] = useState(levels[0]);

  // Demo bars (replace with your invested amount / sales / turnover outputs)
  const demoBars = useMemo(() => ([
    { label: 'This Store', value: 66 },
    { label: 'Peer Avg',   value: 70 },
    { label: 'DC Avg',     value: 73 },
    { label: 'National',   value: 76 },
  ]), []);

  const bars = incomingBars?.length ? incomingBars : demoBars;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={lvl} onChange={(e) => setLvl(e.target.value)}>
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="hc-bars">
        {bars.map((b) => (
          <div key={b.label} className="hc-row">
            <span>{b.label}</span>
            <div
              className="bar"
              style={{
                height: 8,
                width: `${Math.max(0, Math.min(100, b.value))}%`,
                background: 'linear-gradient(90deg,#1ee3b3,#27b2ff)',
                borderRadius: 6
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
