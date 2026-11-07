/** Answer: shape. */

import type { AskMessageVM } from "../thread-words";
import { FOLLOWUP_ECHO, navigateLabel, sameQuestion, storedChart, type AskChart } from "../answer-text";
import type { AskLanguage } from "../language";
import type { FastCall } from "../fast-paths";
import { citationRoute, type AskCitation, type AskCitationKind } from "../citations";
import { rightNowCounts, rightNowLine, type AskWaiting } from "../waiting";
import { canonicalRoute } from "../../shell/address";

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
  /** Opened 250ms after the answer lands (surfaces/ask/line/), when the person asked to open, show or see it. */
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
  /** `chart` only where one was drawn (the answer canvas, C3): an answer stored before it has none. */
  show: { figures: AskFigure[]; items: AskItem[]; breakdown: AskBreakdown | null; chart?: AskChart; list: AskList };
  do: { open: AskOpen | null; next: string[] };
  language: AskLanguage;
}

/**
 * One cap per part: read by the builders here and by the format's words and its parser. The detail is the answer's
 * body, as long as the question needs (a table, steps under headings), so its cap is the most a turn may say, never a
 * length to aim at; the rest are what one line of the Line holds.
 */
export const ASK_ANSWER_CAPS = {
  headline: 160,
  detail: 3000,
  figures: 4,
  items: 5,
  parts: 4,
  points: 31,
  series: 3,
  entries: 25,
  entry: 240,
  next: 2,
  value: 24,
  label: 60,
  note: 60,
  title: 80,
  meta: 60,
  line: 160,
  question: 90,
  /** A plan's words, which the server writes (decision 0055): what no card carries comes first, so a cut keeps it. */
  plan: 700,
} as const;

/** No list: what every answer carries until one is asked for, and what an answer stored before the list part reads as. */
export const noList = (): AskList => ({ style: "bullets", entries: [] });

/** An answer as it was stored, whole: one stored before the list part has none, and reads as having no list. */
export function storedAnswer(askAnswer: AskAnswer): AskAnswer {
  const c = askAnswer.show.chart;
  if (askAnswer.show.list && (!c || c.series)) return askAnswer;
  return {
    ...askAnswer,
    show: { ...askAnswer.show, ...(c ? { chart: storedChart(c) } : {}), list: askAnswer.show.list ?? noList() },
  };
}

/** `t`, at most n characters: a longer one ends on a whole word, with an ellipsis. */
const cutAt = (t: string, n: number) => {
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.search(/\s\S*$/);
  return `${(space > n / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** One line of words, cut by cutAt: every part of an answer but the detail, and an earlier one's in a cold history. */
export const clip = (text: string | null | undefined, count: number) =>
  cutAt((text ?? "").replace(/\s+/g, " ").trim(), count);

/**
 * Words that keep their lines, in at most n characters: spaces run together within a line, each line trimmed but for
 * the indent that nests a list's point under another, at most one empty line between two, cut on a whole word as clip
 * cuts. The detail is cut by it, while it streams and when it lands, so the lines the preview showed are the lines the
 * answer keeps.
 */
export const clipLines = (text: string | null | undefined, count: number) =>
  cutAt(
    (text ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => {
        const sentence = l.replace(/\s+/g, " ").trim();
        return sentence ? `${/^\s*/.exec(l.replace(/\t/g, "  "))?.[0] ?? ""}${sentence}` : "";
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    count,
  );

export const structured = (headline: string, language: AskLanguage): AskAnswer => ({
  v: 2,
  form: "structured",
  say: { headline: clip(headline, ASK_ANSWER_CAPS.headline), detail: "" },
  show: { figures: [], items: [], breakdown: null, list: noList() },
  do: { open: null, next: [] },
  language,
});

/* ------------------------------------------------------------- one door */

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
 * `people/<id>` and `clients/<id>`; the routes the answer carries are left as they were written. A card comes with where
 * its Open goes (contracts cardOpenRoute), from its caller: the cards' specs come with the Line, Ask's answers with every page.
 */
export function oneDoor(
  askAnswer: AskAnswer,
  cards: ReadonlyArray<{ id: string; open: string | null }> = [],
): { answer: AskAnswer; cardOpen: Record<string, boolean> } {
  const offered = new Set<string>();
  const items = askAnswer.show.items.map((it) => {
    const door = !offered.has(canonicalRoute(it.source.to));
    offered.add(canonicalRoute(it.source.to));
    return { ...it, source: { ...it.source, door } };
  });
  const open = askAnswer.do.open && !offered.has(canonicalRoute(askAnswer.do.open.to)) ? askAnswer.do.open : null;
  if (open) offered.add(canonicalRoute(open.to));
  const cardOpen: Record<string, boolean> = {};
  for (const { id, open: to } of cards) {
    cardOpen[id] = !!to && !offered.has(canonicalRoute(to));
    if (to && cardOpen[id]) offered.add(canonicalRoute(to));
  }
  const receipt = (s: AskSource | null): AskSource | null => {
    if (!s) return null;
    const door = !offered.has(canonicalRoute(s.to));
    if (door) offered.add(canonicalRoute(s.to));
    return { ...s, door };
  };
  const breakdown = askAnswer.show.breakdown
    ? { ...askAnswer.show.breakdown, source: receipt(askAnswer.show.breakdown.source) }
    : null;
  const figures = askAnswer.show.figures.map((f) => ({ ...f, source: receipt(f.source) }));
  const result = askAnswer.show.chart;
  const chart = result ? { chart: { ...result, source: receipt(result.source) ?? result.source } } : {};
  return {
    answer: {
      ...askAnswer,
      show: { figures, items, breakdown, ...chart, list: askAnswer.show.list ?? noList() },
      do: { open, next: nextQuestions(askAnswer.do.next, [...offered]) },
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
    broadcast: "Sent once",
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
  askMessage: Pick<AskMessageVM, "text" | "citations" | "navigate" | "followups" | "language">,
): AskAnswer {
  const language = askMessage.language ?? "en";
  const words = KIND_WORDS[language === "es" ? "es" : "en"];
  const cites = askMessage.citations ?? [];
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
  const nav = askMessage.navigate && askMessage.navigate.to ? askMessage.navigate : null;
  const open: AskOpen | null = nav
    ? { to: nav.to, label: navigateLabel(nav, language) ?? nav.label, now: nav.now === true }
    : page
      ? { to: page.to || citationRoute(page), label: page.label, now: false }
      : null;
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: (askMessage.text ?? "").trim() },
    show: { figures: [], items, breakdown: null, list: noList() },
    do: { open, next: askMessage.followups ?? [] },
    language,
  };
}

/* ------------------------------------------------------------- quick answers */

/**
 * Who needs me: the sentence; the people, then the searches, then the runs, then the closing windows, as their own
 * doors; the Inbox only for the people past what is drawn. A queue not read yet says so, and points at Today.
 */
export function needsAnswer(askWaiting: AskWaiting | null, language: AskLanguage): AskAnswer {
  const es = language === "es";
  const answer = structured(rightNowLine(askWaiting, language), language);
  if (!askWaiting) {
    answer.do.open = { to: "today", label: es ? "Abrir Hoy" : "Open Today", now: false };
    return answer;
  }
  const all: AskItem[] = [
    ...askWaiting.people.map((p) => ({
      title: p.who,
      meta: `${p.channel} · ${p.when}`,
      line: p.line,
      source: { kind: p.kind, id: p.id, label: p.who, to: p.to, door: true },
    })),
    ...askWaiting.searches.map((x) => ({
      title: x.name,
      meta: "Leads",
      line: x.question,
      source: { kind: "page" as const, id: x.to, label: x.name, to: x.to, door: true },
    })),
    ...askWaiting.runs.map((r) => ({
      title: r.label,
      // The word a cited campaign's item says, in the answer's language.
      meta: KIND_WORDS[es ? "es" : "en"].playbook,
      line: es
        ? `${r.reach} ${r.reach === 1 ? "persona" : "personas"}`
        : `${r.reach} ${r.reach === 1 ? "person" : "people"}`,
      source: { kind: "page" as const, id: r.to, label: r.label, to: r.to, door: true },
    })),
    // A reply window closing: its thread is the door, and it is never one of the people who need you.
    ...askWaiting.windows.map((p) => ({
      title: p.who,
      meta: es ? "Ventana de respuesta por cerrar" : "Reply window closing",
      line: p.line,
      source: { kind: "thread" as const, id: p.id, label: p.who, to: p.to, door: true },
    })),
  ];
  answer.show.items = all.slice(0, ASK_ANSWER_CAPS.items);
  const total = rightNowCounts(askWaiting).people;
  // The people come first, so the ones drawn are the first of them: a window drawn is never counted as one.
  const shownPeople = Math.min(askWaiting.people.length, ASK_ANSWER_CAPS.items);
  if (total > shownPeople)
    answer.do.open = {
      to: "inbox",
      label: es ? `Ver los ${total} en el Inbox` : `See all ${total} in the Inbox`,
      now: false,
    };
  return answer;
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
  const first = structured(
    es
      ? `${missed.length === 1 ? "Una llamada perdida" : `${missed.length} llamadas perdidas`} hoy.`
      : `${missed.length === 1 ? "One missed call" : `${missed.length} missed calls`} today.`,
    language,
  );
  first.show.items = missed.slice(0, ASK_ANSWER_CAPS.items).map((c) => ({
    title: c.who,
    meta: es ? "Perdida" : "Missed",
    line: "",
    source: { kind: "call", id: c.callId, label: c.who, to: `conversations/cv-${c.callId}`, door: true },
  }));
  first.do.open = seeCalls;
  return first;
}
