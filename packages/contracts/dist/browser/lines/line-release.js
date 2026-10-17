import { receptionistOn, dayWords } from "../workspace/billing.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { DAY_MS } from "../shared/time.js";
export const LINE_RELEASE_WARN_DAYS = 7;
export const LINE_RELEASE_MIN_DAYS = 14;
export const LINE_RELEASE_REPORT_DAYS = 30;
export function lineReleaseAfterDays(raw) {
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= LINE_RELEASE_MIN_DAYS ? n : null;
}
const msOf = (iso) => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};
export function billingEndedAt(b) {
  if (!b || b.mode !== "stripe" || receptionistOn(b.status)) return null;
  const unpaid = b.status === "unpaid";
  const times = [
    b.trial_end,
    unpaid ? null : b.current_period_end,
    b.cancel_at,
    // An unpaid subscription with no failure on record counts from the reading that made it unpaid, never from an
    // old trial's end.
    unpaid ? b.last_payment_failed_at ?? b.updated_at : b.last_payment_failed_at
  ].map(msOf).filter((t) => t !== null);
  return times.length ? Math.max(...times) : msOf(b.updated_at);
}
export function lineReleaseStep(billing, afterDays, warned, nowMs) {
  const endedAt = billingEndedAt(billing);
  if (endedAt === null) return { step: "keep" };
  const releaseAt = endedAt + afterDays * DAY_MS;
  const warnedAt = warned && msOf(warned.ended_at) === endedAt ? msOf(warned.at) : null;
  if (warnedAt === null) {
    return nowMs >= releaseAt - LINE_RELEASE_WARN_DAYS * DAY_MS ? { step: "warn", endedAt, releaseAt } : { step: "wait", endedAt, releaseAt };
  }
  const due = Math.max(releaseAt, warnedAt + LINE_RELEASE_WARN_DAYS * DAY_MS);
  return nowMs >= due ? { step: "release", endedAt, releaseAt: due } : { step: "wait", endedAt, releaseAt: due };
}
export function lineReleaseDay(releaseAt, nowMs) {
  return Math.max(releaseAt, nowMs + LINE_RELEASE_WARN_DAYS * DAY_MS);
}
export function lineReleaseWarning(i) {
  const number = formatPhoneDisplay(i.number) ?? i.number;
  const on = dayWords(new Date(i.on).toISOString());
  const kept = formatPhoneDisplay(i.forwardedFrom);
  const lines = [
    `Your subscription ended, so your receptionist's number, ${number}, goes back to the phone company on ${on}. After that it can't be got back, and callers to it reach nobody.`,
    kept ? `${kept} forwards its calls to it. Switch that forwarding off before ${on}, or those calls will go nowhere.` : null,
    i.billingUrl ? `To keep the number, resume from Billing: ${i.billingUrl}` : "To keep the number, resume from Billing."
  ].filter((x) => !!x);
  return { subject: `Your number ${number} goes back on ${on}`, body: `${lines.join("\n\n")}
` };
}
export function lineReleasedWords(i) {
  const number = formatPhoneDisplay(i.number) ?? i.number;
  const kept = formatPhoneDisplay(i.forwardedFrom);
  const lines = [
    `${number} went back to the phone company, as we wrote a week ago. Your receptionist no longer answers on it.`,
    kept ? `If ${kept} still forwards to it, switch that forwarding off: those calls go nowhere now.` : null,
    "If you resume, Setup picks a new number with you."
  ].filter((x) => !!x);
  return { subject: `Your number ${number} was released`, body: `${lines.join("\n\n")}
` };
}
