/**
 * A lead's preview, as everything but its page reads it (decision 0079, 00497 lead_previews): its states and its limits,
 * which the database's checks and doors hold too (schema-sets.ts holds the states to the column); which page it is now
 * (previewStateOf); whether it can be made someone's own (previewClaimable); and what {{their preview}} reads of it in an
 * email (previewSlotOf). Apart from the page's own module (lead-preview.ts): the lead's card and every email's fill read
 * these alone, and a page that imports one name from a module carries that module whole.
 *
 *   building   its workspace made, its receptionist being written from the lead and its website
 *   ready      open to try: texted and called, up to its limits, until its thirty days are up
 *   failed     it could not be made (its why kept); the email that would have carried it is skipped
 *   claimed    made theirs: an active workspace with its claimer as owner
 *   ended      its thirty days are up, or its lead was erased: its workspace and its words gone, its counts kept
 */
import { REHEARSAL_LIMITS } from "../rehearsal/rehearsal";

export const PREVIEW_STATES = ["building", "ready", "failed", "claimed", "ended"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/** What a preview answers and keeps, as its doors hold it (00497). */
export const PREVIEW_LIMITS = {
  /** Messages a preview answers (preview_said). */
  messages: 20,
  /** Days a preview lasts from the first email that carried it, or from its build. */
  days: 30,
  /** Lines of "not right" a preview keeps (preview_not_right). */
  notRight: 10,
  /**
   * Previews a workspace makes in a UTC day for what nobody pressed for: a sequence that carries the link, a reply that
   * makes one (the edge's askPreview). The email past it waits for the next day; a member's press is never counted out.
   */
  aDay: 50,
  /** The longest message a preview takes, in characters: Try it's case. */
  messageChars: 500,
  /** What its calls may speak in all: the rehearsal's own preview window, three minutes at most a call (L3). */
  callMs: REHEARSAL_LIMITS.previewMs,
} as const;

/** Why a preview could not be made, as its row keeps it (lead_previews.failed_why). */
export type PreviewFailure = "no_name" | "build_failed";

/**
 * What the page draws: open to try; open, its twenty messages said; being set up; ended (its thirty days up, its lead
 * erased, or it could not be made); or someone's own now.
 */
export type PreviewPageState = "building" | "ready" | "spent" | "ended" | "taken";

/** What a preview's standing is read from: its door's state, its clock, and how much it was asked. */
interface PreviewStandingFacts {
  state: string;
  ends_at: string;
  asked_count: number;
}

/** Which page a preview is now: its door's state, read against its clock and its limit. */
export function previewStateOf(previewPageFacts: PreviewStandingFacts, now: Date): PreviewPageState {
  if (previewPageFacts.state === "claimed") return "taken";
  if (
    previewPageFacts.state === "ended" ||
    previewPageFacts.state === "failed" ||
    Date.parse(previewPageFacts.ends_at) <= now.getTime()
  )
    return "ended";
  if (previewPageFacts.state === "building") return "building";
  return previewPageFacts.asked_count >= PREVIEW_LIMITS.messages ? "spent" : "ready";
}

/**
 * A lead's preview as {{their preview}} reads it (L5): open, with its link; being made (or not made yet, which the first
 * send that names it asks for); or gone, failed, ended or someone's own, which no email may carry.
 */
export type LeadPreviewSlot = { state: "open"; url: string } | { state: "building" } | { state: "gone" };

/** The slot's standing for a lead's preview row, or none, read against the clock; `origin` is the dashboard's. */
export function previewSlotOf(
  row: (PreviewStandingFacts & { token: string }) | null,
  now: Date,
  origin: string,
): LeadPreviewSlot {
  if (!row || row.state === "building") return { state: "building" };
  return previewClaimable(previewStateOf(row, now))
    ? { state: "open", url: `${origin}/preview/${encodeURIComponent(row.token)}` }
    : { state: "gone" };
}

/** Whether a preview can be made someone's own now: open, with its twenty messages said or not (Make it mine, L4). */
export function previewClaimable(state: PreviewPageState): boolean {
  return state === "ready" || state === "spent";
}
