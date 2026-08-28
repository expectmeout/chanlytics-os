/* global React, HeroBrief, AgentCommand, NowPlayingRail, AgentFleet, AmbientDock, SegmentPulse, TrustReview */
// Dashboard — Operator's brief.
// Composition: HeroBrief → (AgentCommand + NowPlayingRail) → SegmentPulse → AgentFleet + AmbientDock.
// The Ask overlay and ⌘K are owned by the app shell; the dock's "Listen in" opens it via onAsk.

const DashboardA = ({ onAsk = () => {} }) => (
  <div className="dash-a-v2">
    <HeroBrief />

    <div className="dash-a-v2-core">
      <AgentCommand />
      {/* Everything below is 100% seeded: a fake live call, invented
          appointments, an 8-agent fleet, a pinned dock. Sitting inches under a
          hero that truthfully says "0 messages today", it read as real. Demo
          only until each engine's slice lands. */}
      {window.__DEMO_MODE && <NowPlayingRail />}
    </div>

    {window.__DEMO_MODE && <TrustReview />}

    {window.__DEMO_MODE && <SegmentPulse />}

    {window.__DEMO_MODE && <AgentFleet />}

    {window.__DEMO_MODE && <AmbientDock onAsk={onAsk} />}
  </div>
);

window.DashboardA = DashboardA;
