import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, animate } from 'framer-motion';
import '../styles/PowerCard3D.css';
import RadarPanel from './RadarPanel';

const PowerCard3D = ({ storeMetrics }) => {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef(null);

  // Hover tilt (front-only)
  const tiltX = useSpring(0, { stiffness: 120, damping: 16 });
  const tiltY = useSpring(0, { stiffness: 120, damping: 16 });

  const handleMouseMove = (e) => {
    if (flipped) return; // do NOT tilt when back is visible
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const px = (cx / rect.width) - 0.5;
    const py = (cy / rect.height) - 0.5;
    const maxTilt = 6;
    tiltX.set(py * maxTilt * -1);
    tiltY.set(px * maxTilt);
  };
  const handleMouseLeave = () => { tiltX.set(0); tiltY.set(0); };

  // Current holding counter (unchanged behavior)
  const parseMoney = (str) => {
    if (!str) return 0;
    const cleaned = String(str).replace(/[\$,]/g, '').trim();
    const n = parseFloat(cleaned || '0');
    return isNaN(n) ? 0 : n;
  };
  const targetHolding = useRef(parseMoney(storeMetrics?.currentHolding));
  const [displayHolding, setDisplayHolding] = useState(storeMetrics?.currentHolding || '$0');

  useEffect(() => {
    const to = Math.max(0, targetHolding.current);
    const controls = animate(0, to, { duration: 1.2, ease: 'easeOut' });
    const unsub = controls.stop; // keep reference
    controls.subscribe((v) => {
      setDisplayHolding(
        v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
      );
    });
    return () => { unsub?.(); };
  }, []);

  // Close on ESC when expanded
  useEffect(() => {
    const onKey = (e) => { if (flipped && e.key === 'Escape') setFlipped(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped]);

  // Lock body scroll when flipped
  useEffect(() => {
    if (flipped) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [flipped]);

  return (
    <div className="pc-slot"> {/* clamps size to the left panel */}
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
        className={`pc-wrapper ${flipped ? 'expanded' : ''}`}
        style={{
          rotateX: tiltX,
          rotateY: tiltY,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => { e.stopPropagation(); setFlipped(true); }}
      >
        {/* FRONT */}
        <div className="pc-face pc-front" role="presentation">
          <div className="pc-head">
            <img className="pc-brand" src="/assets/napa.png" alt="NAPA" />
            <span className="pc-title">Store Power Card</span>
            <img className="pc-brand-right" src="/assets/gpc_logo.png" alt="GPC" />
          </div>

          <div className="pc-grid">
            <div className="pc-chip pc-blue">
              <span className="pc-chip_label">Good Bet</span>
              <span className="pc-chip_val">{storeMetrics?.goodBet || '--'}</span>
            </div>

            <div className="pc-chip pc-green">
              <span className="pc-chip_label">Current Holding</span>
              <span className="pc-chip_val">${displayHolding}</span>
            </div>

            <div className="pc-chip pc-purple">
              <span className="pc-chip_label">Best Selling SKU</span>
              <span className="pc-chip_val">{storeMetrics?.bestSelling || '--'}</span>
            </div>

            <div className="pc-chip pc-indigo">
              <span className="pc-chip_label">Weakest SKU</span>
              <span className="pc-chip_val">{storeMetrics?.weakestSku || '--'}</span>
            </div>
          </div>

          <div className="pc-foot">* Click for Details</div>
        </div>

        {/* BACK – keep same size, scrollable if needed */}
        <div className="pc-face pc-back" role="presentation" onClick={(e) => e.stopPropagation()}>
          <h3 className="pc-back_title">Details</h3>
          <ul className="pc-back_list">
            <li><span className="pc-dot pc-dot--warn" /> Overstocked SKUs</li>
            <li><span className="pc-dot pc-dot--error" /> Out of Stock (PFS & Safety) SKUs</li>
            <li><span className="pc-dot pc-dot--ok" /> Store Sales Velocity</li>
          </ul>

          <div className="pc-back_chart">
            <span className="pc-health_label">Store Health</span>
            <span className="pc-health_badge">{storeMetrics?.store_id || ''}</span>
            <RadarPanel label="Health" values={storeMetrics?.radar?.values || [20,20,20,20,20]} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PowerCard3D;
