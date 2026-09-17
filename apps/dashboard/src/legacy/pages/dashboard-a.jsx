/* global React, HeroBrief, AgentCommand, TodayDay, TodayLeaks, TodayPulse, TodayAway, TodayJourney, NowPlayingRail, AgentFleet, AmbientDock, SegmentPulse, TrustReview */
// Dashboard — Operator's brief.
// Composition: HeroBrief → (AgentCommand + TodayDay) → TodayLeaks → TodayPulse → (TodayAway + TodayJourney);
// the seeded panels below stay demo-only.
// The Ask overlay and ⌘K are owned by the app shell; the dock's "Listen in" opens it via onAsk.
//
// The order is the argument: the work first (a phone puts nothing above it),
// then the one band that says what the work does not, then how the day and
// the period are going, then the two lists. Analysis never outranks a person
// who has been waiting eleven days.

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

    {/* Two pages read together: the only place on Today that puts two numbers beside each other. */}
    <TodayLeaks />

    {/* The day so far and the period, in one card with one header — they were two, with the same button twice. */}
    <TodayPulse />

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
