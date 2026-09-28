/**
 * The week as the composed prompt says it: runs of days that share their hours (hoursRuns, which the Settings
 * card reads too) and each run's line. The composer that writes them is compose.ts.
 */
import { dayIntervals as spansOfDay } from "../../calendar/availability";
import { DAYS, type Hours } from "./business-profile";
import { DAY_NAMES } from "./config-schema";

/* ---------------------------------------------------------------- compose */

const DAY_LABEL: Record<string, string> = DAY_NAMES;

/** "Monday–Friday 9:00–18:00" style lines, collapsing identical runs. */
/** One stretch of consecutive days that share the same hours. */
export interface HoursRun {
  /** Day key the run starts on, e.g. "mon". */
  from: string;
  /** Day key it ends on. Equal to `from` for a single day. */
  to: string;
  /** "09:30–18:00", or "Closed". */
  text: string;
}

/**
 * Collapse the week into runs of identical days.
 *
 * Exported because the Settings card had a hand-copied second implementation
 * of this loop, under a comment promising it matched — which is the setup for
 * the owner's own summary disagreeing with what the receptionist says. The
 * ALGORITHM belongs in one place; the FORMATTING does not, because the two
 * surfaces genuinely differ (the prompt says "Monday–Thursday: 09:30–18:00",
 * the card says "Mon–Thu 09:30–18:00"). So this returns the runs and each
 * caller writes its own sentence.
 */
/**
 * Every stretch a day is open, sorted and merged.
 *
 * Sorted because the gap between shifts is computed from neighbours, and array
 * order is not chronology: [15:00-19:00, 09:30-13:00] read positionally says
 * "closed 19:00-09:30", a window running backwards through the night. Merged
 * because two touching shifts are one stretch, and a zero-length gap would
 * otherwise be printed as "closed 13:00-13:00".
 *
 * open/close and intervals are UNIONED rather than one silently winning. Both
 * can be present in a stored row, and dropping either would make a fact
 * disappear from the prompt with nothing to show it had — which is the exact
 * failure this whole area has already had.
 */
function dayIntervals(h: Hours | undefined): { open: string; close: string }[] {
  // The one reader, in availability.ts: the same spans the free windows and
  // the calendar board are computed from, so the prompt cannot describe a day
  // differently from the openings it offers.
  return spansOfDay(h).map(([open, close]) => ({ open, close }));
}

export function joinList(parts: string[]): string {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * What one day says.
 *
 * "Closed" is an affirmative claim, so it is reserved for a day that states
 * nothing. A day that states SOMETHING unusable — an opening time with no
 * closing time, a span that ends before it starts — is not closed; it is a
 * question we cannot answer, and saying "Closed" to a customer would be
 * telling them not to come on a day the business may well be open.
 */
function dayText(h: Hours | undefined): string {
  const spans = dayIntervals(h);
  if (spans.length) {
    const open = joinList(spans.map((x) => `${x.open}–${x.close}`));
    const gaps = spans.slice(1).map((x, i) => `${spans[i].close}–${x.open}`);
    return gaps.length ? `${open} (closed ${joinList(gaps)})` : open;
  }
  const saidSomething = !!(h?.open || h?.close || h?.intervals?.length);
  return saidSomething ? "Hours not confirmed — ask them to call" : "Closed";
}

export function hoursRuns(hours: Record<string, Hours> | undefined): HoursRun[] {
  if (!hours) return [];
  const spans = DAYS.map((d) => ({ day: d as string, text: dayText(hours[d]) }));
  // A seven-line block is harder to read aloud AND longer in a prompt, for no
  // extra information.
  const out: HoursRun[] = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].text === spans[i].text) j++;
    out.push({ from: spans[i].day, to: spans[j].day, text: spans[i].text });
    i = j + 1;
  }
  return out;
}

export function hoursLines(hours: Record<string, Hours> | undefined): string[] {
  return hoursRuns(hours).map((r) => {
    const label = r.from === r.to ? DAY_LABEL[r.from] : `${DAY_LABEL[r.from]}–${DAY_LABEL[r.to]}`;
    return `${label}: ${r.text}`;
  });
}
