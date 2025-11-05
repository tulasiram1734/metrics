import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useSpring } from 'framer-motion';
import storeMetrics from '../data/mockMetricsPc';
import '../styles/PowerCard3D.css';

export default function PowerCard3D() {
  const [flipped, setFlipped] = useState(false);

  // --- Hover tilt (front face only)
  const tiltX = useSpring(0, { stiffness: 120, damping: 16 });
  const tiltY = useSpring(0, { stiffness: 120, damping: 16 });
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (flipped) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width - 0.5;
    const py = y / rect.height - 0.5;
    const max = 8;
    tiltX.set(py * -max);
    tiltY.set(px *  max);
  };
  const handleMouseLeave = () => { tiltX.set(0); tiltY.set(0); };

  // --- Count-up for Current Holding (no controls.subscribe)
  const [displayHolding, setDisplayHolding] = useState(
    storeMetrics.currentHolding.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  );
  useEffect(() => {
    const target = storeMetrics.currentHolding;
    let raf = 0;
    const dur = 1200, t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const v = target * p;
      setDisplayHolding(v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- ESC closes when flipped
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && flipped) setFlipped(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped]);

  // ---- Helper: the card rotor (front + back) ----
  const Rotor = ({ inOverlay }) => (
    <div className={`pc-rotor ${flipped ? 'flipped' : ''} ${inOverlay ? 'overlay-rotor' : ''}`}>
      {/* FRONT (unchanged visuals) */}
      <motion.div
        ref={cardRef}
        className="pc-face pc-front"
        role="presentation"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ transform: `perspective(900px) rotateX(${tiltX.get()}deg) rotateY(${tiltY.get()}deg)` }}
        onClick={() => setFlipped(true)}
      >
        <div className="pc-header">
          <img className="pc-badge" src="/assets/napa.png" alt="NAPA" />
          <h2 className="pc-title">{storeMetrics.title}</h2>
          <img className="pc-badge" src="/assets/gpc_logo.png" alt="GPC" />
        </div>

        <div className="pc-grid">
          <div className="pc-tile pc-chip blue">
            <span className="pc-chip_label">Good Bet</span>
            <span className="pc-chip_value">{storeMetrics.goodBet}</span>
          </div>

          <div className="pc-tile pc-chip green">
            <span className="pc-chip_label">Current Holding</span>
            <span className="pc-chip_value">${displayHolding}</span>
          </div>

          <div className="pc-tile pc-tile--indigo">
            <span className="pc-tile_label">Best Selling SKU</span>
            <span className="pc-tile_value">{storeMetrics.bestSelling}</span>
          </div>

          <div className="pc-tile pc-tile--warn">
            <span className="pc-tile_label">Weakest SKU</span>
            <span className="pc-tile_value">{storeMetrics.weakestSku}</span>
            <img className="pc-icon_warn" src="/assets/warning-icon.png" alt="" />
          </div>
        </div>

        <div className="pc-foot_hint">• Click for Details</div>
      </motion.div>

      {/* BACK — spacious, not cramped; close button */}
      <div className="pc-face pc-back" role="presentation" onClick={(e) => e.stopPropagation()}>
        <div className="pc-back__content">
          <div>
            <h3 className="pc-back__title">Details</h3>
            <ul className="pc-dot-list">
              <li className="pc-dot pc-dot--warn">
                <strong>Overstocked SKUs</strong> — {storeMetrics.details.overstocked} SKUs
              </li>
              <li className="pc-dot pc-dot--error">
                <strong>Out of Stock (PFS + Safety)</strong> — {storeMetrics.details.ooSHighPfs} SKUs
              </li>
              <li className="pc-dot pc-dot--ok">
                <strong>Store Sales Velocity</strong> — {storeMetrics.details.velocity}
              </li>
            </ul>
          </div>

          <div className="pc-back__chart">
            {/* Keep your existing radar component or image here if you had one */}
            <div className="pc-health_badge">Store Health • {storeMetrics.healthBadge}</div>
          </div>
        </div>

        <button className="pc-close" type="button" onClick={() => setFlipped(false)}>Close</button>
      </div>
    </div>
  );

  return (
    <>
      {/* Normal in-panel card */}
      {!flipped && (
        <div className="pc-wrapper">
          <Rotor inOverlay={false} />
        </div>
      )}

      {/* When flipped, render into a fixed overlay so it can grow OUTSIDE the panel without clipping */}
      <AnimatePresence>
        {flipped && (
          <>
            <motion.div
              className="pc-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.25 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setFlipped(false)}
            />
            <motion.div
              className="pc-overlay"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22 }}
            >
              <div className="pc-wrapper overlay">
                <Rotor inOverlay />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
