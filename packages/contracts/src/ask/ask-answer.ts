/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, the
 * finding; Show, what it rests on; Do, the next step. One shape for every surface that answers -- the palette, Today's
 * band, the answers that need no model, and the model's own, which it writes as structured output (ASK_ANSWER_FORMAT,
 * answer-format.ts) and the server reads back through normalizeAnswer -- and one rule for the doors it offers. Pure.
 */
import {
  ASK_CAPS,
  FOLLOWUP_ECHO,
  cleanAnswer,
  navigateLabel,
  sameQuestion,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type FastCall,
} from "./ask";
import {
  ASK_CITATION_KINDS,
  citationRoute,
  groundCitations,
  type AskCitation,
  type AskCitationKind,
  type AskReadSet,
} from "./citations";
import { PROPOSAL_SPECS, proposalSpec } from "../ask-proposals/proposals";

/* ------------------------------------------------------------------ the shape */

/** A row or a page read this turn, with the route the app gives it and whether its door is drawn (oneDoor). */
export interface AskSource extends AskCitation {
  to: string;
  door: boolean;
}
export interface AskFigure {
  value: string;
  label: string;
  note: string;
  source: AskSource | null;
}
export interface AskItem {
  title: string;
  meta: string;
  line: string;
  source: AskSource;
}
export interface AskBreakdownPart {
  label: string;
  value: number;
  warn: boolean;
}
export interface AskBreakdown {
  /** What the whole is ("customer messages"); the Line says "16 customer messages". */
  label: string;
  total: number;
  parts: AskBreakdownPart[];
  source: AskSource | null;
}
export interface AskOpen {
  to: string;
  label: string;
  /** Opened 250ms after the answer lands (ask-real.jsx), when the person asked to open, show or see it. */
  now: boolean;
}
export interface AskAnswer {
  v: 2;
  /** Structured has a headline; prose is words only (every answer made before the Line, and a refused format). */
  form: "structured" | "prose";
  say: { headline: string; detail: string };
  show: { figures: AskFigure[]; items: AskItem[]; breakdown: AskBreakdown | null };
  do: { open: AskOpen | null; next: string[] };
  language: AskLanguage;
}

/** One cap per part: read by the builders here and, from plan 3, by the format's words and its parser. */
export const ASK_ANSWER_CAPS = {
  headline: 160,
  detail: 700,
  figures: 4,
  items: 5,
  parts: 4,
  next: 2,
  value: 24,
  label: 60,
  note: 60,
  title: 80,
  meta: 60,
  line: 160,
  question: 90,
} as const;

/** One line of words in at most n characters; a longer one ends on a whole word, with an ellipsis. */
const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

const structured = (headline: string, language: AskLanguage): AskAnswer => ({
  v: 2,
  form: "structured",
  say: { headline: clip(headline, ASK_ANSWER_CAPS.headline), detail: "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [] },
  language,
});

/** The answer's words, for copy, reading aloud and a folded turn: the headline, then the detail. */
export function answerText(a: AskAnswer): string {
  return [a.say.headline, a.say.detail].filter(Boolean).join(a.form === "prose" ? "\n" : " ");
}

/* ------------------------------------------------------------- one door */

/**
 * Where a card's Open goes, or null for the kinds that have none (a reply, a rewrite, a whisper, an invite): its
 * spec's `open` (ask-proposals/). A lead search's, once approved, is the search the commit made. A kind no card has
 * opens the thread its payload names, as a thread card does.
 */
export function cardOpenRoute(p: Pick<AskProposal, "kind" | "payload" | "outcome">): string | null {
  const card = { payload: (p.payload ?? {}) as Record<string, unknown> };
  return (proposalSpec(p.kind) ?? PROPOSAL_SPECS.thread_verb).open(card, p.outcome ?? null);
}

function nextQuestions(next: string[], places: string[]): string[] {
  const out: string[] = [];
  for (const raw of next) {
    const q = clip(raw, ASK_ANSWER_CAPS.question);
    if (!q || out.some((x) => sameQuestion(x, q))) continue;
    if (FOLLOWUP_ECHO.some(([words, route]) => words.test(q) && places.some((p) => route.test(p)))) continue;
    out.push(q);
    if (out.length >= ASK_ANSWER_CAPS.next) break;
  }
  return out;
}

/**
 * A place appears once per answer (the Line, D4, section 5.5). An item is the door for its row, and the first item to
 * a place keeps it: a later one to the same place (two appointments cited to the Calendar) is drawn without one; Do's
 * Open goes when an item has its route; a card's Open is hidden when an item or Open has its route; a receipt keeps its
 * words and draws its door only when nothing else offers that route; a next question that points at an offered place
 * goes. Returns the answer as drawn and, per card, whether its Open is drawn.
 */
export function oneDoor(
  a: AskAnswer,
  cards: ReadonlyArray<Pick<AskProposal, "id" | "kind" | "payload">> = [],
): { answer: AskAnswer; cardOpen: Record<string, boolean> } {
  const offered = new Set<string>();
  const items = a.show.items.map((it) => {
    const door = !offered.has(it.source.to);
    offered.add(it.source.to);
    return { ...it, source: { ...it.source, door } };
  });
  const open = a.do.open && !offered.has(a.do.open.to) ? a.do.open : null;
  if (open) offered.add(open.to);
  const cardOpen: Record<string, boolean> = {};
  for (const c of cards) {
    const to = cardOpenRoute(c);
    cardOpen[c.id] = !!to && !offered.has(to);
    if (to && cardOpen[c.id]) offered.add(to);
  }
  const receipt = (s: AskSource | null): AskSource | null => {
    if (!s) return null;
    const door = !offered.has(s.to);
    if (door) offered.add(s.to);
    return { ...s, door };
  };
  const breakdown = a.show.breakdown ? { ...a.show.breakdown, source: receipt(a.show.breakdown.source) } : null;
  const figures = a.show.figures.map((f) => ({ ...f, source: receipt(f.source) }));
  return {
    answer: { ...a, show: { figures, items, breakdown }, do: { open, next: nextQuestions(a.do.next, [...offered]) } },
    cardOpen,
  };
}

/* ------------------------------------------------------------- old answers */

const KIND_WORDS = {
  en: { thread: "Thread", conversation: "Conversation", call: "Call", person: "Profile", page: "Page" },
  es: { thread: "Hilo", conversation: "Conversación", call: "Llamada", person: "Perfil", page: "Página" },
} as const;

/**
 * Every answer made before the Line (prose, sources, a navigate door, follow-ups) as the Line draws it: the prose form.
 * A row it cited is an item (a row the answer named); a page it cited was a door to that page, so it is Open when the
 * answer had none and goes otherwise; navigate is Open; the follow-ups are next. Kept for good: the purge drops only
 * threads untouched for 90 days (00040_ask.sql:86-103), so a thread in use keeps its old turns.
 */
export function answerFromV1(
  m: Pick<AskMessageVM, "text" | "citations" | "navigate" | "followups" | "language">,
): AskAnswer {
  const language = m.language ?? "en";
  const words = KIND_WORDS[language === "es" ? "es" : "en"];
  const cites = m.citations ?? [];
  const items: AskItem[] = cites
    .filter((c) => c.kind !== "page")
    .slice(0, ASK_ANSWER_CAPS.items)
    .map((c) => ({
      title: clip(c.label, ASK_ANSWER_CAPS.title),
      meta: words[c.kind],
      line: "",
      source: { kind: c.kind, id: c.id, label: c.label, to: c.to || citationRoute(c), door: true },
    }));
  const page = cites.find((c) => c.kind === "page");
  const nav = m.navigate && m.navigate.to ? m.navigate : null;
  const open: AskOpen | null = nav
    ? { to: nav.to, label: navigateLabel(nav, language) ?? nav.label, now: nav.now === true }
    : page
      ? { to: page.to || citationRoute(page), label: page.label, now: false }
      : null;
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: (m.text ?? "").trim() },
    show: { figures: [], items, breakdown: null },
    do: { open, next: m.followups ?? [] },
    language,
  };
}

/* ------------------------------------------------------------- quick answers */

/**
 * Who is waiting, as Today's queue draws them (TodayVM.queue.rows, six at most), how many more wait past those
 * (queue.waiting), and the runs waiting for a yes. Null is a queue not read yet: nobody is claimed to be waiting.
 */
export interface AskWaiting {
  people: Array<{
    id: string;
    kind: "thread" | "call";
    who: string;
    channel: string;
    when: string;
    line: string;
    to: string;
  }>;
  /** People waiting past the rows the queue draws. */
  more: number;
  /** A run's reach is the people it would send to. */
  runs: Array<{ id: string; label: string; reach: number; to: string }>;
  /** Searches that stopped to ask, waiting on the owner (Today's queue's search rows). */
  searches: Array<{ id: string; name: string; question: string; to: string }>;
}

/** Up to two names, then how many others: "Ana, Sam and 3 others"; a count alone when fewer names are drawn. */
const names = (list: string[], total: number, es: boolean) => {
  if (total <= 2 && list.length === total) return list.join(es ? " y " : " and ");
  if (list.length < 2)
    return es ? `${total} ${total === 1 ? "persona" : "personas"}` : `${total} ${total === 1 ? "person" : "people"}`;
  const rest = total - 2;
  return es
    ? `${list[0]}, ${list[1]} y ${rest} más`
    : `${list[0]}, ${list[1]} and ${rest} ${rest === 1 ? "other" : "others"}`;
};

const unread = (es: boolean) => (es ? "La cola de hoy aún no se ha leído." : "Today's queue hasn't been read yet.");

/**
 * Right now, in a sentence: the people waiting, then the runs waiting for a yes, then the searches waiting for an
 * answer -- three populations, three clauses.
 */
export function rightNowLine(w: AskWaiting | null, language: AskLanguage): string {
  const es = language === "es";
  if (!w) return unread(es);
  const who = w.people.map((p) => p.who);
  const total = who.length + w.more;
  const people = total
    ? es
      ? `${names(who, total, true)} ${total === 1 ? "te espera" : "te esperan"}`
      : `${names(who, total, false)} ${total === 1 ? "is" : "are"} waiting on you`
    : "";
  const n = w.runs.length;
  const runs = n
    ? es
      ? `${n === 1 ? "un envío de playbook espera" : `${n} envíos de playbook esperan`} tu aprobación`
      : `${n === 1 ? "one playbook run is" : `${n} playbook runs are`} waiting for your approval`
    : "";
  // One search is named, since its question is the thing waiting; several are only counted, like the runs.
  const k = w.searches.length;
  const searchesLine = k
    ? es
      ? k === 1
        ? `tu búsqueda de ${w.searches[0].name} espera tu respuesta`
        : `${k} búsquedas esperan tu respuesta`
      : k === 1
        ? `your search for ${w.searches[0].name} is waiting for your answer`
        : `${k} searches are waiting for your answer`
    : "";
  if (!people && !runs && !searchesLine)
    return es ? "Nadie te espera ahora mismo." : "Nobody is waiting on you right now.";
  const s = [people, runs, searchesLine].filter(Boolean).join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/**
 * The counts rightNowLine's sentence is built from, so pills beside it never disagree: people waiting (drawn and past
 * the rows), runs waiting and searches waiting.
 */
export function rightNowCounts(w: AskWaiting | null): { people: number; runs: number; searches: number } {
  return w
    ? { people: w.people.length + w.more, runs: w.runs.length, searches: w.searches.length }
    : { people: 0, runs: 0, searches: 0 };
}

/**
 * Who needs me: the sentence; the people, then the searches, then the runs, as their own doors; the Inbox only for
 * the people past what is drawn. A queue not read yet says so, and points at Today.
 */
export function needsAnswer(w: AskWaiting | null, language: AskLanguage): AskAnswer {
  const es = language === "es";
  const a = structured(rightNowLine(w, language), language);
  if (!w) {
    a.do.open = { to: "today", label: es ? "Abrir Hoy" : "Open Today", now: false };
    return a;
  }
  const all: AskItem[] = [
    ...w.people.map((p) => ({
      title: p.who,
      meta: `${p.channel} · ${p.when}`,
      line: p.line,
      source: { kind: p.kind, id: p.id, label: p.who, to: p.to, door: true },
    })),
    ...w.searches.map((x) => ({
      title: x.name,
      meta: "Leads",
      line: x.question,
      source: { kind: "page" as const, id: x.to, label: x.name, to: x.to, door: true },
    })),
    ...w.runs.map((r) => ({
      title: r.label,
      meta: "Playbook",
      line: es
        ? `${r.reach} ${r.reach === 1 ? "persona" : "personas"}`
        : `${r.reach} ${r.reach === 1 ? "person" : "people"}`,
      source: { kind: "page" as const, id: r.to, label: r.label, to: r.to, door: true },
    })),
  ];
  a.show.items = all.slice(0, ASK_ANSWER_CAPS.items);
  const total = rightNowCounts(w).people;
  const shownPeople = a.show.items.filter((i) => i.source.kind !== "page").length;
  if (total > shownPeople)
    a.do.open = {
      to: "inbox",
      label: es ? `Ver los ${total} en el Inbox` : `See all ${total} in the Inbox`,
      now: false,
    };
  return a;
}

/** Did anyone call: today's missed calls as doors, or none, with the call on the line; Do opens Live. */
export function callsAnswer(missed: FastCall[], live: FastCall[], language: AskLanguage): AskAnswer {
  const es = language === "es";
  const seeCalls: AskOpen = { to: "live", label: es ? "Ver las llamadas" : "See the calls", now: false };
  if (!missed.length) {
    const on = live.length
      ? es
        ? `; ${live.length === 1 ? "hay una llamada en curso" : `hay ${live.length} en curso`}`
        : `; ${live.length === 1 ? "one call is" : `${live.length} calls are`} on the line now`
      : "";
    const a = structured(`${es ? "Ninguna llamada perdida hoy" : "No missed calls today"}${on}.`, language);
    a.do.open = seeCalls;
    return a;
  }
  const a = structured(
    es
      ? `${missed.length === 1 ? "Una llamada perdida" : `${missed.length} llamadas perdidas`} hoy.`
      : `${missed.length === 1 ? "One missed call" : `${missed.length} missed calls`} today.`,
    language,
  );
  a.show.items = missed.slice(0, ASK_ANSWER_CAPS.items).map((c) => ({
    title: c.who,
    meta: es ? "Perdida" : "Missed",
    line: "",
    source: { kind: "call", id: c.callId, label: c.who, to: `conversations/cv-${c.callId}`, door: true },
  }));
  a.do.open = seeCalls;
  return a;
}

/**
 * The openings route's days, as the palette reads them (legacy-bridge/ask/api.ts `openings`). The route's `text` is
 * the receptionist's instruction ("Offer up to three of these…"), never an owner's sentence, so the answer is said
 * from the days.
 */
export interface AskOpeningsView {
  state: "ok" | "no_calendar" | "unavailable";
  days: Array<{ key: string; label: string; windows: string[] }>;
}

// The route reads only the day asked about when one was (askIntent's `day`), so an empty answer is that day's.
const openingsHeadline = (days: AskOpeningsView["days"], es: boolean, asked: boolean): string => {
  if (!days.length && asked)
    return es ? "No hay nada libre en el calendario ese día." : "Nothing is open on the calendar that day.";
  if (!days.length)
    return es
      ? "No hay nada libre en el calendario en los próximos días."
      : "Nothing is open on the calendar in the days ahead.";
  if (days.length === 1) {
    const n = days[0].windows.length;
    return es
      ? `${days[0].label}: ${n} ${n === 1 ? "hora libre" : "horas libres"} en el calendario.`
      : `The calendar has ${n} open ${n === 1 ? "time" : "times"} on ${days[0].label}.`;
  }
  return es
    ? `El calendario tiene horas libres en ${days.length} días.`
    : `The calendar has open times on ${days.length} days.`;
};

/** What is open: the days as items, each a door to its day on the Calendar; Do opens the Calendar. */
export function openingsAnswer(o: AskOpeningsView, language: AskLanguage, day: string | null = null): AskAnswer {
  const es = language === "es";
  if (o.state === "no_calendar") {
    const a = structured(
      es
        ? "No hay calendario conectado, así que no veo horas libres."
        : "No calendar is connected, so I can't see open times.",
      language,
    );
    a.say.detail = es ? "El horario está en Ajustes." : "The hours are in Settings.";
    a.do.open = { to: "admin/integrations", label: es ? "Conectar un calendario" : "Connect a calendar", now: false };
    return a;
  }
  if (o.state === "unavailable")
    return structured(
      es ? "No se pudo leer el calendario ahora." : "The calendar couldn't be read right now.",
      language,
    );
  const days = o.days.filter((d) => d.windows.length);
  const a = structured(openingsHeadline(days, es, !!day), language);
  a.show.items = days.slice(0, ASK_ANSWER_CAPS.items).map((d) => ({
    title: d.label,
    meta: "",
    line: d.windows.join(" · "),
    source: { kind: "page", id: `calendar/${d.key}`, label: d.label, to: `calendar/${d.key}`, door: true },
  }));
  a.do.open = { to: "calendar", label: es ? "Abrir el Calendario" : "Open the Calendar", now: false };
  return a;
}

/* ------------------------------------------------------ what the model writes */

/** What the model names: a row or a page it read this turn, or none. It never writes a route (D5). */
export interface AskSourceRef {
  kind: AskCitationKind | "none";
  id: string;
  label: string;
}

const C = ASK_ANSWER_CAPS;

/* ------------------------------------------------------ what the server reads */

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** A string as the Line may draw it: no tags (cleanAnswer), one line of words, at most its cap. */
const words = (v: unknown, n: number) => clip(cleanAnswer(typeof v === "string" ? v : ""), n);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ROW_KINDS = ["call", "thread", "conversation", "person"] as const;
/** A route that names a row -- a thread, a call, a person -- whatever id it carries: never a page. */
const ROW_ROUTE = /^(inbox\/th-|conversations\/cv-|clients\/(?!leads(?:[/:]|$)|seg:|list:))/;

/**
 * A source grounded in this turn's reads, with the route the app gives it; null for kind none or a row not read.
 * The model names a row by the id a tool gave, but also by its route ("inbox/th-<id>", "conversations/cv-<id>") and
 * now and then under another kind, and dropping a real row over its spelling left "Opening the call…" opening nothing:
 * any spelling of a row read this turn is that row, as the kind written if that kind read it, else the kind that did.
 * A page is a route that names no row: an id inside one is a row, and must have been read.
 */
function groundRef(v: unknown, read: AskReadSet): AskSource | null {
  const r = asObj(v);
  const kind = typeof r.kind === "string" ? r.kind : "none";
  const spelled = typeof r.id === "string" ? r.id.trim().replace(/^#?\/+/, "") : "";
  if (!spelled || !(ASK_CITATION_KINDS as readonly string[]).includes(kind)) return null;
  const label = words(r.label, C.label) || spelled;
  const row = UUID.exec(spelled)?.[0].toLowerCase();
  const tries: AskCitation[] = row
    ? [kind, ...ROW_KINDS].filter((k) => k !== "page").map((k) => ({ kind: k as AskCitationKind, id: row, label }))
    : [
        ...(kind === "page" ? [] : [{ kind: kind as AskCitationKind, id: spelled, label }]),
        // A row's route with an id cut short or misspelled names no row read, and is no page either.
        ...(ROW_ROUTE.test(spelled) ? [] : [{ kind: "page" as const, id: spelled, label }]),
      ];
  const kept = groundCitations(tries, read).kept[0];
  return kept ? { ...kept, to: citationRoute(kept), door: true } : null;
}

export type AskAnswerRead = { ok: true; answer: AskAnswer; dropped: number } | { ok: false; error: string };

/**
 * The model's answer, as the Line may draw it (spec 5.4): every string cleaned and cut to its cap, every array cut to
 * its cap, and every source grounded in this turn's reads with its route derived (a route the model writes is never
 * taken). An item is its row, so an item whose row was not read goes; a figure or a breakdown keeps its words and loses
 * its receipt. A breakdown draws only when it says what the whole is and two to four parts add up exactly to its
 * total. Kind none, or a place not read, is no Open. With no headline it is no answer. `dropped` counts the sources that named a row not read.
 * One door (oneDoor) runs after, with the turn's cards.
 */
export function normalizeAnswer(raw: unknown, read: AskReadSet, fallback: AskLanguage): AskAnswerRead {
  let json: unknown = raw;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const root = asObj(json);
  const say = asObj(root.say);
  const headline = words(say.headline, C.headline);
  if (!headline) return { ok: false, error: "no headline" };
  // English or Spanish as the model says; anything else is the turn's own (detectLanguage), as it was before the Line.
  const language: AskLanguage = root.language === "en" || root.language === "es" ? root.language : fallback;
  let dropped = 0;
  const ground = (v: unknown): AskSource | null => {
    const s = groundRef(v, read);
    const r = asObj(v);
    if (!s && typeof r.kind === "string" && r.kind !== "none" && typeof r.id === "string" && r.id.trim()) dropped++;
    return s;
  };
  const show = asObj(root.show);
  const figures: AskFigure[] = [];
  for (const f of asArr(show.figures).map(asObj)) {
    const value = words(f.value, C.value);
    if (!value) continue;
    figures.push({ value, label: words(f.label, C.label), note: words(f.note, C.note), source: ground(f.source) });
    if (figures.length >= C.figures) break;
  }
  const items: AskItem[] = [];
  for (const it of asArr(show.items).map(asObj)) {
    const title = words(it.title, C.title);
    const source = ground(it.source);
    if (!title || !source) continue;
    items.push({ title, meta: words(it.meta, C.meta), line: words(it.line, C.line), source });
    if (items.length >= C.items) break;
  }
  const b = asObj(show.breakdown);
  const parts = asArr(b.parts)
    .map(asObj)
    .map((p) => ({ label: words(p.label, C.label), value: num(p.value), warn: p.warn === true }));
  const total = num(b.total);
  const whole = words(b.label, C.label);
  const adds =
    !!whole &&
    parts.length >= 2 &&
    parts.length <= C.parts &&
    parts.every((p) => p.label && Number.isFinite(p.value) && p.value >= 0) &&
    Number.isFinite(total) &&
    Math.abs(parts.reduce((s, p) => s + p.value, 0) - total) < 1e-9;
  const breakdown: AskBreakdown | null = adds ? { label: whole, total, parts, source: ground(b.source) } : null;
  const d = asObj(root.do);
  const o = asObj(d.open);
  const at = ground(o.source);
  const open: AskOpen | null = at
    ? {
        to: at.to,
        label: navigateLabel({ to: at.to, label: words(o.label, C.label) || at.label }, language) ?? at.label,
        now: o.now === true,
      }
    : null;
  const next = asArr(d.next)
    .map((q) => words(q, C.question))
    .filter(Boolean)
    .slice(0, C.next);
  return {
    ok: true,
    answer: {
      v: 2,
      form: "structured",
      say: { headline, detail: words(say.detail, C.detail) },
      show: { figures, items, breakdown },
      do: { open, next },
      language,
    },
    dropped,
  };
}

/** Every word an answer says, for the "not from your data" check (isUngrounded): Say, and Show's strings. */
export function answerWords(a: AskAnswer): string {
  return [
    a.say.headline,
    a.say.detail,
    ...a.show.figures.flatMap((f) => [f.value, f.label, f.note]),
    ...a.show.items.flatMap((i) => [i.title, i.meta, i.line]),
    ...(a.show.breakdown
      ? [
          a.show.breakdown.label,
          String(a.show.breakdown.total),
          ...a.show.breakdown.parts.flatMap((p) => [p.label, String(p.value)]),
        ]
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The string value of `"key": "…"` in a JSON prefix, decoded as far as it has arrived: up to the first unescaped
 * quote, or the end of what is there.
 */
function partialField(s: string, key: string): string {
  const k = s.indexOf(`"${key}"`);
  if (k < 0) return "";
  const colon = s.indexOf(":", k + key.length + 2);
  if (colon < 0) return "";
  let i = colon + 1;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '"') return "";
  i++;
  let out = "";
  while (i < s.length) {
    const c = s[i];
    if (c === '"') break;
    if (c === "\\") {
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === "u") {
        const hex = s.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 0x20);
        i += 6;
        continue;
      }
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n === "b" ? "\b" : n === "f" ? "\f" : n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Say while the answer's JSON is still arriving (spec 7.4): the headline and the detail so far, from wherever `say`
 * appears; null before it does. A preview only: the final message is the truth.
 */
export function partialSay(prefix: string): { headline: string; detail: string } | null {
  const at = prefix.indexOf('"say"');
  if (at < 0) return null;
  const rest = prefix.slice(at);
  return { headline: partialField(rest, "headline"), detail: partialField(rest, "detail") };
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** The answer when a round proposed and nothing else, every card made: the cards are the Do, with no second round. */
export function answerForCards(cards: ReadonlyArray<Pick<AskProposal, "title">>, language: AskLanguage): AskAnswer {
  const es = language === "es";
  const n = cards.length;
  const a = structured(
    n === 1
      ? es
        ? sentence(`Una tarjeta para revisar: ${cards[0].title}`)
        : sentence(`One card to review: ${cards[0].title}`)
      : es
        ? `${n} tarjetas para revisar.`
        : `${n} cards to review.`,
    language,
  );
  a.say.detail =
    n === 1
      ? es
        ? "Apruébala, cámbiala o descártala: nada pasa hasta que lo hagas."
        : "Approve it, change it or dismiss it: nothing happens until you do."
      : es
        ? "Aprueba, cambia o descarta cada una: nada pasa hasta que lo hagas."
        : "Approve, change or dismiss each: nothing happens until you do.";
  return a;
}

/** A turn that could not be answered: its sentence as the headline (spec 5.4, step 6). The message is marked failed. */
export function failedAnswer(sentenceText: string, language: AskLanguage): AskAnswer {
  return structured(sentenceText, language);
}

/** The most a prose answer says: what the old answer field held. */
const PROSE_MAX = 1500;

/** Words with no shape: a turn whose format the API refused (D15). */
export function proseAnswer(text: string, language: AskLanguage): AskAnswer {
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: cleanAnswer(text).slice(0, PROSE_MAX) },
    show: { figures: [], items: [], breakdown: null },
    do: { open: null, next: [] },
    language,
  };
}

/**
 * The v1 fields a v2 answer is stored beside (spec 5.8): its words for the history, copy and search; the sources it
 * rests on as citations, with their routes (the erase route finds a person by them); Open as navigate; next as the
 * follow-ups. Read back by every reader of v1 and by answerFromV1. Not an identity round trip.
 */
export function v1FromAnswer(a: AskAnswer): Pick<AskMessageVM, "text" | "citations" | "navigate" | "followups"> {
  const seen = new Set<string>();
  const citations: AskMessageVM["citations"] = [];
  const add = (s: AskSource | null) => {
    if (!s || seen.has(`${s.kind}:${s.id}`)) return;
    seen.add(`${s.kind}:${s.id}`);
    citations.push({ kind: s.kind, id: s.id, label: s.label, to: s.to });
  };
  for (const i of a.show.items) add(i.source);
  for (const f of a.show.figures) add(f.source);
  add(a.show.breakdown ? a.show.breakdown.source : null);
  return {
    text: answerText(a),
    citations: citations.slice(0, ASK_CAPS.citations),
    navigate: a.do.open ? { to: a.do.open.to, label: a.do.open.label, now: a.do.open.now } : null,
    followups: a.do.next,
  };
}
