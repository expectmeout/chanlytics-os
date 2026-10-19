/**
 * Today (moved from pages/dashboard-a.jsx, decision 0015, step 4), as canvas E3 ("Clear") lays it out. The order is the
 * argument: the work first, then the day's own card, then what is left over. Analysis never outranks a person who has
 * been waiting eleven days.
 *
 *   a line that is down (brief.tsx TodayAlert, only then)
 *   the strip: what is on the line, the next appointment, the next opening
 *   what is left to set up,       | the brief: who needs you, the day, what came in, the runs waiting
 *   what goes on its own today    | and While you were away (the bell's rows)
 *   (going-today.tsx, decision    |
 *   0064), then the queue, the    |
 *   steps due                     |
 *   among its rows                |
 *   (TodaySetup, only while something is left, in the queue's column: canvas R10)
 *   the day's card                | Worth a look
 *   the lists this member pinned (one row, only when something is)
 *
 * There is no day pane. E3 folds the day into the strip and the brief's sentence (the one derivation both read is
 * pages/day.tsx `useDayVm`), and the steps due that stood at the pane's head are rows of the queue (queue-steps.tsx;
 * decision 0007, amended). The grid is dashboard-a-v2.css's Glass block.
 *
 * The seeded panels that stood here (a fake live call, invented appointments, an 8-agent fleet, a pinned dock, a
 * trust review, a segment pulse) are gone from this page.
 */
import { AgentCommand } from "./queue";
import { TodayGoing } from "./going-today";
import { HeroBrief } from "./brief";
import { TodayBriefPane } from "./brief-pane";
import { TodayCard } from "./card";
import { TodayLeaks } from "./leaks";
import { TodayAway } from "./away";
import { TodayPins } from "./pins";
import { TodaySetup } from "./setup-card";
import { TodayStrip } from "./strip";

// Canvas E3's bento: the strip, the queue's column beside the brief and the bell, the day's card beside Worth a look.
// No day pane: E3 folds the day into the strip's Next cell (Ruben, 1 October 2026); the Calendar has the rest.
export const DashboardA = () => (
  <div className="dash-a-v2 dash-a-v2-glass">
    <HeroBrief />
    <TodayStrip />
    <div className="dash-a-v2-work">
      <TodaySetup />
      <TodayGoing />
      <AgentCommand />
    </div>
    <div className="dash-a-v2-side">
      <TodayBriefPane />
      <TodayAway />
    </div>
    <div className="dash-a-v2-bottom">
      <TodayCard />
      <TodayLeaks />
    </div>
    <TodayPins />
  </div>
);
