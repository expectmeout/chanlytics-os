import { allowanceBeforeSend } from "../broadcasts/reach-for.js";
import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { triggerOf } from "./playbook-triggers.js";
export function runCapOf(p) {
  return triggerOf(p.trigger)?.kind === "visit" ? 0 : p.cap_per_run ?? 0;
}
const noOne = () => ({ whatsapp: 0, sms: 0, email: 0 });
export function runReadingOf(drawn, trigger, caps) {
  const whole = drawn.reach.by_channel ?? noOne();
  const reading = { candidates: drawn.reach.will, by_channel: whole };
  const below = new Set(
    caps.map((cap) => runCapOf({ trigger, cap_per_run: cap })).filter((cap) => cap >= 1 && cap < reading.candidates)
  );
  if (below.size === 0 || CONSENT_CHANNELS.filter((c) => whole[c] > 0).length < 2) return reading;
  const last = Math.max(...below);
  const counts = noOne();
  const run_split = {};
  let taken = 0;
  for (const person of drawn.eligible) {
    if (taken === last) break;
    const channel = drawn.channelOf[person.id];
    if (channel) counts[channel] += 1;
    taken += 1;
    if (below.has(taken)) run_split[String(taken)] = { ...counts };
  }
  return { ...reading, run_split };
}
function oneRunByChannel(reading, run) {
  const whole = reading.by_channel;
  if (!whole) return null;
  const cap = runCapOf(run);
  if (cap === 0 || cap >= reading.candidates) return whole;
  const atCap = reading.run_split?.[String(cap)];
  if (atCap) return atCap;
  const carrying = CONSENT_CHANNELS.filter((c) => whole[c] > 0);
  const [only] = carrying;
  return carrying.length === 1 && only ? { ...noOne(), [only]: cap } : null;
}
export function heldBackOfOneRun(reading, run, sent, purpose) {
  const split = oneRunByChannel(reading, run) ?? reading.by_channel;
  return split ? allowanceBeforeSend(split, sent, run.trigger, purpose) : null;
}
