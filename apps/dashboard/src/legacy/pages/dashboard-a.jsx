/* global React, HeroBrief, AgentCommand, TodayDay, TodayCard, TodayLeaks, TodayAway */
// Today. Three bands, in this order, and the order is the argument: the work first (a phone puts nothing above it),
// then the day's own card, then what is left over. Analysis never outranks a person who has been waiting eleven days.
//
//   the standing line
//   the queue (8 of 12)          | the day (4 of 12)
//   the day's card (12)
//   worth a look (7)             | while you were away (5)
//
// The seeded panels that stood here (a fake live call, invented appointments, an 8-agent fleet, a pinned dock, a
// trust review, a segment pulse) are gone from this page. The mockup draws the same page from its sample
// (legacy-bridge/today-sample.ts); the seed files stay loaded for the surfaces that still use them.
const DashboardA = () => (
  <div className="dash-a-v2">
    <HeroBrief />
    <div className="dash-a-v2-core">
      <AgentCommand />
      <TodayDay />
    </div>
    <TodayCard />
    <div className="dash-a-v2-foot">
      <TodayLeaks />
      <TodayAway />
    </div>
  </div>
);

window.DashboardA = DashboardA;
