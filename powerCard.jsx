import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import RadarPanel from './RadarPanel';
import storeMetrics from '../data/mockMetrics';
import '../styles/PowerCard3D.css';

const PowerCard3D = () => {
  const [flipped, setFlipped] = useState(false);

  // Hover tilt (front face only)
  const tiltx = useSpring(useMotionValue(0), { stiffness: 120, damping: 16 });
  const tilty = useSpring(useMotionValue(0), { stiffness: 120, damping: 16 });

  const handleMouseMove = (e) => {
    if (flipped) return; // disable tilt when expanded/back is visible
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    const maxTilt = 6;
    tiltx.set(((y - midY) / midY) * -maxTilt);
    tilty.set(((x - midX) / midX) * maxTilt);
  };

  const handleMouseLeave = () => {
    tiltx.set(0);
    tilty.set(0);
  };

  // Count-up animation for Current Holding
  const parseHoldingToNumber = (str) => {
    if (!str) return 0;
    const cleaned = String(str).replace(/[$,]/g, '').trim();
    const base = parseFloat(cleaned.replace(/[kK]/, '')) || 0;
    return cleaned.toLowerCase().includes('k') ? base * 1000 : base;
  };

  const targetHolding = useMotionValue(parseHoldingToNumber(storeMetrics.currentHolding));
  const [displayHolding, setDisplayHolding] = useState(storeMetrics.currentHolding);

  useEffect(() => {
    const animateCount = () => {
      const value = targetHolding.get();
      setDisplayHolding(
        `$${value.toLocaleString(undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })}`
      );
    };
    const unsubscribe = targetHolding.on('change', animateCount);
    return () => unsubscribe();
  }, [targetHolding]);

  // ✅ Prevent page scroll when flipped
  useEffect(() => {
    document.body.classList.toggle('no-scroll', flipped);
    return () => document.body.classList.remove('no-scroll');
  }, [flipped]);

  return (
    <>
      {/* ✅ Dim overlay when flipped */}
      {flipped && <div className="pc-overlay" onClick={() => setFlipped(false)} />}

      <motion.div
        className={`pc-wrapper ${flipped ? 'flipped is-expanded' : ''}`}
        style={{
          rotateX: tiltx,
          rotateY: tilty,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => setFlipped((v) => !v)}
      >
        {/* FRONT FACE */}
        <div className="pc-face pc-front">
          <div className="pc-header">
            <img className="pc-header_logo" src="/assets/napa.png" alt="NAPA" />
            <h2 className="pc-title">Store Power Card</h2>
            <img className="pc-header_logo" src="/assets/gpc_logo.png" alt="GPC" />
          </div>

          <div className="pc-grid">
            <div className="pc-tile blue">
              <span className="pc-tile_label">Good Bet</span>
              <span className="pc-tile_value">{storeMetrics.goodBet}</span>
            </div>

            <div className="pc-tile green">
              <span className="pc-tile_label">Current Holding</span>
              <span className="pc-tile_value">{displayHolding}</span>
            </div>

            <div className="pc-tile red">
              <span className="pc-tile_label">Best Selling SKU</span>
              <span className="pc-tile_value">{storeMetrics.bestSellingSku}</span>
            </div>

            <div className="pc-tile purple">
              <span className="pc-tile_label">Weakest SKU</span>
              <span className="pc-tile_value">{storeMetrics.weakestSku}</span>
            </div>
          </div>

          <div className="pc-footer">* Click for Details</div>
        </div>

        {/* BACK FACE */}
        <div className="pc-face pc-back" onClick={(e) => e.stopPropagation()}>
          <h3 className="pc-back_title">Store Insights</h3>
          <ul className="pc-back_list">
            <li>
              <strong>Overstocked SKUs:</strong> {storeMetrics.details.overstocked}
            </li>
            <li>
              <strong>Out of Stock SKUs:</strong> {storeMetrics.details.oosHighPts}
            </li>
            <li>
              <strong>Sales Velocity:</strong> {storeMetrics.details.velocity}
            </li>
          </ul>
          <div className="pc-back_radar">
            <RadarPanel labels={storeMetrics.radar.labels} values={storeMetrics.radar.values} />
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default PowerCard3D;
