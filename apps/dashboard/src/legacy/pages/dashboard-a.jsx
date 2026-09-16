/* global React, HeroBrief, TodayRecap, AgentCommand, TodayDay, TodayWeek, TodayAway, TodayJourney, NowPlayingRail, AgentFleet, AmbientDock, SegmentPulse, TrustReview */
// Dashboard — Operator's brief.
// Composition: HeroBrief → (AgentCommand + TodayDay) → TodayWeek → (TodayAway + TodayJourney);
// the seeded panels below stay demo-only.
// The Ask overlay and ⌘K are owned by the app shell; the dock's "Listen in" opens it via onAsk.

const DashboardA = ({ onAsk = () => {} }) => (
  <div className="dash-a-v2">
    <HeroBrief />

    <div className="dash-a-v2-core">
      <AgentCommand />
      <TodayDay />
      {/* Everything below is 100% seeded: a fake live call, invented
          appointments, an 8-agent fleet, a pinned dock. Sitting inches under a
          hero that truthfully says "0 messages today", it read as real. Demo
          only until each engine's slice lands. */}
      {window.__DEMO_MODE && <NowPlayingRail />}
    </div>

    {/* The day so far, under the work it explains: it was a strip of stat cards above everything. */}
    <TodayRecap />

    <TodayWeek />

    {!window.__DEMO_MODE && (
      <div className="dash-a-v2-core">
        <TodayAway />
        <TodayJourney />
      </div>
    )}

    {window.__DEMO_MODE && <TrustReview />}

    {window.__DEMO_MODE && <SegmentPulse />}

    {window.__DEMO_MODE && <AgentFleet />}

    {window.__DEMO_MODE && <AmbientDock onAsk={onAsk} />}
  </div>
);

window.DashboardA = DashboardA;
