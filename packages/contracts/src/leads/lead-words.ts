/**
 * The lead's closed sets as the page names them: classes, lists, sorts, call outcomes, not-a-fit reasons, stages,
 * and the words for each. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import type { LeadCheckKey } from "./lead-dtos";
import {
  LEAD_CLOSED_REASONS,
  LEAD_EMAIL_STATES,
  LEAD_ENDING_WORDS,
  LEAD_FITS,
  LEAD_MEMBER_CLASSES,
  LEAD_STAGES,
  type LeadEmailState,
  type LeadMemberClass,
  type LeadRoundEnding,
} from "./lead-search";
import type { Tone } from "../shell/tone";
import { plural } from "../shared/words";

/** B's screen word for A's stored set (`lead_search_members.class`): one set, two names, never two lists. */
export const LEAD_CLASSES = LEAD_MEMBER_CLASSES;

export type LeadClass = LeadMemberClass;

export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"] as const;

export const LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"] as const; // leads_page's p_sort (B widens A's three)

export const LEAD_CALL_OUTCOMES = [
  "interested",
  "call_back",
  "not_interested",
  "voicemail",
  "no_answer",
  "wrong_number",
] as const;

export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"] as const;

/** A's stored set has no type of its own; the word for one of its members is derived here, not a second list. */
export type LeadStage = (typeof LEAD_STAGES)[number];

export type LeadList = (typeof LEAD_LISTS)[number];

export type LeadSort = (typeof LEAD_SORTS)[number];

export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number];

export type LeadNotAFitWhy = (typeof LEAD_NOT_A_FIT_WHYS)[number];

/** Stored values are never shown (§9.1). */
export const LEAD_STAGE_WORDS: Record<LeadStage, string> = {
  ready: "Ready",
  nurture: "Contacted",
  converted: "Talking",
  archived: "Closed",
};

export const LEAD_CLOSED_WORDS: Record<(typeof LEAD_CLOSED_REASONS)[number], string> = {
  said_no: "Said no",
  not_a_fit: "Not a fit",
  customer: "Already a customer",
  stale: "Went quiet",
  search_removed: "Search removed",
};

export const LEAD_FIT_WORDS: Record<(typeof LEAD_FITS)[number], string> = {
  strong: "Strong fit",
  look: "Worth a look",
  long: "Long shot",
};

/** Claims only what the check saw (S12): a catch-all server accepts anything, so the check cannot tell. */
export const LEAD_EMAIL_WORDS: Record<(typeof LEAD_EMAIL_STATES)[number], string> = {
  none: "No email",
  checking: "Checking",
  ok: "Checked",
  catch_all: "Unconfirmed",
  unknown: "Couldn't check",
  invalid: "Bounces",
};

/** How an outcome reads at a glance (D5): the dot beside its word, never colour alone -- the word is always there. */
/**
 * What each outcome means, in the app's ONE tone vocabulary (tone.ts). This used to carry two words of its own --
 * `quiet` and `bad` -- which no pill and no stylesheet could draw: `.tone-quiet` was never written, so a voicemail
 * and a no-answer both fell through to the faintest grey, and a wrong number drew as if nothing had happened.
 */
export const LEAD_CALL_OUTCOME_TONES: Record<(typeof LEAD_CALL_OUTCOMES)[number], Tone> = {
  interested: "ok",
  call_back: "warn",
  voicemail: "plain",
  no_answer: "plain",
  not_interested: "danger",
  wrong_number: "danger",
};

export const LEAD_CALL_OUTCOME_WORDS: Record<(typeof LEAD_CALL_OUTCOMES)[number], string> = {
  interested: "Interested",
  call_back: "Call back later",
  not_interested: "Not interested",
  voicemail: "Left a voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number",
};

/** The rail's six lists, said once (§6.1). `leadRail` draws from here and nowhere else. */
export const LEAD_LIST_WORDS: Record<LeadList, string> = {
  all: "All leads",
  ready: "Ready",
  nurture: "Contacted",
  converted: "Talking",
  said_no: "Said no",
  not_a_fit: "Not a fit",
};

/** Where a lead's facts came from, in the owner's words. */
export const LEAD_SOURCE_WORD = "Google Maps listing";

export const LEAD_LOCKED_LINE =
  "Wait for their yes. Once they write back, they're in People and your yes page works for them.";

export const LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";

export const LEAD_NO_ADDRESS =
  "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";

/** Both consent doors say this, permanently, for a person a lead is linked to (decision 19). */
export const LEAD_CONSENT_REFUSAL =
  "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";

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

/** What a lead's class is called. The page kept a second copy that said "Excluded" for the same state. */
export const LEAD_CLASS_WORDS: Record<LeadMemberClass, string> = {
  qualified: "Qualified",
  review: LEAD_REVIEW_WORD,
  excluded: LEAD_LEFT_OUT_WORD,
};

/** The Excluded chip for a place with no phone and no email (lead-search.ts LEAD_UNREACHABLE_KEY). */
export const LEAD_UNREACHABLE_WORD = "No way to reach them";

export const LEAD_CHECK_UNSURE = "Couldn't tell";

// LEAD_CHECK_KEYS and LeadCheckKey are 4.6's, written with the DTOs below; the
// seven are four seen and three read. Nothing here declares them again.
/**
 * One label per check and answer; the particulars are the check's own reason. The seven, and `kind`: the engine's own
 * first criterion, on every plan (lead-search.ts LEAD_KIND_KEY), which the judge answers for every place. A read check
 * under any other key is the plan's, and `leadCheckWord` (lead-facts.ts) says it in the plan's words.
 */
export const LEAD_CHECK_WORDS: Record<LeadCheckKey | "kind", Record<"yes" | "no" | "unknown", string>> = {
  // Each unknown names what could not be told: four rows of "Couldn't tell" told the owner nothing.
  on_maps: { yes: "Open for business", no: "Not open for business", unknown: "Open for business: couldn't tell" },
  in_area: {
    yes: "In the area you asked for",
    no: "Outside the area you asked for",
    unknown: "In the area: couldn't tell",
  },
  phone_two_sources: {
    yes: "Phone matches on two sources",
    no: "Phone from one source only",
    unknown: "Phone on two sources: couldn't tell",
  },
  mailbox: { yes: "Mailbox exists", no: "Mailbox doesn't exist", unknown: "Mailbox: couldn't tell" },
  independent: { yes: "Not a chain", no: "Part of a chain", unknown: "Independent: couldn't tell" },
  right_kind: {
    yes: "The kind you asked for",
    no: "Not the kind you asked for",
    unknown: "The kind you asked for: couldn't tell",
  },
  own_address: {
    yes: "The business's own address",
    no: "Not the business's own address",
    unknown: "Their own address: couldn't tell",
  },
  kind: {
    yes: "The kind of business you asked for",
    no: "Not the kind of business you asked for",
    unknown: "The kind of business: couldn't tell",
  },
};

/** Erasing one lead, from the peek's ⋯ menu (Reach out Part 4, PR 9): the owner's alone, asked first, for good. */
export const LEAD_ERASE_WORDS = {
  act: "Erase this lead",
  ask: (name: string) => `Erase ${name}? Its record and every trace of it go for good.`,
  yes: "Yes, erase",
  no: "No",
  busy: "Erasing…",
  done: (name: string) => `${name} is erased. It won't be found again.`,
  refused: "Not erased",
} as const;

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
/** What a search counts (decision 0010): one checked way to reach the lead, the owner's preference first. */
export const LEAD_CONTACT_STANDARD_WORDS: Record<"phone" | "email", string> = {
  phone: "This search counts a lead once its phone or email checks out, phone first.",
  email: "This search counts a lead once its email or phone checks out, email first.",
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

/** Below this, the unhappy reviews are the ordinary few every business has, and saying so would be noise. */
export const LEAD_LOW_SHARE_FLOOR = 0.15;

/**
 * The one thing five bars said that the average cannot: how much of the score is carried by people who were unhappy.
 * A 4.5 out of forty reviews and a 4.5 out of forty where a quarter gave one star are different businesses to call,
 * and the mean hides it. So the peek says it in words, and only when it changes the picture -- under a sixth at one
 * or two stars is the ordinary tail of any listing, and a line about it would be noise on every lead.
 *
 * Null when the listing published no breakdown, when it has no reviews, or when nothing is worth saying.
 */
export function leadLowShare(
  dist: { one: number; two: number; three: number; four: number; five: number } | null,
): string | null {
  if (!dist) return null;
  const total = dist.one + dist.two + dist.three + dist.four + dist.five;
  if (total <= 0) return null;
  const share = (dist.one + dist.two) / total;
  if (share < LEAD_LOW_SHARE_FLOOR) return null;
  return `${Math.round(share * 100)}% at 1–2 stars`;
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

/** "Alpine and Fort Davis"; "Round Rock, Pflugerville and Kyle". */
/**
 * Where the nearest areas are, as a sentence says it: "near 10005, 10464 and 10467" when every label is a ZIP's
 * ("near 10005"), else "in Round Rock and Pflugerville". Joining the labels whole read "in near 10005, near 10464".
 */
export function leadNearWhere(labels: readonly string[]): string {
  const isNear = (l: string) => l.toLowerCase().startsWith("near ");
  return labels.length && labels.every(isNear)
    ? `near ${leadAnd(labels.map((l) => l.slice(5).trim()))}`
    : `in ${leadAnd(labels)}`;
}

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
        step:
          f.excluded > 0
            ? { id: "excluded", label: `${f.excluded} left out` }
            : { id: "sort_fit", label: "Sort by fit" },
      };
    case "searched_everything":
      if (f.counted === 0) {
        return {
          mark,
          title: `There are ${plural(f.seen, one, f.name)} in ${f.area}, and ${f.seen === 1 ? "it is" : "all of them are"} ${f.leftOutBy ?? "outside what you asked for"}, which you asked me to leave out.`,
          parts: ["Nothing was counted."],
          step: f.nearby.length ? { id: "nearby", label: `Look ${leadNearWhere(f.nearby)}` } : null,
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
      return {
        mark,
        title: `Stopped at ${f.counted}`,
        parts: ["this month's searching is used up", yours],
        step: null,
      };
    case "few_new_matches":
      return {
        mark,
        // "already yours" read as dedupe. "Found all" says what happened: the area ran dry.
        title: `Found all ${plural(f.seen, one, f.name)} in ${f.area}`,
        parts: [yours, ...(f.nearby.length ? [`Look further out, ${leadNearWhere(f.nearby)}?`] : [])],
        // One word (Ruben, 25 Sep): the line before it says what was found and where; the parts say where next.
        step: f.nearby.length ? { id: "look_further", label: "Widen" } : null,
      };
    case "stopped":
      return f.checking
        ? {
            mark,
            title: "Stopping",
            parts: [`checking the emails of the ${f.counted} found`, "nothing else was counted"],
            step: null,
          }
        : {
            mark,
            title: `Stopped at ${f.counted}`,
            parts: [yours, "nothing else was counted"],
            step: { id: "carry_on", label: "Carry on" },
          };
    case "source_failed":
      return {
        mark,
        title: `Stopped at ${f.seen}: the source stopped answering`,
        parts: [yours, "nothing more was counted"],
        step: { id: "try_again", label: "Try again" },
      };
    case "question_unanswered":
      return {
        mark,
        title: "Stopped after a day without your answer",
        parts: [`the ${f.foundBefore} found before it asked are yours`],
        step: { id: "answer_now", label: "Answer now" },
      };
    case "paused":
      return {
        mark,
        title: LEAD_PAUSED_TITLE,
        parts: ["your leads are all here", "nothing is being counted"],
        step: null,
      };
  }
}

/** The plan card's and the strip's one unit: leads, never dollars (§0.2). */
export function leadAllowanceFact(left: number): string {
  return `${left} left this month`;
}

/** What a call outcome does to the stage (§9.4). Only Interested converts; Wrong number keeps the stage. */
export function outcomeMove(o: (typeof LEAD_CALL_OUTCOMES)[number]): {
  stage: LeadStage | null;
  closedReason: string | null;
  converts: boolean;
} {
  switch (o) {
    case "interested":
      return { stage: "converted", closedReason: null, converts: true };
    case "not_interested":
      return { stage: "archived", closedReason: "said_no", converts: false };
    case "wrong_number":
      return { stage: null, closedReason: null, converts: false };
    default:
      return { stage: "nurture", closedReason: null, converts: false };
  }
}
