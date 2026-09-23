/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, the
 * finding; Show, what it rests on; Do, the next step. One shape for every surface that answers -- the palette, Today's
 * band and the answers that need no model -- and one rule for the doors it offers. Pure: the bridge feeds it and the
 * pages draw it. What the model writes, and its parser, arrive with the structured answer (plan 3).
 */
import {
  FOLLOWUP_ECHO,
  citationRoute,
  navigateLabel,
  sameQuestion,
  type AskCitation,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type FastCall,
} from "./ask";

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

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

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

/** Where a card's Open goes, or null for the kinds that have none (a reply, a rewrite, a whisper, an invite). */
export function cardOpenRoute(p: Pick<AskProposal, "kind" | "payload">): string | null {
  const pl = (p.payload ?? {}) as Record<string, unknown>;
  const id = (k: string) => (typeof pl[k] === "string" && pl[k] ? (pl[k] as string) : null);
  switch (p.kind) {
    case "reply":
    case "steer":
    case "whisper":
    case "invite":
      return null;
    case "settings":
      return "admin/workspace";
    case "policy":
      return "admin/autonomy";
    case "person_mode":
    case "deal":
      return id("contact_id") ? `clients/${id("contact_id")}` : null;
    case "broadcast":
      return "broadcasts";
    case "playbook":
      return "outbound";
    case "lead_search":
      return "clients/leads";
    default:
      return id("conversation_id") ? `inbox/th-${id("conversation_id")}` : null;
  }
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
 * A place appears once per answer (the Line, D4, section 5.5). An item keeps its door; Do's Open goes when an item has
 * its route; a card's Open is hidden when an item or Open has its route; a receipt keeps its words and draws its door
 * only when nothing else offers that route; a next question that points at an offered place goes. Returns the answer
 * as drawn and, per card, whether its Open is drawn.
 */
export function oneDoor(
  a: AskAnswer,
  cards: ReadonlyArray<Pick<AskProposal, "id" | "kind" | "payload">> = [],
): { answer: AskAnswer; cardOpen: Record<string, boolean> } {
  const items = a.show.items.map((it) => ({ ...it, source: { ...it.source, door: true } }));
  const offered = new Set(items.map((it) => it.source.to));
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

/** Right now, in a sentence: the people waiting, then the runs waiting for a yes -- two populations, two clauses. */
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
  if (!people && !runs) return es ? "Nadie te espera ahora mismo." : "Nobody is waiting on you right now.";
  const s = [people, runs].filter(Boolean).join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/**
 * Who needs me: the sentence; the people, then the runs, as their own doors; the Inbox only for the people past what
 * is drawn. A queue not read yet says so, and points at Today.
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
  const total = w.people.length + w.more;
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
