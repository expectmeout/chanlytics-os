/**
 * What a People row says about a person, one fact at a time and each in words: how long ago, why they are
 * escalated, their last and first contact, and both consent answers. toPersonRowVM (person-row.ts) reads them all;
 * the pill's rule (person-state.ts) reads the first contact, and the receptionist's line (person-receptionist.ts) the
 * reason.
 */
import { agoWords, WEEK_MS } from "../shared/time";
import { clockDate } from "../shared/clock";
import { consentSourceLabel, type PersonConsent } from "./person-consent";
import { fmtDate, ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";

/**
 * The escalation reasons in the words an owner uses across a table row.
 * ESCALATION_REASON_LABELS in conversations/escalations.ts are sentences for Today's headlines;
 * these are clauses that follow "Escalated, …".
 */
const REASON_SHORT: Record<string, string> = {
  human_token: "asked for a person",
  non_text: "sent something the receptionist can't read",
  refusal: "the receptionist declined to answer",
  rate_cap: "reply limit reached",
  policy_block: "held by your reply setting",
  policy_ask: "a booking or a question set to Ask me first",
  person_hold: "held for you",
  carriers: "waiting on carriers",
  email_review: "wrote by email",
  send_failed: "a reply failed to send",
  deadman: "no answer in time",
  brain_error: "the receptionist hit an error",
  manual: "flagged by you",
  opt_out: "asked to stop",
  state_unavailable: "memory was unavailable",
  stale: "message arrived late",
  callback: "needs a call back",
  budget: "the day’s model budget is spent",
  paused: "billing is paused",
};

export function reasonShort(reason: string | null | undefined): string {
  if (!reason) return "";
  return REASON_SHORT[reason] ?? reason.replace(/_/g, " ");
}

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
    return { ts: k, at: r.last_call_at, kind: "call", who: "they", label: `Phoned · ${ago(k, tz, nowMs)}` };
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
    ts: m as number,
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
        ? `${how ? `${how} · ` : ""}${date}`
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
  const mWhen = ts(r.marketing_consent_updated_at ?? null);
  const mHow = consentSourceLabel(r.marketing_consent_source ?? null);
  const marketingSub =
    marketing === "opted_in"
      ? `${mHow ? `${mHow} · ` : ""}${mWhen !== null ? fmtDate(mWhen, tz, nowMs) : "recorded"}`
      : marketing === "opted_out"
        ? "no offers"
        : "never asked about offers";
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
  };
}
