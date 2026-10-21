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
  /** The deal sheet over the rows (pipeline-peek.ts): its door to their page, its wait, and what it calls a person it could not read. */
  peek: {
    close: "Close",
    page: "Their page",
    reading: "Reading…",
    what: "this person",
    /** How to reach them: the number and the address (each a copy), and what a reply may be. */
    reach: {
      title: "How to reach them",
      phone: "Phone",
      email: "Email",
      replies: "Replies",
      copy: "Copy",
      copied: "Copied",
      /** What a Copy says it copies, to a screen reader: both buttons read "Copy" on the page. */
      copyPhone: "Copy the number",
      copyEmail: "Copy the address",
    },
  },
  /**
   * The deal sheet's own words (the canvas "Pipeline deal sheet", 20 Oct 2026): its two rests, its next step's two
   * presses, the question a proposal waiting asks and its two answers, the pass it asks in its foot, the caret, the
   * Message its foot leads with for a client, their other deals, and the desk's walk through the rows shown.
   */
  sheet: {
    raise: "Show all of the deal",
    lower: "Back to the quick look",
    next: "Next step",
    done: (step: string) => `Done: ${step}`,
    change: (step: string) => `Change: ${step}`,
    ask: (first: string) => `Did ${first} say yes?`,
    yes: "Yes, a client",
    no: "They passed",
    passAsk: (first: string) => `Why did ${first} pass?`,
    more: (what: string) => `More for ${what}`,
    message: "Message",
    others: "Also with them",
    /** The proposal's own box, raised: its link and the link's copy. */
    proposal: "The proposal",
    link: "Link",
    /** A consultation over with no proposal since, once its step says when and how it went. */
    noProposal: "No proposal yet",
    walk: { label: "Deals in this view", previous: "Previous deal", next: "Next deal" },
  },
  /** The board: a column with nobody in it, what a card says of itself to a screen reader, and a card's menu. */
  board: { nobody: "Nobody here", card: "Open", menu: "More for", move: "Move to" },
  /** The row's menu: the deal's own acts come from the deal sheet's words; these are its two doors. */
  row: { menu: "More for", thread: "Open the thread", page: "Open their page" },
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
    /** A phone's sheet of the rail's rows, behind the bar's list button: the views, as People's and Leads' say Lists. */
    sheet: "Views",
    deals: "Deals",
    all: "All deals",
    // The deals to follow up: proposals with nothing back, lapsed ones, steps due. It said "Waiting on you", which is a thread
    // you have (People), a thread nobody has (Reports) and a run (Sent): one name for four things (D1-waiting-on-you).
    toFollowUp: "To follow up",
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
  },
} as const;
