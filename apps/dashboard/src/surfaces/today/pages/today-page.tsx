/**
 * Today (moved from pages/dashboard-a.jsx, decision 0015, step 4), as canvas E3 ("Clear") lays it out. The order is the
 * argument: the work first, then the day's own card, then what is left over. Analysis never outranks a person who has
 * been waiting eleven days.
 *
 *   a line that is down (brief.tsx TodayAlert, only then)
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
 * There is no day pane, and no strip: E3 folded the day into the strip and the brief's sentence (pages/day.tsx
 * `useDayVm`), and the strip's next appointment is the frame's, beside the bell on every page (frame/topbar/status-bars.tsx
 * NextVisitBar; the page heads canvas, H2, 31 Oct 2026), its day's numbers in the head's right (today-head.tsx). The steps
 * due that stood at the day pane's head are rows of the queue (queue-steps.tsx; decision 0007, amended). The grid is
 * dashboard-a-v2.css's Glass block.
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
import { useWaitsOnToday } from "../../needs-you";
import { useTodayOnPhone } from "../phone";
import { TodayAskFound } from "../phone/ask-found";
import { TodayEnd } from "../phone/end";
import { TodayPhoneDay } from "../phone/day";
import { TodayPhoneHead } from "../phone/head";
import { useToDoCount } from "../phone/to-do";
import { PhoneWarnings } from "../phone/warnings";

/**
 * Today on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md §9): the
 * news in the head, everyone it counts right under it with your own to-dos in the same pane, the day, Ask's ideas, the
 * day's numbers with Worth a look under them, the lists and setting up, and the page says it is done. With nothing
 * waiting on the owner and nothing to do, the day opens by itself and setting up comes up under it, holding the coral.
 * Your brief is the head and Listen; While you were away is the bell's, but for a warning, which stands under the head;
 * Going today is in the day.
 */
function PhoneToday({ waiting }: { waiting: boolean }) {
  const todos = useToDoCount();
  const busy = waiting || todos > 0;
  const head = [<TodayPhoneHead key="head" />, <PhoneWarnings key="warn" />, <AgentCommand key="queue" />];
  const day = <TodayPhoneDay key="day" openByItself={!busy} />;
  // Setting up: what is left to set up and what was brought in, one card (phone/phone.css .tps; nothing while neither draws).
  const settingUpCard = (
    <div key="setting-up" className="tq tps" data-testid="today-setting-up">
      <TodaySetup />
      <TodayBroughtIn />
    </div>
  );
  const rest = [<TodayAskFound key="found" />, <TodayCard key="card" />, <TodayPins key="pins" />];
  return (
    <div className="dash-a-v2 dash-a-v2-glass dash-a-v2-phone" data-testid="today-phone">
      {busy ? [...head, day, ...rest, settingUpCard] : [...head, day, settingUpCard, ...rest]}
      <TodayEnd />
    </div>
  );
}

// Canvas E3's bento: the queue's column beside the brief and the bell, the day's card beside Worth a look. No day pane
// (Ruben, 1 October 2026), and the strip's Next is the bar's (31 Oct 2026); the Calendar has the rest.
export const DashboardA = () => {
  // The work first: while anyone waits on the owner, the queue before the chores (keyed, so a turn moves and never
  // mounts them again). Counted as the queue counts them (needsYouOnToday): the Inbox's parts once it is read, the day's
  // own before, which is all a cold Today has. The Inbox's alone stood empty there, and the chores led over three people
  // waiting (27 Oct 2026). The day's value is in before the page's first draw (ROUTE_WAITS).
  const waiting = useWaitsOnToday();
  const phone = useTodayOnPhone();
  if (phone) return <PhoneToday waiting={waiting} />;
  const chores = [<TodaySetup key="setup" />, <TodayBroughtIn key="in" />, <TodayGoing key="going" />];
  const queue = <AgentCommand key="queue" />;
  return (
    <div className="dash-a-v2 dash-a-v2-glass">
      <HeroBrief />
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
