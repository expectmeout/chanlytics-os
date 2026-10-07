/**
 * A deal's closed sets and their words (0004, 0008): its stages, how an amount recurs, where it came from and why
 * someone passed, each with the word a page says; the acts a deal offers and their labels; and the door's
 * refusals. The deal as a page says it is deal-vm.ts; how a workspace sells is sells-by.ts.
 */
import type { SchemaSet } from "../shared/schema-sets";

export const DEAL_STAGES = ["proposed", "won", "lost", "ended"] as const;
export type DealStage = SchemaSet<"deals.stage">;
export const DEAL_PERS = ["once", "month", "year"] as const;
export type DealPer = SchemaSet<"deals.per">;
export const DEAL_SOURCES = ["person", "payment"] as const;
export type DealSource = SchemaSet<"deals.source">;
/** Why someone passed (00160). The deal's note says the rest in the owner's words. */
export const DEAL_LOST_REASONS = ["price", "timing", "elsewhere", "no_reply", "not_a_fit", "other"] as const;
export type DealLostReason = SchemaSet<"deals.lost_reason">;
export const DEAL_LOST_REASON_WORDS: Record<DealLostReason, string> = {
  price: "Price",
  timing: "Timing",
  elsewhere: "Went elsewhere",
  no_reply: "No reply",
  not_a_fit: "Not a fit",
  other: "Other",
};

/** The word a stage wears; "Client" is a stage word, never a word for a person (docs/glossary.md). */
export const DEAL_STAGE_WORDS: Record<DealStage, string> = {
  proposed: "Proposal out",
  won: "Client",
  lost: "Passed",
  ended: "Ended",
};
export const DEAL_PER_WORDS: Record<DealPer, string> = { once: "once", month: "a month", year: "a year" };
/** The line the person's page says where no deal was ever recorded. */
export const DEAL_LINE_NONE = "No proposal yet";

export function isDealStage(s: unknown): s is DealStage {
  return typeof s === "string" && (DEAL_STAGES as readonly string[]).includes(s);
}

export function isDealLostReason(s: unknown): s is DealLostReason {
  return typeof s === "string" && (DEAL_LOST_REASONS as readonly string[]).includes(s);
}

export function isDealPer(s: unknown): s is DealPer {
  return typeof s === "string" && (DEAL_PERS as readonly string[]).includes(s);
}

/** What a move may empty (deal_record's p_clear, 00160): the link, the valid-until day, the amount with its per, the note. */
export const DEAL_CLEARABLE = ["proposal_url", "valid_until", "amount", "note"] as const;
export type DealClearable = (typeof DEAL_CLEARABLE)[number];

/** An act on a deal (0008): most open the deal sheet (deal-sheet.ts) in a mode; a send opens their thread. */
export type DealActId = "propose" | "again" | "edit" | "won" | "lost" | "ended" | "send" | "follow-up";

/**
 * One act, one label, wherever it is drawn: the person page's deal card and its quiet line, the thread's Deal group,
 * and the person's More menu, whose send is the proposal's (people.ts personActs).
 */
export const DEAL_ACT_WORDS: Record<DealActId, string> = {
  propose: "Start a proposal",
  again: "Propose again",
  edit: "Edit proposal",
  won: "Mark as client",
  lost: "Mark as passed",
  ended: "End the engagement",
  send: "Send proposal",
  "follow-up": "Follow up",
};

/** What the door can answer, in a sentence the page shows at the control. */
export const DEAL_REFUSALS: Record<string, string> = {
  not_found: "Person not found.",
  bad_stage: "That is not a stage a deal can be in.",
  bad_per: "An amount is once, a month or a year.",
  bad_amount: "An amount cannot be negative.",
  note_too_long: "A note is at most 200 characters.",
  service_too_long: "A service name is at most 80 characters.",
  bad_move: "A new deal starts with a proposal.",
  already_open: "They already have a proposal out or an engagement running for this service.",
  moved: "Someone changed this deal since you opened it. Reload and try again.",
  ended: "An ended engagement is not reopened: record a new proposal.",
  bad_link: "That is not a web address.",
  bad_reason: "A reason for passing is price, timing, went elsewhere, no reply, not a fit or other.",
  bad_clear: "Only the link, the valid-until day, the amount or the note can be emptied.",
};
