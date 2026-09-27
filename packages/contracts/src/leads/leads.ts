/**
 * The Leads scope of People, in words (PRD 2026-09-17 v3 §6, §9; release B).
 *
 * Release A (`lead-search.ts`, `lead-judge.ts`) holds the plan, the stored sets
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
  LEAD_STAGES,
  type LeadEmailState,
  type LeadFit,
} from "./lead-search";
import {
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
export * from "./lead-words";
export * from "./lead-plan";
export * from "./lead-facts";
export * from "./lead-peek";
export * from "./lead-dtos";
export * from "./lead-review";
export * from "./lead-row";

/**
 * One home per set. Release A declares all six in `lead-search.ts` and `schema-sets.ts:122` holds
 * `LEAD_OPERATION_KINDS` Exactly equal to `lead_operations.kind`; B widens that one by `stage` and `bulk`
 * **in `lead-search.ts`**, in the same commit as 4.2's migration and `gen:schema-sets` (4.2 step 5) -- widening it
 * here first fails `schema-sets.ts:122` with `Type 'false' does not satisfy the constraint 'true'` until the
 * generated set carries the two new kinds. Nothing below re-declares a stored set.
 */
export { LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_OPERATION_KINDS, LEAD_STAGES };
export type { LeadEmailState, LeadFit }; // A's, re-exported so a page reads one name
/** The first day of Leads, before a workspace has kept one search (§8.9). */
export const LEAD_FIRST_DAY_TITLE = "Your people gather here";
export const LEAD_FIRST_DAY_SUB = "Or have Claude find businesses worth reaching";
/** What the finder does not do, said where it is offered. */
export const LEAD_FIRST_DAY_FOOT = "Claude finds businesses, not people at home.";
/** When the suggestions cannot be written at all: a note on the page, never a page that fails (4.4's suggestionsFor). */
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
  firstDay: { title: LEAD_FIRST_DAY_TITLE, sub: LEAD_FIRST_DAY_SUB, foot: LEAD_FIRST_DAY_FOOT },
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
  // D5, on a phone: one lead at a time, and the question when you are back from the call.
  deckOf: (at: number, of: number) => `${at} of ${of}`,
  deckPrev: "The lead before",
  deckNext: "The next lead",
  callSaveNext: "Save and go to the next",
  callSavedNote: "Saving moves them to Talking. They join People when they write or call in.",
} as const;

/** How long a workspace's suggestions stand before Claude is asked again (4.4's suggestionsFor). */
export const LEAD_SUGGEST_DAYS = 7;

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

export interface LeadWayFacts {
  /** The workspace's own line, when this tab has read the setup surface; null when it has not. */
  voice: { active: boolean; number: string | null } | null;
  whatsapp: { present: boolean; active: boolean } | null;
  calendar: "ok" | "unavailable" | "none";
  people: number;
}
export interface LeadWay {
  id: "reach" | "calendar" | "yours";
  title: string;
  line: string;
  /** Only ever what this tab has read: null claims nothing. */
  status: string | null;
  doors: { id: string; label: string; to: string }[];
}
