/**
 * Today (moved from pages/dashboard-a.jsx, decision 0015, step 4). Three bands, in this order, and the order is the
 * argument: the work first, then the day's own card, then what is left over. Analysis never outranks a person who has
 * been waiting eleven days.
 *
 *   a line that is down (dashboard-a-brief.jsx TodayAlert, only then)
 *   what is left to set up,      | the day (4 of 12)
 *   then the queue (8 of 12)     |
 *   (TodaySetup, only while something is left, in the queue's column: canvas R10)
 *   the day's card (12)
 *   the lists this member pinned (12, one row, only when something is)
 *   worth a look (7)             | while you were away (5)
 *
 * Glass lays the same parts out as its canvas does (E3, "Clear"): the strip across (what is on the line, the next
 * appointment, the next opening), then the queue's column beside the brief, the bell and the day, then the day's card
 * beside Worth a look, then the pinned lists. Two parts are Glass's own: the strip, which says what the queue's rail and
 * the day's head say in Classic, and the brief, which draws the day's lines that the card draws in Classic. The grid is
 * dashboard-a-v2.css's Glass block.
 *
 * The seeded panels that stood here (a fake live call, invented appointments, an 8-agent fleet, a pinned dock, a
 * trust review, a segment pulse) are gone from this page; the seed files stay loaded for the surfaces that still use
 * them.
 */
import { useLook } from "../../kit/look/look";
import { AgentCommand } from "./queue";
import { HeroBrief } from "./brief";
import { TodayBriefPane } from "./brief-pane";
import { TodayCard } from "./card";
import { TodayDay } from "./day";
import { TodayLeaks } from "./leaks";
import { TodayAway } from "./away";
import { TodayPins } from "./pins";
import { TodaySetup } from "./setup-card";
import { TodayStrip } from "./strip";

const Classic = () => (
  <div className="dash-a-v2">
    <HeroBrief />
    <div className="dash-a-v2-core">
      <div className="dash-a-v2-work">
        <TodaySetup />
        <AgentCommand />
      </div>
      <TodayDay />
    </div>
    <TodayCard />
    <TodayPins />
    <div className="dash-a-v2-foot">
      <TodayLeaks />
      <TodayAway />
    </div>
  </div>
);

const GlassPage = () => (
  <div className="dash-a-v2 dash-a-v2-glass">
    <HeroBrief />
    <TodayStrip />
    <div className="dash-a-v2-work">
      <TodaySetup />
      <AgentCommand />
    </div>
    <div className="dash-a-v2-side">
      <TodayBriefPane />
      <TodayAway />
      <TodayDay />
    </div>
    <div className="dash-a-v2-bottom">
      <TodayCard beats={false} />
      <TodayLeaks />
    </div>
    <TodayPins />
  </div>
);

export const DashboardA = () => (useLook() === "glass" ? <GlassPage /> : <Classic />);
