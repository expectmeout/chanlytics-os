import {
  LEAD_CLOSED_REASONS,
  LEAD_EMAIL_STATES,
  LEAD_FITS,
  LEAD_OPERATION_KINDS,
  LEAD_STAGES
} from "./search/sets.js";
import {
  LEAD_ERASE_WORDS,
  LEAD_CALL_OUTCOME_TONES,
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CALL_OUTCOMES,
  LEAD_CALL_QUESTION,
  LEAD_CLOSED_WORDS,
  LEAD_DRAFT_NOTE,
  LEAD_NOT_A_FIT_TITLE,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_NOTE_MAX,
  LEAD_NOTE_PLACEHOLDER,
  LEAD_SENT_QUESTION,
  LEAD_TALKING_NOTE,
  LEAD_UNCLAIMED_NOTE,
  leadNoteLeft
} from "./lead-words.js";
export {
  LEAD_CLASSES,
  LEAD_LISTS,
  LEAD_SORTS,
  LEAD_VIEW_SORTS,
  LEAD_CALL_OUTCOMES,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_STAGE_WORDS,
  LEAD_CLOSED_WORDS,
  LEAD_FIT_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_CALL_OUTCOME_TONES,
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_LIST_WORDS,
  LEAD_SOURCE_WORD,
  LEAD_LOCKED_LINE,
  LEAD_DRAFT_NOTE,
  LEAD_NO_ADDRESS,
  LEAD_CONSENT_REFUSAL,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_NOT_A_FIT_TITLE,
  LEAD_NOT_A_FIT_ASK,
  LEAD_SUPPRESSING_WHY,
  LEAD_REVIEW_WORD,
  LEAD_LEFT_OUT_WORD,
  LEAD_CLASS_WORDS,
  LEAD_UNREACHABLE_WORD,
  LEAD_CHECK_UNSURE,
  LEAD_CHECK_WORDS,
  LEAD_ERASE_WORDS,
  LEAD_MAILBOX_WORDS,
  LEAD_CONTACT_STANDARD_WORDS,
  LEAD_NO_EMAIL_LINE,
  LEAD_SENT_QUESTION,
  LEAD_CALL_QUESTION,
  LEAD_NOTE_PLACEHOLDER,
  LEAD_NOTE_MAX,
  LEAD_TALKING_NOTE,
  leadNoteLeft,
  LEAD_UNCLAIMED_NOTE,
  LEAD_LOW_SHARE_FLOOR,
  leadLowShare,
  LEAD_NO_CARD_LINE,
  LEAD_OUTSIDE_US_LINE,
  leadNotBusinessesLine,
  leadNoCardLine,
  LEAD_PAUSED_TITLE,
  leadNearWhere,
  leadAnd,
  leadEndingLine,
  leadAllowanceFact,
  outcomeMove
} from "./lead-words.js";
export {
  stageArgs,
  leadsRoute,
  parseLeadsRoute,
  LEAD_DRAFT_JSON_SCHEMA,
  leadDraftFooter,
  leadQuestionTitle,
  LEAD_QUESTION_WAIT_LINE,
  leadQuestionRoute,
  leadQuestionMail,
  LEAD_PRIOR_MIN_PLACES,
  leadPlanLikely,
  leadPlanFacts,
  leadPlanFactLine,
  leadMonthPlanFacts,
  leadPlanAsk
} from "./lead-plan.js";
export {
  leadTodayLine,
  leadHoursShort,
  leadWhere,
  LEAD_UNDO_MS,
  leadUndoable,
  leadExclusionWord,
  leadCheckWord,
  LEAD_SLOT_WORDS,
  leadSlots,
  leadTintOf,
  LEAD_TILE_PX,
  leadTileSrc
} from "./lead-facts.js";
export {
  leadPeekMenu,
  leadWeekSummary,
  leadWeekBars,
  toLeadPeekVM,
  LEAD_REMOVE_KEEPS,
  leadSearchWords
} from "./lead-peek.js";
export { LEAD_CHECK_KEYS } from "./lead-dtos.js";
export {
  leadLowerFirst,
  LEAD_REVIEW_GROUP_WORDS,
  LEAD_REVIEW_ACT_WORDS,
  LEAD_REVIEW_GROUP_WHY,
  LEAD_CHECK_CENTS_EACH,
  leadCheckAgainCents,
  leadReviewCosts,
  leadAskedFor,
  leadReviewGroups,
  LEAD_MAP_MAX_SPAN_M,
  leadMapPlot,
  leadMapAcross,
  leadAreaFrom,
  leadMapNote
} from "./lead-review.js";
export {
  leadBand,
  LEAD_MARKS_BUCKET,
  LEAD_MARK_PATH,
  leadMarkSrc,
  toLeadRowVM,
  leadRowOf,
  leadRail,
  leadsStanding
} from "./lead-row.js";
export { LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_OPERATION_KINDS, LEAD_STAGES };
const LEAD_FIRST_DAY = {
  title: "Find your next customers",
  sub: "We'll find them, and how to reach each one.",
  ask: "Describe who you want",
  /** The field's arrow, to a screen reader: what pressing it does. */
  send: "Find them",
  ideas: "Ideas for you",
  /** While another read writes them (00398): the page asks again in a moment. */
  writing: "Writing your ideas\u2026",
  from: "Based on",
  edit: "Edit",
  /** New ideas from the same line, when the owner wants others (00399). */
  newIdeas: "New ideas",
  lineTitle: "Your business",
  lineSub: "Your ideas are written from this.",
  lineLabel: "What your business does",
  linePlaceholder: "What you sell, and who buys it",
  /** Write it for me: the owner's line let go, and the line written from the whole picture (22 Oct 2026). */
  lineForMe: "Write it for me",
  lineWriting: "Writing\u2026",
  /** Under a line written for the owner, where it came from. */
  lineWritten: "Written from your profile, customers and searches.",
  /** The sheet's one press over a line written for the owner and not changed: nothing to save. */
  lineDone: "Done",
  importIt: "Import a list"
};
export const LEAD_SUGGEST_UNAVAILABLE = "Suggestions are not available right now.";
export const LEAD_WORDS = {
  /**
   * The ways a lead can be rung, offered when Call is pressed rather than dialling on the spot. Pressing it rang a
   * real business the moment a thumb landed on a row you might only have been skimming, and a call made from a
   * desk phone could not be recorded at all -- the six outcomes are armed by that button alone.
   *
   * The receptionist is NOT one of the ways and must not become one here. It answers the line and never rings a
   * customer (`business-tab.ts` CANNOT_ROWS, "outbound_call"), which the Business page states to the owner in
   * those words. A menu item offering it would promise what the product says two pages away that it cannot do.
   */
  callWays: {
    dial: { label: "Call from your phone" },
    copy: { label: "Copy the number" },
    /** Rung from a desk phone or a softphone: no dial, straight to "How did the call go?". */
    log: { label: "Log a call you already made", meta: "how did it go?" }
  },
  close: "Close",
  open: "Open",
  /** The door from a lead that became a person (its name in the peek, the row's Client pill) to them in People. */
  openPerson: "Open them in People",
  stageLabel: "Stage",
  notFit: LEAD_CLOSED_WORDS.not_a_fit,
  notFitTitle: LEAD_NOT_A_FIT_TITLE,
  whys: LEAD_NOT_A_FIT_WHYS.map((id) => ({ id, label: LEAD_NOT_A_FIT_WORDS[id] })),
  keep: "Keep",
  exclude: "Exclude",
  putBack: "Put back",
  leftOut: "Left out of this search. It doesn't count.",
  reach: "How you can reach them",
  checked: "Checked",
  found: "Found",
  call: "Call",
  copy: "Copy",
  copyAria: "Copy the email",
  /** The peek's reach rows act with quiet marks; these are their names, heard and shown on hover (data-tip). */
  copyPhoneAria: "Copy the number",
  draftAria: "Draft an email",
  draft: "Draft",
  noWebsite: "No website listed",
  instagram: "Instagram",
  talkingNote: LEAD_TALKING_NOTE,
  sentQuestion: LEAD_SENT_QUESTION,
  sentYes: "Yes, mark contacted",
  sentNo: "Not yet",
  callQuestion: LEAD_CALL_QUESTION,
  callSave: "Save",
  callCancel: "I didn't call",
  outcomes: LEAD_CALL_OUTCOMES.map((id) => ({
    id,
    label: LEAD_CALL_OUTCOME_WORDS[id],
    tone: LEAD_CALL_OUTCOME_TONES[id]
  })),
  noteLabel: "A note about the call",
  /** Under Interested (0052): the person the call reached, who becomes their own page's name. */
  spokeWith: "Who did you speak with?",
  spokeWithPlaceholder: "Their name, if they said it",
  notePlaceholder: LEAD_NOTE_PLACEHOLDER,
  noteMax: LEAD_NOTE_MAX,
  noteLeft: leadNoteLeft,
  backTo: "Back to",
  to: "To",
  subject: "Subject",
  draftRewrite: "Rewrite",
  tones: [
    { id: "shorter", label: "Shorter" },
    { id: "warmer", label: "Warmer" }
  ],
  draftWriting: "Writing it\u2026",
  draftNote: LEAD_DRAFT_NOTE,
  draftOpen: "Open in your email",
  draftFrom: "Sent from your own inbox",
  copiedDraft: "Copied the email.",
  firstDay: LEAD_FIRST_DAY,
  about: "About",
  reachHeading: "Reach",
  unclaimed: LEAD_UNCLAIMED_NOTE,
  suggestUnavailable: LEAD_SUGGEST_UNAVAILABLE,
  // D5: the peek re-cut, and the photo expanded.
  expand: "Expand",
  photos: "Photos",
  noPhoto: "No photo on the listing",
  whereSits: "Where it sits",
  openHours: "Open hours",
  fromListing: "From the listing",
  openMaps: "Open in Maps",
  ratedHeading: "What people say",
  closePhotos: "Close",
  /**
   * The rail's two sections. The first is six views of a lead's stage (LEAD_LIST_WORDS), not lists: "Lists" is People's word
   * for a rule over facts (decision 0009, LIST_GROUP_WORDS), and a list of the owner's own made from a file sits under
   * Searches here.
   */
  viewsHeading: "Views",
  searchesHeading: "Searches",
  // D5, on a phone: one lead at a time, and the question when you are back from the call.
  deckOf: (at, of) => `${at} of ${of}`,
  deckPrev: "The lead before",
  deckNext: "The next lead",
  callSaveNext: "Save and go to the next",
  callSavedNote: "Saving moves them to Talking. They join People when they write or call in.",
  /**
   * The peek's ⋯ menu and its one item (Reach out Part 4, PR 9): Erase, the owner's alone (DELETE leads/[id]), asked
   * first because it cannot be undone. Who is offered it is `leadPeekMenu`'s to say, never the page's.
   */
  more: "More for this lead",
  erase: LEAD_ERASE_WORDS
};
export const LEAD_SUGGEST_DAYS = 30;
export const LEAD_PRIOR_MIN = 25;
export function leadReachLine(prior) {
  if (!prior || prior.matched < LEAD_PRIOR_MIN) return "New kind of search \xB7 checked after 25";
  const tenths = Math.round(prior.with_email / prior.matched * 10);
  if (tenths <= 1) return "Most list a phone \xB7 few have an email";
  if (tenths >= 9) return "Nearly all have an email";
  if (tenths === 5) return "About half have an email";
  if (tenths === 7) return "About 2 in 3 have an email";
  return `About ${tenths} in 10 have an email`;
}
