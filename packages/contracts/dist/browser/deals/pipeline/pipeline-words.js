import { DEAL_STAGE_WORDS } from "../deal-words.js";
export const GROUP_WORDS = /* @__PURE__ */ (() => ({
  consultations: "Consultations",
  proposals: DEAL_STAGE_WORDS.proposed,
  clients: "Clients",
  closed: `${DEAL_STAGE_WORDS.lost} or ${DEAL_STAGE_WORDS.ended.toLowerCase()}`
}))();
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
    acts: "More"
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
    reading: "Reading\u2026",
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
      copyEmail: "Copy the address"
    }
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
    done: (step) => `Done: ${step}`,
    change: (step) => `Change: ${step}`,
    ask: (first) => `Did ${first} say yes?`,
    yes: "Yes, a client",
    no: "They passed",
    passAsk: (first) => `Why did ${first} pass?`,
    more: (what) => `More for ${what}`,
    message: "Message",
    others: "Also with them",
    /** A consultation over with no proposal since, once its step says when and how it went. */
    noProposal: "No proposal yet",
    walk: { label: "Deals in this view", previous: "Previous deal", next: "Next deal" }
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
    busy: "Marking\u2026"
  },
  /** A proposal out waiting with nothing back (waitingOnProposal): the row's In stage already says how long. */
  nothingBack: "Nothing back",
  /**
   * The line's part for the proposals waiting: past a week; past the workspace's pace once it has one; and past the
   * cap in its days, where thirty holds the wait at or under the pace and "longer than usual" would not be so.
   */
  waitingLine: (n, pace) => !pace ? `${n} waiting over a week` : pace.longerThanUsual ? `${n} waiting longer than usual` : `${n} waiting over ${pace.waitDays} days`,
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
    waitingPaced: (days) => `Nothing back in ${days} days`,
    lapsed: "Lapsed",
    // A next step whose day has come (NOTE_WORDS.stepsDue, written out for the same reason).
    steps: "Steps due",
    services: "Services"
  },
  /** New proposal: the button, and the picker it opens before the deal sheet. */
  newProposal: {
    button: "New proposal",
    title: "New proposal",
    sub: "Who is it for?",
    search: "Search people",
    none: "No one matches."
  }
};
