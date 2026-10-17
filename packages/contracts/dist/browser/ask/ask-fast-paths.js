import { dayPlusInZone } from "../calendar/zone-math.js";
import { missedCall } from "../conversations/call-dto.js";
import { CALL_HEARTBEAT_MS } from "../config/policy.js";
import { liveStillUp } from "../voice/live.js";
import { dateFormat } from "../shared/time.js";
import { ASK_ANSWER_CAPS, clip } from "./ask-answer.js";
import { ASK_CITATION_KINDS } from "./citations.js";
const QUICK_WORDS = 8;
const FILLER = "(?:(?:hey|ok|okay|so|and|oye|bueno|y) )?";
const NOW = "(?: (?:right now|now|today|so far today|ahora(?: mismo)?|hoy))?";
const CALLED_WHEN = "(?: (?:today|so far today|while i was (?:busy|out|away)|hoy|mientras estaba ocupad[oa]))?";
const DAY_FORM = "(?:today|tomorrow|hoy|ma\xF1ana|(?:(?:on|this|el|este) )?(?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thursday|fri|friday|sat|saturday|sun|sunday|lunes|martes|mi[e\xE9]rcoles|jueves|viernes|s[a\xE1]bado|domingo))";
const FOR_SERVICE = "(?:for|para) (?:an? |un |una )?[a-z\xE0-\xFF'-]+(?: [a-z\xE0-\xFF'-]+){0,2}";
const whole = (forms, tail) => new RegExp(`^${FILLER}(?:${forms.join("|")})${tail}$`);
const NEEDS_RE = whole(
  [
    "who needs (?:me|my (?:attention|answer|reply|help))",
    "what needs (?:me|my (?:attention|answer|reply))",
    "(?:who|what)(?:'s|s| is) waiting(?: (?:on|for) me)?",
    "(?:is )?(?:anyone|anybody|someone) waiting(?: (?:on|for) me)?",
    "what do i have waiting",
    "(?:is )?anything (?:waiting|pending)(?: (?:on|for) me)?",
    "qui[e\xE9]n me (?:necesita|espera)",
    "qu[e\xE9] me espera",
    "qu[e\xE9] (?:hay|tengo) pendientes?",
    "(?:hay )?alguien (?:me espera|esperando)",
    "(?:algo )?pendientes?"
  ],
  NOW
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
    "(?:me )?llam[o\xF3] alguien",
    "alguien (?:me )?(?:llam[o\xF3]|ha llamado)",
    "qui[e\xE9]n (?:me )?(?:llam[o\xF3]|ha llamado)",
    "(?:me )?llamaron",
    "(?:alguna|hay|hubo) llamadas? perdidas?",
    "alguna llamada",
    "(?:cu[a\xE1]ntas )?llamadas? perdidas?"
  ],
  CALLED_WHEN
);
const OPEN_RE = whole(
  [
    "what(?:'s|s| is) (?:open|free|available)",
    "(?:is there )?anything (?:open|free|available)",
    "(?:any|are there any) (?:openings?|availability|slots?|room|space|free (?:slots?|times?|spots?)|open (?:slots?|times?|spots?))",
    "(?:do|does) (?:i|we) have (?:any )?(?:openings?|availability|room|space|free (?:time|slots?))",
    "openings?",
    "availability",
    "qu[e\xE9] (?:hay|tengo|tenemos) (?:libre|disponible)",
    "(?:hay )?(?:disponibilidad|huecos?|espacios? libres?|algo libre|horas? libres?)",
    "cu[a\xE1]ndo (?:hay|tienen|tenemos|tengo) (?:libre|espacio|hueco|disponibilidad)"
  ],
  `(?: ${DAY_FORM})?(?: ${FOR_SERVICE})?(?: ${DAY_FORM})?`
);
const ACT_RE = /\b(draft|write|send|set ?up|make|turn|create|reply|respond|text|email|book|schedule|cancel|remind|tell|redacta|escribe|env[ií]a|manda|configura|crea|haz|responde|apaga|enciende|programa|reserva|agenda|cancela|recu[eé]rdame|dile)\b/i;
const PERIOD_RE = /\b(yesterday|last|next|week|weekend|month|year|since|between|compare|vs|versus|ayer|anoche|semana|mes|año|pasad[oa]|pr[oó]xim[oa]|desde|entre|compara)\b/i;
const NOT_A_NAME = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?$|^(today|tomorrow|hoy|mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)$/i;
function namesSomeone(question) {
  return question.split(/\s+/).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).slice(1).some((w) => /^\p{Lu}\p{Ll}/u.test(w) && !NOT_A_NAME.test(w));
}
function quickWords(question) {
  return question.replace(/[’‘`´]/g, "'").toLowerCase().replace(/[¿¡?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
}
const DAY_WORDS = [
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tues|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|mi[eé]rcoles)\b/i, "wed"],
  [/\b(thu|thur|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|s[aá]bado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"]
];
function dayKey(atMs, tz) {
  try {
    return dateFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toISOString().slice(0, 10);
  }
}
export function dayFromQuestion(q, now, tz) {
  if (/\b(tomorrow|mañana)\b/i.test(q)) {
    try {
      if (tz) return dayPlusInZone(tz, now, 1).key;
    } catch {
    }
    return dayKey(now + 864e5, tz);
  }
  if (/\b(today|hoy)\b/i.test(q)) return dayKey(now, tz);
  for (const [re, key] of DAY_WORDS) if (re.test(q)) return key;
  return null;
}
export function askIntent(question, now, tz) {
  const q = question.trim();
  const words = quickWords(q);
  if (!words || q.length > 160 || words.split(" ").length > QUICK_WORDS) return null;
  if (ACT_RE.test(words) || PERIOD_RE.test(words) || namesSomeone(q)) return null;
  if (NEEDS_RE.test(words)) return { kind: "needs" };
  if (CALLS_RE.test(words)) return { kind: "calls" };
  if (OPEN_RE.test(words)) return { kind: "openings", day: dayFromQuestion(q, now, tz), service: q };
  return null;
}
const C = ASK_ANSWER_CAPS;
const CITATION_KINDS = new Set(ASK_CITATION_KINDS);
const fields = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const capTo = (v, n) => clip(typeof v === "string" ? v : "", n);
const appRoute = (v) => typeof v === "string" && v.length <= 300 && /^[a-z][a-z0-9-]*(?:\/[^\s\\]*)?$/i.test(v) && !v.includes("//") ? v : null;
export function quickAnswerOf(raw) {
  const a = fields(raw);
  const say = fields(a.say);
  const headline = capTo(say.headline, C.headline);
  if (a.v !== 2 || a.form !== "structured" || !headline) return null;
  const rows = fields(a.show).items;
  const items = [];
  for (const it of (Array.isArray(rows) ? rows : []).slice(0, C.items).map(fields)) {
    const s = fields(it.source);
    const title = capTo(it.title, C.title);
    const to = appRoute(s.to);
    if (!title || !to || typeof s.kind !== "string" || !CITATION_KINDS.has(s.kind) || typeof s.id !== "string")
      return null;
    if (!s.id || s.id.length > 300) return null;
    const label = capTo(s.label, C.label) || title;
    const source = { kind: s.kind, id: s.id, label, to, door: s.door !== false };
    items.push({ title, meta: capTo(it.meta, C.meta), line: capTo(it.line, C.line), source });
  }
  const o = fields(a.do).open;
  const openTo = o ? appRoute(fields(o).to) : null;
  if (o && !openTo) return null;
  const open = openTo ? { to: openTo, label: capTo(fields(o).label, C.label), now: false } : null;
  return {
    v: 2,
    form: "structured",
    say: { headline, detail: capTo(say.detail, C.detail) },
    show: { figures: [], items, breakdown: null, list: { style: "bullets", entries: [] } },
    do: { open, next: [] },
    language: a.language === "es" || a.language === "en" ? a.language : "other"
  };
}
export function callsToday(calls, now, tz) {
  const today = dayKey(now, tz);
  return {
    missed: calls.filter((c) => missedCall(c) && c.startedAtMs && dayKey(c.startedAtMs, tz) === today),
    // On the line by the heartbeat, as Live and the strip count it: a read kept between refreshes still says `live` of
    // a call the provider has gone quiet on.
    live: calls.filter((c) => liveStillUp(c, CALL_HEARTBEAT_MS, now))
  };
}
