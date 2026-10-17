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
  /** The peek beside the rows: its two doors, its wait, and what it calls a person it could not read. */
  peek: {
    close: "Close",
    page: "Open their page",
    thread: "Open the thread",
    reading: "Reading\u2026",
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
      copyEmail: "Copy the address"
    },
    /** What happened with their deals, newest first. */
    history: "History"
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
    none: "No one matches.",
    add: "Add someone new",
    name: "Name",
    optional: "optional",
    number: "Mobile number",
    go: "Continue",
    adding: "Adding\u2026"
  }
};
