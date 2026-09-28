/**
 * Every word the Pipeline says that is not a row's own: its groups' names, the table's headings, and the words
 * of the peek, the board, the rail, a selection's pass and New proposal. The deal's own are deal-words.ts's.
 */
import { DEAL_STAGE_WORDS } from "../deal-words";
import type { DealPaceVM } from "../deal-waits";
import type { PipelineGroupKey } from "./pipeline-vm";

/**
 * The groups' words, the deal's own where it has them. Built inside a call marked pure, as tone.ts builds its tables:
 * the call on a stage's word is a side effect to the bundler, and a plain literal kept this table, and the deal's words
 * with it, in the channels, core, db and jobs dists, none of which draws a Pipeline.
 */
export const GROUP_WORDS: Record<PipelineGroupKey, string> = /* @__PURE__ */ (() => ({
  consultations: "Consultations",
  proposals: DEAL_STAGE_WORDS.proposed,
  clients: "Clients",
  closed: `${DEAL_STAGE_WORDS.lost} or ${DEAL_STAGE_WORDS.ended.toLowerCase()}`,
}))();

/** Every word the Pipeline says that is not a row's own. */
export const PIPELINE_WORDS = {
  groups: GROUP_WORDS,
  /**
   * The table's headings, in the order it draws them. The chip's column shows none -- no one word is right for "Fri
   * 2:00 PM" and "Since Sep 18" alike -- and says this one to a screen reader.
   */
  columns: {
    person: "Person",
    service: "Service",
    value: "Value",
    stage: "Stage",
    came: "Came from",
    valid: "Valid until",
    // The notes card's own words (NOTE_WORDS.next), written out: read off it, this table would be kept in every
    // package that bundles contracts, as GROUP_WORDS would (pipeline.test.mjs holds the two together).
    next: "Next step",
    chip: "Where it stands",
    /** The row's own menu, as a screen reader hears its heading. */
    acts: "More",
  },
  /** What opens a folded group, whose head counts its rows already, and what folds it again. */
  show: "Show",
  hide: "Hide",
  /** Where there is nobody in any group. */
  empty: { title: "No deals yet.", body: "Proposals you start show here, with what they come to." },
  /** The two ways to see it on a desk, and what a screen reader calls the switch. A phone has the list alone. */
  views: { label: "Show as", list: "List", board: "Board" },
  /** The peek beside the rows: its two doors, its wait, and what it calls a person it could not read. */
  peek: {
    close: "Close",
    page: "Open their page",
    thread: "Open the thread",
    reading: "Reading…",
    what: "this person",
    /** How to reach them: the number (a call, a copy), the address (a copy), and what a reply may be. */
    reach: {
      phone: "Phone",
      email: "Email",
      replies: "Replies",
      call: "Call",
      copy: "Copy",
      copied: "Copied",
      /** What a Copy says it copies, to a screen reader: both buttons read "Copy" on the page. */
      copyPhone: "Copy the number",
      copyEmail: "Copy the address",
    },
    /** What happened with their deals, newest first. */
    history: "History",
  },
  /** The board: a column with nobody in it, what a card says of itself to a screen reader, and a card's menu. */
  board: { nobody: "Nobody here", card: "Open", menu: "More for", move: "Move to" },
  /** The row's menu: the deal's own acts come from the deal sheet's words; these are its two doors. */
  row: { menu: "More for" },
  /** A selection's pass (Mark as passed · N): the one question, asked once for every proposal in it. */
  pass: {
    button: "Mark as passed",
    ask: "Why did they pass?",
    cancel: "Cancel",
    busy: "Marking…",
  },
  /** A proposal out waiting with nothing back (waitingOnProposal): the row's In stage already says how long. */
  nothingBack: "Nothing back",
  /**
   * The line's part for the proposals waiting: past a week; past the workspace's pace once it has one; and past the
   * cap in its days, where thirty holds the wait at or under the pace and "longer than usual" would not be so.
   */
  waitingLine: (n: number, pace: DealPaceVM | null) =>
    !pace
      ? `${n} waiting over a week`
      : pace.longerThanUsual
        ? `${n} waiting longer than usual`
        : `${n} waiting over ${pace.waitDays} days`,
  /** The Pipeline's own rail: its groups, what waits on the owner, and each service. */
  rail: {
    /** A phone's sheet of the rail's rows, behind the bar's list button. */
    sheet: "Show",
    deals: "Deals",
    all: "All deals",
    waitingOnYou: "Waiting on you",
    waiting: "Nothing back in a week",
    /** The same, once the workspace has a pace: past it by a fifth (waitAfterDays). */
    waitingPaced: (days: number) => `Nothing back in ${days} days`,
    lapsed: "Lapsed",
    // A next step whose day has come (NOTE_WORDS.stepsDue, written out for the same reason).
    steps: "Steps due",
    services: "Services",
  },
  /** New proposal: the button, and the picker it opens before the deal sheet. */
  newProposal: {
    button: "New proposal",
    title: "New proposal",
    sub: "Who is it for?",
    search: "Search people",
    none: "No one matches.",
    add: "Add someone new",
    name: "Name",
    optional: "optional",
    number: "Mobile number",
    go: "Continue",
    adding: "Adding…",
  },
} as const;
