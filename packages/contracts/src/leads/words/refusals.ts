/** Words: refusals. */

import type { LeadCheckKey } from "../dtos";
import type { LeadEmailState, LeadMemberClass } from "../search/sets";
import type { LeadNotAFitWhy } from "./lists";

/** Where a lead's facts came from, in the owner's words. */
export const LEAD_SOURCE_WORD = "Google Maps listing";

export const LEAD_LOCKED_LINE =
  "Wait for their yes. Once they write back, they're in People and your yes page works for them.";

/** An address on the never-again list: no email is written to it here, as no sequence writes to it. */
export const LEAD_ASKED_NOT_WRITTEN = "They asked not to be written to, so no email is written here.";

/** A draft that kept saying a number about the business that none of Cold email's facts backs (0113). */
export const LEAD_UNBACKED_NUMBER =
  "Not written: it kept saying a number about your business that none of your facts backs. Add it to Facts your emails can use, on Cold email.";

export const LEAD_NO_ADDRESS =
  "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";

/** Both consent doors say this, permanently, for a person a lead is linked to (decision 19). */
export const LEAD_CONSENT_REFUSAL =
  "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";

/* --------------------------------------------- release B, tasks 12-15 ---- */

/**
 * Who read a check that was read, as a lead's checks say it: the judge, Claude, from a place's listing or its own website;
 * or Chanlytics AI, which is the screen before the judge (decision 0085), from a place's listing, and a people search's
 * company judge, from the directory.
 */
export const LEAD_READ_SOURCES = {
  judge: "Claude · the listing",
  site: "Claude · their website",
  screen: "Chanlytics AI · the listing",
  company: "Chanlytics AI · the directory",
} as const;

/** Not a fit's five whys, in the order the peek and the bulk bar offer them (§9.5). */
export const LEAD_NOT_A_FIT_WORDS: Record<LeadNotAFitWhy, string> = {
  chain: "A chain or franchise",
  wrong_kind: "The wrong kind of business",
  too_far: "Too far away",
  customer: "Already a customer",
  other: "Something else",
};

export const LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";

/**
 * Not a fit, one tap, the reason after (the lead-to-sequence canvas): the toast's question and its short reasons, each
 * optional; Something else is the one given with the tap.
 */
export const LEAD_NOT_A_FIT_ASK = {
  said: (name: string) => `${name}: not a fit.`,
  why: "Why?",
  short: { chain: "Chain", wrong_kind: "Wrong kind", too_far: "Too far", customer: "A customer" },
  kept: (reason: string) => `Kept as ${reason.toLowerCase()}`,
} as const;

/** The one why that hides the place from every future search; the rest teach nothing in this release. */
export const LEAD_SUPPRESSING_WHY: LeadNotAFitWhy = "customer";

export const LEAD_REVIEW_WORD = "Needs review";

/**
 * What the finder's own filter left out of a search. It said "Left out", and a sequence's "Left" sat beside it on the same
 * page for a business taken out of a sequence: two things in one word (the phone walk of 3 Nov 2026).
 */
export const LEAD_LEFT_OUT_WORD = "Filtered out";

/** What a lead's class is called. The page kept a second copy that said "Excluded" for the same state. */
export const LEAD_CLASS_WORDS: Record<LeadMemberClass, string> = {
  qualified: "Qualified",
  review: LEAD_REVIEW_WORD,
  excluded: LEAD_LEFT_OUT_WORD,
};

/** The Excluded chip for a place with no phone and no email (search/class.ts LEAD_UNREACHABLE_KEY). */
export const LEAD_UNREACHABLE_WORD = "No way to reach them";

export const LEAD_NO_SITE_WORD = "No website of its own";

export const LEAD_CHECK_UNSURE = "Couldn't tell";

// LEAD_CHECK_KEYS and LeadCheckKey are 4.6's, written with the DTOs below; the
// seven are four seen and three read. Nothing here declares them again.
/**
 * One label per check and answer; the particulars are the check's own reason. The seven, and `kind`: the engine's own
 * first criterion, on every plan (search/class.ts LEAD_KIND_KEY), which the judge answers for every place. A read check
 * under any other key is the plan's, and `leadCheckWord` (leads/facts.ts) says it in the plan's words.
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
