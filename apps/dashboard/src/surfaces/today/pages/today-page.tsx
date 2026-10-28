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
 *   (TodaySetup, only while something is left, in the queue's column: canvas R10; then what was brought in, for the
 *   first week, decision 0073). While someone waits on the owner the queue leads its column, and what is left to set up
 *   is one line under it (the live walk, 27 Oct 2026: at 1024 Need you started past the bottom of the screen)
 *   the day's card                | Worth a look
 *   the lists this member pinned (a pane of figures, only when something is)
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
import { TodayBroughtIn } from "./brought-in";
import { TodayStrip } from "./strip";
import { useWaitsOnToday } from "../../needs-you";

// Canvas E3's bento: the strip, the queue's column beside the brief and the bell, the day's card beside Worth a look.
// No day pane: E3 folds the day into the strip's Next cell (Ruben, 1 October 2026); the Calendar has the rest.
export const DashboardA = () => {
  // The work first: while anyone waits on the owner, the queue before the chores (keyed, so a turn moves and never
  // mounts them again). Counted as the queue counts them (needsYouOnToday): the Inbox's parts once it is read, the day's
  // own before, which is all a cold Today has. The Inbox's alone stood empty there, and the chores led over three people
  // waiting (27 Oct 2026). The day's value is in before the page's first draw (ROUTE_WAITS).
  const waiting = useWaitsOnToday();
  const chores = [<TodaySetup key="setup" />, <TodayBroughtIn key="in" />, <TodayGoing key="going" />];
  const queue = <AgentCommand key="queue" />;
  return (
    <div className="dash-a-v2 dash-a-v2-glass">
      <HeroBrief />
      <TodayStrip />
      <div className="dash-a-v2-work">{waiting ? [queue, ...chores] : [...chores, queue]}</div>
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
};
