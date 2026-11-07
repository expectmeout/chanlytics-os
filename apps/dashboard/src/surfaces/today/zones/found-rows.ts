/**
 * Ask found (Today in three zones, 2 Nov 2026), Today's third zone: one ranked list of what is worth a look and waits on
 * nobody, three drawn. What the workspace's own counts say leaks (today/leaks.ts, the six rules: a booking gap, nobody
 * answered, proposals and consultations nothing followed, people out of reach, gone quiet), what Ask noticed (decision
 * 0087), a call worth a listen and a lead who tried their receptionist (Need you's `found` rows), then Ask's own ideas from
 * its morning (decision 0071), last, since a model's idea never stands before what the numbers say. Each row the same
 * grammar as Need you's: what it is, its one act, the sentence, and why on a press with Not today, which rests it a week
 * for the member (views.ask_found, every kind of row). Under them, what came of an idea approved lately.
 *
 * Never counted in who needs you, and never the coral but where it leads the page, Need you drawing no pane (the page's to
 * say).
 */
import type { TodayQueueRowVM, AskLately, AskMorningCard } from "@chanlytics/contracts";
import { isFindingCard, isRested, type AskRested } from "@chanlytics/contracts";
import type { TodayLeakVM } from "../leaks";

/** How many rows Ask found draws: the rest are said as "and 2 more". */
const ASK_FOUND_SHOWN = 3;

/** What a row came from, which says how its act is pressed. */
export type AskFoundSource = "rule" | "noticed" | "call" | "tried" | "idea";

/** One row of Ask found. */
export interface AskFoundRowVM {
  /** Stable across reads, and what Not today rests it by (views.ask_found). */
  key: string;
  source: AskFoundSource;
  /** What it is, in a few words: "Booking gap", "Ask's idea". */
  tag: string;
  sentence: string;
  /** Why, said under the sentence on a press, beside Not today. */
  why: string;
  /**
   * Its one act: a door where it has one (a rule's, a call's, a card that names one: a fix, replies that fell); a card's own
   * act otherwise (Approve, or Open in Ask for a plan's step), which the page presses through the card's verb walk (`to`
   * null).
   */
  act: { label: string; to: string | null };
  /** The card an idea or what Ask noticed stands for, which its act and Not today are kept on. */
  card: AskMorningCard | null;
  /** Who a rule names, opened on a press under its why, each a door to their page; none for any other row. */
  people: TodayLeakVM["people"];
  /** The words before them ("Waiting now"); null where nobody is named. */
  peopleLead: string | null;
  /** What Ask why asks, the rule's sentence and its arithmetic; null for a row Ask is not asked about. */
  ask: string | null;
}

export interface AskFoundVM {
  rows: AskFoundRowVM[];
  /** How many more there are past the three: "and 2 more". */
  more: number;
  /** What came of an idea approved lately, in one line: "Birthday note: sent to 14, 3 replied, 1 booked." */
  came: string | null;
}

/** The words of Ask found. */
export const ASK_FOUND_WORDS = {
  title: "Ask found",
  more: (n: number) => `and ${n} more`,
  came: "What came of it.",
  notToday: "Not today",
  idea: "Ask's idea",
  noticed: "Ask noticed",
  call: "Worth a listen",
  tried: "Tried their receptionist",
  approve: "Approve",
  openInAsk: "Open in Ask",
  askWhy: "Ask why",
} as const;

/** A row that names nobody and is not asked about: every row but a rule's. */
const NAMES_NOBODY: Pick<AskFoundRowVM, "people" | "peopleLead" | "ask"> = { people: [], peopleLead: null, ask: null };

/** A rule's row: its tag and sentence, the arithmetic as its why, who it names and what Ask why asks, and its door. */
const ruleRow = (todayLeak: TodayLeakVM): AskFoundRowVM => ({
  key: `rule:${todayLeak.id}`,
  source: "rule",
  tag: todayLeak.tag,
  sentence: todayLeak.text,
  why: todayLeak.math,
  act: { label: todayLeak.cta.label, to: todayLeak.cta.to },
  card: null,
  people: todayLeak.people,
  peopleLead: todayLeak.peopleLead,
  ask: todayLeak.ask,
});

/** A card's words where it says them for this row (a finding's payload), else null. */
const cardSays = (c: AskMorningCard, key: "tag" | "sentence" | "why"): string | null => {
  const v = c.payload[key];
  return typeof v === "string" && v ? v : null;
};

/**
 * A card's one act: the door it names (a fix card's, replies that fell: where the thing is mended), else its own verb,
 * Approve, or Open in Ask for a step of a plan, which the page presses through the card's verb walk.
 */
function cardAct(c: AskMorningCard): AskFoundRowVM["act"] {
  const to = typeof c.payload.to === "string" ? c.payload.to : null;
  if (to) return { label: typeof c.payload.door === "string" ? c.payload.door : ASK_FOUND_WORDS.openInAsk, to };
  return { label: c.plan ? ASK_FOUND_WORDS.openInAsk : ASK_FOUND_WORDS.approve, to: null };
}

/**
 * What Ask noticed (decision 0087): the row its card says where it says one (replies that fell: "Win-back drew 2 of 40
 * replies, down from 21 of 120."), else its line with the number as the sentence and what Approve changes as the why (a
 * mode's change after steady batches), and the card's act.
 */
function noticedRow(askMorningCard: AskMorningCard): AskFoundRowVM {
  return {
    key: askMorningCard.id,
    source: "noticed",
    tag: cardSays(askMorningCard, "tag") ?? ASK_FOUND_WORDS.noticed,
    sentence: cardSays(askMorningCard, "sentence") ?? askMorningCard.line ?? askMorningCard.title,
    why: cardSays(askMorningCard, "why") ?? askMorningCard.summary,
    act: cardAct(askMorningCard),
    card: askMorningCard,
    ...NAMES_NOBODY,
  };
}

/**
 * One of Ask's ideas: its one line (its title where it has none), what Approve changes as the why, whatever the line
 * (ask.ts AskProposal.summary: "the exact change"), and the card's act: Approve, Open in Ask for a step of a plan, or a
 * fix card's door, never an Approve that has nothing to approve.
 */
const ideaRow = (c: AskMorningCard): AskFoundRowVM => ({
  key: c.id,
  source: "idea",
  tag: ASK_FOUND_WORDS.idea,
  sentence: c.line ?? c.title,
  why: c.summary,
  act: cardAct(c),
  card: c,
  ...NAMES_NOBODY,
});

/** A call worth a listen, or a lead who tried their receptionist: the queue's row, with its one door. */
const queueRow = (r: TodayQueueRowVM): AskFoundRowVM => ({
  key: `${r.kind}:${r.id}`,
  source: r.kind === "tried" ? "tried" : "call",
  tag: r.kind === "tried" ? ASK_FOUND_WORDS.tried : ASK_FOUND_WORDS.call,
  sentence: [r.who, r.sentence].filter(Boolean).join(": "),
  why: r.status.join(" · "),
  act: { label: r.cta.label, to: r.cta.to },
  card: null,
  ...NAMES_NOBODY,
});

/**
 * Ask found's rows, ranked once: the rules that look at a person first (amber), what Ask noticed, the rules that wait on
 * someone else, the calls worth a listen and the leads who tried, then Ask's ideas. A row the member set aside lately is
 * left out; three are drawn, and the rest are said.
 */
export function askFoundOf(input: {
  rules: readonly TodayLeakVM[];
  /** The morning's cards, what Ask noticed and its ideas both, as GET ask/morning reads them (offered ones only). */
  cards: readonly AskMorningCard[];
  /** Need you's `found` rows: a call worth a listen, a lead who tried. */
  found: readonly TodayQueueRowVM[];
  lately: readonly AskLately[];
  rested: AskRested;
  /** The business's day, YYYY-MM-DD: what a rest runs out against. */
  today: string;
}): AskFoundVM {
  const all = [
    ...input.rules.filter((l) => l.tone === "warn").map(ruleRow),
    ...input.cards.filter(isFindingCard).map(noticedRow),
    ...input.rules.filter((l) => l.tone !== "warn").map(ruleRow),
    ...input.found.map(queueRow),
    ...input.cards.filter((c) => !isFindingCard(c)).map(ideaRow),
  ].filter((r) => !isRested(input.rested, r.key, input.today));
  const [first] = input.lately;
  return {
    rows: all.slice(0, ASK_FOUND_SHOWN),
    more: Math.max(0, all.length - ASK_FOUND_SHOWN),
    came: first ? `${first.title}: ${first.said}` : null,
  };
}
