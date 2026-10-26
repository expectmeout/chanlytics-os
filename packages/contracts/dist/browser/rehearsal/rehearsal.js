import { DAY_MS, MIN_MS } from "../shared/time.js";
export const REHEARSAL_KINDS = ["call", "typed", "call_review"];
export const REHEARSAL_LIMITS = {
  /** One call's length: the provider ends the call there (agent_override.max_call_duration_ms; its floor is a minute). */
  callMs: 3 * MIN_MS,
  /** What a workspace may speak before its plan starts. */
  beforePlanMs: 10 * MIN_MS,
  /** What a workspace with a plan may speak in any thirty days. */
  withPlanMs: 60 * MIN_MS,
  /** The window a plan's minutes are counted over. */
  withPlanWindowMs: 30 * DAY_MS,
  /**
   * A call that has not said it ended is counted as running for this long after it was made, the whole of a call's
   * length and a margin, so a tab closed mid-call cannot open a second one beside it, and a call whose end was never
   * told does not hold the workspace for ever.
   */
  runningMs: 5 * MIN_MS
};
export function rehearsalAllowance(f) {
  const window = f.hasPlan ? "thirty_days" : "before_plan";
  const ofMs = f.hasPlan ? REHEARSAL_LIMITS.withPlanMs : REHEARSAL_LIMITS.beforePlanMs;
  const leftMs = Math.max(0, ofMs - Math.max(0, f.spentMs));
  const used = leftMs < MIN_MS;
  return {
    window,
    of_ms: ofMs,
    left_ms: leftMs,
    can_call: !used && !f.running,
    why: f.running ? "running" : used ? "used" : null
  };
}
export function rehearsalCallMs(a) {
  return Math.max(MIN_MS, Math.min(REHEARSAL_LIMITS.callMs, a.left_ms));
}
export const REHEARSAL_SHOWN_TOOLS = ["send_booking_link"];
export function turnsOfTranscript(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const role = t.role;
    const content = t.content;
    const name = t.name;
    if (role === "tool_call_invocation" && REHEARSAL_SHOWN_TOOLS.includes(name)) {
      out.push({ role: "tool", content: name });
      continue;
    }
    if (role !== "agent" && role !== "user" || typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  return out;
}
export const REHEARSAL_TOOL_WORDS = {
  bookingLink: "This is a rehearsal, so nothing was sent: the owner sees the booking link on their screen. Tell the caller the link is on its way by WhatsApp, as you would on a real call."
};
export const SPEND_REHEARSE = { before: "rehearsing your receptionist", can: "rehearse your receptionist" };
export const SPEND_REVIEW = { before: "reviewing a conversation", can: "review a conversation" };
export const REHEARSE_WORDS = {
  title: "Rehearse",
  sub: "Before a customer does",
  row: { label: "Talk to it as a customer would", value: "Hear it, see how it did, fix it", act: "Rehearse" },
  modes: { talk: "Talk", type: "Type" },
  talk: {
    start: "Call it",
    starting: "Connecting\u2026",
    live: "On the call",
    end: "End and see how it did",
    mute: "Mute",
    unmute: "Unmute",
    you: "You",
    it: (name) => name || "Your receptionist",
    mic: "Allow the microphone when your browser asks: it's how it hears you.",
    micBlocked: "Your browser blocked the microphone. Allow it in the address bar, or type instead.",
    dropped: "The call dropped. What was said is kept: see how it did, or call again.",
    failed: "The call could not start. Nothing was spent; try again, or type instead.",
    ended: "Call ended",
    listening: "It's listening",
    notLive: "Calls in the browser answer on the live app only."
  },
  type: { placeholder: "Are you open on Saturday?", ask: "Ask it", asking: "Asking\u2026" },
  review: "See how it did",
  reviewing: "Reading the conversation\u2026",
  again: "Start over",
  /** After a fix kept from a call: its questions, for the next one. */
  askNext: "Ask it these again on your next call:",
  /** What is left, said under the call's press. */
  left: (leftMs, window) => {
    const min = Math.floor(leftMs / MIN_MS);
    const n = `${min} free minute${min === 1 ? "" : "s"}`;
    return window === "before_plan" ? `${n} left before you go live` : `${n} left this month`;
  },
  /** When none is left. */
  used: (window) => window === "before_plan" ? "Your free minutes are used. Go live to keep talking; typing is still free." : "This month's minutes are used. Typing is still free.",
  running: "A call is still running. End it first, or wait a minute.",
  /** On a test call, what a transfer would have done (D4): a rehearsal dials nobody. */
  transferred: (number) => number ? `On a real call, a caller who asks for a person is put through to ${number}. A rehearsal dials nobody.` : "On a real call, a caller who asks for a person leaves a message for you.",
  /** On a test call, the link it would have sent (D4). */
  linkShown: (link) => `It would have sent your booking link: ${link}`
};
