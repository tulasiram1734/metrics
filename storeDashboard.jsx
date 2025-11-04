import React from "react";
import { useParams, Link } from "react-router-dom";
import StoreLeaderboard from "../components/StoreLeaderboard";
import HierarchyCompare from "../components/HierarchyCompare";
import { getStoreDashboardData } from "../mock/mockMetrics";
import "./StoreDashboard.css";

// If you already have PowerCard3D, keep it. We'll show a placeholder if not.
function PowerCard3DStub() {
  return (
    <div className="pcard-stub">
      <div className="pcard-title">Store Power Card</div>
      <div className="pcard-grid">
        <div className="pcard-pill">Good Bet<br/><b>Filters</b></div>
        <div className="pcard-pill">Current Holding<br/><b>$574.1K</b></div>
        <div className="pcard-pill">Best Selling SKU<br/><b>Batteries</b></div>
        <div className="pcard-pill">Weakest SKU<br/><b>Alternator</b></div>
      </div>
    </div>
  );
}

export default function StoreDashboard() {
  const { storeId = "DAL-009" } = useParams();
  const data = getStoreDashboardData(storeId);

  return (
    <div className="sd-shell">
      <div className="sd-topbar">
        <div className="sd-crumbs">
          <Link to="/" className="sd-back">← Back to Map</Link>
        </div>
        <div className="sd-title">Store · <span className="sd-store">{data.me.name} ({storeId})</span></div>
      </div>

      <div className="sd-grid">
        <div className="sd-col sd-col-hero">
          {/* Replace stub with your real PowerCard3D component */}
          <PowerCard3DStub />
        </div>

        <div className="sd-col">
          <StoreLeaderboard ranked={data.ranked} me={data.me} />
        </div>

        <div className="sd-col">
          <HierarchyCompare
            categories={data.categories}
            levels={data.levels}
            hierarchy={data.hierarchy}
          />
        </div>

        <div className="sd-col sd-col-wide">
          <div className="sd-card">
            <div className="sd-card-title">SKU Explorer</div>
            <div className="sd-muted">Coming soon — compare assortment and inventory metrics with interactive filters.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

