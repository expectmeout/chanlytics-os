/* global React, HeroBrief, AgentCommand, NowPlayingRail, AgentFleet, AmbientDock, SegmentPulse, TrustReview */
// Dashboard — Operator's brief.
// Composition: HeroBrief → (AgentCommand + NowPlayingRail) → SegmentPulse → AgentFleet + AmbientDock.
// The Ask overlay and ⌘K are owned by the app shell; the dock's "Listen in" opens it via onAsk.

const DashboardA = ({ onAsk = () => {} }) => (
  <div className="dash-a-v2">
    <HeroBrief />

    <div className="dash-a-v2-core">
      <AgentCommand />
      <NowPlayingRail />
    </div>

    <TrustReview />

    <SegmentPulse />

    <AgentFleet />

    <AmbientDock onAsk={onAsk} />
  </div>
);

window.DashboardA = DashboardA;
