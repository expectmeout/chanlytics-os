/**
 * The Leads scope of People, in words (PRD 2026-09-17 v3 §6, §9; release B).
 *
 * Release A (`search/`, `lead-judge.ts`) holds the plan, the stored sets
 * and every rule with a right answer. This file is what the OWNER sees: the
 * word a stored value wears, the shape a request takes, the view a route
 * spells, and the view models the page draws a row, the rail and the standing
 * line from. Pure -- nothing here reads a file, a database or a clock of its
 * own; a caller hands in the workspace's zone and the moment.
 *
 * No word here names the vendor that runs the searches. Where a fact came from
 * is said the way the owner would say it ("Google Maps listing"), never by the
 * name of the service that fetched it.
 */
import {
  LEAD_CLOSED_REASONS,
  LEAD_EMAIL_STATES,
  LEAD_FITS,
  LEAD_OPERATION_KINDS,
  LEAD_REACH_FILTERS,
  LEAD_STAGES,
  type LeadEmailState,
  type LeadFit,
  type LeadReachFilter,
} from "./search/sets";
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
  leadNoteLeft,
} from "./lead-words";
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
  LEAD_READ_SOURCES,
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
  leadEndingFound,
  leadEndingLine,
  leadAllowanceFact,
  outcomeMove,
} from "./lead-words";
export type {
  LeadClass,
  LeadStage,
  LeadList,
  LeadSort,
  LeadCallOutcome,
  LeadNotAFitWhy,
  LeadEndingFacts,
  LeadEndingLine,
} from "./lead-words";
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
  leadPlanAsk,
} from "./lead-plan";
export type { LeadPlanView, LeadPlanRefusalKind, LeadPlanned, PeoplePlanned, LeadChips } from "./lead-plan";
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
  leadReaches,
  leadReachOf,
  LEAD_REACH_WORDS,
  leadReachWord,
  leadTintOf,
  LEAD_TILE_PX,
  leadTileSrc,
} from "./lead-facts";
export {
  leadPeekMenu,
  leadWeekSummary,
  leadWeekBars,
  toLeadPeekVM,
  LEAD_REMOVE_KEEPS,
  leadSearchWords,
} from "./lead-peek";
export type { LeadPeekReach, LeadPeekVM, LeadWeekRow } from "./lead-peek";
export { LEAD_CHECK_KEYS } from "./lead-dtos";
export type {
  LeadCheck,
  LeadCheckKey,
  LeadRowDto,
  LeadSearchRoundDto,
  LeadSearchDto,
  LeadCounts,
  LeadMonthDto,
  LeadSuggestionsDto,
  LeadIdeaDto,
  LeadIdeaRole,
  LeadPlanFacts,
} from "./lead-dtos";
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
  leadMapNote,
} from "./lead-review";
export type { LeadReviewGroupId, LeadReviewAct, LeadReviewGroup, LeadMapPin, LeadMapPlot } from "./lead-review";
export {
  leadBand,
  LEAD_MARKS_BUCKET,
  LEAD_MARK_PATH,
  leadMarkSrc,
  toLeadRowVM,
  leadRowOf,
  leadRail,
  leadSearchEmptyWords,
  leadsStanding,
} from "./lead-row";
export type { LeadSlotState, LeadSlot, LeadRowCard, LeadBand, LeadRailRow, LeadRowVM } from "./lead-row";

/**
 * One home per set. Release A declares all six in `search/sets.ts` and `schema-sets.ts:122` holds
 * `LEAD_OPERATION_KINDS` Exactly equal to `lead_operations.kind`; B widens that one by `stage` and `bulk`
 * **in `search/sets.ts`**, in the same commit as 4.2's migration and `gen:schema-sets` (4.2 step 5) -- widening it
 * here first fails `schema-sets.ts:122` with `Type 'false' does not satisfy the constraint 'true'` until the
 * generated set carries the two new kinds. Nothing below re-declares a stored set.
 */
export { LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_OPERATION_KINDS, LEAD_REACH_FILTERS, LEAD_STAGES };
export type { LeadEmailState, LeadFit, LeadReachFilter }; // A's, re-exported so a page reads one name
/**
 * The first day of Leads, before a workspace has kept one search or holds one lead (§8.9; redrawn 7 Oct 2026 as one
 * question and the door to Ask, canvas "Leads, the first day", option A). `ask` is what the door says, in the place a
 * field's own words would stand; `ideas` heads the searches written for this workspace, with `newIdeas` beside it;
 * `from` leads the business line they were written from, a row whose one control is `edit`; the four `line` words are
 * the sheet that rewrites it (its name, the sentence under it, its field's name and what the empty field says); the last
 * two are the doors to a list the owner already has and to named people at companies.
 *
 * Plain words, short lines, and no model's name (Ruben, 22 Oct 2026: "the copy should not be technical nor mention
 * things like Claude"): what the page does for the owner, never how it is built.
 */
const LEAD_FIRST_DAY = {
  title: "Find your next customers",
  sub: "We'll find them, and how to reach each one.",
  ask: "Describe who you want",
  /** The field's arrow, to a screen reader: what pressing it does. */
  send: "Find them",
  ideas: "Ideas for you",
  /** While another read writes them (00398): the page asks again in a moment. */
  writing: "Writing your ideas…",
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
  lineWriting: "Writing…",
  /** Under a line written for the owner, where it came from. */
  lineWritten: "Written from your profile, customers and searches.",
  /** The sheet's one press over a line written for the owner and not changed: nothing to save. */
  lineDone: "Done",
  importIt: "Import a list",
} as const;
/** When the suggestions cannot be written at all: a note on the page, never a page that fails (suggestionsWritten). */
export const LEAD_SUGGEST_UNAVAILABLE = "Suggestions are not available right now.";

/**
 * Every word the Leads scope's own markup says, spelled once here and seeded onto the window as `window.__LEAD_WORDS`
 * by `seed-globals.ts`, because the legacy pages import nothing. A words record is a global seeded once at boot, like
 * `__FACT_WORDS`, not a courier's -- the courier carries acts. Task 19 adds the facts' own words (the stages, the
 * endings, the guardrail sentences) to THIS record; there is one `LEAD_WORDS` and nothing else holds a lead's words.
 * A sentence the server also says is not here: the routes' toasts are the routes' own.
 */
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
    log: { label: "Log a call you already made", meta: "how did it go?" },
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
    tone: LEAD_CALL_OUTCOME_TONES[id],
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
    { id: "warmer", label: "Warmer" },
  ],
  draftWriting: "Writing it…",
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
   * The rail's sections. The first is six views of a lead's stage (LEAD_LIST_WORDS), not lists: "Lists" is People's word
   * for a rule over facts (decision 0009, LIST_GROUP_WORDS), and a list of the owner's own made from a file sits under
   * Searches here. The third is the sequences' own lists (00496), each named for its sequence: the leads added to it.
   */
  viewsHeading: "Views",
  searchesHeading: "Searches",
  sequencesHeading: "Sequences",
  // D5, on a phone: one lead at a time, and the question when you are back from the call.
  deckOf: (at: number, of: number) => `${at} of ${of}`,
  deckPrev: "The lead before",
  deckNext: "The next lead",
  callSaveNext: "Save and go to the next",
  callSavedNote: "Saving moves them to Talking. They join People when they write or call in.",
  /**
   * The peek's ⋯ menu and its one item (Reach out Part 4, PR 9): Erase, the owner's alone (DELETE leads/[id]), asked
   * first because it cannot be undone. Who is offered it is `leadPeekMenu`'s to say, never the page's.
   */
  more: "More for this lead",
  erase: LEAD_ERASE_WORDS,
} as const;

/**
 * How long a workspace's ideas stand before Claude is asked again (suggestionsWritten), when nothing else asks sooner: a
 * round that ends, or a business line saved (00398). A week while they were the line's alone.
 */
export const LEAD_SUGGEST_DAYS = 30;

/** The platform-wide prior for a kind of business, as `lead_niche_prior()` answers it. */
export interface LeadNichePrior {
  places: number;
  matched: number;
  with_email: number;
}
/** Under this many judged matches the share is noise, and the line says so instead. */
export const LEAD_PRIOR_MIN = 25;

/**
 * How reachable a kind of business is, in tenths, from what past searches
 * measured (`lead_niche_priors`, A1's calibration). Never a percentage and
 * never a promise: a kind nobody has searched says so, and the plan card says
 * the same thing ("checked after the first 25").
 */
export function leadReachLine(prior: LeadNichePrior | null | undefined): string {
  if (!prior || prior.matched < LEAD_PRIOR_MIN) return "New kind of search · checked after 25";
  const tenths = Math.round((prior.with_email / prior.matched) * 10);
  if (tenths <= 1) return "Most list a phone · few have an email";
  if (tenths >= 9) return "Nearly all have an email";
  if (tenths === 5) return "About half have an email";
  if (tenths === 7) return "About 2 in 3 have an email";
  return `About ${tenths} in 10 have an email`;
}
