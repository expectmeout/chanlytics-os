/** Answer: normalize. */

import type { AskProposal } from "../thread-words";
import {
  answerChart,
  answerDoors,
  chartSaid,
  cleanAnswer,
  firstSentence,
  navigateLabel,
  opensWithBlock,
  firstJsonValue,
} from "../answer-text";
import type { AskLanguage } from "../language";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";
import {
  ASK_CITATION_KINDS,
  citationRoute,
  groundCitations,
  type AskCitation,
  type AskCitationKind,
  type AskReadSet,
} from "../citations";
import type { PlanLead } from "../../journey/plan";
import { planCountWords } from "../plan-steps";
import {
  ASK_ANSWER_CAPS,
  ASK_LIST_STYLES,
  clip,
  clipLines,
  structured,
  type AskAnswer,
  type AskBreakdown,
  type AskFigure,
  type AskItem,
  type AskList,
  type AskOpen,
  type AskSource,
} from "./shape";
import { isOneOf, recordOrEmpty } from "../../shared/unknown";

/**
 * The openings route's days, as the palette reads them (bridge/ask/api.ts `openings`). The route's `text` is
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
const openingsHeadline = (days: AskOpeningsView["days"], es: boolean, enabled: boolean): string => {
  if (!days.length && enabled)
    return es ? "No hay nada libre en el calendario ese día." : "Nothing is open on the calendar that day.";
  if (!days.length)
    return es
      ? "No hay nada libre en el calendario en los próximos días."
      : "Nothing is open on the calendar in the days ahead.";
  if (days.length === 1) {
    const n = days[0]?.windows.length ?? 0;
    return es
      ? `${days[0]?.label ?? ""}: ${n} ${n === 1 ? "hora libre" : "horas libres"} en el calendario.`
      : `The calendar has ${n} open ${n === 1 ? "time" : "times"} on ${days[0]?.label ?? ""}.`;
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
  const sentence =
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
  const answer = structured(sentence, language);
  answer.say.detail = es ? "El horario está en Ajustes." : "The hours are in Settings.";
  answer.do.open =
    instead?.by === "emails"
      ? { to: "calendar", label: es ? "Abrir el Calendario" : "Open the Calendar", now: false }
      : { to: CALENDAR_SETTING_ROUTE, label: es ? "Conectar un calendario" : "Connect a calendar", now: false };
  return answer;
}

/** What is open: the days as items, each a door to its day on the Calendar; Do opens the Calendar. */
export function openingsAnswer(
  askOpeningsView: AskOpeningsView,
  language: AskLanguage,
  day: string | null = null,
): AskAnswer {
  const es = language === "es";
  if (askOpeningsView.state === "no_calendar") return noCalendarAnswer(askOpeningsView.instead ?? null, language);
  if (askOpeningsView.state === "unavailable")
    return structured(
      es ? "No se pudo leer el calendario ahora." : "The calendar couldn't be read right now.",
      language,
    );
  const days = askOpeningsView.days.filter((d) => d.windows.length);
  const answer = structured(openingsHeadline(days, es, !!day), language);
  answer.show.items = days.slice(0, ASK_ANSWER_CAPS.items).map((d) => ({
    title: d.label,
    meta: "",
    line: d.windows.join(" · "),
    source: { kind: "page", id: `calendar/${d.key}`, label: d.label, to: `calendar/${d.key}`, door: true },
  }));
  answer.do.open = { to: "calendar", label: es ? "Abrir el Calendario" : "Open the Calendar", now: false };
  return answer;
}

/* ------------------------------------------------------ what the model writes */

/** What the model names: a row or a page it read this turn, or none. It never writes a route (D5). */
export interface AskSourceRef {
  kind: AskCitationKind | "none";
  id: string;
  label: string;
}

const C = ASK_ANSWER_CAPS;

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Markdown's emphasis, which the Line never draws: `**word**` and `__word__` are the word. */
const unbold = (s: string) => s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2");

const drawnText = (v: unknown) => unbold(cleanAnswer(typeof v === "string" ? v : ""));

/** A string as the Line may draw it: no tags (cleanAnswer), no emphasis marks, one line of words, at most its cap. */
const words = (v: unknown, n: number) => clip(drawnText(v), n);

/** A list's entry: its words and their emphasis, without the bullet or number the model now and then writes. */
const entry = (v: unknown) =>
  clip(cleanAnswer(typeof v === "string" ? v.replace(/^\s*(?:[-*•·–]|\d{1,2}[.)])\s+/, "") : ""), C.entry);

/**
 * Say as the Line draws it, the same while it streams (partialSay) and when it lands (normalizeAnswer): the headline
 * its first sentence, on one line of words, and the detail its own lines (clipLines), opening with whatever the
 * headline said past that sentence; each cleaned as every string is and cut at its cap.
 */
export function sayAsDrawn(say: { headline?: unknown; detail?: unknown }): { headline: string; detail: string } {
  const [headline, more] = firstSentence(drawnText(say.headline).replace(/\s+/g, " ").trim());
  // The detail keeps its formatting, which answerBlocks reads; the headline is one plain sentence. Its words past that
  // sentence open the detail, as a paragraph of their own where the detail opens with a table, a list or a heading.
  const detail = cleanAnswer(typeof say.detail === "string" ? say.detail : "");
  const apart = opensWithBlock(detail) ? "\n\n" : " ";
  return {
    headline: clip(headline, C.headline),
    detail: clipLines(more && detail ? `${more}${apart}${detail}` : more || detail, C.detail),
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

/** Every id in what the model spelled: global, so a route that carries two is read whole (groundRef takes the last). */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The twelve kinds of row, in the grammar's order: a row not read as the kind written is looked for under each. */
const ROW_KINDS = ASK_CITATION_KINDS.filter((k) => k !== "page");

/**
 * A route that names a row -- a thread, a call, a person (never People's Get their yes), a list of the workspace's own, a
 * playbook, a run (at its home, or Sent's older spelling), a lead or a search -- whatever id it carries: never a page.
 */
const ROW_ROUTE =
  /^(inbox\/th-|conversations\/cv-|outbound\/|broadcasts\/run:|campaigns\/sequences\/[^/]+\/runs\/|clients\/leads.*:[sp]-|clients\/(?!leads(?:[/:]|$)|seg:|get-yes$))/;

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
function groundRef(value: unknown, read: AskReadSet): AskSource | null {
  const obj = recordOrEmpty(value);
  const kind = typeof obj.kind === "string" ? obj.kind : "none";
  const spelled = typeof obj.id === "string" ? obj.id.trim().replace(/^#?\/+/, "") : "";
  if (!spelled || !isOneOf(ASK_CITATION_KINDS, kind)) return null;
  const label = words(obj.label, C.label) || spelled;
  // The row is the route's LAST id: every row's route carries one, but a lead's on a search's view carries the search's
  // first (leadsRoute: `clients/leads:s-<search>:p-<lead>`, the open lead last), and the lead is the row it names.
  const ids = spelled.match(UUID);
  const row = ids?.[ids.length - 1]?.toLowerCase();
  // A row's route with an id cut short or misspelled names no row read, and is no page either.
  const page = row || ROW_ROUTE.test(spelled) ? [] : [{ kind: "page" as const, id: spelled, label }];
  const tries: AskCitation[] = [
    ...(kind === "page" ? page : []),
    ...[kind, ...ROW_KINDS].filter((k) => k !== "page").map((k) => ({ kind: k, id: row ?? spelled, label })),
    ...page,
  ];
  const kept = groundCitations(tries, read).kept[0];
  return kept ? { ...kept, to: citationRoute(kept, read), door: true } : null;
}

/** The answer read, or why not; `ignored` is what followed its closed object (firstJsonValue): logged, never drawn. */
export type AskAnswerRead =
  { ok: true; answer: AskAnswer; dropped: number; ignored?: string } | { ok: false; error: string };

/**
 * The model's answer, as the Line may draw it (spec 5.4): every string cleaned and cut to its cap, every array cut to
 * its cap, and every source grounded in this turn's reads with its route derived (a route the model writes is never
 * taken). An item is its row, so an item whose row was not read goes; a figure or a breakdown keeps its words and loses
 * its receipt. A breakdown draws only when it says what the whole is and two to four parts add up exactly to its
 * total. Kind none, or a place not read, is no Open. With no headline it is no answer, unless a card stands beside it. `dropped` counts the sources that named a row not read.
 * One door (oneDoor) runs after, with the turn's cards.
 */
export function normalizeAnswer(
  raw: unknown,
  read: AskReadSet,
  fallback: AskLanguage,
  beside: { cards: number } = { cards: 0 },
): AskAnswerRead {
  let json: unknown = raw;
  let ignored = "";
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      const first = firstJsonValue(raw);
      if (!first) return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
      json = first.value;
      ignored = first.rest.trim();
    }
  }
  const root = recordOrEmpty(json);
  const sentence = sayAsDrawn(recordOrEmpty(root.say));
  const headline = sentence.headline;
  // Beside a card the headline may be empty: the card says it all (the answers canvas, D1).
  if (!headline && beside.cards === 0) return { ok: false, error: "no headline" };
  // English or Spanish as the model says; anything else is the turn's own (detectLanguage), as it was before the Line.
  const language: AskLanguage = root.language === "en" || root.language === "es" ? root.language : fallback;
  let dropped = 0;
  const ground = (v: unknown): AskSource | null => {
    const s = groundRef(v, read);
    const r = recordOrEmpty(v);
    if (!s && typeof r.kind === "string" && r.kind !== "none" && typeof r.id === "string" && r.id.trim()) dropped++;
    return s;
  };
  // A row named in the words is a door where this turn read it (`kind:id`, or the id or route alone), else its words.
  const say = {
    ...sentence,
    detail: answerDoors(sentence.detail, (target, label) => {
      const [, kind = "", id = ""] = /^([a-z_]+):(.+)$/.exec(target) ?? [];
      const named = isOneOf(ASK_CITATION_KINDS, kind);
      return ground(named ? { kind, id, label } : { kind: "page", id: target, label })?.to ?? null;
    }),
  };
  const show = recordOrEmpty(root.show);
  const figures: AskFigure[] = [];
  for (const f of asArr(show.figures).map(recordOrEmpty)) {
    const value = words(f.value, C.value);
    if (!value) continue;
    figures.push({ value, label: words(f.label, C.label), note: words(f.note, C.note), source: ground(f.source) });
    if (figures.length >= C.figures) break;
  }
  const items: AskItem[] = [];
  for (const it of asArr(show.items).map(recordOrEmpty)) {
    const title = words(it.title, C.title);
    const source = ground(it.source);
    if (!title || !source) continue;
    items.push({ title, meta: words(it.meta, C.meta), line: words(it.line, C.line), source });
    if (items.length >= C.items) break;
  }
  const obj = recordOrEmpty(show.breakdown);
  const parts = asArr(obj.parts)
    .map(recordOrEmpty)
    .map((p) => ({ label: words(p.label, C.label), value: num(p.value), warn: p.warn === true }));
  const total = num(obj.total);
  const whole = words(obj.label, C.label);
  const adds =
    !!whole &&
    parts.length >= 2 &&
    parts.length <= C.parts &&
    parts.every((p) => p.label && Number.isFinite(p.value) && p.value >= 0) &&
    Number.isFinite(total) &&
    Math.abs(parts.reduce((s, p) => s + p.value, 0) - total) < 1e-9;
  const breakdown: AskBreakdown | null = adds ? { label: whole, total, parts, source: ground(obj.source) } : null;
  const chart = answerChart(show.chart, ground, C);
  const result = recordOrEmpty(show.list);
  const list: AskList = {
    style: ASK_LIST_STYLES.find((x) => x === result.style) ?? "bullets",
    entries: asArr(result.entries).map(entry).filter(Boolean).slice(0, C.entries),
  };
  const otherObj = recordOrEmpty(root.do);
  const objItem = recordOrEmpty(otherObj.open);
  const at = ground(objItem.source);
  const open: AskOpen | null = at
    ? {
        to: at.to,
        label: navigateLabel({ to: at.to, label: words(objItem.label, C.label) || at.label }, language) ?? at.label,
        now: objItem.now === true,
      }
    : null;
  const next = asArr(otherObj.next)
    .map((q) => words(q, C.question))
    .filter(Boolean)
    .slice(0, C.next);
  return {
    ok: true,
    answer: {
      v: 2,
      form: "structured",
      say,
      show: { figures, items, breakdown, ...(chart ? { chart } : {}), list },
      do: { open, next },
      language,
    },
    dropped,
    ...(ignored ? { ignored } : {}),
  };
}

/** Every word an answer says, for the "not from your data" check (isUngrounded): Say, and Show's strings. */
export function answerWords(askAnswer: AskAnswer): string {
  return [
    askAnswer.say.headline,
    askAnswer.say.detail,
    ...askAnswer.show.figures.flatMap((f) => [f.value, f.label, f.note]),
    ...askAnswer.show.items.flatMap((i) => [i.title, i.meta, i.line]),
    ...(askAnswer.show.breakdown
      ? [
          askAnswer.show.breakdown.label,
          String(askAnswer.show.breakdown.total),
          ...askAnswer.show.breakdown.parts.flatMap((p) => [p.label, String(p.value)]),
        ]
      : []),
    ...(askAnswer.show.chart ? chartSaid(askAnswer.show.chart) : []),
    ...askAnswer.show.list.entries,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A sentence of a card's title: one that ends leading into more (a comma) ends as a sentence, never ",.". */
const sentence = (s: string) => {
  const ended = s.replace(/[,;:]+$/u, "");
  return /[.!?]$/.test(ended) ? ended : `${ended}.`;
};

/**
 * The answer when a round proposed and nothing else, every card made: the cards are the Do, with no second round. A
 * plan's cards are counted as its steps, and a plan's words are the detail, cut on a whole word (plan-steps.ts
 * planCountWords; `words` null for a round that made no plan); the loop's headline for an answer that claimed a write is
 * this one's too. A setup that waits on something leads with it (`lead`, journey/plan.ts PlanLead): its headline, an Open to
 * where it is set and the question that asks how; null for every other round. Its language is the one its words are
 * written in, Spanish or English: a question with no hint of either ("find 5,000 nail salons across Texas") was kept as
 * `other` beside an English answer (the operator stress run, 15 Oct 2026).
 */
export function answerForCards(
  cards: ReadonlyArray<Pick<AskProposal, "title" | "kind" | "plan">>,
  language: AskLanguage,
  words: string | null,
  lead: PlanLead | null,
  why: string | null = null,
): AskAnswer {
  const es = language === "es";
  // An offer's plan answers with its one sentence, the card holding the rest (D1 of the answers canvas).
  if (why) return structured(why, es ? "es" : "en");
  const length = cards.length;
  const plan = planCountWords(cards, language, words);
  const first = structured(
    lead?.headline ??
      plan.headline ??
      (length === 1
        ? es
          ? sentence(`Aquí está: ${cards[0]?.title ?? ""}`)
          : sentence(`Here it is: ${cards[0]?.title ?? ""}`)
        : es
          ? `${length} para mirar.`
          : `${length} to look at.`),
    es ? "es" : "en",
  );
  first.say.detail = clip(plan.detail ?? "", ASK_ANSWER_CAPS.plan);
  // A setup that waits on something (journey/plan.ts PlanLead): Open goes where it is set, and the next question asks how.
  if (lead) {
    first.do.open = { ...lead.open, now: false };
    first.do.next = lead.next.slice(0, ASK_ANSWER_CAPS.next);
  }
  return first;
}
