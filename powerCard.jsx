import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useSpring, animate } from "framer-motion";
import "../styles/PowerCard3D.css";
import RadarPanel from "./RadarPanel";

const PowerCard3D = ({ storeMetrics }) => {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef(null);

  // hover tilt (front only)
  const tiltX = useSpring(0, { stiffness: 120, damping: 16 });
  const tiltY = useSpring(0, { stiffness: 120, damping: 16 });

  const handleMouseMove = (e) => {
    if (flipped) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const px = (cx / rect.width) - 0.5;
    const py = (cy / rect.height) - 0.5;
    const maxTilt = 6;
    tiltX.set(py * -maxTilt);
    tiltY.set(px * maxTilt);
  };

  const handleMouseLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  // animated number for Current Holding
  const parseMoney = (str) => {
    if (!str) return 0;
    const cleaned = String(str).replace(/[\$,]/g, "").trim();
    const n = parseFloat(cleaned || "0");
    return isNaN(n) ? 0 : n;
  };

  const targetHolding = useRef(parseMoney(storeMetrics?.currentHolding));
  const [displayHolding, setDisplayHolding] = useState(
    storeMetrics?.currentHolding || "$0"
  );

  useEffect(() => {
    const to = Math.max(0, targetHolding.current);
    const controls = animate(0, to, { duration: 1.2, ease: "easeOut" });
    controls.subscribe((v) => {
      setDisplayHolding(
        v.toLocaleString(undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })
      );
    });
    return () => controls.stop();
  }, []);

  // close on ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setFlipped(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* dim overlay when expanded */}
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

      <div className={`pc-wrapper ${flipped ? "expanded" : ""}`}>
        <motion.div
          ref={cardRef}
          className={`pc-outer ${flipped ? "flipped" : ""}`}
          layout
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            rotateX: flipped ? 0 : tiltX,
            rotateY: flipped ? 0 : tiltY,
            scale: flipped ? 0.95 : 1, // ✅ keeps flipped view fitted perfectly
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => setFlipped(!flipped)}
        >
          {/* FRONT FACE */}
          <div className="pc-face pc-front" role="presentation">
            <div className="pc-header">
              <img className="pc-logo-left" src="/assets/napa.png" alt="NAPA" />
              <h2 className="pc-title">Store Power Card</h2>
              <img
                className="pc-logo-right"
                src="/assets/gpc_logo.png"
                alt="GPC"
              />
            </div>

            <div className="pc-grid">
              <div className="pc-chip pc-blue">
                <span className="pc-chip_label">Good Bet</span>
                <span className="pc-chip_val">{storeMetrics?.goodBet || "--"}</span>
              </div>

              <div className="pc-chip pc-green">
                <span className="pc-chip_label">Current Holding</span>
                <span className="pc-chip_val">${displayHolding}</span>
              </div>

              <div className="pc-chip pc-purple">
                <span className="pc-chip_label">Best Selling SKU</span>
                <span className="pc-chip_val">
                  {storeMetrics?.bestSelling || "--"}
                </span>
              </div>

              <div className="pc-chip pc-indigo">
                <span className="pc-chip_label">Weakest SKU</span>
                <span className="pc-chip_val">
                  {storeMetrics?.weakestSku || "--"}
                </span>
              </div>
            </div>

            <div className="pc-foot">* Click for Details</div>
          </div>

          {/* BACK FACE */}
          <div
            className="pc-face pc-back"
            role="presentation"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="pc-back_title">Details</h3>
            <ul className="pc-back_list">
              <li>
                <span className="pc-dot pc-dot--warn" /> Overstocked SKUs
              </li>
              <li>
                <span className="pc-dot pc-dot--error" /> Out of Stock (PFS &
                Safety)
              </li>
              <li>
                <span className="pc-dot pc-dot--ok" /> Store Sales Velocity
              </li>
            </ul>

            <div className="pc-back_chart">
              <span className="pc-health_label">Store Health</span>
              <span className="pc-health_badge">
                {storeMetrics?.store_id || ""}
              </span>
              <RadarPanel
                label="Health"
                values={storeMetrics?.radar?.values || [20, 20, 20, 20, 20]}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default PowerCard3D;
