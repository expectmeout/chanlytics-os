/**
 * Once a week, what AI did (Working for you, 21 Nov 2026, W9): in the card while nobody waits, from the first look of the
 * week until Got it, one sentence of the last seven days as Reports counts them (its "Last 7 days", today among them,
 * so the card's numbers are the page's its door opens): the messages AI answered, and under it the calls and what was
 * booked, which are the business's and not said as AI's. The days are the headline's the page holds, or the last thirty
 * read once where the period this device picked is shorter than a week (days.ts). Got it is kept for the member until the next Monday (need-you/rests.tsx), so it is said once a
 * week, on any of their devices, and never before what they set aside is read. Nothing where the days are not read, or
 * AI answered nothing in them: no number the data can't back.
 *
 * A milestone works the same, once (22 Nov 2026): "AI's 100th booking for you." in the week it is reached, from the
 * count of AI's bookings the morning's read carries (contracts ask/memory/morning.ts), ahead of the week's
 * card and until Got it, which puts it away past the days it is news for. No door: no page holds that count.
 */
import { DAY_MS, DEFAULT_TIMEZONE, dayInZone, shiftKey, type AskMorningDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { AI_WORDS } from "../model/ai";
import { useRests } from "../need-you/rests";
import { useTodayOnPhone } from "../phone";
import { appNavigate, useToast, workspaceClock } from "../shell";
import { useSurface } from "../../use-surface";
import { useLastDays, type LastDays } from "./days";
import { CardActs, Lead } from "./lead";

/** The days a week's sentence counts: Reports' last seven, today the last of them. */
const WEEK_DAYS = 7;

const WEEK_WORDS = AI_WORDS.week;
const MILESTONE_WORDS = AI_WORDS.milestone;

/** Where the week's numbers are held, each with what is behind it. */
const REPORTS_ROUTE = "reports";

/** The Monday the business's week began on, and the next one, YYYY-MM-DD: the rest's id, and the day it runs to. */
function mondays(): { began: string; next: string } {
  const day = dayInZone(workspaceClock()?.zone() ?? DEFAULT_TIMEZONE, Date.now());
  const at = Date.UTC(day.y, day.m - 1, day.d);
  const back = (new Date(at).getUTCDay() + 6) % WEEK_DAYS;
  const keyOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  return { began: keyOf(at - back * DAY_MS), next: keyOf(at + (WEEK_DAYS - back) * DAY_MS) };
}

/** What the week's card says: its sentence, and the quieter line under it (null where it has none). */
export interface WeekWords {
  sentence: string;
  sub: string | null;
}

/**
 * The week's words from the period's days (oldest first, today last): the messages AI answered in the last seven, and
 * under them the calls and what was booked (only where every one of the seven days was counted, as the headline's last
 * seven are). Null without seven days, or where AI answered nothing in them.
 */
export function weekWords(days: LastDays): WeekWords | null {
  if (days.length < WEEK_DAYS) return null;
  const week = days.slice(-WEEK_DAYS);
  const answered = week.reduce((n, d) => n + d.answered, 0);
  if (answered === 0) return null;
  const calls = week.reduce((n, d) => n + d.calls, 0);
  const counted = week.every((d) => d.booked !== null);
  const booked = counted ? week.reduce((n, d) => n + (d.booked ?? 0), 0) : 0;
  const sub = [calls ? WEEK_WORDS.calls(calls) : null, booked ? WEEK_WORDS.booked(booked) : null].filter(Boolean);
  return { sentence: WEEK_WORDS.answered(answered), sub: sub.length ? sub.join(" · ") : null };
}

/**
 * What the card says once while nobody waits (W9), the week or a milestone: its rest's id and its words, what kind it
 * is, the day Got it puts it away until and what that says back, and the page that holds its numbers (none where no
 * page does).
 */
interface TodayMoment extends WeekWords {
  id: string;
  kind: string;
  label: string;
  until: string;
  kept: string;
  door: string | null;
  testid: string;
}

/** The business's day, YYYY-MM-DD. */
const dayNow = (): string => dayInZone(workspaceClock()?.zone() ?? DEFAULT_TIMEZONE, Date.now()).key;

/** AI's bookings as the morning's read counts them: all of them, and those of the last days. */
type AiBooked = NonNullable<AskMorningDto["history"]>["booked_by_ai"];

/** The counts of AI's bookings a milestone is said at, once each. */
const MILESTONES: readonly number[] = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * The milestone AI's bookings reached lately: the highest of MILESTONES the count stands at or past, which it stood
 * under before the last days' bookings. Null with none, so a count that passed a milestone long ago says nothing of it:
 * the 100th booking is news the week it is made, and old news in a business that already has 400.
 */
function milestoneOf(booked: AiBooked): number | null {
  const before = booked.total - booked.lately;
  return MILESTONES.filter((step) => before < step && step <= booked.total).at(-1) ?? null;
}

/**
 * The milestone AI's bookings reached lately, as the card says it; null with none. Got it puts it away a day past the
 * days it is news for: by then the count no longer says it, so it is said once, and says the count the next is said at.
 */
function milestoneMoment(booked: AiBooked | null | undefined): TodayMoment | null {
  const reached = booked ? milestoneOf(booked) : null;
  if (!booked || reached === null) return null;
  return {
    id: `milestone:${reached}`,
    kind: MILESTONE_WORDS.kind,
    label: MILESTONE_WORDS.label,
    sentence: MILESTONE_WORDS.reached(reached),
    // Where every one of them is from these days, the sentence has said it all.
    sub: booked.lately < booked.total ? MILESTONE_WORDS.lately(booked.lately, booked.days) : null,
    until: shiftKey(dayNow(), booked.days + 1),
    kept: MILESTONE_WORDS.kept(MILESTONES.find((step) => step > reached) ?? null),
    door: null,
    testid: "today-milestone",
  };
}

/** The week as the card says it: put away until the next Monday, its numbers Reports'. */
const weekMoment = (words: WeekWords): TodayMoment => {
  const { began, next } = mondays();
  return {
    id: `week:${began}`,
    kind: WEEK_WORDS.kind,
    label: WEEK_WORDS.label,
    ...words,
    until: next,
    kept: WEEK_WORDS.kept,
    door: REPORTS_ROUTE,
    testid: "today-week",
  };
};

/**
 * The card's moment where it is still to be seen: a milestone ahead of the week (it is the rarer, and the week's card
 * is there the day after); null where there is none to say.
 */
export function useWeekMoment(): TodayMoment | null {
  const days = useLastDays(WEEK_DAYS);
  const history = useSurface("ask_morning")?.dto?.history ?? null;
  const { rests, known } = useRests();
  // Not before what the member set aside is read: a card they answered would show, then go.
  if (!known) return null;
  const words = days ? weekWords(days) : null;
  const moments = [milestoneMoment(history?.booked_by_ai), words ? weekMoment(words) : null];
  return moments.find((moment) => moment && !rests(moment.id)) ?? null;
}

/** The moment, as the page's card: its sentence, Got it (the page's coral while it holds the card) and its door. */
export function WeekLead(moment: TodayMoment) {
  const { id, door } = moment;
  const { rest } = useRests();
  const [toastNode, flash] = useToast();
  const size = useTodayOnPhone() ? "touch" : "lg";
  return (
    <>
      <Lead
        holder="week"
        id={id}
        label={moment.label}
        kind={
          <>
            <Icon name="three" size={14} />
            <span>{moment.kind}</span>
          </>
        }
        title={moment.sentence}
        why={moment.sub}
        testid={moment.testid}
      >
        <CardActs>
          {/* The card's presses at the card's size, as every card has them: its one press, then its quiet door. */}
          <Button
            variant="primary"
            size={size}
            onClick={() => void rest({ key: id, flash, for: { until: moment.until, kept: moment.kept } })}
            data-testid="today-week-got-it"
          >
            {WEEK_WORDS.gotIt}
          </Button>
          {door ? (
            <Button variant="quiet" size={size} onClick={() => appNavigate(door)} data-testid="today-week-reports">
              {WEEK_WORDS.reports}
            </Button>
          ) : null}
        </CardActs>
      </Lead>
      {toastNode}
    </>
  );
}
