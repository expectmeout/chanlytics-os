import { isOfferByEmail } from "../consent/consent.js";
import { dayInZone } from "../calendar/zone-math.js";
import { wallClockAt } from "../shared/clock.js";
import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { whyNotReceive } from "../people/person-consent.js";
import { triggerOf } from "../playbooks/playbook-triggers.js";
import { emailOffersOpen, OFFERS_BY_EMAIL_WORDS } from "./email-offers.js";
import { whatsappOffersOpen } from "./whatsapp-offers.js";
export const DEFAULT_CAMPAIGN_CHANNELS = ["whatsapp"];
export const NEW_PLAYBOOK_TICKS_EVERY_CHANNEL = true;
export function newCampaignChannels(kind, open) {
  const [first] = open ?? [];
  if (!open || first === void 0) return [...DEFAULT_CAMPAIGN_CHANNELS];
  return kind === "playbook" && NEW_PLAYBOOK_TICKS_EVERY_CHANNEL ? [...open] : [first];
}
export const CHANNEL_WORDS = {
  noOffersByText: "Texts carry no offers.",
  /**
   * What an offer by email says where the read carries no facts about offers (the WhatsApp-alone reading, a page cached before
   * them, Ask's own): the campaigns domain, which is what its absence is. A read that has them says the reason that is true.
   */
  noOffersByEmailYet: OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
  noWhatsApp: "Connect a WhatsApp number first.",
  noTextLine: "No texting line yet.",
  textLineMock: "Your texting line is a test filing: it sends nothing.",
  textLineNotActive: "Your texting line is not approved by the carriers yet.",
  noMailbox: "Set up email in Settings \u203A Connections first.",
  noEmailDomain: "Email is not switched on for this deployment yet.",
  /** What could not be asked of the edge just now: not offered, and not guessed to be ready either. */
  unchecked: "This could not be checked just now."
};
export function channelNeverCarries(channel, purpose) {
  return purpose === "marketing" && channel === "sms" ? CHANNEL_WORDS.noOffersByText : null;
}
export function channelRefuses(channel, purpose, about, ready) {
  const never = channelNeverCarries(channel, purpose);
  if (never) return never;
  if (channel === "whatsapp" && purpose === "marketing") {
    const offers2 = ready.whatsapp.offers;
    return offers2 && !offers2.ok ? offers2.why : null;
  }
  if (!isOfferByEmail({ channel, purpose, proactive: true, about })) return null;
  const offers = ready.email.offers;
  return offers?.ok ? null : offers?.why ?? CHANNEL_WORDS.noOffersByEmailYet;
}
export function offersNote(ready) {
  const byWhatsApp = channelRefuses("whatsapp", "marketing", "ours", ready) === null;
  const byEmail = channelRefuses("email", "marketing", "ours", ready) === null;
  const noText = "The text line is registered with the carriers for replies and appointment messages, so nothing promotional is sent by text";
  const paused = ready.whatsapp.offers?.why ?? "";
  if (byWhatsApp && byEmail)
    return `Offers and news go by WhatsApp and by email. ${noText}; someone who has only ever texted you hears about offers on WhatsApp once they say yes there, or by email if you have their address and they have not said no.`;
  if (byWhatsApp)
    return `Offers and news go by WhatsApp only. ${noText}; someone who has only ever texted you hears about offers once they say yes on WhatsApp.`;
  if (byEmail)
    return `Offers and news go by email only for now. ${paused} ${noText}; someone hears about offers by email if you have their address and they have not said no.`;
  return `Offers and news have no channel right now. ${paused} ${noText}, and offers by email wait until email is set up for them.`;
}
export function channelsReady(f) {
  const waNow = !f.whatsapp ? { ready: false, why: CHANNEL_WORDS.noWhatsApp } : f.whatsapp.canSend ? { ready: true, why: null } : { ready: false, why: f.whatsapp.refusal ?? CHANNEL_WORDS.noWhatsApp };
  const wa = f.whatsapp && f.whatsapp.number !== void 0 ? { ...waNow, offers: whatsappOffersOpen(f.whatsapp.number) } : waNow;
  const sms = !f.textLine ? { ready: false, why: CHANNEL_WORDS.noTextLine } : f.textLine.reg_mock ? { ready: false, why: CHANNEL_WORDS.textLineMock } : f.textLine.sms_state === "active" ? { ready: true, why: null } : { ready: false, why: CHANNEL_WORDS.textLineNotActive };
  const emailNow = f.email.domain === null ? { ready: false, why: CHANNEL_WORDS.unchecked, unchecked: true } : !f.email.domain ? { ready: false, why: CHANNEL_WORDS.noEmailDomain } : f.email.mailbox ? { ready: true, why: null } : { ready: false, why: CHANNEL_WORDS.noMailbox };
  const email = f.email.offers ? { ...emailNow, offers: emailOffersOpen(f.email.offers, CHANNEL_WORDS.unchecked) } : emailNow;
  return { whatsapp: wa, sms, email, ...f.paused ? { paused: true } : {} };
}
export function channelChoices(ready, purpose, about) {
  return CONSENT_CHANNELS.map((channel) => {
    const refuses = channelRefuses(channel, purpose, about, ready);
    if (refuses) return { channel, ok: false, why: refuses };
    return { channel, ok: ready[channel].ready, why: ready[channel].why };
  });
}
const HELD_ORDER = {
  stopped: 0,
  unsubscribed: 1,
  no_yes: 2,
  no_number: 3,
  no_address: 4,
  address_stopped: 5,
  no_channel: 6
};
export const HELD_ON = Object.keys(HELD_ORDER).sort(
  (a, b) => HELD_ORDER[a] - HELD_ORDER[b]
);
export function reachFor(r, purpose, o) {
  const usable = CONSENT_CHANNELS.filter(
    (c) => o.channels.includes(c) && o.ready[c].ready && channelRefuses(c, purpose, o.about, o.ready) === null
  );
  if (usable.length === 0) return { channel: null, held: "no_channel" };
  const last = usable.find((c) => c === r.lastChannel) ?? null;
  const order = last ? [last, ...usable.filter((c) => c !== last)] : usable;
  const why = [];
  for (const c of order) {
    const w = whyNotReceive(r, purpose, c, o.about);
    if (w === null) return { channel: c, held: null };
    why.push(w);
  }
  return { channel: null, held: HELD_ON.find((w) => why.includes(w)) ?? "no_channel" };
}
export function reachSplit(rows, purpose, o) {
  const out = { reached: 0, byChannel: { whatsapp: 0, sms: 0, email: 0 }, held: 0, heldBy: {} };
  for (const r of rows) {
    const p = reachFor(r, purpose, o);
    if (p.channel) {
      out.reached += 1;
      out.byChannel[p.channel] += 1;
    } else {
      out.held += 1;
      out.heldBy[p.held] = (out.heldBy[p.held] ?? 0) + 1;
    }
  }
  return out;
}
const SPLIT_CHANNEL_WORDS = {
  whatsapp: "on WhatsApp",
  sms: "by text",
  email: "by email"
};
export function reachSplitWords(s) {
  const parts = CONSENT_CHANNELS.filter((c) => s.byChannel[c] > 0).map(
    (c) => `${s.byChannel[c]} ${SPLIT_CHANNEL_WORDS[c]}`
  );
  const head = s.reached === 0 ? "Reaches nobody" : parts.length === 1 ? `Reaches ${parts[0]}` : `Reaches ${s.reached}: ${parts.join(", ")}`;
  return s.held > 0 ? `${head} \xB7 ${s.held} can't be reached` : head;
}
export const CAMPAIGN_MONTH_ALLOWANCE = {
  email: 2e3,
  sms: 500
};
export function heldByAllowance(trigger, purpose) {
  const t = trigger ? triggerOf(trigger) : null;
  return !(t?.cls === "booking" && purpose === "conversational");
}
export function nextMonthStart(tz, atMs) {
  const { y, m } = dayInZone(tz, atMs);
  const [year, month] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return wallClockAt(tz, `${year}-${String(month).padStart(2, "0")}-01`, 0, 0);
}
export function monthSentAt(read, at) {
  const next = read.month_sent_next;
  if (next && at >= next.from) return next.sent;
  return read.month_sent ?? null;
}
export function allowanceRoom(channel, sent) {
  return Math.max(0, CAMPAIGN_MONTH_ALLOWANCE[channel] - sent);
}
export function pastAllowance(people, sent, trigger, purpose) {
  if (!heldByAllowance(trigger, purpose)) return [];
  const room = { email: allowanceRoom("email", sent.email), sms: allowanceRoom("sms", sent.sms) };
  const past = [];
  for (const p of people) {
    if (p.channel === "whatsapp") continue;
    if (room[p.channel] > 0) room[p.channel] -= 1;
    else past.push(p);
  }
  return past;
}
function sends(channel, n) {
  const one = channel === "email" ? "email" : "text";
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : `${one}s`}`;
}
const peopleWord = (n) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
export function allowanceBeforeSend(byChannel, sent, trigger, purpose) {
  if (!sent || !heldByAllowance(trigger, purpose)) return null;
  const lines = [];
  for (const channel of ["email", "sms"]) {
    const room = allowanceRoom(channel, sent[channel]);
    const past = byChannel[channel] - room;
    if (past <= 0) continue;
    lines.push(
      room === 0 ? `This month's ${sends(channel, CAMPAIGN_MONTH_ALLOWANCE[channel])} are used up: ${peopleWord(past)} will be held back.` : `Only ${sends(channel, room)} ${room === 1 ? "is" : "are"} left this month: ${past.toLocaleString("en-US")} of these people will be held back.`
    );
  }
  return lines.length > 0 ? lines.join(" ") : null;
}
export function allowanceLine(channel, used) {
  const of = CAMPAIGN_MONTH_ALLOWANCE[channel];
  if (used * 2 < of) return null;
  const noun = channel === "email" ? "emails" : "texts";
  return `${used.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} ${noun} used this month`;
}
export function allowanceLines(sent) {
  if (!sent) return [];
  return ["email", "sms"].flatMap((channel) => allowanceLine(channel, sent[channel]) ?? []);
}
