import React from 'react';

// Keep your existing components
import PowerCard3D from '../components/PowerCard3D';
import StoreLeaderboard from '../components/StoreLeaderboard';
import HierarchyCompare from '../components/HierarchyCompare';
import TimChat from '../components/TimChat';

import '../styles/StoreDashboard.css';

export default function StoreDashboard() {
  return (
    <div className="sd-shell">
      <div className="sd-grid">
        {/* LEFT COLUMN */}
        <div className="sd-left">
          {/* Top-left: your current details/radar/PowerCard area */}
          <section className="panel">
            <div className="content">
              {/* Keep whatever you render here today (details + radar, etc.) */}
              {/* If your PowerCard3D lives here, keep it here: */}
              <PowerCard3D />
            </div>
          </section>

          {/* Bottom-left: PulseAI — Tim (single panel) */}
          <section className="panel ai-panel">
            <TimChat />
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="sd-right">
          <section className="panel leaderboard-panel">
            <StoreLeaderboard />
          </section>

          <section className="panel hc-panel">
            <HierarchyCompare />
          </section>
        </div>
      </div>
    </div>
  );
}
