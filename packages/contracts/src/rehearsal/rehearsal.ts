/**
 * A rehearsal (decision 0069): the owner talks to the receptionist as a customer would, in the browser, or types to it,
 * before any number is bought and whenever after; then sees how it did and fixes it where it went wrong. A real call is
 * reviewed the same way, as a rehearsal of the kind `call_review`.
 *
 * This module holds what a spoken rehearsal is allowed (its free minutes, one rule read by the edge that starts a call
 * and the page that says what is left), the shape a rehearsal is read in, what the receptionist's tools answer on a test
 * call, and every word the Rehearse surface says outside the review (review.ts) and the fix (fix-router.ts).
 */
import { DAY_MS, MIN_MS } from "../shared/time";
import type { SpendWords } from "../workspace/billing";

export const REHEARSAL_KINDS = ["call", "typed", "call_review"] as const;
export type RehearsalKind = (typeof REHEARSAL_KINDS)[number];

/** The free minutes (decision 0069, D1). Typing is free; a spoken minute is the provider's, on the platform's account. */
export const REHEARSAL_LIMITS = {
  /** One call's length: the provider ends the call there (agent_override.max_call_duration_ms; its floor is a minute). */
  callMs: 3 * MIN_MS,
  /** What a workspace may speak before its plan starts. */
  beforePlanMs: 10 * MIN_MS,
  /** What a workspace with a plan may speak in any thirty days. */
  withPlanMs: 60 * MIN_MS,
  /** What a lead's own receptionist may speak in all, before anyone makes it theirs (decision 0079): two calls' worth. */
  previewMs: 6 * MIN_MS,
  /** The window a plan's minutes are counted over. */
  withPlanWindowMs: 30 * DAY_MS,
  /**
   * A call that has not said it ended is counted as running for this long after it was made, the whole of a call's
   * length and a margin, so a tab closed mid-call cannot open a second one beside it, and a call whose end was never
   * told does not hold the workspace for ever.
   */
  runningMs: 5 * MIN_MS,
} as const;

/**
 * What a workspace's spoken minutes are counted against: before its plan, or the plan's thirty days; or, for a lead's own
 * receptionist that nobody has made theirs yet, the preview's whole life (decision 0079).
 */
export type RehearsalWindow = "before_plan" | "thirty_days" | "preview";

export interface RehearsalAllowance {
  window: RehearsalWindow;
  /** All the window gives. */
  of_ms: number;
  /** What is left of it, never below nothing. */
  left_ms: number;
  /** Whether a call may start now: something left, and no call of this workspace still running. */
  can_call: boolean;
  /** Why not, when it may not. */
  why: "used" | "running" | null;
}

/**
 * The free minutes, from what was spoken: one rule, read by the edge before a call is made and by the page that says
 * what is left. `hasPlan` is the plan the spend predicate reads (contracts maySpend): a trial is before the plan.
 * `spentMs` is the window's spoken rehearsals, each counted by the provider's seconds, and a running one by its whole
 * length (REHEARSAL_LIMITS.callMs), so a call cannot run past what is left.
 */
export function rehearsalAllowance(f: {
  hasPlan: boolean;
  /** A lead's own receptionist nobody has made theirs: its six minutes, whatever else is true. */
  preview: boolean;
  spentMs: number;
  running: boolean;
}): RehearsalAllowance {
  const window: RehearsalWindow = f.preview ? "preview" : f.hasPlan ? "thirty_days" : "before_plan";
  const ofMs = {
    preview: REHEARSAL_LIMITS.previewMs,
    thirty_days: REHEARSAL_LIMITS.withPlanMs,
    before_plan: REHEARSAL_LIMITS.beforePlanMs,
  }[window];
  const leftMs = Math.max(0, ofMs - Math.max(0, f.spentMs));
  // A call is let start with at least a minute left: the provider's floor for a call's length.
  const used = leftMs < MIN_MS;
  return {
    window,
    of_ms: ofMs,
    left_ms: leftMs,
    can_call: !used && !f.running,
    why: f.running ? "running" : used ? "used" : null,
  };
}

/** How long the next call may last: three minutes, or what is left when that is less (a minute at the least). */
export function rehearsalCallMs(a: RehearsalAllowance): number {
  return Math.max(MIN_MS, Math.min(REHEARSAL_LIMITS.callMs, a.left_ms));
}

/**
 * One turn of a conversation rehearsed or reviewed, in the order it was said: the receptionist's words, the customer's,
 * or a tool the receptionist used, by its name (`send_booking_link`), which a rehearsal shows and never runs.
 */
export interface RehearsalTurn {
  role: "agent" | "user" | "tool";
  content: string;
}

/** The tools a rehearsal shows when the receptionist reaches for them (D4): what it would have sent. */
export const REHEARSAL_SHOWN_TOOLS = ["send_booking_link"] as const;

/**
 * A spoken call's transcript as the provider gives it, read into turns: the words (transcript_object, or the items of
 * transcript_with_tool_calls), and each tool the receptionist invoked that a rehearsal shows; every other item dropped.
 */
export function turnsOfTranscript(raw: unknown): RehearsalTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: RehearsalTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const role = (t as { role?: unknown }).role;
    const content = (t as { content?: unknown }).content;
    const name = (t as { name?: unknown }).name;
    if (role === "tool_call_invocation" && (REHEARSAL_SHOWN_TOOLS as readonly unknown[]).includes(name)) {
      out.push({ role: "tool", content: name as string });
      continue;
    }
    if ((role !== "agent" && role !== "user") || typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  return out;
}

/** A rehearsal as the page reads it (GET receptionist/rehearsals/[id]). */
export interface RehearsalDto {
  id: string;
  kind: RehearsalKind;
  started_at: string | null;
  ended_at: string | null;
  seconds: number | null;
  end_reason: string | null;
  transcript: RehearsalTurn[];
  config_version: number | null;
  /** The review, when it has one (review.ts ReviewDto). */
  review: unknown;
  /** The changes kept from it, newest last. */
  fixes: RehearsalFixDto[];
}

/** A change kept from a rehearsal: which op, the field's name as the owner reads it, the line it showed, and when. */
export interface RehearsalFixDto {
  op: string;
  field: string;
  said: string;
  version: number;
  at: string;
}

/**
 * What the receptionist's tools answer on a test call (decision 0069, D4): nothing is sent and nobody is dialed, and the
 * answer says so to the model, which says it to the owner playing the customer.
 */
export const REHEARSAL_TOOL_WORDS = {
  bookingLink:
    "This is a rehearsal, so nothing was sent: the owner sees the booking link on their screen. Tell the caller the link is on its way, by WhatsApp or by text as your instructions say, as you would on a real call.",
} as const;

/** What a refusal to spend says a rehearsal's call was for (the route wrapper's requireSpend). */
export const SPEND_REHEARSE: SpendWords = { before: "rehearsing your receptionist", can: "rehearse your receptionist" };
/** And a review, or a fix routed by the model. */
export const SPEND_REVIEW: SpendWords = { before: "reviewing a conversation", can: "review a conversation" };

/** Every word the Rehearse surface says, outside the review and the fix. */
export const REHEARSE_WORDS = {
  title: "Rehearse",
  sub: "Before a customer does",
  row: { label: "Talk to it as a customer would", value: "Hear it, see how it did, fix it", act: "Rehearse" },
  modes: { talk: "Talk", type: "Type" },
  talk: {
    start: "Call it",
    starting: "Connecting…",
    live: "On the call",
    end: "End and see how it did",
    mute: "Mute",
    unmute: "Unmute",
    you: "You",
    it: (name: string | null) => name || "Your receptionist",
    mic: "Allow the microphone when your browser asks: it's how it hears you.",
    micBlocked: "Your browser blocked the microphone. Allow it in the address bar, or type instead.",
    dropped: "The call dropped. What was said is kept: see how it did, or call again.",
    failed: "The call could not start. Nothing was spent; try again, or type instead.",
    ended: "Call ended",
    listening: "It's listening",
    notLive: "Calls in the browser answer on the live app only.",
  },
  type: { placeholder: "Are you open on Saturday?", ask: "Ask it", asking: "Asking…" },
  review: "See how it did",
  reviewing: "Reading the conversation…",
  again: "Start over",
  /** After a fix kept from a call: its questions, for the next one. */
  askNext: "Ask it these again on your next call:",
  /** What is left, said under the call's press. */
  left: (leftMs: number, window: RehearsalWindow) => {
    const min = Math.floor(leftMs / MIN_MS);
    const n = `${min} free minute${min === 1 ? "" : "s"}`;
    if (window === "preview") return `${n} left on this preview`;
    return window === "before_plan" ? `${n} left before you go live` : `${n} left this month`;
  },
  /** When none is left. */
  used: (window: RehearsalWindow) =>
    window === "preview"
      ? "That's all a preview calls. Make it yours to keep talking."
      : window === "before_plan"
        ? "Your free minutes are used. Go live to keep talking; typing is still free."
        : "This month's minutes are used. Typing is still free.",
  running: "A call is still running. End it first, or wait a minute.",
  /** On a test call, what a transfer would have done (D4): a rehearsal dials nobody. */
  transferred: (number: string | null) =>
    number
      ? `On a real call, a caller who asks for a person is put through to ${number}. A rehearsal dials nobody.`
      : "On a real call, a caller who asks for a person leaves a message for you.",
  /** On a test call, the link it would have sent (D4). */
  linkShown: (link: string) => `It would have sent your booking link: ${link}`,
} as const;
