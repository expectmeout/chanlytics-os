/**
 * Once a week, what AI did (Working for you, 21 Nov 2026, W9): in the card while nobody waits, from the first look of the
 * week until Got it, one sentence of the last seven days as Reports counts them (its "Last 7 days", today among them,
 * so the card's numbers are the page's its door opens): the messages AI answered, and under it the calls and what was
 * booked, which are the business's and not said as AI's. The days are the headline's the page holds, or the last thirty
 * read once where the period this device picked is shorter than a week (days.ts). Got it is kept for the member until the next Monday (need-you/rests.tsx), so it is said once a
 * week, on any of their devices, and never before what they set aside is read. Nothing where the days are not read, or
 * AI answered nothing in them: no number the data can't back. A milestone (AI's 100th booking) waits for a count of AI's
 * bookings since the start, which nothing keeps yet.
 */
import { DAY_MS, DEFAULT_TIMEZONE, dayInZone } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { AI_WORDS } from "../model/ai";
import { useRests } from "../need-you/rests";
import { useTodayOnPhone } from "../phone";
import { appNavigate, useToast, workspaceClock } from "../shell";
import { useLastDays, type LastDays } from "./days";
import { CardActs, Lead } from "./lead";

/** The days a week's sentence counts: Reports' last seven, today the last of them. */
const WEEK_DAYS = 7;

const WEEK_WORDS = AI_WORDS.week;

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

/** The week's card where it is still to be seen: its rest's id and its words; null where there is none to say. */
export function useWeekMoment(): ({ id: string } & WeekWords) | null {
  const days = useLastDays(WEEK_DAYS);
  const { rests, known } = useRests();
  const words = days ? weekWords(days) : null;
  const id = `week:${mondays().began}`;
  // Not before what the member set aside is read: a card they answered would show, then go.
  return words && known && !rests(id) ? { id, ...words } : null;
}

/** The week, as the page's card: its sentence, Got it (the page's coral while it holds the card) and Reports' door. */
export function WeekLead({ id, sentence, sub }: { id: string } & WeekWords) {
  const { rest } = useRests();
  const [toastNode, flash] = useToast();
  const size = useTodayOnPhone() ? "touch" : "lg";
  return (
    <>
      <Lead
        holder="week"
        id={id}
        label={WEEK_WORDS.label}
        kind={
          <>
            <Icon name="three" size={14} />
            <span>{WEEK_WORDS.kind}</span>
          </>
        }
        title={sentence}
        why={sub}
        testid="today-week"
      >
        <CardActs>
          {/* The card's presses at the card's size, as every card has them: its one press, then its quiet door. */}
          <Button
            variant="primary"
            size={size}
            onClick={() => void rest({ key: id, flash, for: { until: mondays().next, kept: WEEK_WORDS.kept } })}
            data-testid="today-week-got-it"
          >
            {WEEK_WORDS.gotIt}
          </Button>
          <Button
            variant="quiet"
            size={size}
            onClick={() => appNavigate(REPORTS_ROUTE)}
            data-testid="today-week-reports"
          >
            {WEEK_WORDS.reports}
          </Button>
        </CardActs>
      </Lead>
      {toastNode}
    </>
  );
}
