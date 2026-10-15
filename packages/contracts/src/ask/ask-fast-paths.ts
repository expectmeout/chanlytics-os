/**
 * The fast paths: the three questions an owner asks most, answered without a model. Which one a question is
 * (askIntent), the day it names (dayFromQuestion), today's missed calls and those on the line (callsToday), and a
 * quick answer as the route keeps it, a turn of its thread (quickAnswerOf); ask-answer.ts words each answer.
 */
import { dayPlusInZone } from "../calendar/zone-math";
import { missedCall } from "../conversations/call-dto";
import { CALL_HEARTBEAT_MS } from "../config/policy";
import { liveStillUp, type LiveCallVM } from "../voice/live";
import { dateFormat } from "../shared/time";
import { ASK_ANSWER_CAPS, clip, type AskAnswer, type AskItem, type AskOpen } from "./ask-answer";
import { ASK_CITATION_KINDS, type AskCitationKind } from "./citations";

/* -------------------------------------------------------------- fast paths */

/** A call as the fast paths read it: the Live view model's slice (missed to the owner only where the customer dialled, missedCall; on the line by the heartbeat, liveStillUp). */
export type FastCall = Pick<
  LiveCallVM,
  "callId" | "who" | "missed" | "direction" | "live" | "startedAtMs" | "heartbeatAtMs"
>;

/*
 * A quick question is one of its short forms, word for word, and nothing else. Matched anywhere in a question, the
 * three patterns caught 12 of 14 ordinary questions (the end-to-end review, 15 October 2026, A1): "Draft a reply to
 * everyone waiting on me" got a list and no reply, "How many missed calls did we have last month?" today's calls, and
 * "¿Qué campañas tengo pendientes de aprobar?" who needs you. Each form is the whole question, after a filler word
 * ("so", "oye") and before a word for now; a question longer than QUICK_WORDS, one that asks for something done
 * (ACT_RE), one about any period but today (PERIOD_RE) and one that names someone (namesSomeone) is the model's,
 * whatever it starts with.
 */
const QUICK_WORDS = 8;
const FILLER = "(?:(?:hey|ok|okay|so|and|oye|bueno|y) )?";
const NOW = "(?: (?:right now|now|today|so far today|ahora(?: mismo)?|hoy))?";
const CALLED_WHEN = "(?: (?:today|so far today|while i was (?:busy|out|away)|hoy|mientras estaba ocupad[oa]))?";
const DAY_FORM =
  "(?:today|tomorrow|hoy|mañana|(?:(?:on|this|el|este) )?(?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thursday|fri|friday|sat|saturday|sun|sunday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))";
/** A service the openings route may read the length of: "for a balayage", "para un corte". */
const FOR_SERVICE = "(?:for|para) (?:an? |un |una )?[a-zà-ÿ'-]+(?: [a-zà-ÿ'-]+){0,2}";
const whole = (forms: string[], tail: string) => new RegExp(`^${FILLER}(?:${forms.join("|")})${tail}$`);

const NEEDS_RE = whole(
  [
    "who needs (?:me|my (?:attention|answer|reply|help))",
    "what needs (?:me|my (?:attention|answer|reply))",
    "(?:who|what)(?:'s|s| is) waiting(?: (?:on|for) me)?",
    "(?:is )?(?:anyone|anybody|someone) waiting(?: (?:on|for) me)?",
    "what do i have waiting",
    "(?:is )?anything (?:waiting|pending)(?: (?:on|for) me)?",
    "qui[eé]n me (?:necesita|espera)",
    "qu[eé] me espera",
    "qu[eé] (?:hay|tengo) pendientes?",
    "(?:hay )?alguien (?:me espera|esperando)",
    "(?:algo )?pendientes?",
  ],
  NOW,
);
const CALLS_RE = whole(
  [
    "(?:did|has|have) (?:anyone|someone|anybody|somebody) (?:call|called|rang|rung|phoned)(?: me| us)?",
    "(?:any|were there any) (?:missed )?calls?",
    "missed calls?",
    "did (?:i|we) (?:miss|get|have) any (?:missed )?calls?",
    "did (?:i|we) miss (?:a|any) calls?",
    "how many (?:missed )?calls(?: did (?:i|we) (?:miss|get))?",
    "who called(?: me| us)?",
    "(?:me )?llam[oó] alguien",
    "alguien (?:me )?(?:llam[oó]|ha llamado)",
    "qui[eé]n (?:me )?(?:llam[oó]|ha llamado)",
    "(?:me )?llamaron",
    "(?:alguna|hay|hubo) llamadas? perdidas?",
    "alguna llamada",
    "(?:cu[aá]ntas )?llamadas? perdidas?",
  ],
  CALLED_WHEN,
);
const OPEN_RE = whole(
  [
    "what(?:'s|s| is) (?:open|free|available)",
    "(?:is there )?anything (?:open|free|available)",
    "(?:any|are there any) (?:openings?|availability|slots?|room|space|free (?:slots?|times?|spots?)|open (?:slots?|times?|spots?))",
    "(?:do|does) (?:i|we) have (?:any )?(?:openings?|availability|room|space|free (?:time|slots?))",
    "openings?",
    "availability",
    "qu[eé] (?:hay|tengo|tenemos) (?:libre|disponible)",
    "(?:hay )?(?:disponibilidad|huecos?|espacios? libres?|algo libre|horas? libres?)",
    "cu[aá]ndo (?:hay|tienen|tenemos|tengo) (?:libre|espacio|hueco|disponibilidad)",
  ],
  `(?: ${DAY_FORM})?(?: ${FOR_SERVICE})?(?: ${DAY_FORM})?`,
);

/** A question that asks for something done -- a draft, a message, a change -- whatever it asks about. */
const ACT_RE =
  /\b(draft|write|send|set ?up|make|turn|create|reply|respond|text|email|book|schedule|cancel|remind|tell|redacta|escribe|env[ií]a|manda|configura|crea|haz|responde|apaga|enciende|programa|reserva|agenda|cancela|recu[eé]rdame|dile)\b/i;
/** Any period but today: a quick answer reads today's calls, now's queue, and the day asked about. */
const PERIOD_RE =
  /\b(yesterday|last|next|week|weekend|month|year|since|between|compare|vs|versus|ayer|anoche|semana|mes|año|pasad[oa]|pr[oó]xim[oa]|desde|entre|compara)\b/i;
/** The words a question may capitalise without naming anyone: a day, today, tomorrow. */
const NOT_A_NAME =
  /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?$|^(today|tomorrow|hoy|mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)$/i;

/** A capitalised word past the first that is not a day: a name ("Any calls from Robin?"), the model's to read. */
function namesSomeone(question: string): boolean {
  return question
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .slice(1)
    .some((w) => /^\p{Lu}\p{Ll}/u.test(w) && !NOT_A_NAME.test(w));
}

/** The question as its forms read it: lower case, one space, no punctuation around it or between its words. */
function quickWords(question: string): string {
  return question
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/[¿¡?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
    return dateFormat("en-CA", {
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
 * route, and ask-answer.ts says the answer. Only the short forms are quick
 * (NEEDS_RE, CALLS_RE, OPEN_RE, whole): everything else is the model's.
 */
export function askIntent(question: string, now: number, tz?: string | null): AskIntent {
  const q = question.trim();
  const words = quickWords(q);
  if (!words || q.length > 160 || words.split(" ").length > QUICK_WORDS) return null;
  if (ACT_RE.test(words) || PERIOD_RE.test(words) || namesSomeone(q)) return null;
  if (NEEDS_RE.test(words)) return { kind: "needs" };
  if (CALLS_RE.test(words)) return { kind: "calls" };
  if (OPEN_RE.test(words)) return { kind: "openings", day: dayFromQuestion(q, now, tz), service: q };
  return null;
}

/* ------------------------------------------------- a quick answer, kept */

const C = ASK_ANSWER_CAPS;
const CITATION_KINDS = new Set<string>(ASK_CITATION_KINDS);
const fields = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const capTo = (v: unknown, n: number) => clip(typeof v === "string" ? v : "", n);
/** Where a quick answer's door may go: a page of the app, never a scheme, a host or a path from the root. */
const appRoute = (v: unknown): string | null =>
  typeof v === "string" && v.length <= 300 && /^[a-z][a-z0-9-]*(?:\/[^\s\\]*)?$/i.test(v) && !v.includes("//")
    ? v
    : null;

/**
 * A quick answer as POST ask/quick keeps it, the turn the Line drew without a model (the review's A1): its headline
 * and detail, its rows, each a row of the workspace with its door, and its Open -- every string cut to its cap, as the
 * answers say them. A quick answer has no figures, breakdown, list or next questions, so none is kept. Null for a
 * shape the Line never draws: no headline, a row with no kind, id or door, or a door that leaves the app.
 */
export function quickAnswerOf(raw: unknown): AskAnswer | null {
  const a = fields(raw);
  const say = fields(a.say);
  const headline = capTo(say.headline, C.headline);
  if (a.v !== 2 || a.form !== "structured" || !headline) return null;
  const rows = fields(a.show).items;
  const items: AskItem[] = [];
  for (const it of (Array.isArray(rows) ? rows : []).slice(0, C.items).map(fields)) {
    const s = fields(it.source);
    const title = capTo(it.title, C.title);
    const to = appRoute(s.to);
    if (!title || !to || typeof s.kind !== "string" || !CITATION_KINDS.has(s.kind) || typeof s.id !== "string")
      return null;
    if (!s.id || s.id.length > 300) return null;
    const label = capTo(s.label, C.label) || title;
    const source = { kind: s.kind as AskCitationKind, id: s.id, label, to, door: s.door !== false };
    items.push({ title, meta: capTo(it.meta, C.meta), line: capTo(it.line, C.line), source });
  }
  const o = fields(a.do).open;
  const openTo = o ? appRoute(fields(o).to) : null;
  if (o && !openTo) return null;
  const open: AskOpen | null = openTo ? { to: openTo, label: capTo(fields(o).label, C.label), now: false } : null;
  return {
    v: 2,
    form: "structured",
    say: { headline, detail: capTo(say.detail, C.detail) },
    show: { figures: [], items, breakdown: null, list: { style: "bullets", entries: [] } },
    do: { open, next: [] },
    language: a.language === "es" || a.language === "en" ? a.language : "other",
  };
}

/**
 * Today's missed calls by the business's clock, and the calls on the line now. A dial the receptionist placed that
 * nobody answered is not a missed call (missedCall), so it is not here.
 */
export function callsToday(
  calls: FastCall[],
  now: number,
  tz?: string | null,
): { missed: FastCall[]; live: FastCall[] } {
  const today = dayKey(now, tz);
  return {
    missed: calls.filter((c) => missedCall(c) && c.startedAtMs && dayKey(c.startedAtMs, tz) === today),
    // On the line by the heartbeat, as Live and the strip count it: a read kept between refreshes still says `live` of
    // a call the provider has gone quiet on.
    live: calls.filter((c) => liveStillUp(c, CALL_HEARTBEAT_MS, now)),
  };
}
