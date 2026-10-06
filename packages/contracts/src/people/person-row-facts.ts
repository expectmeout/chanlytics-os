/**
 * What a People row says about a person, one fact at a time and each in words: how long ago, why they are
 * escalated, their last and first contact, and both consent answers. toPersonRowVM (person-row.ts) reads them all;
 * the pill's rule (person-state.ts) reads the first contact, and the receptionist's line (person-receptionist.ts) the
 * reason.
 */
import { agoWords, WEEK_MS } from "../shared/time";
import { clockDate } from "../shared/clock";
import { relationshipOnRecord } from "../consent/consent";
import { channelsWords, coveredChannels } from "../consent/consent-channels";
import { consentSourceLabel, STOP_ENDED_OFFERS_SOURCE, type PersonConsent } from "./person-consent";
import { fmtDate, ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";

/** "just now" · "5m ago" · "3h ago" · "2d ago", the business's date past a week — the one family (time.ts, clock.ts). */
export function ago(ms: number, tz: string, nowMs: number): string {
  return agoWords(ms, nowMs, { dateAfterMs: WEEK_MS, date: (at) => clockDate(at, tz, nowMs) });
}

/* ------------------------------ row facts -------------------------------- */

export interface PersonLastContact {
  ts: number | null;
  at: string | null;
  kind: "message" | "call" | null;
  who: "they" | "receptionist" | "you" | "system" | null;
  /** "They wrote · 2h ago" */
  label: string;
}

export function lastContactOf(r: PersonRowDto, tz: string, nowMs: number): PersonLastContact {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  if (m === null && k === null) return { ts: null, at: null, kind: null, who: null, label: "No contact recorded" };
  if (k !== null && (m === null || k > m)) {
    // "Phoned" only when THEY did: last_call_at holds the receptionist's own outbound calls too, and the row said
    // "Phoned" over a call we placed (the 2 Oct 2026 audit). heardAt (person-state.ts) already reads it this way.
    const theirs = ts(r.last_inbound_call_at) === k;
    return {
      ts: k,
      at: r.last_call_at,
      kind: "call",
      who: theirs ? "they" : "system",
      label: `${theirs ? "Phoned" : "We called"} · ${ago(k, tz, nowMs)}`,
    };
  }
  const who: PersonLastContact["who"] =
    r.last_message_direction === "inbound"
      ? "they"
      : r.last_message_sender === "human"
        ? "you"
        : r.last_message_sender === "ai"
          ? "receptionist"
          : "system";
  const verb =
    who === "they"
      ? "They wrote"
      : who === "you"
        ? "You replied"
        : who === "receptionist"
          ? "Receptionist replied"
          : "We sent";
  return {
    ts: m,
    at: r.last_message_at,
    kind: "message",
    who,
    label: `${verb} · ${ago(m as number, tz, nowMs)}`,
  };
}

export interface PersonFirstContact {
  ts: number | null;
  /** "Jul 14", "Before Aug 27", or "—" */
  label: string;
  /** True when the only history is an undated import: we know a floor, not a date. */
  estimate: boolean;
  /** True when this date may count as "new" (no imported history). */
  evidence: boolean;
}

export function firstContactOf(r: PersonRowDto, tz: string, nowMs: number): PersonFirstContact {
  const f = ts(r.first_contact_at);
  if (f !== null) return { ts: f, label: fmtDate(f, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  const e = ts(r.earliest_row_at);
  if (e !== null && r.has_backfill)
    return { ts: e, label: `Before ${fmtDate(e, tz, nowMs)}`, estimate: true, evidence: false };
  if (e !== null) return { ts: e, label: fmtDate(e, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  return { ts: null, label: "—", estimate: true, evidence: false };
}

/** One line for the person's profile about offers: how and when they said yes and on which channels, or what they said. */
function offersSub(r: PersonRowDto, marketing: PersonConsent["marketing"], tz: string, nowMs: number): string {
  if (marketing === "opted_out") return "no offers";
  // A yes a stop ended (00323) is not "never asked": they said yes once, and took everything back.
  if (marketing !== "opted_in")
    return r.marketing_consent_source === STOP_ENDED_OFFERS_SOURCE
      ? "their yes ended when they said stop"
      : "never asked about offers";
  const when = ts(r.marketing_consent_updated_at ?? null);
  const how = consentSourceLabel(r.marketing_consent_source ?? null);
  const date = when !== null ? fmtDate(when, tz, nowMs) : "recorded";
  return `${how ? `${how} · ` : ""}${date} · ${channelsWords(coveredChannels(r.marketing_channels))}`;
}

/** How an answer about email offers was given, in a person's page's words. */
const EMAIL_OFFERS_SOURCES: Record<string, string> = {
  customer_message: "Their own message",
  form: "Sign-up form",
  unsubscribe: "Pressed Unsubscribe",
  complaint: "Marked an email as spam",
  reply: "Said no in a reply",
};

/**
 * The person's answer about offers by email, in a word and a line (the person's page, beside the two consent rows): Yes
 * once they asked for offers by email, Unsubscribed once they said no to them, Not asked until then. A row read without the
 * answer says none (null): nothing is invented. Offers by email may also go to someone who has dealt with the business,
 * and "not asked" says so quietly.
 */
function emailOffersOf(
  r: PersonRowDto,
  relationship: boolean,
  tz: string,
  nowMs: number,
): Pick<PersonConsent, "emailMarketing" | "emailMarketingSource" | "emailOffersLabel" | "emailOffersSub"> {
  const answer = r.email_marketing;
  const emailMarketing: PersonConsent["emailMarketing"] =
    answer === "opted_in" || answer === "opted_out" || answer === "unknown" ? answer : null;
  const source = r.email_marketing_source ?? null;
  const when = ts(r.email_marketing_updated_at ?? null);
  const how = source ? (EMAIL_OFFERS_SOURCES[source] ?? source) : null;
  const dated = `${how ? `${how} · ` : ""}${when !== null ? fmtDate(when, tz, nowMs) : "recorded"}`;
  if (emailMarketing === "opted_in")
    return { emailMarketing, emailMarketingSource: source, emailOffersLabel: "Yes", emailOffersSub: dated };
  if (emailMarketing === "opted_out")
    return { emailMarketing, emailMarketingSource: source, emailOffersLabel: "Unsubscribed", emailOffersSub: dated };
  return {
    emailMarketing,
    emailMarketingSource: source,
    emailOffersLabel: emailMarketing === "unknown" ? "Not asked" : null,
    emailOffersSub:
      emailMarketing === null
        ? ""
        : relationship
          ? "they have dealt with you, so offers may go by email"
          : "no offers by email until they ask for them",
  };
}

export function consentOf(r: PersonRowDto, tz: string, nowMs: number): PersonConsent {
  const dnc = !!r.dnc;
  const state: PersonConsent["state"] =
    r.consent === "opted_out" || dnc ? "opted_out" : r.consent === "opted_in" ? "opted_in" : "unknown";
  const when = ts(r.consent_updated_at);
  const date = when !== null ? fmtDate(when, tz, nowMs) : "recorded";
  const how = consentSourceLabel(r.consent_source);
  const sub =
    state === "opted_out"
      ? r.consent_source === "customer_message"
        ? `STOP received${when !== null ? ` ${fmtDate(when, tz, nowMs)}` : ""}`
        : `${how ? `${how} · ` : ""}${date}`
      : state === "opted_in"
        ? `${how ? `${how} · ` : ""}${date} · ${channelsWords(coveredChannels(r.consent_channels))}`
        : "no opt-in recorded";
  // The offers answer, judged on its own. A STOP or a do-not-call stops
  // everything, so it shows here as opted_out too -- but declining offers never
  // reads back as an opt-out of conversation.
  const marketing: PersonConsent["marketing"] =
    dnc || r.consent === "opted_out"
      ? "opted_out"
      : r.marketing_consent === "opted_in"
        ? "opted_in"
        : r.marketing_consent === "opted_out"
          ? "opted_out"
          : "unknown";
  const marketingSub = offersSub(r, marketing, tz, nowMs);
  // They wrote (in a person's own words: last_wrote_at, not an automatic reply or a list's mail), called or have a deal: all
  // three are columns people_list returns (the newest deal's id is any deal's). A row read before 00299 has no last_wrote_at,
  // which is no relationship on record: an offer by email then asks for the person's own yes.
  const relationship = relationshipOnRecord({
    lastWroteAt: r.last_wrote_at ?? null,
    lastInboundCallAt: r.last_inbound_call_at ?? null,
    hasDeal: !!r.deal_id,
  });
  return {
    state,
    dnc,
    label: state === "opted_out" ? "Opted out" : state === "opted_in" ? "Opted in" : "Unknown",
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
    relationship,
  };
}
