/**
 * A call to a lead's own preview, read back (decision 0079; the redesign of 17 November 2026): the shapes the page, the
 * dashboard's door and the edge's door agree on. The words said on a call, as the page shows them while the call runs
 * and keeps them on the call's line; what a call's analysis said, as the edge reads it from the provider; and the card a
 * business would get after a real call like it. The dashboard's server makes the lines and the card
 * (apps/dashboard/src/server/previews/heard.ts), in the words every surface says a call in (voice/call-words.ts).
 */

/** One thing said on the call: by AI, or by the person who called it. */
export interface PreviewHeardLine {
  who: "ai" | "you";
  text: string;
}

/**
 * Where a call's write-up stands at the provider: still being written, written, or none to come (a call it has no
 * record of, or one whose analysis it never made).
 */
export const PREVIEW_AFTER_CALL_STATES = ["writing", "ready", "none"] as const;
export type PreviewAfterCallState = (typeof PREVIEW_AFTER_CALL_STATES)[number];

/** What a call's analysis said, as the edge's door answers it: the provider's own fields, each null where it said none. */
export interface PreviewCallAnalysis {
  outcome: string | null;
  wanted: string | null;
  summary: string | null;
  follow_up: string | null;
  caller_name: string | null;
  caller_email: string | null;
}

/** What the business would get after a real call like this one: the card its Inbox would hold. */
export interface PreviewGotVM {
  /** How it ended, in the Inbox's words; null where the analysis named none. */
  outcome: string | null;
  /** Whether something is left for a person at the business to do: what the card's mark says. */
  yours: boolean;
  /** What the caller wanted, in one sentence; empty where the analysis left only its notes. */
  wanted: string;
  /** The to-do first, then what the caller gave about themselves. */
  notes: string[];
}

/** What the page's read of a call answers: its words so far, whether it has ended, and what comes after it. */
export interface PreviewHeardDto {
  lines: PreviewHeardLine[];
  ended: boolean;
  /** The card, once the call's write-up is there. */
  got: PreviewGotVM | null;
  /** Whether a write-up may still come: the page asks again while it is true. */
  writing: boolean;
}
