import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

// ✅ keep your existing PowerCard import untouched
import PowerCard from '../components/PowerCard3D';

// New widgets
import StoreLeaderboard from '../components/StoreLeaderboard';
import HierarchyCompare from '../components/HierarchyCompare';

// Mock data (the function you fixed earlier)
import { getStoreDashboardData } from '../data/mockMetrics';

import '../styles/StoreDashboard.css';

export default function StoreDashboard() {
  const { storeId = 'DAL-009' } = useParams();
  const data = useMemo(() => getStoreDashboardData(storeId), [storeId]);

  return (
    <div className="sd-shell">
      <div className="sd-topbar">
        <Link to="/" className="sd-back">{'← Back to Map'}</Link>
        <div className="sd-title">
          <span className="muted">Store · </span>
          <b>{data.me.name}</b>
          <span className="muted"> ({data.me.store_id})</span>
        </div>
      </div>

      <div className="sd-grid">
        {/* Left Column */}
        <div className="sd-left">
          <div className="panel powercard-panel">
            {/* Your existing PowerCard component renders here unchanged */}
            <PowerCard />
          </div>

          <div className="panel placeholder">
            <div className="panel-title">SKU Explorer</div>
            <div className="panel-sub">Coming soon — deep assortment & inventory metrics.</div>
          </div>
        </div>

        {/* Right Column */}
        <div className="sd-right">
          <div className="panel leaderboard-panel">
            <StoreLeaderboard
              ranked={data.ranked}
              me={data.me}
            />
          </div>

          <div className="panel compare-panel">
            <HierarchyCompare
              categories={data.categories}
              levels={data.levels}
              hierarchy={data.hierarchy}
              me={data.me}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
