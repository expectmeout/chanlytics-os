import {
  isOfferByEmail,
  isOptedOutContact,
  mayMessageFor,
  PURPOSE_REFUSALS,
  relationshipOnRecord
} from "../consent/consent.js";
import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS } from "../consent/consent-channels.js";
import { STOP_WORDS } from "../consent/consent.js";
import { replyWindow } from "../config/policy.js";
import { QUIET_AFTER_DAYS } from "../people/person-state.js";
import { DAY_MS, HOUR_MS } from "../shared/time.js";
export const WRITE_HOLDS = [
  "stopped",
  "no_number",
  "no_address",
  "address_stopped",
  "not_ready",
  "no_history",
  "unsubscribed",
  "no_yes"
];
const heardWire = (c) => c === "whatsapp" || c === "sms" || c === "email" ? c : null;
const HEARD_BY_CALL_MS = QUIET_AFTER_DAYS * DAY_MS;
export function startsOn(wire, heard, now) {
  const called = !!heard.calledAt && now.getTime() - Date.parse(heard.calledAt) <= HEARD_BY_CALL_MS;
  return !(heard.lastWrote === wire || wire !== "email" && called);
}
export const WRITE_HOLD_WORDS = {
  stopped: () => `${STOP_WORDS.said("They")}.`,
  no_number: () => "No number on their page.",
  no_address: () => "No email address on their page.",
  address_stopped: () => "Email to their address has stopped.",
  no_history: () => "A first email to someone with no history with you goes from Campaigns, with its way to unsubscribe.",
  // The send door's own sentence for it (consent.ts), so the sheet and a refused row say the same thing.
  unsubscribed: () => PURPOSE_REFUSALS.unsubscribed,
  no_yes: (wire) => `No yes on record for messages ${CONSENT_CHANNEL_WORDS[wire]}.`
};
export const WRITE_WAY_REFUSED = "A message cannot go to them that way.";
function holdOf(wire, r, { bearing, ready, starts, about }) {
  if (isOptedOutContact(bearing)) return "stopped";
  if (wire === "email") {
    if (!r.email) return "no_address";
    if (r.email_suppressed_at) return "address_stopped";
  } else if (!r.phone_e164) return "no_number";
  if (ready && !ready[wire].ready) return "not_ready";
  if (isOfferByEmail({ channel: wire, purpose: "conversational", proactive: starts, about })) return "no_history";
  const may = mayMessageFor(bearing, "conversational", { proactive: starts, channel: wire, about, begins: starts });
  if (may.ok) return null;
  return may.reason === "unsubscribed" ? "unsubscribed" : "no_yes";
}
export function writeWaysOf(r, ready, now = /* @__PURE__ */ new Date()) {
  const relationship = relationshipOnRecord({
    lastWroteAt: r.last_wrote_at,
    lastInboundCallAt: r.last_inbound_call_at,
    hasDeal: !!r.deal_id
  });
  const about = relationship ? "theirs" : "ours";
  const bearing = {
    consent: r.consent,
    dnc: r.dnc,
    marketing_consent: r.marketing_consent,
    consent_channels: r.consent_channels,
    marketing_channels: r.marketing_channels,
    email_marketing: r.email_marketing,
    has_relationship: relationship
  };
  const heard = { lastWrote: heardWire(r.last_inbound_channel), calledAt: r.last_inbound_call_at ?? null };
  return CONSENT_CHANNELS.map((wire) => {
    const starts = startsOn(wire, heard, now);
    const hold = holdOf(wire, r, { bearing, ready, starts, about });
    const window = replyWindow(wire, r.latest_wa_inbound_at, now);
    const left = window.closesAtIso ? new Date(window.closesAtIso).getTime() - now.getTime() : 0;
    return {
      wire,
      ok: hold === null,
      hold,
      why: hold === null ? null : hold === "not_ready" ? ready?.[wire].why ?? null : WRITE_HOLD_WORDS[hold](wire),
      carries: window.open ? "words" : "approved",
      starts,
      about,
      hours_left: wire === "whatsapp" && window.open ? Math.max(0, Math.floor(left / HOUR_MS)) : null
    };
  });
}
export function defaultWriteWire(ways, lastWrote) {
  const last = heardWire(lastWrote);
  const there = ways.find((w) => w.wire === last && w.ok);
  return (there ?? ways.find((w) => w.ok))?.wire ?? null;
}
export function wayOff(ways, wire) {
  const w = ways.find((x) => x.wire === wire);
  return w && !w.ok ? w.why ?? WRITE_WAY_REFUSED : null;
}
