/**
 * Today (moved from pages/dashboard-a.jsx, decision 0015, step 4), as the redesign of 1 Nov 2026 lays it out, over canvas
 * E3's bento. The order is the argument: what cannot wait for the list, then the work, then the day, then what is left
 * over. Analysis never outranks a person who has been waiting.
 *
 *   what cannot wait (phone/warnings.tsx: a line that is down, a reply that never reached anyone, a warning that stops
 *   customers being answered), only then
 *   Need you, with To do and Ask found at its foot (queue.tsx)  | the day (day-card.tsx: next, the bar, the rest of it
 *   what is left to set up and what was brought in, one card,   |   with what goes on its own today and its Stop)
 *   under Need you while someone waits, over it while none     | While you were away (the bell's rows)
 *   Worth a look, with the week at its foot (leaks.tsx)         | the lists this member pinned
 *
 * The head over it is the frame's (pages/today-head.tsx): the greeting, one sentence, Listen at its end, and on a desk the
 * day's four figures. Your brief's pane went, since all it said the page says where it is acted on: who needs you in the
 * head and Need you, the day in the day's card, what came in in the figures, the runs in Your OK, a reply that failed under
 * the head, a run that went out in the day. Going today went into the day, at its time among the visits, and the day's
 * card on a desk, a title and one line, into Worth a look's foot. The grid is dashboard-a-v2.css's Glass block.
 */
import { AgentCommand } from "./queue";
import { TodayCard } from "./card";
import { TodayDay } from "./day-card";
import { TodayLeaks } from "./leaks";
import { TodayAway } from "./away";
import { TodayPins } from "./pins";
import { TodaySetup } from "./setup-card";
import { TodayBroughtIn } from "./brought-in";
import { useWaitsOnToday } from "../../needs-you";
import { useTodayOnPhone } from "../phone";
import { TodayEnd } from "../phone/end";
import { useToDoCount } from "../phone/to-do";
import { TodayWarnings } from "../phone/warnings";

/** What is left to set up and what was brought in, one card (phone.css .tps; nothing while neither draws). */
const settingUp = () => (
  <div key="setting-up" className="tq tps" data-testid="today-setting-up">
    <TodaySetup />
    <TodayBroughtIn />
  </div>
);

/**
 * Today on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md §9): what
 * cannot wait, Need you with your own to-dos and what Ask found at its foot, the day, Today so far (the day's numbers with
 * Worth a look and the week under them), the lists and setting up, and the page says it is done. With nothing waiting on
 * the owner and nothing to do, setting up comes up under the day, holding the coral.
 */
function PhoneToday({ waiting }: { waiting: boolean }) {
  const todos = useToDoCount();
  const busy = waiting || todos > 0;
  const head = [<TodayWarnings key="warn" />, <AgentCommand key="queue" />, <TodayDay key="day" />];
  const rest = [<TodayCard key="card" />, <TodayPins key="pins" />];
  return (
    <div className="dash-a-v2 dash-a-v2-glass dash-a-v2-phone" data-testid="today-phone">
      {busy ? [...head, ...rest, settingUp()] : [...head, settingUp(), ...rest]}
      <TodayEnd />
    </div>
  );
}

// The bento on a desk: the work beside the day and the bell, Worth a look beside the pinned lists.
export const DashboardA = () => {
  // The work first: while anyone waits on the owner, Need you before setting up (keyed, so a turn moves and never mounts
  // them again). Counted as the queue counts them (needsYouOnToday): the Inbox's parts once it is read, the day's own
  // before, which is all a cold Today has. The day's value is in before the page's first draw (ROUTE_WAITS).
  const waiting = useWaitsOnToday();
  const phone = useTodayOnPhone();
  if (phone) return <PhoneToday waiting={waiting} />;
  const queue = <AgentCommand key="queue" />;
  return (
    <div className="dash-a-v2 dash-a-v2-glass">
      <TodayWarnings />
      <div className="dash-a-v2-work">{waiting ? [queue, settingUp()] : [settingUp(), queue]}</div>
      <div className="dash-a-v2-side">
        <TodayDay />
        <TodayAway />
      </div>
      <div className="dash-a-v2-bottom">
        <TodayLeaks />
        <TodayPins />
      </div>
    </div>
  );
};
