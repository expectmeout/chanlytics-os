/**
 * The page's last lines (Today, calm, 19 Nov 2026, D1 and D3; it was the foot of Today in three zones): what the day came
 * to so far, one line where the head's four figures stood (contracts today/lines.ts `dayCameToWords`: a zero is not said,
 * and a day with nothing yet has no line at all); the lists this member pinned (decision 0009), a line each, its count
 * under its name and the page it opens; and the page saying it is done. The pins' counts are People's lists'
 * (lists/actions.ts), read as Today's page loads.
 */
import { LIST_GROUP_WORDS } from "@chanlytics/contracts";
import { TODAY_LINE_WORDS, dayCameToWords } from "../model/lines";
import type { PeopleListsLike } from "../leaks";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { Icon } from "../../kit/icon/icon";
import { SAYS_WHEN } from "../../kit/says-when";
import { routeDoor } from "../../frame-verbs";
import { useNeedsYou } from "../../needs-you";
import { useSurface } from "../../use-surface";
import { todayAskOf, useTodayAsks } from "../calm/asks";
import { CalmList, CalmRow } from "../calm/lines";
import { useTodayQuiet } from "../calm/quiet";
import { useSinceSaid } from "../ai/since";
import { borrowed, useMoved } from "../shell";
import { useDayTurned } from "./head";

/** People's lists' code: asked for once, as Today's page loads; a fetch that failed is asked for again as the pins draw. */
const listsCode = codeOnce(() => import("../../people/people-lists"));

// Asked for as Today's page loads, so the pins draw with it; a failure is asked for again as they draw.
void listsCode().then(
  () => undefined,
  () => undefined,
);

/** The lists this member pinned, each its count (a dash where People can't count it) and its page; none while unread. */
function usePins() {
  useMoved(["people", "today_pins"]);
  const lists = useCode(listsCode, true).loaded;
  const people = borrowed<PeopleListsLike>("__PEOPLE");
  return people && lists ? lists.lists.pinned() : [];
}

/** What the head's sentence says of the day once it has turned (contracts todayWentLine): never said twice (D18). */
const SAID_BY_THE_HEAD = ["booked", "answered"] as const;

/** Where the day's line goes: Reports, which holds each of its counts and what is behind it. */
const REPORTS_ROUTE = "reports";

/**
 * What the day came to so far, one line: what AI answered, the calls, what was booked and who is new, each only where
 * there is any. Nothing on a day with nothing yet: the head has said the page is quiet.
 */
export function DayCameTo() {
  const vm = useSurface("today");
  // Once the day has turned the head has said what was booked and what AI answered (head.tsx): this says neither again.
  const turned = useDayTurned();
  // Where the head says what AI did since this member last looked (W2), the day's line steps aside: said once.
  const since = useSinceSaid(turned);
  const words = vm && !since ? dayCameToWords(vm.figures, turned ? SAID_BY_THE_HEAD : []) : null;
  // AI is handed the line's question where AI answered anything (D10).
  const answered = vm?.figures.find((f) => f.id === "answered")?.value ?? null;
  useTodayAsks("did", [words && answered ? todayAskOf(TODAY_LINE_WORDS.asks.did) : null]);
  if (!words) return null;
  return (
    <CalmList label={words.title} testid="today-came-to">
      <CalmRow
        first={{ mark: <Icon name="wave" size={14} /> }}
        name={<span {...SAYS_WHEN}>{words.title}</span>}
        said={words.sub ? <span {...SAYS_WHEN}>{words.sub}</span> : undefined}
        door={routeDoor(REPORTS_ROUTE)}
        testid="today-came-to-line"
      />
    </CalmList>
  );
}

/** The pinned lists, a line each: the list's name, how many are on it, and its page on People; nothing with none pinned. */
export function TodayPins() {
  const pins = usePins();
  return pins.length ? (
    <CalmList label={LIST_GROUP_WORDS.pinned} testid="today-pins">
      {pins.map((pin) => (
        <CalmRow
          key={pin.token}
          first={{ mark: <Icon name="pin" size={14} /> }}
          name={pin.label}
          said={pin.count === null || pin.count === undefined ? undefined : String(pin.count)}
          door={routeDoor(pin.to)}
          testid="today-pin"
        />
      ))}
    </CalmList>
  ) : null;
}

/**
 * The page says it is done: its last line, once nobody waits and the page is sure of it (calm/quiet.ts). While a line is
 * down it says instead that this may not be everything, whoever waits; while it is checking, behind or could not read a
 * part, it just ends.
 */
export function TodayEnd() {
  const quiet = useTodayQuiet("end");
  const waiting = useNeedsYou();
  // Nor under "Nothing can come in yet": it is only true of a business that is answering (9 Nov 2026), read.
  const answering = useSurface("setup")?.vm.readiness.answering;
  if (quiet.kind === "unread" && quiet.line)
    return (
      <p className="tz-end calm-done" data-testid="today-end-unsure" {...SAYS_WHEN}>
        {TODAY_LINE_WORDS.quiet.lineDown}
      </p>
    );
  // "That's everything" under "2 need you" read as all done: while anyone waits the page just ends.
  if (quiet.kind !== "sure" || waiting !== 0 || answering !== true) return null;
  return (
    <p className="tz-end calm-done" data-testid="today-end" {...SAYS_WHEN}>
      <Icon name="check" size={13} />
      {TODAY_LINE_WORDS.end}
    </p>
  );
}
