/**
 * Once a week, what AI did (Working for you, 21 Nov 2026, W9): in the card while nobody waits, from the first look of the
 * week until Got it, one sentence of the last seven days in the business's own counts (Reports' headline, the days the
 * page already reads). Got it is kept for the member as a rest for good (need-you/rests.tsx), so it is said once a week,
 * on any of their devices. Nothing where the days are not read, or AI did nothing in them: no number the data can't back.
 * A milestone (AI's 100th booking) waits for a count of AI's bookings since the start, which nothing keeps yet.
 */
import { DEFAULT_TIMEZONE, dayInZone, type ReportHeadlineVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../frame-verbs";
import { useSurface } from "../../use-surface";
import { AI_WORDS } from "../model/ai";
import { useRests } from "../need-you/rests";
import { useToast, workspaceClock } from "../shell";
import { CardActs, Lead } from "./lead";

const DAY_MS = 86_400_000;
/** The days a week's sentence counts: the seven before today, today being still under way. */
const WEEK_DAYS = 7;

const WEEK_WORDS = AI_WORDS.week;

/** The Monday the business's week began on, YYYY-MM-DD: the rest's id, so Got it holds until the next Monday. */
function mondayKey(): string {
  const day = dayInZone(workspaceClock()?.zone() ?? DEFAULT_TIMEZONE, Date.now());
  const at = Date.UTC(day.y, day.m - 1, day.d);
  const back = (new Date(at).getUTCDay() + 6) % 7;
  return new Date(at - back * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The week's sentence from the period's days (oldest first, today last): what AI answered and the calls, and what was
 * booked where every one of the seven days was counted. Null without seven days before today, or with nothing in them.
 */
export function weekSentence(days: ReportHeadlineVM["perDay"]): string | null {
  if (days.length < WEEK_DAYS + 1) return null;
  const week = days.slice(-(WEEK_DAYS + 1), -1);
  const answered = week.reduce((n, d) => n + d.answered, 0);
  const calls = week.reduce((n, d) => n + d.calls, 0);
  if (answered + calls === 0) return null;
  const counted = week.every((d) => d.booked !== null);
  const booked = counted ? week.reduce((n, d) => n + (d.booked ?? 0), 0) : 0;
  const did = [answered ? WEEK_WORDS.messages(answered) : null, calls ? WEEK_WORDS.calls(calls) : null]
    .filter(Boolean)
    .join(" and ");
  return `In the last 7 days AI answered ${did}${booked ? `, and ${WEEK_WORDS.booked(booked)}` : ""}.`;
}

/** The week's card where it is still to be seen: its rest's id and its sentence; null where there is none to say. */
export function useWeekMoment(): { id: string; sentence: string } | null {
  const headline = useSurface("reports_headline");
  const { rests } = useRests();
  const sentence = headline ? weekSentence(headline.perDay) : null;
  const id = `week:${mondayKey()}`;
  return sentence && !rests(id) ? { id, sentence } : null;
}

/** The week, as the page's card: its sentence, Got it (the page's coral while it holds the card) and Reports' door. */
export function WeekLead({ id, sentence }: { id: string; sentence: string }) {
  const { rest } = useRests();
  const [toastNode, flash] = useToast();
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
        testid="today-week"
      >
        <CardActs>
          <Button
            variant="primary"
            onClick={() => void rest({ key: id, flash, for: { kept: WEEK_WORDS.kept } })}
            data-testid="today-week-got-it"
          >
            {WEEK_WORDS.gotIt}
          </Button>
          <LinkButton {...routeDoor("reports")} data-testid="today-week-reports">
            {WEEK_WORDS.reports}
          </LinkButton>
        </CardActs>
      </Lead>
      {toastNode}
    </>
  );
}
