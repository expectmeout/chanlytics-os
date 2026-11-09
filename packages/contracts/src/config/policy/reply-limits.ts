/** Policy: reply limits. */

import { MIN_MS, HOUR_MS } from "../../shared/time";

/**
 * The clock a wire's reply window reads (decision 0001, steps 5 and 8): when the thread's person last wrote on that wire.
 * WhatsApp's from its accessor, an Instagram DM's from its own; a wire with no window reads none. Every reader of a
 * window hands replyWindow the clock this picks, so a DM thread is never judged by a WhatsApp message, or one by the other.
 */
export function windowClockOf(
  replyChannel: string | null | undefined,
  clocks: { whatsapp?: string | null; instagram?: string | null },
): string | null {
  if (replyChannel === "instagram") return clocks.instagram ?? null;
  return replyChannel === "sms" || replyChannel === "email" ? null : (clocks.whatsapp ?? null);
}

/**
 * How long one reply may be on each wire, and the sentence for one that is
 * longer. WhatsApp's and the carriers' limits are theirs, as Instagram's per DM is; email's and a DM reply's whole are ours, the
 * same bound an email taken in is kept to. Asked before anything is queued: a
 * reply over WhatsApp's limit was once stored, reported queued, and failed
 * fifteen seconds later as an escalation and an alert.
 */
export const REPLY_LIMITS = {
  whatsapp: { max: 4096, refusal: "WhatsApp refuses a message over 4096 characters." },
  sms: { max: 1600, refusal: "A text can be at most 1600 characters." },
  email: { max: 20000, refusal: "An email reply can be at most 20,000 characters." },
  // Instagram takes 1000 bytes a DM; a longer reply leaves as several (channels instagramDmChunks), up to this.
  instagram: { max: 2000, refusal: "An Instagram reply can be at most 2000 characters." },
} as const;

/** The longest reply any wire takes: what a route may accept before it knows the wire. */
export const REPLY_MAX_ANY = Math.max(...Object.values(REPLY_LIMITS).map((l) => l.max));

/**
 * A reply's grace: queued, it waits this long before its job sends it, and inside it the send is cancelled cleanly. The
 * cancelable window IS the undo (core reply.ts, §6). Said once here, so core queues by it and Today's rows hold a review's
 * public reply for the same grace (decision 0071, E7).
 */
export const SEND_GRACE_MS = 15_000;

/**
 * How late a member's own reply may still leave after its grace (decision 0089, D3): words a person wrote for the moment
 * should not reach the customer hours later, after an outage held the ledger. Past it the send door refuses it as too
 * late, its words stay on the thread, and the thread is held for the person to send it again or answer anew (core
 * send.ts). The receptionist's draft has its own horizon, measured from the message it answers (inbound steps.ts).
 */
export const MEMBER_REPLY_STALE_MS = 30 * MIN_MS;

/* ----------------------------- live calls -------------------------------- */

/**
 * How long a call may go without any sign of life before we stop calling it
 * live, whatever its status column says.
 *
 * `calls.status = 'ongoing'` is written from Retell's own `call_status`, and it
 * is only ever cleared by a later webhook. So a single lost `call_ended` — a
 * deploy mid-call, a provider blip, a 500 on our side — leaves that row
 * `ongoing` FOREVER, and anything reading the flag alone shows a call in
 * progress that hung up days ago. A status flag is a claim; this is the
 * evidence.
 *
 * Ten minutes, and it stays ten now that `transcript_updated` is on every line
 * (decision 0092). A turn refreshes the row, but a call can go quiet with
 * nobody gone: a caller on hold, a warm transfer bridged to the owner's phone,
 * a long silence the agent waits out. What clears a quiet call is the calls
 * sweep, which asks the provider once a call has been quiet for five minutes
 * and runs every five (calls-sweep.ts SETTLE_MS): a call still up is
 * re-ingested and heard from again, one that ended is closed. So a call quiet
 * for up to ten minutes may still be live, and a bound below the sweep's
 * cadence would drop real calls from Live while they run.
 *
 * This is a DISPLAY guard, not the fix. It bounds how long a phantom can be
 * shown; only reconciling against the provider makes the row itself honest.
 */
export const CALL_HEARTBEAT_MS = 10 * MIN_MS;

export function isLiveCall(
  call: { status: string; updated_at?: string | null; started_at?: string | null },
  now = new Date(),
): boolean {
  if (call.status !== "ongoing") return false;
  // updated_at moves on every ingest (moddatetime + the upsert in ingest_call);
  // started_at is the fallback for a row written before that was true.
  const beat = call.updated_at ?? call.started_at;
  // Ongoing with no timestamp at all is not evidence of anything.
  if (!beat) return false;
  const at = new Date(beat).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < CALL_HEARTBEAT_MS;
}

/* --------------------------- the veto window ------------------------------ */

/**
 * How long the receptionist holds its own reply before sending it.
 *
 * A text channel is not a phone call. Nobody expects a WhatsApp answer in under
 * a second, so a short pause costs the customer nothing — and it converts the
 * only two options a business had, "let the bot speak" or "turn the bot off",
 * into a third: let it draft, and redirect it before the customer ever sees it.
 * Correcting a message that has already been read is not a feature; this is.
 */
export const REPLY_DELAY_DEFAULT_MS = 30_000;

export const REPLY_DELAY_MIN_MS = 5_000;

export const REPLY_DELAY_MAX_MS = 10 * MIN_MS;

/**
 * The two limits a workspace is seeded with and Autonomy states: automatic
 * replies to one person in a day, and the hours a person's reply keeps the
 * receptionist off a thread. The runtime keeps its own copy of the cap (core's
 * MAX_REPLIES_PER_DAY), and a test holds it equal to this one; every pause reads
 * pauseHoursOf.
 */
export const REPLY_CAP_DEFAULT = 20;

export const PAUSE_HOURS_DEFAULT = 24;

/** The pause a reply policy may keep, in whole hours: the range PolicyLimitsSchema's `pause_hours` is built from. */
export const PAUSE_HOURS_MIN = 1;

export const PAUSE_HOURS_MAX = 168;

/**
 * How long a person's touch keeps the receptionist off a thread, in hours, from
 * the reply policy's limits. A stored `pause_hours` counts when it is one the
 * reply policy's schema allows, which is all `PUT policies` and the Autonomy
 * dial write (a whole number from PAUSE_HOURS_MIN to PAUSE_HOURS_MAX); anything
 * else, or nothing, is the default day. The pause, the handoff email and the
 * pane's words all read this, so none of them can say one number and apply another.
 */
export function pauseHoursOf(limits: { pause_hours?: unknown } | null | undefined): number {
  const stored = limits?.pause_hours;
  return typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= PAUSE_HOURS_MIN &&
    stored <= PAUSE_HOURS_MAX
    ? stored
    : PAUSE_HOURS_DEFAULT;
}

/**
 * How long a person may wait on the team before Today's Need you says their wait in the amber: the owner's own target
 * (Autonomy's "Answer people within", the reply policy's `answer_within_hours`), and a day where none is set, which is what
 * Need you said for everyone before an owner could (the 10/10 read, 2 Nov 2026: amber meant "past a day", whatever the
 * business promised). Whole hours inside the pause's own range; anything else is the day.
 */
export const ANSWER_WITHIN_HOURS_DEFAULT = 24;

/** The owner's target in whole hours, read as pauseHoursOf reads the pause: a stored whole number in range, else a day. */
export function answerWithinHoursOf(limits: { answer_within_hours?: unknown } | null | undefined): number {
  const stored = limits?.answer_within_hours;
  return typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= PAUSE_HOURS_MIN &&
    stored <= PAUSE_HOURS_MAX
    ? stored
    : ANSWER_WITHIN_HOURS_DEFAULT;
}

/** The same target in ms, for a wait to be held to. */
export const answerWithinMsOf = (limits: { answer_within_hours?: unknown } | null | undefined): number =>
  answerWithinHoursOf(limits) * HOUR_MS;

/** The same pause in ms, for a `paused_until`. */
export function pauseMsOf(limits: { pause_hours?: unknown } | null | undefined): number {
  return pauseHoursOf(limits) * HOUR_MS;
}

/**
 * The hard limits in an owner's words (the wiring audit's S6). The card called
 * the last two "this workspace's own values", then limits Chanlytics set that
 * nothing on the page could change; they are the owner's two dials now. Each
 * says what it does and what its default is, and the value a dial shows is the
 * stored one, or the default when nothing is stored.
 */
export function hardLimitsWords(
  limits: { max_replies_day?: unknown; pause_hours?: unknown; answer_within_hours?: unknown } | null | undefined,
): {
  sub: string;
  replies: string;
  pause: string;
  within: string;
  cap: number;
  hours: number;
  withinHours: number;
} {
  const stored = (v: unknown): number | null => {
    const n = Number(v);
    return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    sub: "The first two never change; the rest are yours to set",
    replies: `How many it sends before it stops and asks for you. ${REPLY_CAP_DEFAULT} is the default.`,
    pause: `Counted from Take over, a reply sent from the Inbox or the WhatsApp Business app, or a handoff to you. ${PAUSE_HOURS_DEFAULT} hours is the default.`,
    within: `Someone handed to you who has waited longer shows in amber on Today. ${ANSWER_WITHIN_HOURS_DEFAULT} hours is the default.`,
    cap: stored(limits?.max_replies_day) ?? REPLY_CAP_DEFAULT,
    hours: pauseHoursOf(limits),
    withinHours: answerWithinHoursOf(limits),
  };
}

/**
 * The wait for THIS reply, in ms. Zero means send now.
 *
 * Clamped rather than trusted: `limits` is tenant-editable JSON, and a typo of
 * one extra zero would leave a customer waiting hours for an answer the bot had
 * already written. A configuration mistake should degrade the experience by
 * seconds, never strand someone.
 */
export function replyDelayMs(mode: string | null | undefined, limits?: { reply_delay_ms?: number } | null): number {
  // 'auto' answers immediately — that is what it means. Every other mode either
  // holds for a human or never speaks, and neither reaches a send.
  if (mode !== "veto") return 0;
  const raw = limits?.reply_delay_ms;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return REPLY_DELAY_DEFAULT_MS;
  return Math.min(REPLY_DELAY_MAX_MS, Math.max(REPLY_DELAY_MIN_MS, Math.round(raw)));
}
