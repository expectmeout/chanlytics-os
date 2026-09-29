/**
 * The fast paths: the three questions an owner asks most, answered without a model. Which one a question is
 * (askIntent), the day it names (dayFromQuestion), and today's missed calls and those on the line (callsToday);
 * ask-answer.ts words each answer.
 */
import { dayPlusInZone } from "../calendar/zone-math";

/* -------------------------------------------------------------- fast paths */

export interface FastCall {
  callId: string;
  who: string;
  missed: boolean;
  live: boolean;
  startedAtMs: number | null;
}

const NEEDS_RE =
  /\b(who needs me|who needs my|needs? (my|me)\b|what('s| is| do i have)? waiting|waiting (on|for) me|anyone waiting|qui[eé]n me necesita|qu[eé] (me )?espera|qu[eé] (hay )?pendiente|pendientes?)\b/i;
const CALLS_RE =
  /\b((did|has|have) (anyone|someone|anybody|somebody) (call|called|rang|phoned)|missed calls?|who called|any calls?|llam[oó] alguien|llamaron|llamadas? perdidas?|qui[eé]n llam[oó]|alguna llamada)\b/i;
const OPEN_RE =
  /\b(what('s| is) open|what('s| is) free|openings?|availab|free (slot|slots|time)|any (slots?|room|space|time)|qu[eé] (hay|tengo) (libre|disponible)|disponibilidad|disponibles?|huecos?|espacios? libres?|cu[aá]ndo (hay|tienen) (libre|espacio))\b/i;

const DAY_WORDS: Array<[RegExp, string]> = [
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tues|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|mi[eé]rcoles)\b/i, "wed"],
  [/\b(thu|thur|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|s[aá]bado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"],
];

/** The day `atMs` falls on in `tz`; with no zone, or one Intl cannot use, the day in UTC -- never the machine's. */
function dayKey(atMs: number, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toISOString().slice(0, 10);
  }
}

/** The day a question names: a weekday key, "today"/"tomorrow" as a date, or nothing. */
export function dayFromQuestion(q: string, now: number, tz?: string | null): string | null {
  // Tomorrow is the next DAY, which is not "now plus 24 hours" on the two
  // days a year the clock moves (availability dayPlusInZone). A zone we
  // cannot use falls back the way dayKey does.
  if (/\b(tomorrow|mañana)\b/i.test(q)) {
    try {
      if (tz) return dayPlusInZone(tz, now, 1).key;
    } catch {
      /* an unusable zone falls through */
    }
    return dayKey(now + 86_400_000, tz);
  }
  if (/\b(today|hoy)\b/i.test(q)) return dayKey(now, tz);
  for (const [re, key] of DAY_WORDS) if (re.test(q)) return key;
  return null;
}

/** What a quick question asks for, answered without a model; ask-answer.ts words the answer. */
export type AskIntent =
  { kind: "needs" } | { kind: "calls" } | { kind: "openings"; day: string | null; service: string } | null;

/**
 * The three questions an owner asks most, answered without a model: who
 * needs me, did anyone call, what is open. This only says which one a
 * question is; the bridge reads Today's queue, the calls or the openings
 * route, and ask-answer.ts says the answer. Everything else is the model's.
 */
export function askIntent(question: string, now: number, tz?: string | null): AskIntent {
  const q = question.trim();
  if (!q || q.length > 160) return null;
  if (NEEDS_RE.test(q)) return { kind: "needs" };
  if (CALLS_RE.test(q)) return { kind: "calls" };
  if (OPEN_RE.test(q)) return { kind: "openings", day: dayFromQuestion(q, now, tz), service: q };
  return null;
}

/** Today's missed calls by the business's clock, and the calls on the line now. */
export function callsToday(
  calls: FastCall[],
  now: number,
  tz?: string | null,
): { missed: FastCall[]; live: FastCall[] } {
  const today = dayKey(now, tz);
  return {
    missed: calls.filter((c) => c.missed && c.startedAtMs && dayKey(c.startedAtMs, tz) === today),
    live: calls.filter((c) => c.live),
  };
}
