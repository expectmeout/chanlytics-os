/**
 * Today's head (Today in three zones, 2 Nov 2026), said to the frame's head in Glass: the greeting by the hour to the
 * member by their first name, as the page's name, and under it one sentence that follows the rows. A line that is down
 * leads, and how many need you as well; else how many need you, the one count (the badge's, the strip's Inbox tab's, the
 * phone tab's and the title's: Need you's rows above To do still open, needs-you.ts), then what Ask prepared and the one thing
 * that cannot wait, as the rows still hold them (need-you-model.ts useNeedYouLine); after closing, how today went; with nobody
 * waiting, what is listening on a quiet day, else "Nothing needs you." and that that's everyone (contracts
 * todayHeadLine). Listen stands beside the greeting on a desk and beside the bell on a phone (the kit head's `beside`).
 * Nothing stands under the sentence: what happened since the member last looked is the bell's to say, and what the day
 * came to is a line of the page's (decision 0137; the line that stood here said each of them a second time; Today, calm,
 * D7: the four figures at the head's right became that line).
 *
 * The greeting is the only sentence made in the dashboard (today/chrome.ts, where Today's address says it from the
 * frame's first draw, before the page is read, so the head never says "Today" first).
 */
import type { ReactNode } from "react";
import {
  DEFAULT_TIMEZONE,
  NEED_YOU_WORDS,
  todayWentLine,
  todayZoneDay,
  tzClock,
  type TodayHeadLineVM,
} from "@chanlytics/contracts";
import { aiPill } from "../ai/pill";
import { useSinceSaid } from "../ai/since";
import { useCatchUp, useTodayQuiet, type TodayQuiet } from "../calm/quiet";
import { TODAY_LINE_WORDS, dayAheadWords } from "../model/lines";
import { workspaceClock } from "../shell";
import { surfaceValue } from "../../surface-values";
import { useStanding } from "../../kit/head/standing";
import { routeDoor } from "../../frame-verbs";
import { SAYS_WHEN } from "../../kit/says-when";
import { useNeedsYou } from "../../needs-you";
import { useSurface } from "../../use-surface";
import { countRolls } from "../calm/motion";
import { todayGreetingNow } from "../chrome";
import { TODAY_HELPERS, calendarLikeOf } from "../helpers";
import { useNeedYouLine } from "../need-you-model";
import { useTodayOnPhone } from "../phone";
import { useDayVm } from "./day-vm";
import { morningWaits, type TodayMorning } from "../calm/evening";
import { listenButton, useBriefWords, useSpeech } from "./listen";

/**
 * The head's sentence as drawn: what leads in bold (kit.css `.pg-sentence b`), the rest after it, how many were done today
 * where nothing else stands after how many need you, then why Listen could not speak. On a phone how many need you is a
 * door to who they are (`door`). Called, not drawn, so the head's tree has no part of its own for it.
 */
function headSentence(
  line: TodayHeadLineVM,
  {
    done,
    why,
    door,
    count,
    ai,
  }: { done: string | null; why: string | null; door: string | null; count: number; ai: ReactNode },
): ReactNode {
  const waits = count > 0;
  // Someone waits on you: the warn tone's dot before how many (Today with colour, D5), as the menu's count says it.
  const lead = (
    // How many need you rolls into place as it falls (D13, calm/motion.ts): the only number on the page that moves.
    <b className="calm-count" data-testid="today-head-lead" ref={countRolls(count)}>
      {waits ? <span className="tz-waits" aria-hidden="true" /> : null}
      {line.lead}
    </b>
  );
  return (
    <>
      {door ? (
        <a className="tz-lead" {...routeDoor(door)}>
          {lead}
        </a>
      ) : (
        lead
      )}
      {line.rest ? ` ${line.rest}` : null}
      {/* A count of the day, which a copy some minutes old must not go on saying: it wears the mark a time wears (decision 0101). */}
      {done ? (
        <>
          {" "}
          <span {...SAYS_WHEN} data-testid="today-done">
            {done}
          </span>
        </>
      ) : null}
      {why ? (
        <span className="today-listen-why" role="status" data-testid="today-listen-why">
          {why}
        </span>
      ) : null}
      {/* AI's state, its own press under the sentence (W1): it opens AI's sheet. */}
      {ai}
    </>
  );
}

/** The page's quiet, in words. */
const QUIET_WORDS = TODAY_LINE_WORDS.quiet;

/** How many were done today, after how many need you, where nothing else stands: no list's head says it (Today, calm). */
const doneTodayOf = (line: TodayHeadLineVM, count: number, done: number): string | null =>
  count > 0 && !line.rest && done > 0 ? `${NEED_YOU_WORDS.doneToday(done)}.` : null;

/**
 * The sentence as the page's quiet has it (calm/quiet.ts, W18): while who needs you is still being read the head says it is
 * checking, never "Nothing needs you."; where a read failed, that there may be more; where what it shows is an older read's,
 * since when, and that it is catching up. Sure, or drawn from this device's copy while the read is out, it stands as made.
 */
function quietLine(line: TodayHeadLineVM, quiet: TodayQuiet, count: number): TodayHeadLineVM {
  // Someone known to wait is said as they are: only "nobody" waits on what is still being read.
  if (quiet.kind === "checking" && count === 0) return { lead: QUIET_WORDS.checking, rest: null };
  if (quiet.kind === "unread" && !quiet.line) return { lead: line.lead, rest: QUIET_WORDS.unread };
  if (quiet.kind !== "behind") return line;
  const at = quiet.at === null ? null : tzClock(new Date(quiet.at).toISOString(), headZone(), new Date());
  return { lead: line.lead, rest: [line.rest, QUIET_WORDS.behind(at)].filter(Boolean).join(" ") };
}

/** The business's own zone, which every time on Today is said in. */
const headZone = (): string => workspaceClock()?.zone() ?? DEFAULT_TIMEZONE;

/** Whether the day has turned to tomorrow, as the day's zone says it (contracts todayZoneDay): the head says how today went. */
export function useDayTurned(): boolean {
  return useZoneDayNow()?.tomorrow ?? false;
}

/** The day's zone now, from the Calendar and the day the page holds; and whether the business set its hours. */
function useZoneDayNow() {
  const day = useDayVm();
  const cal = surfaceValue("calendar");
  const zone = todayZoneDay(cal?.vm ? calendarLikeOf(cal.vm) : null, day, [], Date.now());
  return zone ? { ...zone, hoursSet: !!cal?.vm.hoursSet } : null;
}

/**
 * Whether the business has closed for the day by its own hours (Working for you, W5, calm/evening.tsx): the day's line has
 * turned to tomorrow, the hours are Settings' own, and today was not a closed day (that turns at once, whatever the hour,
 * and is no evening). A business with no hours set keeps the day's page as it is.
 */
export function useTodayEvening(): boolean {
  const zone = useZoneDayNow();
  return !!zone?.hoursSet && zone.tomorrow && !zone.closedToday;
}

/**
 * The sentence's rest where AI's "since you last looked" says nothing: the day ahead in facts while nobody waits (W15), or,
 * once the business has closed with someone waiting, that the rest waits for morning (W5), where something does: with
 * nothing folded into its line there is no rest to wait. Only on a page sure of itself.
 */
export function headRestOf(at: {
  count: number;
  turned: boolean;
  sure: boolean;
  alert: boolean;
  forMorning: boolean;
  ahead: string | null;
}): string | null {
  if (!at.sure) return null;
  if (at.count === 0) return !at.turned && !at.alert ? at.ahead : null;
  return at.forMorning ? TODAY_LINE_WORDS.evening.rest : null;
}

/** The day's weekday in the business's zone: "Tuesday". */
export const weekdayNow = (): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE, weekday: "long" }).format(
    Date.now(),
  );

/**
 * The day ahead in facts (W15), with its one word where the last four of its weekday back it: the morning's read of the
 * business's history. Null with no visit ahead.
 */
function useDayAhead(): string | null {
  const before = useSurface("ask_morning")?.dto?.history?.weekday_visits ?? null;
  return dayAheadWords(useDayVm(), { before, weekday: weekdayNow() });
}

/**
 * Today's standing, said to the frame's head as the page draws: the greeting, its one sentence, the figures. `morning` is
 * the page's own arrangement's (null by day), handed over from the same draw, so the head says the rest waits for morning
 * only where the page's one line for it holds something.
 */
export function useZonesStanding(morning: TodayMorning | null): void {
  const phone = useTodayOnPhone();
  const vm = useSurface("today");
  // Read from Need you's own model in the head's pass, never heard from the list as it draws: the line is there on the
  // first frame (today/arrangement.ts says why).
  const said = useNeedYouLine(vm ?? null);
  // The one count, the badge's: it leaves a row the moment Need you acts on it (needs-you.ts needsYouActed).
  const count = useNeedsYou() ?? 0;
  // How sure the count is: checking, behind or a part unread says so (W18), and the page asks again by itself meanwhile.
  const quiet = useTodayQuiet("count");
  useCatchUp(useTodayQuiet("end"));
  const turned = useDayTurned();
  const words = useBriefWords();
  const brief = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(brief);
  const went = turned && vm ? todayWentLine(vm.figures) : null;
  const done = vm?.done_today ?? 0;
  // What AI did since this member last looked, where it is said (W2): the sentence's rest, in place of what it said.
  const since = useSinceSaid(turned);
  const headLine = vm
    ? quietLine(TODAY_HELPERS.headLine(vm.standing, count, said, vm.calm, went, done > 0), quiet, count)
    : null;
  // Nobody waits and nothing new since the last look: the day ahead, in facts (W15).
  const ahead = useDayAhead();
  // Only on a page sure of itself: behind or unread, its own sentence is the one that matters.
  const sure = quiet.kind === "sure" || quiet.kind === "settling";
  // Once the day is over, whoever waits is said, and the rest waits for morning in its one line where it holds any (W5).
  const forMorning = !!morning && morningWaits(morning);
  const rest = since ?? headRestOf({ count, turned, sure, alert: vm?.standing.tone === "alert", forMorning, ahead });
  const line = headLine && rest ? { lead: headLine.lead, rest } : headLine;
  // Only where the brief has news, and not once it plays: the header's capsule has it then (BriefPlaying).
  const listen = speech.can && brief && words?.news && speech.state !== "speaking" ? listenButton(speech, brief) : null;
  useStanding({
    stacked: true,
    title: todayGreetingNow(),
    sentence: line
      ? headSentence(line, {
          done: doneTodayOf(line, count, done),
          why: speech.why,
          door: phone && count > 0 ? "inbox" : null,
          count,
          ai: aiPill(vm?.ai ?? null),
        })
      : undefined,
    beside: listen ?? undefined,
  });
}
