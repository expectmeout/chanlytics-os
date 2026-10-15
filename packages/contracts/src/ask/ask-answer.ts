/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, the
 * finding; Show, what it rests on; Do, the next step. One shape for every surface that answers -- the palette, Today's
 * band, the answers that need no model, and the model's own, which it writes as structured output (ASK_ANSWER_FORMAT,
 * answer-format.ts) and the server reads back through normalizeAnswer -- and one rule for the doors it offers. Pure.
 */
import { ASK_CAPS, type AskMessageVM, type AskProposal } from "./ask";
import { FOLLOWUP_ECHO, cleanAnswer, firstSentence, navigateLabel, sameQuestion } from "./answer-text";
import type { AskLanguage } from "./ask-language";
import { CALENDAR_SETTING_ROUTE } from "../setup/calendar-source";
import type { FastCall } from "./ask-fast-paths";
import {
  ASK_CITATION_KINDS,
  citationRoute,
  groundCitations,
  type AskCitation,
  type AskCitationKind,
  type AskReadSet,
} from "./citations";
import { PROPOSAL_SPECS, proposalSpec } from "../ask-proposals/proposals";
import { planCountWords } from "./plan-steps";
import { rightNowCounts, rightNowLine, type AskWaiting } from "./ask-waiting";
import { canonicalRoute } from "../shell/address";

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
/** How a list is marked: a bullet, a number (steps, an order), or nothing, one entry to a line. */
export const ASK_LIST_STYLES = ["bullets", "numbers", "lines"] as const;
type AskListStyle = (typeof ASK_LIST_STYLES)[number];
/**
 * What the person asked to see as a list, and steps to follow: points in words, never rows (a row is an item, its own
 * door). Each entry is one point with no mark of its own: the Line draws the bullet, the number or the line. With no
 * entries, `numbers` numbers the items instead (a numbered list of who needs you is its rows, numbered).
 */
export interface AskList {
  style: AskListStyle;
  entries: string[];
}
export interface AskAnswer {
  v: 2;
  /** Structured has a headline; prose is words only (every answer made before the Line, and a refused format). */
  form: "structured" | "prose";
  say: { headline: string; detail: string };
  show: { figures: AskFigure[]; items: AskItem[]; breakdown: AskBreakdown | null; list: AskList };
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
  entries: 15,
  entry: 160,
  next: 2,
  value: 24,
  label: 60,
  note: 60,
  title: 80,
  meta: 60,
  line: 160,
  question: 90,
} as const;

/** No list: what every answer carries until one is asked for, and what an answer stored before the list part reads as. */
const noList = (): AskList => ({ style: "bullets", entries: [] });

/** An answer as it was stored, whole: one stored before the list part has none, and reads as having no list. */
export function storedAnswer(a: AskAnswer): AskAnswer {
  return a.show.list ? a : { ...a, show: { ...a.show, list: noList() } };
}

/** `t`, at most n characters: a longer one ends on a whole word, with an ellipsis. */
const cutAt = (t: string, n: number) => {
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.search(/\s\S*$/);
  return `${(space > n / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/**
 * One line of words in at most n characters; a longer one ends on a whole word, with an ellipsis. Every part of an
 * answer but the detail is cut by it, and so is every part of an earlier answer's line in a cold turn's history
 * (server/ask/prompt.ts).
 */
export const clip = (s: string | null | undefined, n: number) => cutAt((s ?? "").replace(/\s+/g, " ").trim(), n);

/**
 * Words that keep their lines, in at most n characters: spaces run together within a line, each line trimmed, at most
 * one empty line between two, cut on a whole word as clip cuts. The detail is cut by it, while it streams and when it
 * lands, so the lines the preview showed are the lines the answer keeps.
 */
const clipLines = (s: string | null | undefined, n: number) =>
  cutAt(
    (s ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    n,
  );

const structured = (headline: string, language: AskLanguage): AskAnswer => ({
  v: 2,
  form: "structured",
  say: { headline: clip(headline, ASK_ANSWER_CAPS.headline), detail: "" },
  show: { figures: [], items: [], breakdown: null, list: noList() },
  do: { open: null, next: [] },
  language,
});

/** A list's entries as lines of text, each with its mark: "• ", "1. ", or none. */
function listLines(l: AskList): string[] {
  return l.entries.map((e, i) => (l.style === "numbers" ? `${i + 1}. ${e}` : l.style === "bullets" ? `• ${e}` : e));
}

/** The answer's words, for copy, a folded turn and the history: the headline, then the detail, then the list, a line each. */
export function answerText(a: AskAnswer): string {
  const say = [a.say.headline, a.say.detail].filter(Boolean).join(a.form === "prose" ? "\n" : " ");
  return [say, ...listLines(a.show.list ?? noList())].filter(Boolean).join("\n");
}

/** The answer as Copy takes it: its words (answerText), then its parts, each figure and each row, a line each. */
export function answerCopy(a: AskAnswer): string {
  const b = a.show.breakdown;
  return [
    answerText(a),
    ...(b ? [`${b.total} ${b.label}: ${b.parts.map((p) => `${p.label} ${p.value}`).join(", ")}`] : []),
    ...a.show.figures.map((f) => `${[f.value, f.label].filter(Boolean).join(" ")}${f.note ? ` (${f.note})` : ""}`),
    ...a.show.items.map((it) => [it.title, it.meta, it.line].filter(Boolean).join(" · ")),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lines said one after another: each ends as a sentence does, so a voice pauses between them. */
const sentences = (lines: string[]) =>
  lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?…:;,]$/.test(l) ? l : `${l}.`))
    .join(" ");

/** A list as a voice reads it: each entry its own sentence, a numbered one with its number; nothing for no entries. */
export function listSpoken(l: AskList): string {
  return sentences(l.entries.map((e, i) => (l.style === "numbers" ? `${i + 1}. ${e}` : e)));
}

/**
 * The answer's words as a voice reads them (Read aloud, a spoken question, the voice door): the headline, the detail's
 * lines, then the list (listSpoken). The figures and rows are drawn, never read.
 */
export function answerSpoken(a: AskAnswer): string {
  return [sentences([a.say.headline, ...a.say.detail.split("\n")]), listSpoken(a.show.list ?? noList())]
    .filter(Boolean)
    .join(" ");
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
 * goes. Returns the answer as drawn and, per card, whether its Open is drawn. A place is its canonical route (canonicalRoute):
 * the readers spell a campaign `outbound/<id>` and the cards `campaigns/moment:<id>`, which are one place, and so are
 * `people/<id>` and `clients/<id>`; the routes the answer carries are left as they were written.
 */
export function oneDoor(
  a: AskAnswer,
  cards: ReadonlyArray<Pick<AskProposal, "id" | "kind" | "payload">> = [],
): { answer: AskAnswer; cardOpen: Record<string, boolean> } {
  const offered = new Set<string>();
  const items = a.show.items.map((it) => {
    const door = !offered.has(canonicalRoute(it.source.to));
    offered.add(canonicalRoute(it.source.to));
    return { ...it, source: { ...it.source, door } };
  });
  const open = a.do.open && !offered.has(canonicalRoute(a.do.open.to)) ? a.do.open : null;
  if (open) offered.add(canonicalRoute(open.to));
  const cardOpen: Record<string, boolean> = {};
  for (const c of cards) {
    const to = cardOpenRoute(c);
    cardOpen[c.id] = !!to && !offered.has(canonicalRoute(to));
    if (to && cardOpen[c.id]) offered.add(canonicalRoute(to));
  }
  const receipt = (s: AskSource | null): AskSource | null => {
    if (!s) return null;
    const door = !offered.has(canonicalRoute(s.to));
    if (door) offered.add(canonicalRoute(s.to));
    return { ...s, door };
  };
  const breakdown = a.show.breakdown ? { ...a.show.breakdown, source: receipt(a.show.breakdown.source) } : null;
  const figures = a.show.figures.map((f) => ({ ...f, source: receipt(f.source) }));
  return {
    answer: {
      ...a,
      show: { figures, items, breakdown, list: a.show.list ?? noList() },
      do: { open, next: nextQuestions(a.do.next, [...offered]) },
    },
    cardOpen,
  };
}

/* ------------------------------------------------------------- old answers */

const KIND_WORDS: Record<"en" | "es", Record<AskCitationKind, string>> = {
  en: {
    thread: "Thread",
    conversation: "Conversation",
    call: "Call",
    person: "Profile",
    page: "Page",
    lead: "Lead",
    search: "Search",
    deal: "Deal",
    list: "List",
    broadcast: "Broadcast",
    playbook: "Campaign",
    template: "Template",
    mailbox: "Mailbox",
    visit: "Booking",
    review: "Review",
  },
  es: {
    thread: "Hilo",
    conversation: "Conversación",
    call: "Llamada",
    person: "Perfil",
    page: "Página",
    lead: "Lead",
    search: "Búsqueda",
    deal: "Acuerdo",
    list: "Lista",
    broadcast: "Difusión",
    playbook: "Campaña",
    template: "Plantilla",
    mailbox: "Buzón",
    visit: "Cita",
    review: "Reseña",
  },
};

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
    show: { figures: [], items, breakdown: null, list: noList() },
    do: { open, next: m.followups ?? [] },
    language,
  };
}

/* ------------------------------------------------------------- quick answers */

/**
 * Who needs me: the sentence; the people, then the searches, then the runs, then the closing windows, as their own
 * doors; the Inbox only for the people past what is drawn. A queue not read yet says so, and points at Today.
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
      // The word a cited campaign's item says, in the answer's language.
      meta: KIND_WORDS[es ? "es" : "en"].playbook,
      line: es
        ? `${r.reach} ${r.reach === 1 ? "persona" : "personas"}`
        : `${r.reach} ${r.reach === 1 ? "person" : "people"}`,
      source: { kind: "page" as const, id: r.to, label: r.label, to: r.to, door: true },
    })),
    // A reply window closing: its thread is the door, and it is never one of the people who need you.
    ...w.windows.map((p) => ({
      title: p.who,
      meta: es ? "Ventana de respuesta por cerrar" : "Reply window closing",
      line: p.line,
      source: { kind: "thread" as const, id: p.id, label: p.who, to: p.to, door: true },
    })),
  ];
  a.show.items = all.slice(0, ASK_ANSWER_CAPS.items);
  const total = rightNowCounts(w).people;
  // The people come first, so the ones drawn are the first of them: a window drawn is never counted as one.
  const shownPeople = Math.min(w.people.length, ASK_ANSWER_CAPS.items);
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
  /**
   * With no calendar link: what the calendar is fed by instead, where anything is (setup/calendar-source.ts): the
   * tool whose booking emails arrive, by the name the product says it, or the owner's word that they book by hand.
   * Null or absent for neither, and on an answer from a route before it.
   */
  instead?: { by: "emails"; tool: string } | { by: "hand" } | null;
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

/**
 * No calendar link to read open times from, said for what the business does have. Bookings that arrive by email are on
 * the Calendar, and the door goes there: it said "No calendar is connected" to such a business and sent it to
 * Connections, beside a board that showed its bookings. Otherwise the door is the Business row that connects one
 * (CALENDAR_SETTING_ROUTE), where it went to Connections, whose own row then sent the owner on to Business.
 */
function noCalendarAnswer(instead: NonNullable<AskOpeningsView["instead"]> | null, language: AskLanguage): AskAnswer {
  const es = language === "es";
  const said =
    instead?.by === "emails"
      ? es
        ? `Las reservas llegan por correo desde ${instead.tool} y están en el Calendario, pero sin un enlace de calendario no veo horas libres.`
        : `Bookings arrive by email from ${instead.tool} and are on the Calendar, but without a calendar link I can't see open times.`
      : instead?.by === "hand"
        ? es
          ? "Tomas las reservas tú, así que no hay calendario del que leer horas libres."
          : "You take bookings yourself, so there is no calendar for me to read open times from."
        : es
          ? "No hay calendario conectado, así que no veo horas libres."
          : "No calendar is connected, so I can't see open times.";
  const a = structured(said, language);
  a.say.detail = es ? "El horario está en Ajustes." : "The hours are in Settings.";
  a.do.open =
    instead?.by === "emails"
      ? { to: "calendar", label: es ? "Abrir el Calendario" : "Open the Calendar", now: false }
      : { to: CALENDAR_SETTING_ROUTE, label: es ? "Conectar un calendario" : "Connect a calendar", now: false };
  return a;
}

/** What is open: the days as items, each a door to its day on the Calendar; Do opens the Calendar. */
export function openingsAnswer(o: AskOpeningsView, language: AskLanguage, day: string | null = null): AskAnswer {
  const es = language === "es";
  if (o.state === "no_calendar") return noCalendarAnswer(o.instead ?? null, language);
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
/** Markdown's emphasis, which the Line never draws: `**word**` and `__word__` are the word. */
const unbold = (s: string) => s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2");
const drawnText = (v: unknown) => unbold(cleanAnswer(typeof v === "string" ? v : ""));
/** A string as the Line may draw it: no tags (cleanAnswer), no emphasis marks, one line of words, at most its cap. */
const words = (v: unknown, n: number) => clip(drawnText(v), n);
/** A list's entry: its words, without the bullet or number the model now and then writes, since the Line draws its own. */
const entry = (v: unknown) =>
  words(typeof v === "string" ? v.replace(/^\s*(?:[-*•·–]|\d{1,2}[.)])\s+/, "") : "", C.entry);

/**
 * Say as the Line draws it, the same while it streams (partialSay) and when it lands (normalizeAnswer): the headline
 * its first sentence, on one line of words, and the detail its own lines (clipLines), opening with whatever the
 * headline said past that sentence; each cleaned as every string is and cut at its cap.
 */
export function sayAsDrawn(say: { headline?: unknown; detail?: unknown }): { headline: string; detail: string } {
  const [headline, more] = firstSentence(drawnText(say.headline).replace(/\s+/g, " ").trim());
  const detail = drawnText(say.detail);
  return {
    headline: clip(headline, C.headline),
    detail: clipLines(more && detail ? `${more} ${detail}` : more || detail, C.detail),
  };
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

/** Every id in what the model spelled: global, so a route that carries two is read whole (groundRef takes the last). */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** The twelve kinds of row, in the grammar's order: a row not read as the kind written is looked for under each. */
const ROW_KINDS = ASK_CITATION_KINDS.filter((k) => k !== "page");
/**
 * A route that names a row -- a thread, a call, a person, a list of the workspace's own, a playbook, a broadcast, a
 * lead or a search -- whatever id it carries: never a page.
 */
const ROW_ROUTE =
  /^(inbox\/th-|conversations\/cv-|outbound\/|broadcasts\/run:|clients\/leads.*:[sp]-|clients\/(?!leads(?:[/:]|$)|seg:))/;

/**
 * A source grounded in this turn's reads, opened where its reader said (the read set's RowRef); null for kind none or a
 * row not read. The model names a row by the id a tool gave, but also by its route ("inbox/th-<id>",
 * "conversations/cv-<id>") and now and then under another kind, and dropping a real row over its spelling left
 * "Opening the call…" opening nothing: any spelling of a row read this turn is that row -- by the id inside it, or as
 * spelled when its id is a name (a People list's, `quiet`) -- as the kind written if that kind read it, else the kind
 * that did. A page is a route that names no row: an id inside one is a row, and must have been read. A source written
 * as a page is tried as that page first, so People's address (`clients`) is People, never the built-in list of the same
 * name, which a list's own spelling still reaches.
 */
function groundRef(v: unknown, read: AskReadSet): AskSource | null {
  const r = asObj(v);
  const kind = typeof r.kind === "string" ? r.kind : "none";
  const spelled = typeof r.id === "string" ? r.id.trim().replace(/^#?\/+/, "") : "";
  if (!spelled || !(ASK_CITATION_KINDS as readonly string[]).includes(kind)) return null;
  const label = words(r.label, C.label) || spelled;
  // The row is the route's LAST id: every row's route carries one, but a lead's on a search's view carries the search's
  // first (leadsRoute: `clients/leads:s-<search>:p-<lead>`, the open lead last), and the lead is the row it names.
  const ids = spelled.match(UUID);
  const row = ids?.[ids.length - 1]?.toLowerCase();
  // A row's route with an id cut short or misspelled names no row read, and is no page either.
  const page = row || ROW_ROUTE.test(spelled) ? [] : [{ kind: "page" as const, id: spelled, label }];
  const tries: AskCitation[] = [
    ...(kind === "page" ? page : []),
    ...[kind, ...ROW_KINDS]
      .filter((k) => k !== "page")
      .map((k) => ({ kind: k as AskCitationKind, id: row ?? spelled, label })),
    ...page,
  ];
  const kept = groundCitations(tries, read).kept[0];
  return kept ? { ...kept, to: citationRoute(kept, read), door: true } : null;
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
  const say = sayAsDrawn(asObj(root.say));
  const headline = say.headline;
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
  const l = asObj(show.list);
  const list: AskList = {
    style: ASK_LIST_STYLES.find((x) => x === l.style) ?? "bullets",
    entries: asArr(l.entries).map(entry).filter(Boolean).slice(0, C.entries),
  };
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
      say,
      show: { figures, items, breakdown, list },
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
    ...a.show.list.entries,
  ]
    .filter(Boolean)
    .join(" ");
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * The answer when a round proposed and nothing else, every card made: the cards are the Do, with no second round. A
 * plan's cards are counted as its steps, and a plan's words are the detail, cut on a whole word (plan-steps.ts
 * planCountWords; `words` null for a round that made no plan); the loop's headline for an answer that claimed a write is
 * this one's too.
 */
export function answerForCards(
  cards: ReadonlyArray<Pick<AskProposal, "title" | "plan">>,
  language: AskLanguage,
  words: string | null,
): AskAnswer {
  const es = language === "es";
  const n = cards.length;
  const plan = planCountWords(cards, language, words);
  const a = structured(
    plan.headline ??
      (n === 1
        ? es
          ? sentence(`Una tarjeta para revisar: ${cards[0].title}`)
          : sentence(`One card to review: ${cards[0].title}`)
        : es
          ? `${n} tarjetas para revisar.`
          : `${n} cards to review.`),
    language,
  );
  a.say.detail = clip(
    plan.detail ??
      (n === 1
        ? es
          ? "Apruébala, cámbiala o descártala: nada pasa hasta que lo hagas."
          : "Approve it, change it or dismiss it: nothing happens until you do."
        : es
          ? "Cada una se aprueba por separado: apruébala, cámbiala o descártala; nada pasa hasta que lo hagas."
          : "Each is its own press: approve, change or dismiss each one; nothing happens until you do."),
    ASK_ANSWER_CAPS.detail,
  );
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
    show: { figures: [], items: [], breakdown: null, list: noList() },
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
