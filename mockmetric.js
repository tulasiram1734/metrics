// Simple mock data generator you can later replace with API calls.

export function getStoreDashboardData(storeId = "DAL-009") {
  // Mock peers for the leaderboard (same division/DC as the store)
  const peers = [
    { store_id: "ATL-001", name: "Atlanta #1", health: 86, division: "Southern", dc_id: "ATL-DC" },
    { store_id: "ATL-057", name: "Atlanta #57", health: 74, division: "Southern", dc_id: "ATL-DC" },
    { store_id: "ATL-102", name: "Atlanta #102", health: 91, division: "Southern", dc_id: "ATL-DC" },
    { store_id: "DAL-009", name: "Dallas #9", health: 82, division: "Southern", dc_id: "DAL-DC" },
    { store_id: "HOU-007", name: "Houston #7", health: 79, division: "Southern", dc_id: "HOU-DC" },
    { store_id: "MIA-013", name: "Miami #13", health: 68, division: "Southern", dc_id: "MIA-DC" },
    { store_id: "MSP-021", name: "Minneapolis #21", health: 88, division: "Northern", dc_id: "MSP-DC" },
    { store_id: "CHI-014", name: "Chicago #14", health: 72, division: "Midwestern", dc_id: "CHI-DC" },
    { store_id: "NYC-033", name: "New York #33", health: 77, division: "Eastern", dc_id: "NYC-DC" },
  ];

  // Find our store row (or fall back)
  const me = peers.find(p => p.store_id === storeId) || peers[3];

  // Sort peers for leaderboard
  const ranked = [...peers].sort((a, b) => b.health - a.health);

  // Mock hierarchy categories and levels
  const categories = ["Batteries", "Alternators", "Filters", "Brakes"];
  const levels = ["L1 Family", "L2 Category", "L3 Sub-Category", "L4 Segment", "L5 SKU"];

  // For the selected category/level, provide store/peer/DC/national aggregates (0–100)
  const makeRollups = (seed = 0) => ({
    store: clamp(65 + seed * 3 + (me.health - 80) * 0.25, 40, 98),
    peers: clamp(70 + seed * 2, 45, 96),
    dc: clamp(73 + seed * 2.5, 48, 97),
    national: clamp(76 + seed, 50, 95),
  });

  const hierarchy = {};
  categories.forEach((cat, ci) => {
    hierarchy[cat] = {};
    levels.forEach((lvl, li) => {
      hierarchy[cat][lvl] = makeRollups(ci + li);
    });
  });

  return {
    me,
    ranked,
    categories,
    levels,
    hierarchy,
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
