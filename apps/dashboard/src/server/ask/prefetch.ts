import type { ToolRun } from "./tools";

/**
 * Reads made before the model is asked.
 *
 * Two rounds is the shape of most turns that read: one to choose the tool,
 * one to answer with its rows. When the question says plainly what it needs
 * — the week's report, tomorrow's calendar, the playbooks, the audiences,
 * the calls — the read can run beside the snapshot and ride into the first
 * round as data, and the model answers at once. The table is deliberately
 * narrow: a wrong read costs tokens and says nothing false, a missed one
 * costs the round it always cost. The model may still call any tool; a
 * prefetch is a head start, not a decision.
 */
export const PREFETCH_MAX = 2;

const DAY_WORDS: Array<[RegExp, string]> = [
  [/\b(tomorrow|mañana)\b/i, "tomorrow"],
  [/\b(today|hoy)\b/i, "today"],
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|miércoles|miercoles)\b/i, "wed"],
  [/\b(thu|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|sábado|sabado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"],
];

function dayOf(q: string, fallback: string): string {
  for (const [re, d] of DAY_WORDS) if (re.test(q)) return d;
  return fallback;
}

function daysOf(q: string): 7 | 30 | 90 {
  if (/\b(90|ninety|quarter|noventa|trimestre)\b/i.test(q)) return 90;
  if (/\b(30|thirty|month|treinta|mes)\b/i.test(q)) return 30;
  return 7;
}

const REPORT =
  /\breports?\b|\binforme\b|\b(last|past|previous|these|últimos?|ultimos?)\s+(7|seven|30|thirty|90|ninety|siete|treinta|noventa)\s*(days|días|dias)\b|\bhow (did|was|were|are|is)\b.*\b(week|month|days|semana|mes)\b|\bcómo (fue|va|nos fue|estuvo)\b/i;
const OPENINGS =
  /\bopenings?\b|\bavailab|\bfree (slots?|times?|spots?)\b|\bslots?\b|\bhuecos?\b|\bdisponib|\bopen (on |this |next |el |este |próximo |proximo )?(mon|tue|wed|thu|fri|sat|sun|today|tomorrow|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|mañana)/i;
const CALENDAR = /\bcalendar\b|\bcalendario\b|\bagenda\b|\bappointments?\b|\bcitas?\b|\bwhat'?s on\b|\bqué hay\b/i;
const PLAYBOOKS = /\bplaybooks?\b|\bwin-?back\b|\bsave our number\b|\bmonth'?s offer\b|\bstanding (rules?|offers?)\b/i;
const AUDIENCES =
  /\baudiences?\b|\bsaid yes\b|\bopted[- ]in\b|\boffers?\b|\bbroadcasts?\b|\bcampaigns?\b|\btemplates?\b|\bquiet (clients|customers|people)\b|\bdijeron que s[ií]\b|\bofertas?\b|\bplantillas?\b/i;
const MISSED = /\bmissed calls?\b|\bllamadas? perdidas?\b/i;
const CALLS = /\btranscripts?\b|\brecordings?\b|\bcalls?\b|\bcalled\b|\bllam(ó|o|aron|ada|adas|ar)\b|\bgrabaci[oó]n\b/i;

/** The reads a question names plainly, at most PREFETCH_MAX, in the order the tools are listed. */
export function prefetchPlan(text: string): ToolRun[] {
  const q = text.replace(/\s+/g, " ").trim();
  const out: ToolRun[] = [];
  const add = (name: string, input: Record<string, unknown>) => {
    if (!out.some((r) => r.name === name)) out.push({ name, input });
  };
  if (REPORT.test(q)) add("get_report", { days: daysOf(q) });
  if (OPENINGS.test(q)) add("get_openings", { day: dayOf(q, ""), service: "" });
  else if (CALENDAR.test(q)) add("get_calendar", { day: dayOf(q, "today") });
  if (PLAYBOOKS.test(q)) add("list_playbooks", {});
  if (AUDIENCES.test(q)) add("list_audiences", {});
  if (MISSED.test(q)) add("list_calls", { filter: "missed" });
  else if (CALLS.test(q)) add("list_calls", { filter: "recent" });
  return out.slice(0, PREFETCH_MAX);
}

/** The block the first round carries: what was read, as data, and how to treat it. */
export function prefetchBlock(reads: ReadonlyArray<{ run: ToolRun; result: string }>): string {
  if (!reads.length) return "";
  return [
    "Read for this question before you were asked — the same rows those tools return now. Cite their ids as read this turn; call the tool again only for a different input.",
    ...reads.map((r) => `${r.run.name} ${JSON.stringify(r.run.input)} → ${r.result}`),
  ].join("\n");
}
