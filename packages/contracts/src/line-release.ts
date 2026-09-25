/**
 * When a number whose subscription ended goes back to the phone company, and what the owner is told first.
 *
 * Before this, nothing gave a number back: a workspace that cancelled kept its line, and we paid the carrier for it
 * every month for ever, with a receptionist answering "take a message" on it (pausedVoiceFacts). The release is the
 * lines sweep's (apps/edge/lib/lines/line-release.ts); the rule of when, and every sentence the owner reads, are here.
 *
 * A release cannot be undone -- the number goes back to the carrier's pool and to somebody else -- so the rule leans
 * late on purpose: the grace counts from the LATEST moment the billing row says the subscription stopped paying, the
 * owner is warned LINE_RELEASE_WARN_DAYS before, and a release never comes sooner than that after the warning went.
 */
import { receptionistOn, dayWords, type BillingMode, type BillingStatus } from "./billing";
import { formatPhoneDisplay } from "./phone";

/** The owner is told this many days before the number goes. */
export const LINE_RELEASE_WARN_DAYS = 7;
/** The least grace a deployment may set (LINE_RELEASE_AFTER_DAYS): a typed "3" must not give numbers back in days. */
export const LINE_RELEASE_MIN_DAYS = 14;
/** The grace the sweep reports against while it only reports (LINE_RELEASE_AFTER_DAYS unset). */
export const LINE_RELEASE_REPORT_DAYS = 30;

const DAY_MS = 86_400_000;

/** The grace a deployment set, in whole days, or null (unset, or less than the least allowed: then it only reports). */
export function lineReleaseAfterDays(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= LINE_RELEASE_MIN_DAYS ? n : null;
}

/** The billing row, as far as the release reads it. */
export interface LineReleaseBilling {
  mode: BillingMode;
  status: BillingStatus;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  last_payment_failed_at: string | null;
  updated_at: string | null;
}

const msOf = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * When the subscription stopped paying, as late as the row says anything did; null while it pays (or never gates:
 * a direct arrangement is billed by hand and its number is never ours to take back).
 *
 * The latest of the trial's end, the paid period's end, a cancellation's date and the last failed payment: a
 * subscription cancelled today keeps its number to the end of the period it paid for, and a trial that ended without a
 * card counts from the trial's end. `unpaid` leaves the period out, because Stripe keeps opening periods on an unpaid
 * subscription and the date would move for ever. With none of them, the reading that ended it (updated_at).
 */
export function billingEndedAt(b: LineReleaseBilling | null | undefined): number | null {
  if (!b || b.mode !== "stripe" || receptionistOn(b.status)) return null;
  const unpaid = b.status === "unpaid";
  const times = [
    b.trial_end,
    unpaid ? null : b.current_period_end,
    b.cancel_at,
    // An unpaid subscription with no failure on record counts from the reading that made it unpaid, never from an
    // old trial's end.
    unpaid ? (b.last_payment_failed_at ?? b.updated_at) : b.last_payment_failed_at,
  ]
    .map(msOf)
    .filter((t): t is number => t !== null);
  return times.length ? Math.max(...times) : msOf(b.updated_at);
}

/** What the sweep has already told the owner about this line (lines.facts.release_warning). */
export interface LineReleaseWarned {
  /** When the warning went. */
  at: string;
  /** The end it was about: a workspace that resumed and ended again is warned again. */
  ended_at: string;
}

export type LineReleaseStep =
  | { step: "keep" }
  | { step: "wait"; endedAt: number; releaseAt: number }
  | { step: "warn"; endedAt: number; releaseAt: number }
  | { step: "release"; endedAt: number; releaseAt: number };

/**
 * One line's next step. `keep` while the subscription pays; `wait` until the warning is due; `warn` once for each end;
 * `release` when the grace is over AND the warning has had its week -- a grace set late, or a sweep that was down,
 * warns first and releases a week after, never at once.
 */
export function lineReleaseStep(
  billing: LineReleaseBilling | null | undefined,
  afterDays: number,
  warned: LineReleaseWarned | null | undefined,
  nowMs: number,
): LineReleaseStep {
  const endedAt = billingEndedAt(billing);
  if (endedAt === null) return { step: "keep" };
  const releaseAt = endedAt + afterDays * DAY_MS;
  const warnedAt = warned && msOf(warned.ended_at) === endedAt ? msOf(warned.at) : null;
  if (warnedAt === null) {
    return nowMs >= releaseAt - LINE_RELEASE_WARN_DAYS * DAY_MS
      ? { step: "warn", endedAt, releaseAt }
      : { step: "wait", endedAt, releaseAt };
  }
  const due = Math.max(releaseAt, warnedAt + LINE_RELEASE_WARN_DAYS * DAY_MS);
  return nowMs >= due ? { step: "release", endedAt, releaseAt: due } : { step: "wait", endedAt, releaseAt: due };
}

/** The day a warned release happens, as the warning names it: its own date or a week after the warning, the later. */
export function lineReleaseDay(releaseAt: number, nowMs: number): number {
  return Math.max(releaseAt, nowMs + LINE_RELEASE_WARN_DAYS * DAY_MS);
}

export interface LineReleaseWordsInput {
  /** The number that goes, E.164. */
  number: string;
  /** The day it goes. */
  on: number;
  /** The owner's own number that forwards to it, E.164, when one does. */
  forwardedFrom: string | null;
  /** Billing, where it is resumed. */
  billingUrl: string | null;
}

/** The warning, a week before (the bell and the email say the same). */
export function lineReleaseWarning(i: LineReleaseWordsInput): { subject: string; body: string } {
  const number = formatPhoneDisplay(i.number) ?? i.number;
  const on = dayWords(new Date(i.on).toISOString());
  const kept = formatPhoneDisplay(i.forwardedFrom);
  const lines = [
    `Your subscription ended, so your receptionist's number, ${number}, goes back to the phone company on ${on}. After that it can't be got back, and callers to it reach nobody.`,
    kept
      ? `${kept} forwards its calls to it. Switch that forwarding off before ${on}, or those calls will go nowhere.`
      : null,
    i.billingUrl
      ? `To keep the number, resume from Billing: ${i.billingUrl}`
      : "To keep the number, resume from Billing.",
  ].filter((x): x is string => !!x);
  return { subject: `Your number ${number} goes back on ${on}`, body: `${lines.join("\n\n")}\n` };
}

/** After it went (the bell and the email say the same). */
export function lineReleasedWords(i: Omit<LineReleaseWordsInput, "on">): { subject: string; body: string } {
  const number = formatPhoneDisplay(i.number) ?? i.number;
  const kept = formatPhoneDisplay(i.forwardedFrom);
  const lines = [
    `${number} went back to the phone company, as we wrote a week ago. Your receptionist no longer answers on it.`,
    kept ? `If ${kept} still forwards to it, switch that forwarding off: those calls go nowhere now.` : null,
    "If you resume, Setup picks a new number with you.",
  ].filter((x): x is string => !!x);
  return { subject: `Your number ${number} was released`, body: `${lines.join("\n\n")}\n` };
}
