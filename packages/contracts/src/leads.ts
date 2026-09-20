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
import { z } from "zod";
import {
  LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_ENDING_WORDS, LEAD_FITS, LEAD_MAX_PLACES, LEAD_MEMBER_CLASSES, LEAD_OPERATION_KINDS, LEAD_STAGES,
  LEAD_KIND_KEY, LEAD_UNREACHABLE_KEY, leadKindWord, LeadSearchPlanSchema, planMinutes, planWho, siteHost, stateCode,
  type LeadArea, type LeadEmailState, type LeadFit, type LeadMemberClass, type LeadRoundEnding, type LeadSearchPlan,
} from "./lead-search";
import { initialsOf } from "./viewmodels";
import { agoShort } from "./time";
import { clockDateYear, clockTime } from "./clock";

/**
 * One home per set. Release A declares all six in `lead-search.ts` and `schema-sets.ts:122` holds
 * `LEAD_OPERATION_KINDS` Exactly equal to `lead_operations.kind`; B widens that one by `stage` and `bulk`
 * **in `lead-search.ts`**, in the same commit as 4.2's migration and `gen:schema-sets` (4.2 step 5) -- widening it
 * here first fails `schema-sets.ts:122` with `Type 'false' does not satisfy the constraint 'true'` until the
 * generated set carries the two new kinds. Nothing below re-declares a stored set.
 */
export { LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_OPERATION_KINDS, LEAD_STAGES };
/** B's screen word for A's stored set (`lead_search_members.class`): one set, two names, never two lists. */
export const LEAD_CLASSES = LEAD_MEMBER_CLASSES;
export type LeadClass = LeadMemberClass;
export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"] as const;
export const LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"] as const;   // leads_page's p_sort (B widens A's three)
export const LEAD_CALL_OUTCOMES = ["interested", "call_back", "not_interested", "voicemail", "no_answer", "wrong_number"] as const;
export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"] as const;
/** A's stored set has no type of its own; the word for one of its members is derived here, not a second list. */
export type LeadStage = (typeof LEAD_STAGES)[number];
export type { LeadEmailState, LeadFit };   // A's, re-exported so a page reads one name
export type LeadList = (typeof LEAD_LISTS)[number]; export type LeadSort = (typeof LEAD_SORTS)[number];
export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number]; export type LeadNotAFitWhy = (typeof LEAD_NOT_A_FIT_WHYS)[number];

/** Stored values are never shown (§9.1). */
export const LEAD_STAGE_WORDS: Record<LeadStage, string> = { ready: "Ready", nurture: "Contacted", converted: "Talking", archived: "Closed" };
export const LEAD_CLOSED_WORDS: Record<(typeof LEAD_CLOSED_REASONS)[number], string> = { said_no: "Said no", not_a_fit: "Not a fit", customer: "Already a customer", stale: "Went quiet", search_removed: "Search removed" };
export const LEAD_FIT_WORDS: Record<(typeof LEAD_FITS)[number], string> = { strong: "Strong fit", look: "Worth a look", long: "Long shot" };
/** Claims only what the check saw (S12): a catch-all server accepts anything, so the check cannot tell. */
export const LEAD_EMAIL_WORDS: Record<(typeof LEAD_EMAIL_STATES)[number], string> = { none: "No email", checking: "Checking", ok: "Checked", catch_all: "Unconfirmed", unknown: "Couldn't check", invalid: "Bounces" };
/** How an outcome reads at a glance (D5): the dot beside its word, never colour alone -- the word is always there. */
export const LEAD_CALL_OUTCOME_TONES: Record<(typeof LEAD_CALL_OUTCOMES)[number], "ok" | "warn" | "quiet" | "bad"> = {
  interested: "ok", call_back: "warn", voicemail: "quiet", no_answer: "quiet", not_interested: "bad", wrong_number: "bad",
};
export const LEAD_CALL_OUTCOME_WORDS: Record<(typeof LEAD_CALL_OUTCOMES)[number], string> = { interested: "Interested", call_back: "Call back later", not_interested: "Not interested", voicemail: "Left a voicemail", no_answer: "No answer", wrong_number: "Wrong number" };
/** The rail's six lists, said once (§6.1). `leadRail` draws from here and nowhere else. */
export const LEAD_LIST_WORDS: Record<LeadList, string> = { all: "All leads", ready: "Ready", nurture: "Contacted", converted: "Talking", said_no: "Said no", not_a_fit: "Not a fit" };
/** Where a lead's facts came from, in the owner's words. */
export const LEAD_SOURCE_WORD = "Google Maps listing";
export const LEAD_LOCKED_LINE = "Wait for their yes. Once they write back, they're in People and your yes page works for them.";
export const LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
export const LEAD_NO_ADDRESS = "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";
/** Both consent doors say this, permanently, for a person a lead is linked to (decision 19). */
export const LEAD_CONSENT_REFUSAL = "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";
/* --------------------------------------------- release B, tasks 12-15 ---- */

/** Not a fit's five whys, in the order the peek and the bulk bar offer them (§9.5). */
export const LEAD_NOT_A_FIT_WORDS: Record<LeadNotAFitWhy, string> = {
  chain: "A chain or franchise",
  wrong_kind: "The wrong kind of business",
  too_far: "Too far away",
  customer: "Already a customer",
  other: "Something else",
};
export const LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";
/** The one why that hides the place from every future search; the rest teach nothing in this release. */
export const LEAD_SUPPRESSING_WHY: LeadNotAFitWhy = "customer";
export const LEAD_REVIEW_WORD = "Needs review";
export const LEAD_LEFT_OUT_WORD = "Left out";
/** The Excluded chip for a place with no phone and no email (lead-search.ts LEAD_UNREACHABLE_KEY). */
export const LEAD_UNREACHABLE_WORD = "No way to reach them";
/** The peek's two groups of checks (P2, §0.1). Nothing read wears a plain check mark. */
export const LEAD_CHECK_GROUP_WORDS: Record<"seen" | "read", string> = { seen: "Seen", read: "Claude's read" };
export const LEAD_CHECK_UNSURE = "Couldn't tell";
// LEAD_CHECK_KEYS and LeadCheckKey are 4.6's, written with the DTOs below; the
// seven are four seen and three read. Nothing here declares them again.
/** One label per check and answer; the particulars are the check's own reason. */
export const LEAD_CHECK_WORDS: Record<LeadCheckKey, Record<"yes" | "no" | "unknown", string>> = {
  // Each unknown names what could not be told: four rows of "Couldn't tell" told the owner nothing.
  on_maps: { yes: "Open for business", no: "Not open for business", unknown: "Open for business: couldn't tell" },
  in_area: { yes: "In the area you asked for", no: "Outside the area you asked for", unknown: "In the area: couldn't tell" },
  phone_two_sources: { yes: "Phone matches on two sources", no: "Phone from one source only", unknown: "Phone on two sources: couldn't tell" },
  mailbox: { yes: "Mailbox exists", no: "Mailbox doesn't exist", unknown: "Mailbox: couldn't tell" },
  independent: { yes: "Not a chain", no: "Part of a chain", unknown: "Independent: couldn't tell" },
  right_kind: { yes: "The kind you asked for", no: "Not the kind you asked for", unknown: "The kind you asked for: couldn't tell" },
  own_address: { yes: "The business's own address", no: "Not the business's own address", unknown: "Their own address: couldn't tell" },
};
/** The mailbox check says the state it saw, never a word for it (§10.4, S12). */
export const LEAD_MAILBOX_WORDS: Record<LeadEmailState, string> = {
  none: "No email found on their site",
  checking: "Checking the mailbox",
  ok: "Mailbox exists",
  catch_all: "Their server accepts every address, so the check can't tell",
  unknown: "Their mail server wouldn't answer",
  invalid: "That mailbox doesn't exist",
};
/** What the peek says under the email, from the plan's own contact standard (§0.1). */
export const LEAD_CONTACT_STANDARD_WORDS: Record<"phone" | "email", string> = {
  phone: "This search counts a phone as enough.",
  email: "This search asked for a checked email.",
};
/** The note under the email of a lead that came with none, and the one thing left to do. */
export const LEAD_NO_EMAIL_LINE = "Checked their home, contact and about pages. Call instead.";
/** Both questions the peek asks when the owner comes back to the tab (§9.3, §9.4). */
export const LEAD_SENT_QUESTION = "Did you send it?";
export const LEAD_CALL_QUESTION = "How did the call go?";
export const LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
export const LEAD_NOTE_MAX = 280;
/** A stage click never converts (§9.6): the control says where the yes comes from. */
export const LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";

/** How much of the note is left, said in the field (§9.4). */
export function leadNoteLeft(left: number, max: number): string {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}

/** An unclaimed listing rarely watches its email; the peek says so, quietly (D2). */
export const LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";
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
  outcomes: LEAD_CALL_OUTCOMES.map((id) => ({ id, label: LEAD_CALL_OUTCOME_WORDS[id], tone: LEAD_CALL_OUTCOME_TONES[id] })),
  noteLabel: "A note about the call",
  notePlaceholder: LEAD_NOTE_PLACEHOLDER,
  noteMax: LEAD_NOTE_MAX,
  noteLeft: leadNoteLeft,
  backTo: "Back to",
  to: "To",
  subject: "Subject",
  draftRewrite: "Rewrite",
  tones: [{ id: "shorter", label: "Shorter" }, { id: "warmer", label: "Warmer" }],
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
export interface LeadNichePrior { places: number; matched: number; with_email: number }
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

/**
 * The three ways people arrive (§8.9), each claiming only what this tab has
 * read. The People surface carries the calendar and the count; the line is the
 * setup surface's, which this route does not load on a cold open -- so with no
 * facts the way says what it is and points at Setup, and never says a number is
 * live that nobody looked at. "Import a list" is Phase 2 and is not offered
 * until it exists.
 */
export function leadsFirstDayWays(f: LeadWayFacts): LeadWay[] {
  const live = !!(f.voice && f.voice.active && f.voice.number);
  const reachDoors = [{ id: "line", label: live ? "Your number" : "Set up your number", to: "admin/setup" }];
  if (!f.whatsapp || !f.whatsapp.active) reachDoors.push({ id: "whatsapp", label: "Connect WhatsApp", to: "admin/integrations" });
  return [
    {
      id: "reach",
      title: "They reach you",
      line: live
        ? `Calls and texts to ${f.voice!.number} are answered, and each person lands here.`
        : "Calls and texts to your number are answered, and each person lands here.",
      status: live ? "Your number is live" : null,
      doors: reachDoors,
    },
    {
      id: "calendar",
      title: "Your calendar",
      line: "Anyone with an appointment is added, with their visits, so regulars aren't strangers.",
      status: f.calendar === "ok" ? "Your calendar is connected" : null,
      doors: f.calendar === "ok"
        ? [{ id: "calendar", label: "Open the calendar", to: "calendar" }]
        : [{ id: "calendar", label: "Connect your calendar", to: "admin/integrations" }],
    },
    {
      id: "yours",
      title: "Clients you already have",
      line: "Add them one at a time, and they gather here with everyone else.",
      status: f.people > 0 ? `${f.people} ${f.people === 1 ? "person" : "people"} here already` : null,
      doors: [{ id: "add", label: "Add someone", to: "clients" }],
    },
  ];
}

/* ------------------------------------------------- the planner's refusals */

/**
 * The three things the planner says instead of a plan (§8.8). They are words for
 * whoever asked -- the composer prints them under the input, Ask's tool hands
 * them to the model to say -- and never a card with a problem in it.
 */
export const LEAD_NO_CARD_LINE = "I can find local businesses for now.";
export const LEAD_OUTSIDE_US_LINE =
  "I can only find businesses in the US for now. The rules for emailing businesses in Canada, the UK and the EU are different, and Chanlytics follows the US ones.";
/** The second: what the workspace sells, in the owner's own words, or "what you do". */
export function leadNotBusinessesLine(want: string | null): string {
  return `I find businesses, not people at home. People who want ${want && want.trim() ? want.trim() : "what you do"} find you, and your receptionist answers them. Businesses whose clients need you next are a good start:`;
}
/** The third: what was asked for, named, and what the one card can do. The ask is logged as demand (§0.3). */
export function leadNoCardLine(what: string | null): string {
  return what && what.trim() ? `I can't search ${what.trim()} yet. ${LEAD_NO_CARD_LINE}` : LEAD_NO_CARD_LINE;
}

/* ------------------------------------------ the nine endings, said once -- */

/** The platform's switch, in the owner's words: nothing about a vendor, nothing about money. */
export const LEAD_PAUSED_TITLE = "Lead searches are paused for now";

export interface LeadEndingFacts {
  /** The plan's subject in the owner's words: "personal trainers". */
  name: string;
  /** Where it looked, in the owner's words: "Austin". */
  area: string;
  counted: number;
  target: number;
  emails: number;
  phones: number;
  excluded: number;
  /** A stopped round whose emails are still being checked (S12). */
  checking: boolean;
  /** question_unanswered: how many were counted before it asked. */
  foundBefore: number;
  /** few_new_matches / searched_everything: where to look next, in the owner's words. */
  nearby: string[];
  /** How many places the source returned at all, and what left them all out. */
  seen: number;
  leftOutBy: string | null;
}

export interface LeadEndingLine {
  /** A's word for the ending; the strip's accessible name, never its sentence. */
  mark: string;
  title: string;
  parts: string[];
  step: { id: string; label: string } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Alpine and Fort Davis"; "Round Rock, Pflugerville and Kyle". */
export function leadAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Every ending, said once (§8.8, the States artboard): what happened, what was
 * kept, what was counted, and one next step. Two shapes only -- "Found N ..."
 * when the round delivered what it was for, "Stopped ..." when it did not --
 * because an owner reads the first word and must know which of the two this is.
 * LEAD_ENDING_WORDS stays A's short name for the ending and rides along as
 * `mark`, for the strip's accessible name and the kept-search menu.
 *
 * No dollar amount: the month's allowance and the searching budget are both
 * spoken as leads (§0.2), and no line here names what any of it is bought from.
 */
export function leadEndingLine(ending: LeadRoundEnding, f: LeadEndingFacts): LeadEndingLine {
  const mark = LEAD_ENDING_WORDS[ending];
  const yours = `the ${f.counted} found are yours`;
  const one = f.name.replace(/s$/, "");
  switch (ending) {
    case "target_reached":
      return {
        mark,
        title: `Found ${f.counted} ${f.name}`,
        parts: [`${f.emails} you can email`, `${f.phones} by phone`, `${f.excluded} left out`],
        step: f.excluded > 0 ? { id: "excluded", label: `${f.excluded} left out` } : { id: "sort_fit", label: "Sort by fit" },
      };
    case "searched_everything":
      if (f.counted === 0) {
        return {
          mark,
          title: `There are ${plural(f.seen, one, f.name)} in ${f.area}, and ${f.seen === 1 ? "it is" : "all of them are"} ${f.leftOutBy ?? "outside what you asked for"}, which you asked me to leave out.`,
          parts: ["Nothing was counted."],
          step: f.nearby.length ? { id: "nearby", label: `Look in ${leadAnd(f.nearby)}` } : null,
        };
      }
      return {
        mark,
        title: `Found ${f.counted} ${f.name}`,
        parts: [`everything these searches returned in ${f.area}`],
        step: { id: "nearby", label: `Find ${Math.max(0, f.target - f.counted)} more nearby` },
      };
    case "month_leads_used":
      return { mark, title: `Stopped at ${f.counted}`, parts: ["this month's leads are used", yours], step: null };
    case "budget_used":
      return { mark, title: `Stopped at ${f.counted}`, parts: ["this month's searching is used up", yours], step: null };
    case "few_new_matches":
      return {
        mark,
        // "already yours" read as dedupe. "Found all" says what happened: the area ran dry.
        title: `Found all ${plural(f.seen, one, f.name)} in ${f.area}`,
        parts: [yours, ...(f.nearby.length ? [`Look further out, in ${leadAnd(f.nearby)}?`] : [])],
        step: f.nearby.length ? { id: "look_further", label: "Look further out" } : null,
      };
    case "stopped":
      return f.checking
        ? { mark, title: "Stopping", parts: [`checking the emails of the ${f.counted} found`, "nothing else was counted"], step: null }
        : { mark, title: `Stopped at ${f.counted}`, parts: [yours, "nothing else was counted"], step: { id: "carry_on", label: "Carry on" } };
    case "source_failed":
      return { mark, title: `Stopped at ${f.seen}: the source stopped answering`, parts: [yours, "nothing more was counted"], step: { id: "try_again", label: "Try again" } };
    case "question_unanswered":
      return { mark, title: "Stopped after a day without your answer", parts: [`the ${f.foundBefore} found before it asked are yours`], step: { id: "answer_now", label: "Answer now" } };
    case "paused":
      return { mark, title: LEAD_PAUSED_TITLE, parts: ["your leads are all here", "nothing is being counted"], step: null };
  }
}

/** The plan card's and the strip's one unit: leads, never dollars (§0.2). */
export function leadAllowanceFact(left: number): string {
  return `${left} left this month`;
}

/** What a call outcome does to the stage (§9.4). Only Interested converts; Wrong number keeps the stage. */
export function outcomeMove(o: (typeof LEAD_CALL_OUTCOMES)[number]): { stage: LeadStage | null; closedReason: string | null; converts: boolean } {
  switch (o) {
    case "interested": return { stage: "converted", closedReason: null, converts: true };
    case "not_interested": return { stage: "archived", closedReason: "said_no", converts: false };
    case "wrong_number": return { stage: null, closedReason: null, converts: false };
    default: return { stage: "nurture", closedReason: null, converts: false };
  }
}

/* --------------------------------------------------------------- requests */

export const LeadsQuerySchema = z.object({
  list: z.enum(LEAD_LISTS).default("all"),
  search: z.string().uuid().optional(),
  class: z.enum(LEAD_CLASSES).optional(),
  sort: z.enum(LEAD_SORTS).default("fit"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  after_key: z.string().max(80).optional(),
  after_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export type LeadsQuery = z.infer<typeof LeadsQuerySchema>;
/** The view a bulk act names when the owner chose "Select all N that match" (S13): the same keys GET leads takes. */
export const LeadsViewSchema = LeadsQuerySchema.omit({ after_key: true, after_id: true, limit: true });

/** POST leads/[id]/stage, the page's five acts made exclusive. */
export const LeadStageInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), stage: z.enum(["ready", "nurture", "converted"]) }),
  z.object({ kind: z.literal("not_a_fit"), why: z.enum(LEAD_NOT_A_FIT_WHYS) }),
  z.object({ kind: z.literal("said_no") }),
  z.object({ kind: z.literal("outcome"), outcome: z.enum(LEAD_CALL_OUTCOMES), note: z.string().trim().max(280).optional() }),
  /** "Did you send it?" Yes. */
  z.object({ kind: z.literal("emailed") }),
]);
export type LeadStageInput = z.infer<typeof LeadStageInputSchema>;

/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
export function stageArgs(i: LeadStageInput): { p_stage: string | null; p_reason: string | null; p_fit_reason: string | null; p_outcome: string | null; p_note: string | null } {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null };
  switch (i.kind) {
    case "stage": return { ...none, p_stage: i.stage };
    case "not_a_fit": return { ...none, p_stage: "archived", p_reason: i.why === "customer" ? "customer" : "not_a_fit", p_fit_reason: i.why };
    case "said_no": return { ...none, p_stage: "archived", p_reason: "said_no" };
    case "emailed": return { ...none, p_stage: "nurture", p_outcome: "emailed" };
    case "outcome": {
      const m = outcomeMove(i.outcome);
      return { ...none, p_stage: m.stage, p_reason: m.closedReason, p_outcome: i.outcome, p_note: i.note ?? null };
    }
  }
}
export const LeadsBulkSchema = z.discriminatedUnion("by", [
  // Keep and Exclude (D3) take ids only, and may name the search the Needs review pile is read in.
  z.object({ by: z.literal("ids"), action: z.enum(["contacted", "not_a_fit", "keep", "exclude"]), ids: z.array(z.string().uuid()).min(1).max(500), search_id: z.string().uuid().optional() }),
  z.object({ by: z.literal("view"), action: z.enum(["contacted", "not_a_fit"]), view: LeadsViewSchema }),
]);
export type LeadsBulkInput = z.infer<typeof LeadsBulkSchema>;
/** Check again (D3): the leads whose mailbox check did not answer, asked once more. */
export const LeadsCheckAgainSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export type LeadsCheckAgainInput = z.infer<typeof LeadsCheckAgainSchema>;
export const LeadDraftInputSchema = z.object({
  tone: z.enum(["first", "shorter", "warmer"]).default("first"),
  previous: z.object({ subject: z.string().max(200), body: z.string().max(4000) }).optional(),
});
export const LeadExportQuerySchema = LeadsViewSchema;
export const RenameLeadSearchSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const BusinessLineSchema = z.object({ business_line: z.string().trim().min(3).max(160) });

/* --------------------------------------------------------- the planner */

/**
 * What Ask's `propose_lead_search` hands the planner: the ask in fields, not a
 * plan. The model never writes a `LeadSearchPlan` -- it says who, how many,
 * where, the standard and what to leave out, and `planLeadSearch` builds the
 * plan, keys every criterion and exclusion, and checks the result against
 * release A's own schema. A model that gets a field wrong gets a refusal in
 * words, never a plan the door would have had to catch.
 */
const planChip = (max: number) => z.string().trim().min(2).max(max);
export const ProposeLeadSearchSchema = z.object({
  looking_for: z.enum(["local_businesses", "people", "online_sellers", "other"]),
  country: z.string().trim().min(2).max(40),
  count: z.number().int().min(1).max(LEAD_MAX_PLACES),
  /** Plural, as the sentence says it: "personal trainers". */
  who: planChip(60),
  /** One of them, for the question and the judge's rubric: "personal trainer". */
  who_one: planChip(60),
  category_key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  terms: z.array(planChip(60)).min(1).max(5),
  city: z.string().trim().max(60).nullable().default(null),
  region: z.string().trim().min(2).max(40),
  zip: z.string().regex(/^\d{5}$/).nullable().default(null),
  contact: z.enum(["phone", "email"]),
  criteria: z.array(z.object({ text: planChip(120), standard: z.enum(["likely", "seen"]), required: z.boolean() })).max(6).default([]),
  leave_out: z.array(z.object({ words: planChip(40) })).max(6).default([]),
  asked: z.string().trim().min(1).max(400),
});
export type ProposeLeadSearch = z.infer<typeof ProposeLeadSearchSchema>;

/** The card's head. The rest of what the card draws is the plan itself and the workspace's facts. */
export interface LeadPlanView { title: string }
export type LeadPlanRefusalKind = "outside_us" | "not_businesses" | "no_card" | "not_a_plan";
export type LeadPlanned =
  | { ok: true; plan: LeadSearchPlan; view: LeadPlanView }
  | { ok: false; refusal: { kind: LeadPlanRefusalKind; text: string; what: string | null } };

const US_NAMES = new Set(["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america", "the united states", "america", "the us", "the usa"]);
/** "United States (US)" and "the U.S." are the same country as "US"; brackets and a leading "the" say nothing more. */
const countryKey = (c: string) => c.trim().toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
/**
 * Where the state is, when the model put "Miami, FL" in one field and a city
 * in the other. The tool asks for a city and its two-letter state apart, and
 * a model reliably packs them together instead; that is a plan that is
 * complete in every way that matters, so it is read rather than refused.
 */
function placeOf(input: Pick<ProposeLeadSearch, "city" | "region">): { city: string | null; state: string | null } {
  const region = (input.region ?? "").trim();
  const city = (input.city ?? "").trim();
  const direct = stateCode(region);
  if (direct) return { city: city || null, state: direct };
  // "Miami, FL" or "Miami, Florida" in either field: the last part is the state.
  for (const packed of [region, city]) {
    const m = packed.match(/^(.*?),\s*([A-Za-z .]+)$/);
    if (m && stateCode(m[2])) return { city: m[1].trim() || city || null, state: stateCode(m[2]) };
  }
  // The state alone in the city field, with a city in the region field.
  if (stateCode(city) && !stateCode(region)) return { city: region || null, state: stateCode(city) };
  return { city: city || null, state: null };
}
/** A criterion's or an exclusion's own key, from its words, so the judge's rubric and the chips name the same thing. */
function planKey(text: string, fallback: string, taken: Set<string>): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "");
  let key = /^[a-z]/.test(base) ? base : fallback;
  let n = 2;
  while (taken.has(key)) key = `${fallback}_${n++}`;
  taken.add(key);
  return key;
}
/** Title Case for a state written out ("new mexico" -> "New Mexico"); a two-letter code keeps its own case. */
const titleWords = (s: string) => s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/** Where to look, as the plan spells it: a ZIP, a city and its state, or the state on its own. */
function planArea(input: ProposeLeadSearch): LeadArea | null {
  const place = placeOf(input);
  const state = place.state;
  if (!state) return null;
  if (input.zip) return { kind: "zip", label: `near ${input.zip}`, state, center: null, radius_m: 8_000, zip: input.zip, query: `${input.zip}, ${state}, USA` };
  const city = place.city ?? "";
  if (city) return { kind: "city", label: `${city}, ${state}`, state, center: null, radius_m: 25_000, query: `${city}, ${state}, USA` };
  const label = /^[A-Za-z]{2}$/.test(input.region.trim()) ? state : titleWords(input.region.trim());
  return { kind: "city", label, state, center: null, radius_m: 200_000, query: `${label}, USA` };
}

/**
 * The ask as a plan, or one of the three refusals in words (§8.8): outside the
 * US, people rather than businesses, and an ask no source card fits, which is
 * logged as demand. Nothing here reads anything: the same function answers the
 * composer and Ask's tool, so a plan made by typing and a plan made by asking
 * are the same plan.
 */
export function planLeadSearch(input: ProposeLeadSearch): LeadPlanned {
  if (!US_NAMES.has(countryKey(input.country))) return { ok: false, refusal: { kind: "outside_us", text: LEAD_OUTSIDE_US_LINE, what: input.country.trim() } };
  if (input.looking_for === "people") return { ok: false, refusal: { kind: "not_businesses", text: leadNotBusinessesLine(null), what: input.who } };
  if (input.looking_for !== "local_businesses") return { ok: false, refusal: { kind: "no_card", text: leadNoCardLine(input.who), what: input.who } };
  const area = planArea(input);
  if (!area) return { ok: false, refusal: { kind: "outside_us", text: LEAD_OUTSIDE_US_LINE, what: input.region } };
  const taken = new Set<string>();
  const plan: LeadSearchPlan = {
    version: 1,
    card: "local_businesses",
    name: input.who,
    asked: input.asked,
    // Widest first, and at most the three the tool asks the model for.
    terms: [...new Set(input.terms.map((t) => t.trim()).filter(Boolean))].slice(0, 3),
    area,
    count: input.count,
    contact: input.contact,
    criteria: input.criteria.map((c, i) => ({ key: planKey(c.text, `c${i + 1}`, taken), text: c.text, standard: c.standard, required: c.required })),
    exclusions: input.leave_out.map((l, i) => ({ key: planKey(l.words, `x${i + 1}`, taken), text: l.words, origin: "claude" as const })),
  };
  const checked = LeadSearchPlanSchema.safeParse(plan);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return { ok: false, refusal: { kind: "not_a_plan", text: `the plan is not complete: ${issue?.path.join(".")} ${issue?.message}`, what: null } };
  }
  return { ok: true, plan: checked.data, view: { title: `Find ${checked.data.count} ${checked.data.name}` } };
}

/* ------------------------------------------- a view of the scope, as a route */

/**
 * The chips a view may carry. Release B parses none -- the route grammar keeps the key so the surface, the route and
 * the bulk act agree on one shape, and release C fills it (`2026-09-19-lead-finder-C-extras.md`). It is a type, not a
 * list: an empty record cannot be given a value by accident.
 */
export type LeadChips = Record<string, never>;

/** "clients/leads:s-<search>:l-<list>:c-<class>" -- the grammar Ask's page citations admit (ask.ts PAGE_PREFIX). Chips join in release C. */
export function leadsRoute(v: { searchId?: string | null; list?: LeadList | null; cls?: LeadClass | null; chips?: Record<string, unknown> }): string {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  return parts.join(":");
}
export function parseLeadsRoute(route: string): { searchId: string | null; list: LeadList; cls: LeadClass | null; chips: Record<string, unknown> } | null {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out = { searchId: null as string | null, list: "all" as LeadList, cls: null as LeadClass | null, chips: {} };
  for (const s of segs) {
    const dash = s.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [s.slice(0, dash), s.slice(dash + 1)];
    if (seg === "s" && /^[0-9a-f-]{36}$/.test(val)) out.searchId = val;
    else if (seg === "l" && (LEAD_LISTS as readonly string[]).includes(val)) out.list = val as LeadList;
    else if (seg === "c" && (LEAD_CLASSES as readonly string[]).includes(val)) out.cls = val as LeadClass;
  }
  return out;
}

/* ------------------------------------------- what the model answers ------- */

export const LEAD_DRAFT_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string" } } } as const;
export const LeadDraftAnswerSchema = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(20).max(2000) });
export const LEAD_SUGGEST_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["line", "items"],
  properties: { line: { type: "string" }, items: { type: "array", items: { type: "object", additionalProperties: false, required: ["words", "who_for", "category_key"], properties: { words: { type: "string" }, who_for: { type: "string" }, category_key: { type: "string" } } } } },
} as const;
export const LeadSuggestAnswerSchema = z.object({
  line: z.string().trim().min(3).max(160),
  items: z.array(z.object({ words: z.string().trim().min(3).max(80), who_for: z.string().trim().min(3).max(120), category_key: z.string().regex(/^[a-z_]{2,40}$/) })).min(1).max(4),
});
/** The foot every draft carries: the business's postal address and a way to say no (CAN-SPAM). */
export function leadDraftFooter(business: string, address: string): string {
  return `\n\n—\n${business} · ${address}\nNot interested? Reply "no thanks" and I won't write again.`;
}
/* ---------------------------------------------------------------- the peek */

export interface LeadPeekReach {
  phone: { value: string; note: string; tel: string | null; wrong: boolean } | null;
  /** `standard` is null beside an address that checks out: there it would be a line saying nothing (D5). */
  email: { value: string; note: string; standard: string | null; state: LeadEmailState; word: string; address: string | null; canDraft: boolean };
  locked: { title: string; line: string };
}
export interface LeadPeekVM {
  id: string;
  searchId: string | null;
  mark: string;
  name: string;
  /** The first two words of the name, for "Back to Zilker Strength". */
  short: string;
  sub: string;
  /** Who they are, from what the listing shows (D2): each null when the listing did not say. */
  about: string | null;
  where: { line: string; href: string | null } | null;
  today: string | null;
  image: string | null;
  reviewsDist: [number, number, number, number, number] | null;
  claimedNote: string | null;
  /* ---- D5: the peek re-cut ---- */
  /** The tile behind the photo band: initials on the kind's tint, drawn when there is no photo or it fails to load. */
  tile: { initials: string; tint: number };
  /** "4.7" and "1,284", apart; null where the source does not rate. */
  rated: { score: string; count: string } | null;
  /** The two reach slots, as the row wears them. */
  slots: { phone: LeadSlot; mailbox: LeadSlot };
  /** The week's hours as bars, in the listing's own order, today marked; [] when the listing showed no hours. */
  week: LeadWeekRow[];
  /** "From the listing": the facts about the place the expanded photo lists beside it. */
  facts: { k: string; v: string }[];
  /** "5 checks passed · 2 couldn't tell": the head the checks fold under. */
  checksSummary: string;
  /** One mark per check, in the order they were made: the strip beside the head, so the shape of the evidence reads at a glance. */
  checkDots: ("yes" | "unknown" | "no")[];
  /** "Found 3 ways, 2:02 PM · #9 for “independent bookstore”": the line the trace folds under. */
  foundSummary: string;
  /** "1.2 mi", from the search's centre; "" when the search has none. */
  distance: string;
  cls: LeadClass;
  stage: LeadStage;
  stages: { id: "ready" | "nurture" | "converted"; label: string; on: boolean }[];
  canStage: boolean;
  notFitWord: string;
  fit: { word: string; cls: string; sentence: string };
  reach: LeadPeekReach;
  groups: { how: "seen" | "read"; label: string; checks: { key: LeadCheckKey; label: string; answer: "yes" | "no" | "unknown"; source: string; reason: string | null }[] }[];
  others: { summary: string; picked: string | null; items: { email: string; why: string }[] } | null;
  found: { at: string; what: string }[];
  links: {
    website: { label: string; href: string } | null; instagram: { label: string; href: string } | null;
    facebook: { label: string; href: string } | null; linkedin: { label: string; href: string } | null;
    tiktok: { label: string; href: string } | null; maps: { label: string; href: string } | null;
  };
  version: number;
}

/** "Open today · 9 AM to 6 PM", "Closed today", or null when the listing showed no hours. The day is the business's own (tz). */
export function leadTodayLine(hours: { day: string; hours: string }[], tz: string, now: Date): string | null {
  if (!hours.length) return null;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  const h = hours.find((x) => x.day.toLowerCase() === day.toLowerCase());
  if (!h) return null;
  return /^closed/i.test(h.hours) ? "Closed today" : `Open today · ${h.hours}`;
}
/** One day of the week's hours as a bar across the day (D5): x and w in percent of 24 hours; null for a day the parser cannot draw. */
export interface LeadWeekRow { day: string; hours: string; bar: { x: number; w: number } | null; today: boolean }
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:to|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;
const hourOf = (h: string, m: string | undefined, ap: string): number => ((Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0)) + (m ? Number(m) / 60 : 0);
/**
 * The week's hours as bars (D5): "9 AM to 6 PM" is a bar from 37.5% to 75% of the day, "Open 24 hours" the whole
 * day, "Closed" no bar, and a line the parser cannot read keeps its words and draws nothing. Overnight hours run to
 * the end of the day. The listing's own order is kept; today is the business's own day (tz).
 */
export function leadWeekBars(hours: { day: string; hours: string }[], tz: string, now: Date): LeadWeekRow[] {
  const today = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now).toLowerCase();
  return hours.map((h) => {
    const text = h.hours.trim();
    let bar: LeadWeekRow["bar"] = null;
    if (/^open 24 hours$/i.test(text)) bar = { x: 0, w: 100 };
    else if (!/^closed/i.test(text)) {
      const m = text.match(CLOCK);
      if (m) {
        const a = hourOf(m[1], m[2], m[3]);
        let b = hourOf(m[4], m[5], m[6]);
        if (b <= a) b = 24;
        bar = { x: Math.round((a / 24) * 1000) / 10, w: Math.round(((b - a) / 24) * 1000) / 10 };
      }
    }
    return { day: h.day, hours: text, bar, today: h.day.toLowerCase() === today };
  });
}

/** "101 Biscayne Blvd, Miami, FL 33132", with the Maps page when the listing has one. */
export function leadWhere(r: Pick<LeadRowDto, "street" | "city" | "state" | "postal_code" | "maps_url">): { line: string; href: string | null } | null {
  const town = [r.city, r.state].filter(Boolean).join(", ") + (r.postal_code ? ` ${r.postal_code}` : "");
  const line = [r.street, town].filter(Boolean).join(", ");
  return line ? { line, href: r.maps_url ?? null } : null;
}

/** The owner's own word for the criterion a place was left out by; the plan holds it. */
/** A day, from the round's end, in which the untouched leads may be removed and the month credited (§8.6). */
export const LEAD_UNDO_MS = 24 * 60 * 60_000;
/**
 * Whether a search's latest round may still be undone: ended within the day,
 * and not undone already. Read by the rail's menu, which is where the removal
 * lives -- not the strip, where "Undo" beside "yours" read as deleting what was
 * just paid for.
 */
export function leadUndoable(s: { round: { undo_op_id: string | null; ended_at: string | null } | null } | null, now: Date): boolean {
  const r = s?.round;
  return !!r && !r.undo_op_id && !!r.ended_at && now.getTime() - Date.parse(r.ended_at) < LEAD_UNDO_MS;
}

export function leadExclusionWord(search: LeadSearchDto | null, key: string | null): string {
  if (!key) return LEAD_LEFT_OUT_WORD;
  const plan = search?.plan;
  if (key === LEAD_KIND_KEY) return plan ? leadKindWord(plan.name) : LEAD_LEFT_OUT_WORD;
  if (key === LEAD_UNREACHABLE_KEY) return LEAD_UNREACHABLE_WORD;
  const ex = plan?.exclusions.find((e) => e.key === key);
  if (ex) return ex.text;
  const cr = plan?.criteria.find((c) => c.key === key);
  return cr ? cr.text : LEAD_LEFT_OUT_WORD;
}
/** A clock time on the day it happened, and the date too once it is not today (the peek is read weeks later). */
function clockIn(tz: string, iso: string | null, now: Date): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  if (day(at) === day(now)) return clock;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}, ${clock}`;
}

/**
 * The peek (§9.2, P2, S12): the sub-line, the fit sentence, how to reach them, the checks in two groups (what was
 * seen, and what Claude read), the other addresses, Found, the site. Every sentence here, so the page says nothing
 * of its own. The mark is `initialsOf`, the same derivation the row wears, never a second one.
 */
export function toLeadPeekVM(r: LeadRowDto, search: LeadSearchDto | null, tz: string, now: Date): LeadPeekVM {
  const m = r.member;
  const area = [r.city, r.state].filter(Boolean).join(", ");
  const sub = [r.category, r.price ?? null, area].filter(Boolean).join(" · ") + (r.places > 1 ? ` · ${r.places} locations` : "");
  const fitWord = m.class === "qualified"
    ? (m.fit ? LEAD_FIT_WORDS[m.fit] : LEAD_FIT_WORDS.look)
    // "venues. Venue brand on 828venues host." glued the chip to the reason; say what happened first.
    : m.class === "review" ? LEAD_REVIEW_WORD : `${LEAD_LEFT_OUT_WORD} — ${leadExclusionWord(search, m.excluded_by)}`;
  const fitCls = m.class === "qualified" ? (m.fit ?? "look") : m.class === "review" ? "review" : "out";
  const standard = LEAD_CONTACT_STANDARD_WORDS[search?.plan.contact === "email" ? "email" : "phone"];
  const emailNote = r.email
    ? r.email_state === "ok" ? `${LEAD_MAILBOX_WORDS.ok} · checked ${clockIn(tz, r.email_checked_at, now)}`
      : r.email_state === "checking" ? LEAD_MAILBOX_WORDS.checking
      : r.email_state === "invalid" ? `${LEAD_MAILBOX_WORDS.invalid}. Call instead.`
      : LEAD_MAILBOX_WORDS[r.email_state]
    : LEAD_NO_EMAIL_LINE;
  const mailboxLabel = LEAD_MAILBOX_WORDS[r.email_state];
  const seen: LeadPeekVM["groups"][number]["checks"] = [];
  const read: LeadPeekVM["groups"][number]["checks"] = [];
  for (const c of m.checks) {
    const label = c.key === "mailbox" ? mailboxLabel : LEAD_CHECK_WORDS[c.key][c.answer];
    (c.how === "seen" ? seen : read).push({ key: c.key, label, answer: c.answer, source: c.source, reason: c.reason });
  }
  const others = m.other_emails.length
    ? {
        summary: `${m.other_emails.length} other address${m.other_emails.length === 1 ? "" : "es"} on their site`,
        picked: m.checks.find((c) => c.key === "own_address")?.reason ?? null,
        items: m.other_emails,
      }
    : null;
  const host = r.website;
  const siteLine = host
    ? r.email_state === "none"
      ? `Their website, ${host}: no email on the home, contact or about pages`
      : `Their website, ${host}: an email on the contact page`
    : "No website to check";
  const term = search?.plan.terms[0] ?? null;
  // D5: the peek re-cut -- the tile, the rating apart, the checks' head, the week, and the listing's facts.
  const passed = m.checks.filter((c) => c.answer === "yes").length;
  const unsure = m.checks.filter((c) => c.answer === "unknown").length;
  const failed = m.checks.filter((c) => c.answer === "no").length;
  const checksSummary = m.checks.length === 0 ? "" : [
    `${passed} check${passed === 1 ? "" : "s"} passed`,
    ...(unsure ? [`${unsure} couldn't tell`] : []),
    ...(failed ? [`${failed} failed`] : []),
  ].join(" · ");
  const rated = r.rating === null || r.rating === undefined ? null : { score: r.rating.toFixed(1), count: (r.reviews ?? 0).toLocaleString("en-US") };
  // The trace is always three lines: the listing, their site, the mailbox. The head says how many so the panel can
  // fold it away and still say what happened.
  const foundWays: number = 3;
  const facts: LeadPeekVM["facts"] = [
    ...(r.category ? [{ k: "Kind", v: r.category }] : []),
    ...(r.price ? [{ k: "Price", v: r.price }] : []),
    ...(rated ? [{ k: "Rated", v: `${rated.score} from ${rated.count} review${r.reviews === 1 ? "" : "s"}` }] : []),
    ...(r.claimed === true ? [{ k: "Listing", v: "Claimed by the owner" }] : r.claimed === false ? [{ k: "Listing", v: "Not claimed by the owner" }] : []),
    ...(term && r.rank ? [{ k: "Found at", v: `#${r.rank} for “${term}”` }] : []),
    ...(r.places > 1 ? [{ k: "Other listings", v: `${r.places} listings for this business` }] : []),
  ];
  return {
    id: r.id,
    searchId: r.search_id ?? null,
    mark: initialsOf(r.business_name),
    tile: { initials: initialsOf(r.business_name), tint: leadTintOf(r.category) },
    rated,
    slots: leadSlots(r),
    week: leadWeekBars(r.hours ?? [], tz, now),
    facts,
    checksSummary,
    checkDots: m.checks.map((c) => c.answer),
    distance: milesLabel(m.distance_m),
    name: r.business_name,
    about: r.about ?? null,
    where: leadWhere(r),
    today: leadTodayLine(r.hours ?? [], tz, now),
    image: r.image_url ?? null,
    reviewsDist: r.reviews_dist ? [r.reviews_dist.one, r.reviews_dist.two, r.reviews_dist.three, r.reviews_dist.four, r.reviews_dist.five] : null,
    claimedNote: r.claimed === false ? LEAD_UNCLAIMED_NOTE : null,
    short: r.business_name.split(/\s+/).slice(0, 2).join(" "),
    sub,
    cls: m.class,
    stage: r.stage,
    stages: (["ready", "nurture", "converted"] as const).map((id) => ({ id, label: LEAD_STAGE_WORDS[id], on: r.stage === id })),
    canStage: m.class !== "excluded",
    notFitWord: LEAD_CLOSED_WORDS.not_a_fit,
    fit: { word: fitWord, cls: fitCls, sentence: m.reason },
    reach: {
      phone: r.phone
        ? {
            value: r.phone,
            note: r.phone_wrong ? "You marked this number wrong." : r.phone_agrees ? "The same number on Google Maps and their website" : "From their Google Maps listing",
            tel: r.phone_wrong ? null : `tel:${r.phone}`,
            wrong: r.phone_wrong,
          }
        : null,
      email: {
        value: r.email ?? "No email on their site",
        note: emailNote,
        // The standard explains a lead the mailbox did not settle. Beside an address that checks out it is a line
        // saying nothing, on every good lead: null there, so the peek reads shorter where there is nothing to say.
        standard: r.email_state === "ok" ? null : standard,
        state: r.email_state,
        word: LEAD_EMAIL_WORDS[r.email_state],
        address: r.email,
        canDraft: !!r.email && r.email_state !== "invalid" && r.email_state !== "none",
      },
      locked: { title: "Texts and WhatsApp", line: LEAD_LOCKED_LINE },
    },
    groups: [
      { how: "seen", label: LEAD_CHECK_GROUP_WORDS.seen, checks: seen },
      { how: "read", label: LEAD_CHECK_GROUP_WORDS.read, checks: read },
    ].filter((g) => g.checks.length > 0) as LeadPeekVM["groups"],
    others,
    foundSummary: [
      `Found ${foundWays} way${foundWays === 1 ? "" : "s"}, ${clockIn(tz, r.found_at, now)}`,
      ...(term && r.rank ? [`#${r.rank} for “${term}”`] : []),
    ].join(" · "),
    found: [
      // The rank it was found at rides the first line when the listing gave one: "#3 for “wedding planner”".
      { at: clockIn(tz, r.found_at, now), what: term ? (r.rank ? `On Google Maps, #${r.rank} for “${term}”` : `On Google Maps, searching “${term}”`) : "On a Google Maps listing" },
      { at: clockIn(tz, r.found_at, now), what: siteLine },
      { at: clockIn(tz, r.email_checked_at ?? r.found_at, now), what: `Mailbox check: ${mailboxLabel}` },
    ],
    links: {
      website: host ? { label: host, href: `https://${host}` } : null,
      instagram: r.instagram ? { label: "Instagram", href: r.instagram } : null,
      facebook: r.facebook_url ? { label: "Facebook", href: r.facebook_url } : null,
      linkedin: r.linkedin_url ? { label: "LinkedIn", href: r.linkedin_url } : null,
      tiktok: r.tiktok_url ? { label: "TikTok", href: r.tiktok_url } : null,
      maps: r.maps_url ? { label: "Google Maps", href: r.maps_url } : null,
    },
    version: r.version,
  };
}


/** What removing a search keeps: the leads already worked. Said before the press; the number comes after it. */
export const LEAD_REMOVE_KEEPS = "Keeps the ones you contacted or are talking to.";

/**
 * A kept search, in the owner's own words (§8.10): what they asked for, the day they asked, and what the plan
 * leaves out. One derivation, because the rail's menu and the question before Remove both say it.
 */
export function leadSearchWords(s: { asked: string; asked_on: string; plan?: LeadSearchPlan } | null, tz: string): { askedLine: string; keepsLine: string } {
  if (!s) return { askedLine: "", keepsLine: LEAD_REMOVE_KEEPS };
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(s.asked_on));
  // Release A spells an exclusion `exclusions[]: { key, text, origin }` and a criterion
  // `criteria[]: { key, text, standard, required }` (lead-search.ts, LeadSearchPlanSchema):
  // what is left out is the exclusions list, and its words are `text`.
  const left = (s.plan?.exclusions ?? []).map((c) => c.text).filter(Boolean);
  const leaving = left.length ? ` Leaving out ${left.join(" and ")}.` : "";
  return { askedLine: `You asked on ${day}: “${s.asked}”.${leaving}`, keepsLine: LEAD_REMOVE_KEEPS };
}

/* ------------------------------------------------- what the doors answer -- */

export interface LeadCheck { key: LeadCheckKey; how: "seen" | "read"; answer: "yes" | "no" | "unknown"; source: string; reason: string | null }
/** The seven checks §0.1 and the interface name, four seen and three read; §9.2's "six" is the PRD's count of one screen. */
export const LEAD_CHECK_KEYS = ["on_maps", "in_area", "phone_two_sources", "mailbox", "independent", "right_kind", "own_address"] as const;
export type LeadCheckKey = (typeof LEAD_CHECK_KEYS)[number];
export interface LeadRowDto {
  id: string; search_id: string; place_id: string; business_name: string; category: string | null;
  city: string | null; state: string | null; street: string | null;
  /** `leads_page` answers it beside the city; the area cell reads "78704 · Austin, TX" from the pair. */
  postal_code?: string | null;
  /** Not the door's: `leads_page` returns the search's id, and 4.4 fills the name from the same read that loads the searches. */
  search_name?: string | null;
  phone: string | null; phone_agrees: boolean; phone_wrong: boolean;
  email: string | null; email_state: LeadEmailState; email_checked_at: string | null;
  website: string | null; instagram: string | null; rating: number | null; reviews: number | null;
  /** What the listing shows about the business (D2, 00144). Optional: a fixture from before carries none, and the view models read them as absent. */
  about?: string | null; hours?: { day: string; hours: string }[]; image_url?: string | null; price?: string | null;
  reviews_dist?: { one: number; two: number; three: number; four: number; five: number } | null;
  facebook_url?: string | null; linkedin_url?: string | null; tiktok_url?: string | null; claimed?: boolean | null; maps_url?: string | null; rank?: number | null;
  /** D5 (00146): the neighbourhood the listing names, and the coordinates leads_page returns, for the row's line about where and the map. */
  neighborhood?: string | null; lat?: number | null; lng?: number | null;
  stage: LeadStage; closed_reason: string | null; contact_id: string | null;
  /** How the lead has been worked, from `leads_page` (4.2): a fixture copies the real shape even where B draws none of it. */
  last_outcome: string | null; last_note: string | null; contacted_at: string | null; converted_at: string | null;
  places: number; found_at: string; exported_at: string | null; version: number;
  member: {
    class: LeadClass; fit: "strong" | "look" | "long" | null; reason: string; excluded_by: string | null; distance_m: number | null; counted: boolean; checks: LeadCheck[]; other_emails: { email: string; why: string }[];
    /** The class rule's reason tokens (D3): what Needs review is grouped by. Optional: a fixture from before carries none. */
    reasons?: string[];
  };
}

/* ------------------------------------------- Needs review, as a queue (D3) */

/** "Independent" -> "independent" for the middle of a sentence; a name that is capitals stays as it is. */
export const leadLowerFirst = (s: string): string => (s && s[1] && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export const LEAD_REVIEW_GROUP_WORDS = {
  mailbox_waiting: "Waiting on the mailbox check",
  checks_out: "Their email checks out",
  mailbox_silent: "Their mail server wouldn't answer",
  bad_email: "Their email bounces",
  no_email: "No email on their site",
  no_phone: "No phone on their listing",
  catch_all: "Unconfirmed — the mailbox accepts any address",
  unsure: "Couldn't tell if",
  read_only: "Only the listing says so",
  out_of_area: "Just outside the area you asked for",
} as const;
export type LeadReviewGroupId = keyof typeof LEAD_REVIEW_GROUP_WORDS;
export type LeadReviewAct = "check_again" | "find_email" | "keep" | "exclude";
/** The order an owner would work the pile: what resolves itself first, then what one press resolves, then what needs a look. */
const REVIEW_GROUP_ORDER: LeadReviewGroupId[] = ["mailbox_waiting", "checks_out", "mailbox_silent", "bad_email", "no_email", "no_phone", "catch_all", "unsure", "read_only", "out_of_area"];
const REVIEW_GROUP_ACTS: Record<LeadReviewGroupId, LeadReviewAct[]> = {
  mailbox_waiting: [],
  checks_out: ["keep", "exclude"],
  mailbox_silent: ["check_again", "keep", "exclude"],
  bad_email: ["find_email", "keep", "exclude"],
  no_email: ["find_email", "keep", "exclude"],
  no_phone: ["keep", "exclude"],
  catch_all: ["keep", "exclude"],
  unsure: ["keep", "exclude"],
  read_only: ["keep", "exclude"],
  out_of_area: ["keep", "exclude"],
};
function reviewGroupOf(reason: string): LeadReviewGroupId | null {
  if (reason === "email:checking") return "mailbox_waiting";
  // The email token says the address's state now (the page reads it off the lead, not off the judgment's snapshot):
  // ok with the member still in review is a mailbox that checks out after the month was full, for Keep to count.
  if (reason === "email:ok") return "checks_out";
  if (reason === "email:unknown") return "mailbox_silent";
  if (reason === "email:invalid") return "bad_email";
  if (reason === "email:none") return "no_email";
  // A search that counts a phone as enough holds back a place whose number nothing could match (classify's
  // "phone:none"). It is a pile like any other: without it, those leads sat in the queue under no heading at all.
  if (reason === "phone:none") return "no_phone";
  if (reason === "email:catch_all") return "catch_all";
  if (reason.startsWith("unknown:")) return "unsure";
  if (reason.startsWith("inferred:")) return "read_only";
  if (reason === "out_of_area") return "out_of_area";
  return null;
}
export const LEAD_REVIEW_ACT_WORDS: Record<LeadReviewAct, string> = { check_again: "Check again", find_email: "Find an email", keep: "Keep", exclude: "Exclude" };
/** Why a pile is waiting, in a sentence: what was looked at, and what is true of every lead in it. */
export const LEAD_REVIEW_GROUP_WHY: Record<LeadReviewGroupId, string> = {
  mailbox_waiting: "The mailbox check is still running on these. Nothing to press — they move on their own.",
  checks_out: "Their address answered after this month's leads were spoken for, so they are waiting for you to keep them.",
  mailbox_silent: "Their mail server did not answer the check. Asking again settles most of them.",
  bad_email: "The address on their site does not exist, so an email would bounce. Their number may still be good.",
  no_email: "Their home, contact and about pages were read, and no address was on any of them.",
  no_phone: "This search counts a phone as enough, and no number on the listing could be matched against their site. An email may still reach them.",
  catch_all: "Their server accepts every address, so the check cannot tell whether this one is real.",
  unsure: "Claude could not tell from the listing or from their site.",
  read_only: "Only the listing says so, and this search asked to see it for itself.",
  out_of_area: "They sit outside the area you asked for, so they were not counted.",
};
/** A mailbox re-check, in cents an address (the source card's own price): what "Check again" says it costs. */
export const LEAD_CHECK_CENTS_EACH = 0.089;
export const leadCheckAgainCents = (n: number): number => Math.max(1, Math.round(n * LEAD_CHECK_CENTS_EACH));
/**
 * What each press on the bench does, and what it costs (D5). One derivation, because the bar offers the acts and
 * the column beside it explains them: a Keep that spends a lead of the month says so with the number left.
 */
export function leadReviewCosts(acts: LeadReviewAct[], n: number, month: LeadMonthDto | null): { act: LeadReviewAct; label: string; line: string }[] {
  const line = (a: LeadReviewAct): string => {
    switch (a) {
      case "keep": return month
        ? `They join Ready and count against this month. ${n} of your ${month.left} left.`
        : "They join Ready and count against this month.";
      case "exclude": return "They don't count, and nothing is charged.";
      case "check_again": return `About ${leadCheckAgainCents(n)}¢. Their answer lands here in a few minutes.`;
      case "find_email": return "Claude reads their pages again for an address.";
    }
  };
  return acts.map((act) => ({ act, label: LEAD_REVIEW_ACT_WORDS[act], line: line(act) }));
}
/** What a search asked for, in the owner's own words: its criteria, then what it leaves out (D5's right column). */
export function leadAskedFor(search: LeadSearchDto | null): { text: string; kind: "criterion" | "exclusion" }[] {
  const plan = search?.plan;
  if (!plan) return [];
  return [
    ...plan.criteria.map((c) => ({ text: c.text, kind: "criterion" as const })),
    ...plan.exclusions.map((e) => ({ text: e.text, kind: "exclusion" as const })),
  ];
}
export interface LeadReviewGroup { id: LeadReviewGroupId; key: string; label: string; ids: string[]; acts: LeadReviewAct[] }
/**
 * Needs review as a queue: one group per thing that would resolve it, each with the leads in it and the acts that
 * resolve it. A lead with two reasons sits in the first group that fits it, in the order above; a group about one
 * criterion names it in the owner's own words from the plan, and two criteria make two groups.
 */
export function leadReviewGroups(rows: { id: string; cls: LeadClass; reasons: string[] }[], search: LeadSearchDto | null): LeadReviewGroup[] {
  const by = new Map<string, LeadReviewGroup>();
  for (const r of rows) {
    if (r.cls !== "review") continue;
    const reasons = r.reasons ?? [];
    // An address that checks out is not a problem: it groups a lead only when nothing else holds the lead back
    // (the month was full when its check answered), for Keep to count it. Anything else the lead waits on comes first.
    const held = reasons.map(reviewGroupOf).filter((g): g is LeadReviewGroupId => g !== null && g !== "checks_out");
    const picked = held.length ? REVIEW_GROUP_ORDER.find((g) => held.includes(g)) : reasons.some((x) => reviewGroupOf(x) === "checks_out") ? "checks_out" : undefined;
    if (!picked) continue;
    const reason = reasons.find((x) => reviewGroupOf(x) === picked) ?? "";
    const crit = (picked === "unsure" || picked === "read_only") && reason.includes(":") ? reason.slice(reason.indexOf(":") + 1) : null;
    const key = crit ? `${picked}:${crit}` : picked;
    const label = crit ? `${LEAD_REVIEW_GROUP_WORDS[picked]} — ${leadLowerFirst(leadExclusionWord(search, crit))}` : LEAD_REVIEW_GROUP_WORDS[picked];
    const g = by.get(key) ?? { id: picked, key, label, ids: [], acts: REVIEW_GROUP_ACTS[picked] };
    g.ids.push(r.id);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => REVIEW_GROUP_ORDER.indexOf(a.id) - REVIEW_GROUP_ORDER.indexOf(b.id));
}
export interface LeadSearchRoundDto {
  id: string; seq: number; purpose: string; state: string; ending: LeadRoundEnding | null;
  question: { sentence: string; criterion_key: string } | null;
  target: number; counted: number; qualified: number; review: number; excluded: number;
  /** Counted leads whose address was found and checked: "88 you can email", and "41 emails checked" while it runs. */
  emails_checked: number;
  /** Counted leads reachable by phone: "72 by phone" (§8.6's sentence needs both, W2 put both on the view). */
  with_phone: number;
  /** The round is stopping and still checking what it found (S12): the only way to tell Stopping from Checking. */
  ending_pending: boolean;
  waiting_since: string | null; cost_usd: number; ended_at: string | null;
  undo_op_id: string | null; undo_version: number | null;
  /** Where to look next when the round ran dry (D3, 00145): the nearest ZIP centres past its area, nearest first; [] otherwise. */
  nearby: LeadArea[];
  /** The qualified members by fit band (D5, 00146), for the band bar. Optional: a fixture from before carries none. */
  fits?: { strong: number; look: number; long: number };
}
export interface LeadSearchDto { id: string; name: string; asked: string; asked_on: string; plan: LeadSearchPlan; plan_version: number; round: LeadSearchRoundDto | null }
/* ------------------------------------------------ the same leads, on the ground (D5) */

export interface LeadMapPin { id: string; x: number; y: number }
export interface LeadMapPlot {
  /** Every lead the door gave a place, in a square of 0..1 with 0,0 at the top left. */
  pins: LeadMapPin[];
  /** The area the search asked for, when it has a centre: where it sits in the same square, and how wide. */
  ring: { x: number; y: number; r: number } | null;
  /** How many metres the square is across, for the scale bar; 0 when there was nothing to place. */
  spanM: number;
  /** What the square is centred on, so "widen the area" asks about the ground the owner is looking at. */
  center: { lat: number; lng: number } | null;
}
/** Metres per degree, near enough for a city: a plot of one town, not a projection of the world. */
const M_PER_DEG_LAT = 111_320;
/**
 * Where the leads sit on the ground, relative to each other and to the area the search asked for (D5). Everything
 * is measured in metres from one centre and then scaled into a square, so the picture is honest at a town's size
 * without a projection, a tile or a request to anyone. A lead the source placed nowhere is simply not on it.
 */
export function leadMapPlot(rows: { id: string; point: { lat: number; lng: number } | null }[], area: LeadArea | null): LeadMapPlot {
  const placed = rows.filter((r): r is { id: string; point: { lat: number; lng: number } } => !!r.point);
  const anchor = area?.center ?? (placed.length ? { lat: placed[0].point.lat, lng: placed[0].point.lng } : null);
  if (!anchor || (!placed.length && !area?.center)) return { pins: [], ring: null, spanM: 0, center: anchor };
  const perLng = M_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180);
  const at = (p: { lat: number; lng: number }) => ({ e: (p.lng - anchor.lng) * perLng, s: (anchor.lat - p.lat) * M_PER_DEG_LAT });
  const metres = placed.map((r) => at(r.point));
  // The square holds every lead and the whole of the area the search asked for, with a margin so nothing sits on
  // the edge. Half a kilometre is the smallest it goes: one lead alone is a place, not a pinpoint.
  const reach = Math.max(
    area?.center && area.radius_m ? area.radius_m : 0,
    ...metres.map((m) => Math.max(Math.abs(m.e), Math.abs(m.s))),
    500,
  );
  const half = reach * 1.12;
  const spanM = Math.round(half * 2);
  const into = (m: { e: number; s: number }) => ({ x: 0.5 + m.e / (half * 2), y: 0.5 + m.s / (half * 2) });
  return {
    pins: placed.map((r, i) => ({ id: r.id, ...into(metres[i]) })),
    ring: area?.center && area.radius_m ? { ...into(at(area.center)), r: area.radius_m / (half * 2) } : null,
    spanM,
    center: anchor,
  };
}

/** How wide the square is, in the owner's own unit: "3.4 mi across", and nothing when there was nothing to place. */
export const leadMapAcross = (spanM: number): string => (spanM ? `${milesLabel(spanM)} across` : "");

export interface LeadCounts { all: number; ready: number; nurture: number; converted: number; said_no: number; not_a_fit: number }
/**
 * The month, as a surface says it (D5): how many of its leads are spoken for, how many are left, and the day it
 * renews. The workbench reads it to say what a press costs -- "5 of your 238 left" -- so a Keep is never a number
 * nobody can see. The whole is contracts' LEAD_MONTHLY_ALLOWANCE, never a number a page invents.
 */
export interface LeadMonthDto { used: number; left: number; renewsOn: string }
export interface LeadSuggestionsDto { business_line: string; by_owner: boolean; made_at: string; items: { words: string; who_for: string; category_key: string; reach: string | null }[]; note?: string }
/** What the card knows beyond the plan: the reads release A's doors answer, folded into one unit (§0.2). `planFacts` in `server/leads.ts` (4.4) builds exactly this. */
export interface LeadPlanFacts {
  /** Places already in People or Leads this plan would skip: "Skips the 14 already yours". */
  dupes: number;
  /** Leads this month still covers, every limit folded in. */
  leadsLeft: number;
  /** Which limit made that number, when one of them binds before the plan's own count. A's counter kinds, never a word of its own. */
  bound: "allowance" | "budget" | null;
  /** The platform-wide prior for this kind of business (lead_niche_prior), or null when it was never searched. */
  prior: { places: number; matched: number; with_email: number } | null;
  /** The kind of business the prior is for, in the owner's words: "trainers". */
  priorOf: string | null;
  /** A must-be-seen criterion the chosen card cannot see (§0.1), with the likely version offered. */
  cannotSee: { key: string; text: string; likely: string } | null;
  /** The day the month's leads renew, in the workspace's zone: "Oct 1". */
  renewsOn: string;
  /** Claude's nearby areas, for the card's area picker and for a round further out. */
  nearby: LeadArea[];
}

/* ------------------------------------------------ what the page is given -- */

/**
 * One row as the table draws it (§6.2). Every field is a word or a shape, and not one of them is a stored value:
 * `stage` rides along only so the row's dot has a class. Task 2's `LEAD_COLUMNS` reads exactly these and nothing else.
 */
/* ------------------------------------------------ the row, as the redesign reads it (D5) */

export type LeadSlotState = "ok" | "part" | "none" | "bad" | "checking";
/** One reach slot: the shape carries the meaning (state), the word repeats it, the tip gives the value back. */
export interface LeadSlot { state: LeadSlotState; value: string | null; word: string; tip: string; copy: boolean }
export const LEAD_SLOT_WORDS: Record<LeadSlotState, string> = { ok: "Checked", part: "Unconfirmed", none: "Nothing found", bad: "Bad", checking: "Still checking" };
/** The name card's facts (D5): the same derivations the peek draws from, so a hover decides without opening it. */
export interface LeadRowCard {
  about: string | null;
  today: string | null;
  where: { line: string; href: string | null } | null;
  site: { label: string; href: string } | null;
  maps: { label: string; href: string } | null;
  found: { at: string; what: string }[];
}
/** The band over the table (D5): the search's whole shape in one line, which is also the class tabs, and the qualified split by fit. */
export interface LeadBand {
  classes: { id: LeadClass; label: string; count: number }[];
  fits: { id: "strong" | "look" | "long"; label: string; count: number }[];
  /** Worth drawing the split only when the fits differ: a search whose every row is strong says nothing by it. */
  mixed: boolean;
}

/**
 * The two reach slots, phone then mailbox (D5): five states a shape can carry, so the column survives greyscale.
 * A mail server that would not answer wears Unconfirmed's shape with its own sentence; a number the owner marked
 * wrong is Bad; a source that gave nothing is Nothing found, never a failure.
 */
export function leadSlots(r: Pick<LeadRowDto, "phone" | "phone_agrees" | "phone_wrong" | "email" | "email_state">): { phone: LeadSlot; mailbox: LeadSlot } {
  const phone: LeadSlot = !r.phone
    ? { state: "none", value: null, word: LEAD_SLOT_WORDS.none, tip: "No phone on the listing", copy: false }
    : r.phone_wrong ? { state: "bad", value: r.phone, word: LEAD_SLOT_WORDS.bad, tip: `${r.phone} — you marked this number wrong`, copy: false }
    : r.phone_agrees ? { state: "ok", value: r.phone, word: LEAD_SLOT_WORDS.ok, tip: `${r.phone} — the same number on Google Maps and on their website`, copy: true }
    : { state: "part", value: r.phone, word: LEAD_SLOT_WORDS.part, tip: `${r.phone} — one source, their Google Maps listing`, copy: true };
  const s = r.email_state;
  const mailbox: LeadSlot = !r.email || s === "none"
    ? { state: "none", value: null, word: LEAD_SLOT_WORDS.none, tip: `${LEAD_MAILBOX_WORDS.none} — home, contact and about pages checked`, copy: false }
    : s === "ok" ? { state: "ok", value: r.email, word: LEAD_SLOT_WORDS.ok, tip: `${r.email} — ${LEAD_MAILBOX_WORDS.ok}`, copy: true }
    : s === "invalid" ? { state: "bad", value: r.email, word: LEAD_SLOT_WORDS.bad, tip: `${r.email} — ${LEAD_MAILBOX_WORDS.invalid}`, copy: false }
    : s === "checking" ? { state: "checking", value: r.email, word: LEAD_SLOT_WORDS.checking, tip: `${r.email} — ${LEAD_MAILBOX_WORDS.checking}. It resolves itself`, copy: true }
    : { state: "part", value: r.email, word: LEAD_SLOT_WORDS.part, tip: `${r.email} — ${LEAD_MAILBOX_WORDS[s]}`, copy: true };
  return { phone, mailbox };
}

/** The tile's tint, one of six, from the kind of business: the same kind wears the same tint on every row and in the peek. */
export function leadTintOf(kind: string | null | undefined): number {
  let h = 7;
  for (const ch of kind ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}

export function leadBand(search: LeadSearchDto | null): LeadBand | null {
  const r = search?.round;
  if (!r) return null;
  const f = r.fits ?? { strong: 0, look: 0, long: 0 };
  const fits = (["strong", "look", "long"] as const).map((id) => ({ id, label: LEAD_FIT_WORDS[id], count: f[id] }));
  return {
    classes: [
      { id: "qualified", label: `${r.qualified} qualified`, count: r.qualified },
      { id: "review", label: `${r.review} need${r.review === 1 ? "s" : ""} a look`, count: r.review },
      { id: "excluded", label: `${r.excluded} left out`, count: r.excluded },
    ],
    fits,
    mixed: fits.filter((x) => x.count > 0).length > 1,
  };
}

export interface LeadRowVM {
  id: string; searchId: string; searchName: string; mark: string; name: string; places: number;
  category: string; area: string; cls: LeadClass;
  /** The fit band itself (D5), for the band bar's filter; null for a row that is not qualified. */
  fit: "strong" | "look" | "long" | null;
  fitLabel: string; fitTitle: string;
  email: string | null; emailState: LeadEmailState; emailLabel: string; emailWord: string;
  phone: string | null; phoneAgrees: boolean; phoneWrong: boolean;
  /** The two contacts as one glance (D2's Reach column), and the listing's photo for the row's mark. */
  reach: { email: { address: string; state: LeadEmailState; word: string } | null; phone: { number: string; agrees: boolean } | null };
  image: string | null;
  /** The class rule's reason tokens, for the Needs review queue (D3); [] on a row from before. */
  reasons: string[];
  why: string; rating: string;
  /** The spread of reviews, "5★ 30 · 4★ 8 · 3★ 2 · 2★ 0 · 1★ 1", for the Rating cell's title; blank when the listing did not say. */
  reviewsTitle: string;
  stage: LeadStage; stageLabel: string;
  foundLabel: string; foundAt: string; distance: string; source: string; host: string;
  excludedBy: string | null; version: number;
  /* ---- D5: the row as the redesign reads it ---- */
  /** "Book store · Hawthorne · 97214 · 1.2 mi": whatever the source gave, in that order; "" when it gave none. */
  sub: string;
  /** The two reach slots, phone then mailbox. */
  slots: { phone: LeadSlot; mailbox: LeadSlot };
  /** "4.7" and "1,284", apart, or null where the source does not rate. */
  rated: { score: string; count: string } | null;
  /** The spread of reviews, one to five stars, or null when the listing did not say. */
  spread: [number, number, number, number, number] | null;
  /** The tile: the listing's photo, else initials on a tint the kind decides. */
  tile: { initials: string; tint: number; image: string | null };
  /** A review row's line: what would resolve it, in the queue's own words; null for any other row. */
  waitsOn: string | null;
  /** The row's state mark: Ready is silent; the rest wear an edge and a tag. */
  state: "ready" | "contacted" | "talking" | "review" | "out";
  stateTag: string | null;
  /** The name card's facts. */
  card: LeadRowCard;
  /** Where it sits, when the door gave coordinates. */
  point: { lat: number; lng: number } | null;
}

const METRES_PER_MILE = 1609.344;
/** A key from a plan ("chain", "wrong_kind") as a person would read it. */
const keyInWords = (key: string): string => {
  const words = key.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
};
/** "1.2 mi" close in, whole miles past ten: nobody says "12.4 mi" about a drive across town. */
const milesLabel = (m: number | null): string => {
  if (m === null || m === undefined) return "";
  const mi = m / METRES_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : String(Math.round(mi))} mi`;
};
/** "5.0 · 16": the stars and how many said so, together, because one without the other says nothing. */
const ratingLabel = (rating: number | null, reviews: number | null): string => (rating === null || rating === undefined ? "" : `${rating.toFixed(1)} · ${reviews ?? 0}`);
/** A closed lead says WHY it closed; "archived" is a stored value and never reaches a screen. */
const stageLabelOf = (stage: LeadStage, closedReason: string | null): string =>
  (stage === "archived" ? LEAD_CLOSED_WORDS[closedReason as (typeof LEAD_CLOSED_REASONS)[number]] ?? LEAD_STAGE_WORDS.archived : LEAD_STAGE_WORDS[stage]);

/**
 * One row's words and shapes (§6.2). Nothing here is a stored value. The search is the row's own (D5): a review
 * row names what it waits on in the queue's words, and the name card names the term it was found for.
 */
export function toLeadRowVM(r: LeadRowDto, tz: string, now: Date, search: LeadSearchDto | null = null): LeadRowVM {
  const nowMs = now.getTime();
  const foundMs = Date.parse(r.found_at);
  const m = r.member;
  const excludedBy = m.excluded_by ? keyInWords(m.excluded_by) : null;
  const rating = ratingLabel(r.rating, r.reviews);
  // Qualified wears its fit band; Needs review wears the judge's reason, which
  // is what it is waiting on; Excluded wears the criterion that left it out.
  const fitLabel = m.class === "excluded" ? excludedBy ?? m.reason : m.class === "review" ? m.reason : m.fit ? LEAD_FIT_WORDS[m.fit] : m.reason;
  const fitTitle = m.class === "excluded"
    ? `Left out: ${excludedBy ?? m.reason}`
    : m.class === "qualified" && rating ? `${m.reason} · ${rating.replace(" · ", " from ")} reviews` : m.reason;
  const area = [r.postal_code ?? "", [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  // D5: the row as the redesign reads it -- one line about where, two reach slots, the tile, its state, the card.
  const sub = [r.category, r.neighborhood ?? null, r.postal_code ?? null, milesLabel(m.distance_m) || null].filter((x): x is string => !!x).join(" · ");
  const rated = r.rating === null || r.rating === undefined ? null : { score: r.rating.toFixed(1), count: (r.reviews ?? 0).toLocaleString("en-US") };
  const spread: LeadRowVM["spread"] = r.reviews_dist ? [r.reviews_dist.one, r.reviews_dist.two, r.reviews_dist.three, r.reviews_dist.four, r.reviews_dist.five] : null;
  const waitsOn = m.class === "review" ? leadReviewGroups([{ id: r.id, cls: "review", reasons: m.reasons ?? [] }], search)[0]?.label ?? m.reason : null;
  const state: LeadRowVM["state"] = m.class === "excluded" ? "out" : m.class === "review" ? "review" : r.stage === "nurture" ? "contacted" : r.stage === "converted" ? "talking" : r.stage === "archived" ? "out" : "ready";
  const stateTag = state === "contacted"
    ? `${LEAD_STAGE_WORDS.nurture}${r.contacted_at ? ` · ${agoShort(Date.parse(r.contacted_at), nowMs)}` : ""}`
    : state === "talking" ? LEAD_STAGE_WORDS.converted
    : state === "out" ? (m.class === "excluded" ? LEAD_LEFT_OUT_WORD : stageLabelOf(r.stage, r.closed_reason))
    : null;
  const term = search?.plan.terms[0] ?? null;
  const card: LeadRowCard = {
    about: r.about ?? null,
    today: leadTodayLine(r.hours ?? [], tz, now),
    where: leadWhere(r),
    site: r.website ? { label: siteHost(r.website) ?? r.website, href: `https://${r.website}` } : null,
    maps: r.maps_url ? { label: "Google Maps", href: r.maps_url } : null,
    found: [{ at: clockIn(tz, r.found_at, now), what: term ? (r.rank ? `On Google Maps, #${r.rank} for “${term}”` : `On Google Maps, searching “${term}”`) : "On a Google Maps listing" }],
  };
  return {
    id: r.id,
    searchId: r.search_id,
    searchName: r.search_name ?? "",
    mark: initialsOf(r.business_name),
    name: r.business_name,
    places: r.places,
    category: r.category ?? "",
    area,
    cls: m.class,
    fit: m.class === "qualified" ? m.fit : null,
    fitLabel,
    fitTitle,
    email: r.email,
    emailState: r.email_state,
    // The cell draws the address itself; an address nobody has is blank, not "none".
    emailLabel: r.email ?? "",
    emailWord: LEAD_EMAIL_WORDS[r.email_state],
    // E.164, because the row dials it (plDial's tel:); the double tick says Maps and their own site agree.
    phone: r.phone,
    phoneAgrees: r.phone_agrees,
    phoneWrong: r.phone_wrong,
    reach: {
      email: r.email ? { address: r.email, state: r.email_state, word: LEAD_EMAIL_WORDS[r.email_state] } : null,
      phone: r.phone ? { number: r.phone, agrees: r.phone_agrees } : null,
    },
    image: r.image_url ?? null,
    reasons: m.reasons ?? [],
    why: m.reason,
    rating,
    reviewsTitle: r.reviews_dist ? `5★ ${r.reviews_dist.five} · 4★ ${r.reviews_dist.four} · 3★ ${r.reviews_dist.three} · 2★ ${r.reviews_dist.two} · 1★ ${r.reviews_dist.one}` : "",
    stage: r.stage,
    stageLabel: stageLabelOf(r.stage, r.closed_reason),
    foundLabel: agoShort(foundMs, nowMs),
    foundAt: `${clockDateYear(foundMs, tz)} · ${clockTime(foundMs, tz)}`,
    distance: milesLabel(m.distance_m),
    source: LEAD_SOURCE_WORD,
    host: siteHost(r.website) ?? "",
    excludedBy,
    version: r.version,
    sub,
    slots: leadSlots(r),
    rated,
    spread,
    tile: { initials: initialsOf(r.business_name), tint: leadTintOf(r.category), image: r.image_url ?? null },
    waitsOn,
    state,
    stateTag,
    card,
    point: typeof r.lat === "number" && typeof r.lng === "number" ? { lat: r.lat, lng: r.lng } : null,
  };
}

/** A round that is still going; one waiting on the owner is its own mark. */
const roundIsLive = (state: string): boolean => state !== "ended" && state !== "waiting_on_owner";

/** The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks. */
export function leadRail(counts: LeadCounts, searches: LeadSearchDto[], now: Date = new Date()): { lists: { id: LeadList; label: string; count: number }[]; searches: { id: string; name: string; count: number; mark: "live" | "question" | null; undoable: boolean }[] } {
  // Said no is a list only when somebody said no: an empty row in the rail
  // teaches the owner nothing and costs them a line every day.
  const ids: LeadList[] = ["all", "ready", "nurture", "converted", ...(counts.said_no > 0 ? (["said_no"] as LeadList[]) : []), "not_a_fit"];
  return {
    lists: ids.map((id) => ({ id, label: LEAD_LIST_WORDS[id], count: counts[id === "all" ? "all" : id] })),
    searches: searches.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.round?.counted ?? 0,
      undoable: leadUndoable(s, now),
      mark: !s.round ? null : s.round.state === "waiting_on_owner" ? "question" : roundIsLive(s.round.state) ? "live" : null,
    })),
  };
}

/** "322 leads · 272 ready · 3 searches", and "1 search needs you" when one waits. */
export function leadsStanding(counts: LeadCounts, searches: LeadSearchDto[]): { total: string; parts: string[]; needsYou: { count: number; searchId: string } | null } {
  const waiting = searches.filter((s) => s.round?.state === "waiting_on_owner");
  return {
    total: `${counts.all} leads`,
    parts: [`${counts.ready} ready`, `${searches.length} ${searches.length === 1 ? "search" : "searches"}`],
    needsYou: waiting.length ? { count: waiting.length, searchId: waiting[0]!.id } : null,
  };
}


/* --------------------------------------------- the plan card (Task 9) -- */

/** Under this many places judged, a prior is too thin to say a number from. */
export const LEAD_PRIOR_MIN_PLACES = 50;

/**
 * The Likely line and its two-part bar (§8.3): what past searches for this
 * kind of business found, never a promise about this one. A kind never
 * searched says the share is checked after the first 25 (P3).
 */
export function leadPlanLikely(plan: LeadSearchPlan, facts: LeadPlanFacts): { emailPct: number | null; phonePct: number | null; line: string } {
  const p = facts.prior;
  if (!p || p.places < LEAD_PRIOR_MIN_PLACES || p.matched <= 0) {
    return { emailPct: null, phonePct: null, line: "How many have an email is checked after the first 25." };
  }
  const share = Math.min(1, p.with_email / p.matched);
  const emailPct = Math.round(share * 100);
  const withEmail = Math.round(plan.count * share);
  const of = facts.priorOf ? ` · from past searches for ${facts.priorOf}` : "";
  return { emailPct, phonePct: 100 - emailPct, line: `About ${withEmail} will have an email; the rest you call${of}` };
}

/** The facts under the sentence (§8.3), in the one unit the owner has: leads. No dollar meter. */
export function leadPlanFacts(plan: LeadSearchPlan, facts: LeadPlanFacts): string[] {
  return [
    `About ${planMinutes(plan)} minutes — leave the page if you like`,
    // No number: the card cannot know how many of THIS search's places are already here until it has looked.
    "Anything already yours is skipped",
    `Counts only matches you can reach · ${leadAllowanceFact(facts.leadsLeft)}`,
  ];
}

/**
 * What the card asks for, and how it says why it is not what was typed (§0.2,
 * decision 27). When a limit binds the count is clamped to what is left, the
 * button says that number, and one sentence says which limit and what else
 * would fit. There is no dollar meter, and the word is always leads.
 */
export function leadPlanAsk(plan: LeadSearchPlan, facts: LeadPlanFacts): { count: number; label: string; covers: string | null } {
  const binds = facts.bound !== null && facts.leadsLeft < plan.count;
  const count = binds ? Math.max(0, facts.leadsLeft) : plan.count;
  const label = `Find ${count} lead${count === 1 ? "" : "s"}`;
  if (!binds) return { count, label, covers: null };
  const who = planWho(plan);
  const covers = facts.bound === "budget"
    ? `Emails for ${who} are hard to find, so this month covers about ${count} more. Find ${count} now?`
    : `You have ${count} lead${count === 1 ? "" : "s"} left this month. Your leads renew on ${facts.renewsOn}.`;
  return { count, label, covers };
}
