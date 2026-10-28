import { agoWords, WEEK_MS } from "../shared/time.js";
import { clockDate } from "../shared/clock.js";
import { relationshipOnRecord, STOP_WORDS } from "../consent/consent.js";
import { channelsWords, coveredChannels } from "../consent/consent-channels.js";
import { consentSourceLabel, STOP_ENDED_OFFERS_SOURCE } from "./person-consent.js";
import { fmtDate, ts } from "./person-helpers.js";
export function ago(ms, tz, nowMs) {
  return agoWords(ms, nowMs, { dateAfterMs: WEEK_MS, date: (at) => clockDate(at, tz, nowMs) });
}
export function theirTurnWords(last) {
  if (last.who !== "they") return null;
  return last.kind === "call" ? "they called last" : "they wrote last";
}
export function heardAt(r) {
  const wrote = ts(r.last_inbound_at) ?? (r.last_message_direction === "inbound" ? ts(r.last_message_at) : null);
  const at = [wrote, ts(r.last_inbound_call_at ?? null)].filter((x) => x !== null);
  return at.length ? Math.max(...at) : null;
}
export function lastContactOf(r, tz, nowMs) {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  if (m === null && k === null) {
    return {
      ts: null,
      at: null,
      kind: null,
      who: null,
      by: "No contact recorded",
      when: "",
      label: "No contact recorded"
    };
  }
  if (k !== null && (m === null || k > m)) {
    const theirs = ts(r.last_inbound_call_at) === k;
    const by = theirs ? "Phoned" : "We called";
    const when2 = ago(k, tz, nowMs);
    return {
      ts: k,
      at: r.last_call_at,
      kind: "call",
      who: theirs ? "they" : "system",
      by,
      when: when2,
      label: `${by} \xB7 ${when2}`
    };
  }
  const who = r.last_message_direction === "inbound" ? "they" : r.last_message_sender === "human" ? "team" : r.last_message_sender === "ai" ? "receptionist" : "system";
  const answered = heardAt(r) !== null;
  const verb = who === "they" ? "They wrote" : who === "team" ? answered ? "Your team replied" : "Your team wrote" : who === "receptionist" ? answered ? "Receptionist replied" : "Receptionist wrote" : "We sent";
  const when = ago(m, tz, nowMs);
  return { ts: m, at: r.last_message_at, kind: "message", who, by: verb, when, label: `${verb} \xB7 ${when}` };
}
export function firstContactOf(r, tz, nowMs) {
  const f = ts(r.first_contact_at);
  if (f !== null) return { ts: f, label: fmtDate(f, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  const e = ts(r.earliest_row_at);
  if (e !== null && r.has_backfill)
    return { ts: e, label: `Before ${fmtDate(e, tz, nowMs)}`, estimate: true, evidence: false };
  if (e !== null) return { ts: e, label: fmtDate(e, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  return { ts: null, label: "\u2014", estimate: true, evidence: false };
}
function offersSub(r, marketing, tz, nowMs) {
  if (marketing === "opted_out") return "no offers";
  if (marketing !== "opted_in")
    return r.marketing_consent_source === STOP_ENDED_OFFERS_SOURCE ? "their yes ended when they said stop" : "never asked about offers";
  const when = ts(r.marketing_consent_updated_at ?? null);
  const how = consentSourceLabel(r.marketing_consent_source ?? null);
  const date = when !== null ? fmtDate(when, tz, nowMs) : "recorded";
  return `${how ? `${how} \xB7 ` : ""}${date} \xB7 ${channelsWords(coveredChannels(r.marketing_channels))}`;
}
const EMAIL_OFFERS_SOURCES = {
  customer_message: "Their own message",
  form: "Sign-up form",
  confirmed_signup: "Confirmed their sign-up by email",
  unsubscribe: "Pressed Unsubscribe",
  complaint: "Marked an email as spam",
  reply: "Said no in a reply"
};
function emailOffersOf(r, relationship, tz, nowMs) {
  const answer = r.email_marketing;
  const emailMarketing = answer === "opted_in" || answer === "opted_out" || answer === "unknown" ? answer : null;
  const source = r.email_marketing_source ?? null;
  const when = ts(r.email_marketing_updated_at ?? null);
  const how = source ? EMAIL_OFFERS_SOURCES[source] ?? source : null;
  const dated = `${how ? `${how} \xB7 ` : ""}${when !== null ? fmtDate(when, tz, nowMs) : "recorded"}`;
  if (emailMarketing === "opted_in")
    return { emailMarketing, emailMarketingSource: source, emailOffersLabel: "Yes", emailOffersSub: dated };
  if (emailMarketing === "opted_out")
    return { emailMarketing, emailMarketingSource: source, emailOffersLabel: "Unsubscribed", emailOffersSub: dated };
  return {
    emailMarketing,
    emailMarketingSource: source,
    emailOffersLabel: emailMarketing === "unknown" ? "Not asked" : null,
    emailOffersSub: emailMarketing === null ? "" : relationship ? "they have dealt with you, so offers may go by email" : "no offers by email until they ask for them"
  };
}
export function consentOf(r, tz, nowMs) {
  const dnc = !!r.dnc;
  const state = r.consent === "opted_out" || dnc ? "opted_out" : r.consent === "opted_in" ? "opted_in" : "unknown";
  const when = ts(r.consent_updated_at);
  const date = when !== null ? fmtDate(when, tz, nowMs) : "recorded";
  const how = consentSourceLabel(r.consent_source);
  const sub = state === "opted_out" ? r.consent_source === "customer_message" ? `STOP received${when !== null ? ` ${fmtDate(when, tz, nowMs)}` : ""}` : `${how ? `${how} \xB7 ` : ""}${date}` : state === "opted_in" ? `${how ? `${how} \xB7 ` : ""}${date} \xB7 ${channelsWords(coveredChannels(r.consent_channels))}` : "no opt-in recorded";
  const marketing = dnc || r.consent === "opted_out" ? "opted_out" : r.marketing_consent === "opted_in" ? "opted_in" : r.marketing_consent === "opted_out" ? "opted_out" : "unknown";
  const marketingSub = offersSub(r, marketing, tz, nowMs);
  const relationship = relationshipOnRecord({
    lastWroteAt: r.last_wrote_at ?? null,
    lastInboundCallAt: r.last_inbound_call_at ?? null,
    hasDeal: !!r.deal_id
  });
  return {
    state,
    dnc,
    label: state === "opted_out" ? STOP_WORDS.pill : state === "opted_in" ? "Opted in" : "Unknown",
    // The answer in the words its own control uses (Yes, Not asked, No), as marketingLabel is the offers answer's.
    answerLabel: state === "opted_in" ? "Yes" : state === "opted_out" ? "No" : "Not asked",
    sub,
    source: r.consent_source ?? null,
    marketing,
    marketingSource: r.marketing_consent_source ?? null,
    marketingSub,
    // The offers answer in the words People's Offers column uses, so a list and the page agree.
    marketingLabel: marketing === "opted_in" ? "Yes" : marketing === "opted_out" ? "No" : "Not asked",
    channels: r.consent_channels ?? null,
    marketingChannels: r.marketing_channels ?? null,
    ...emailOffersOf(r, relationship, tz, nowMs),
    relationship
  };
}
