import React from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import "../styles/StoreDashboard.css";

// Import your real visual components when ready
import PowerCard3D from "../components/PowerCard3D.jsx";
import RadarPanel from "../components/RadarPanel.jsx";
// import Leaderboard from "../components/Leaderboard.jsx";
// import SKUExplorer from "../components/SKUExplorer.jsx";

export default function StoreDashboard() {
  const { id } = useParams();
  const [q] = useSearchParams();
  const period = q.get("period") || "DAILY";

  return (
    <div className="sd-shell">
      {/* Left column — PowerCard + Radar */}
      <div className="sd-left">
        <div className="sd-title">
          Store&nbsp;<span className="sd-id">{id}</span> ·{" "}
          <span className="sd-period">{period}</span>
        </div>

        <div className="sd-card-section">
          <PowerCard3D />
        </div>

        <div className="sd-radar-section">
          <RadarPanel />
        </div>
      </div>

      {/* Right column — Leaderboard + SKU Explorer */}
      <div className="sd-right">
        <div className="sd-panel">
          <div className="sd-panel-title">Store Leaderboard</div>
          <div className="sd-panel-content">
            <p>
              Coming soon — compare this store’s <b>health</b>, <b>stockouts</b>,
              and <b>returns</b> with its division peers and DC region.
            </p>
            {/* <Leaderboard /> */}
          </div>
        </div>

        <div className="sd-panel">
          <div className="sd-panel-title">SKU Explorer</div>
          <div className="sd-panel-content">
            <p>
              Explore SKU-level assortment and inventory metrics. Interactive
              grid + filters to come.
            </p>
            {/* <SKUExplorer /> */}
          </div>
        </div>
      </div>

      {/* Back navigation */}
      <div className="sd-nav">
        <Link to="/" className="sd-back">
          ← Back to Map
        </Link>
      </div>
    </div>
  );
}
