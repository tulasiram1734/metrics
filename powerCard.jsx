import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import '../styles/PowerCard3D.css';

// Props:
//   storeMetrics = {
//     goodBet: 'Filters',
//     currentHolding: '$574.17K',
//     bestSelling: 'Batteries',
//     weakestSku: 'Alternator',
//     replacementHint: '⚠️',
//     details: { overstocked: 12, oosHighPts: 3, velocity: 'OK' },
//     radar: { labels: ['Inventory Coverage','Duration Risk','Substitution Risk','Demand Hit','Sales Velocity'], values: [60,40,45,55,70] },
//     storeBadge: 'ATL-001'
//   }
export default function PowerCard3D({ storeMetrics = {} }) {
  const [flipped, setFlipped] = useState(false);

  // ----- tilt on hover (front only) -----
  const tiltX = useSpring(0, { stiffness: 120, damping: 16 });
  const tiltY = useSpring(0, { stiffness: 120, damping: 16 });

  const handleMouseMove = (e) => {
    if (flipped) return; // disable while expanded
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const px = cx / rect.width - 0.5;
    const py = cy / rect.height - 0.5;
    const maxTilt = 8;
    tiltX.set(py * -maxTilt);
    tiltY.set(px *  maxTilt);
  };
  const handleMouseLeave = () => {
    if (flipped) return;
    tiltX.set(0); tiltY.set(0);
  };

  // ----- scale-to-fit when flipped (no clipping) -----
  const wrapperRef = useRef(null); // panel-area wrapper
  const cardRef = useRef(null);    // the element we scale
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!flipped) { setScale(1); return; }
    const wrap = wrapperRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;

    const measure = () => {
      const w = wrap.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const pad = 24; // margin so shadows don’t clip
      const availW = Math.max(0, w.width  - pad * 2);
      const availH = Math.max(0, w.height - pad * 2);
      const baseW  = Math.max(c.width,  560);
      const baseH  = Math.max(c.height, 360);
      const s = Math.min(availW / baseW, availH / baseH, 1);
      setScale(Number.isFinite(s) ? s : 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [flipped]);

  // close on Escape while flipped
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFlipped(false); };
    if (flipped) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped]);

  // convenience safe getters
  const m = storeMetrics || {};
  const radarLabels = (m.radar && m.radar.labels) || [];
  const radarValues = (m.radar && m.radar.values) || [];

  return (
    <div ref={wrapperRef} className={`pc-wrapper ${flipped ? 'expanded' : ''}`}>
      <AnimatePresence>
        {flipped && (
          <motion.div
            className="pc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            exit={{ opacity: 0 }}
            onClick={() => setFlipped(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={cardRef}
        className={`pc-inner ${flipped ? 'is-flipped' : ''}`}
        style={{
          rotateX: flipped ? 0 : tiltX,
          rotateY: flipped ? 0 : tiltY,
          '--pc-scale': flipped ? scale : 1
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
      >
        {/* FRONT FACE (unchanged styling hooks) */}
        <div className="pc-face pc-front" role="presentation" onClick={() => setFlipped(true)}>
          <div className="pc-head">
            <img className="pc-brand" src="/assets/napa.png" alt="NAPA" />
            <h2 className="pc-title">Store Power Card</h2>
            <img className="pc-brand" src="/assets/gpc_logo.png" alt="GPC" />
          </div>

          <div className="pc-chiprow">
            <div className="pc-chip">
              <span className="pc-chip_label">Good Bet</span>
              <span className="pc-chip_value">{m.goodBet || '—'}</span>
            </div>
            <div className="pc-chip pc-chip--green">
              <span className="pc-chip_label">Current Holding</span>
              <span className="pc-chip_value">{m.currentHolding || '$0'}</span>
            </div>
          </div>

          <div className="pc-tiles">
            <div className="pc-tile pc-tile--orange">
              <span className="pc-title_label">Best Selling SKU</span>
              <span className="pc-title_value">{m.bestSelling || '—'}</span>
            </div>
            <div className="pc-tile pc-tile--indigo">
              <span className="pc-title_label">Weakest SKU</span>
              <span className="pc-title_value">
                {m.weakestSku || '—'}
                <img className="pc-warn" src="/assets/warning-icon.png" alt="" />
              </span>
              <small className="pc-replace">{m.replacementHint || ''}</small>
            </div>
          </div>

          <div className="pc-footnote">• Click for Details</div>
        </div>

        {/* BACK FACE (unchanged layout hooks; just ensure it fits) */}
        <div className="pc-face pc-back" role="presentation" onClick={(e) => e.stopPropagation()}>
          <div className="pc-back-content">
            <h3 className="pc-back_h">Details</h3>
            <ul className="pc-detail_list">
              <li><span className="pc-dot pc-dot--warn" /> Overstocked SKUs <strong>{m.details?.overstocked ?? 0}</strong></li>
              <li><span className="pc-dot pc-dot--error" /> Out of Stock (PTS & Safety) <strong>{m.details?.oosHighPts ?? 0}</strong></li>
              <li><span className="pc-dot pc-dot--ok" /> Store Sales Velocity <strong>{m.details?.velocity || '—'}</strong></li>
            </ul>

            {/* simple inline radar placeholder (keep your existing RadarPanel if you have it) */}
            <div className="pc-radar">
              <div className="pc-radar_title">Store Health</div>
              <div className="pc-radar_grid">
                {radarLabels.map((lbl, i) => (
                  <div key={lbl} className="pc-radar_row">
                    <span className="pc-radar_lbl">{lbl}</span>
                    <div className="pc-radar_bar">
                      <div className="pc-radar_fill" style={{ width: `${Math.max(0, Math.min(100, radarValues[i] || 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="pc-badge">
                <span className="pc-badge_label">Store</span>
                <span className="pc-badge_value">{m.storeBadge || ''}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
