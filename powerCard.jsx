import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, animate } from 'framer-motion';
import '../styles/PowerCard3D.css';
import { storeMetrics } from '../data/mockMetricsPC';
import RadarPanel from './RadarPanel';

const PowerCard3D = () => {
  const [flipped, setFlipped] = useState(false);

  // Hover tilt (front face only)
  const tiltX = useSpring(0, { stiffness: 120, damping: 16 });
  const tiltY = useSpring(0, { stiffness: 120, damping: 16 });

  const handleMouseMove = (e) => {
    if (flipped) return; // disable tilt when expanded/back is visible
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width - 0.5;
    const py = y / rect.height - 0.5;
    const maxTilt = 8; // degrees
    tiltX.set(-py * maxTilt);
    tiltY.set(px * maxTilt);
  };
  const handleMouseLeave = () => { tiltX.set(0); tiltY.set(0); };

  // Count-up animation for Current Holding
  const parseHoldingToNumber = (str) => {
    if (!str) return 0;
    const cleaned = String(str).replace(/\$/g, '').trim();
    const isK = /k$/i.test(cleaned);
    const base = parseFloat(cleaned.replace(/k/i, '')) || 0;
    return isK ? base * 1000 : base;
  };

  const targetHolding = useMemo(() => parseHoldingToNumber(storeMetrics.currentHolding), []);
  const count = useMotionValue(0);
  const [displayHolding, setDisplayHolding] = useState(storeMetrics.currentHolding);

  useEffect(() => {
    const controls = animate(count, targetHolding, { duration: 1.2, ease: 'easeOut' });
    const unsubscribe = count.on('change', (v) => {
      const val = Number(v);
      const kVal = val / 1000; // display as K
      setDisplayHolding(
        `$${kVal.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}K`
      );
    });
    return () => { controls.stop(); unsubscribe(); };
  }, [count, targetHolding]);

  // Escape to close when expanded
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && flipped) setFlipped(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped]);

  return (
    <>
      {/* Dim overlay when expanded */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            className="pc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setFlipped(false)}
          />
        )}
      </AnimatePresence>

      <div className={`pc-wrapper ${flipped ? 'expanded' : ''}`}>
        {/* OUTER: layout expansion only (no rotate here) */}
        <motion.div
          className="pc-outer"
          layout
          transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={() => setFlipped((v) => !v)}
        >
          {/* INNER: flip only (no layout here) */}
          <div className={`pc-rotator ${flipped ? 'flipped' : ''}`}>
            {/* FRONT FACE */}
            <div
              className="pc-face pc-front"
              role="presentation"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ transform: `rotateY(${tiltY.get()}deg) rotateX(${tiltX.get()}deg)` }}
            >
              <div className="pc-header">
                <img className="pc-badge" src="/assets/napa.png" alt="NAPA" />
                <h2 className="pc-title">{storeMetrics.title}</h2>
                <img className="pc-badge" src="/assets/gpc_logo.png" alt="GPC" />
              </div>

              <div className="pc-hero">
                <div className="pc-chip pc-chip--blue">
                  <span className="pc-chip__label">Good Bet</span>
                  <span className="pc-chip__value">{storeMetrics.goodBet}</span>
                </div>

                <img className="pc-hero-tire" src="/assets/tire.png" alt="Tire" />

                <div className="pc-chip pc-chip--emerald">
                  <span className="pc-chip__label">Current Holding</span>
                  <span className="pc-chip__value">{displayHolding}</span>
                </div>
              </div>

              <div className="pc-row">
                <div className="pc-tile pc-tile--copper">
                  <span className="pc-tile__label">Best Selling SKU</span>
                  <span className="pc-tile__value">{storeMetrics.bestSelling}</span>
                </div>

                <div className="pc-tile pc-tile--indigo">
                  <div className="pc-tile__label-wrap">
                    <span className="pc-tile__label">Weakest SKU</span>
                    <span className="pc-tile__hint">{storeMetrics.replacementHint}</span>
                  </div>
                  <span className="pc-tile__value">{storeMetrics.weakestSku}</span>
                  <div className="pc-warning">
                    <img src="/assets/warning-icon.png" alt="!" />
                  </div>
                </div>
              </div>

              <div className="pc-foot-hint">▸ Click for Details</div>
            </div>

            {/* BACK FACE */}
            <div className="pc-face pc-back" role="presentation" onClick={(e) => e.stopPropagation()}>
              <div className="pc-back-left">
                <h3 className="pc-section-title">Details</h3>
                <ul className="pc-detail-list">
                  <li>
                    <span className="pc-dot pc-dot--warn" /> Overstocked SKUs
                    <strong> {storeMetrics.details.overstocked} SKUs</strong>
                  </li>
                  <li>
                    <span className="pc-dot pc-dot--error" /> Out of Stock (PTS • Safety)
                    <strong> {storeMetrics.details.oosHighPts} SKUs</strong>
                  </li>
                  <li>
                    <span className="pc-dot pc-dot--ok" /> Store Sales Velocity
                    <strong> {storeMetrics.details.velocity}</strong>
                  </li>
                </ul>
              </div>

              <div className="pc-back-right">
                <div onClick={(e) => e.stopPropagation()}>
                  <RadarPanel labels={storeMetrics.radar.labels} values={storeMetrics.radar.values} />
                </div>
                <div className="pc-health">
                  <span className="pc-health__label">Store Health</span>
                  <span className="pc-health__badge">ATL-001</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default PowerCard3D;
