/** Message versions: email rules. */

import { fillSlots, numberedSlots, slotOutside, slotsOut, slotsWritten } from "../slot-sets";
import type { SlotSet, SlotValue } from "../slot-sets";
import {
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  SMS_SEGMENTS_MAX,
  SMS_SEGMENTS_WARN,
  VERSION_CHANNELS,
  smsStopLine,
  smsVersionSegments,
  type OwnVersionChannel,
  type VersionChannel,
} from "./channels";

/** A version's own words, as a page edits them. A text version has no subject. */
export interface VersionWords {
  subject: string | null;
  body: string;
}

export type VersionCheck = { ok: true; value: VersionWords; warnings: string[] } | { ok: false; error: string };

/** Words as a page or a route hands them over: a string with its line endings read as LF and its ends trimmed. */
function clean(s: unknown): string {
  return (typeof s === "string" ? s : "").replace(/\r\n/g, "\n").trim();
}

/** The slot rule's sentence for a numbered slot the message has none for. `slots` is how many it has. */
function numberedRefusal(extra: string, slots: number): string {
  return slots === 0
    ? `This message fills no values, so {{${extra}}} has nothing to take.`
    : `{{${extra}}} is not one of this message's values: it has ${slots === 1 ? "{{1}}" : `{{1}} to {{${slots}}}`}.`;
}

/**
 * The slot rule: a version fills its message's slots and no others. `slots` is how many the message has. Null when
 * the words keep to them, else the sentence that says which one does not.
 */
export function versionSlotsRefusal(text: string, slots: number): string | null {
  const extra = slotOutside(numberedSlots(slots), text);
  return extra === null ? null : numberedRefusal(extra, slots);
}

/** What the checks every email's words pass find wrong, by the field it is in. */
export type EmailProblem =
  "subject_missing" | "subject_too_long" | "body_missing" | "body_too_long" | "unknown_slot" | "stray_brace";

/** One thing wrong with an email's words. `Extra` is the problems a kind of email finds beyond the shared ones. */
export interface EmailIssue<Extra extends string = never> {
  field: "subject" | "body";
  problem: EmailProblem | Extra;
  /** The slot as it was written, for unknown_slot. */
  slot?: string;
}

/**
 * What a kind of email keeps to: the slots it fills, whether it has a subject, how long each half may be, anything it
 * asks of its words beyond that, and its own sentences for what is wrong. A campaign message's rules are
 * campaignEmailRules; a reach-out's are reachOutRules (reach-out/words/opening.ts). One check reads them all (emailIssues). Its
 * three functions are methods, so a page that holds the rules of either kind holds them as `EmailRules<string>`.
 */
export interface EmailRules<Extra extends string = never> {
  slots: SlotSet;
  /** Whether the email has a subject of its own: a reach-out's later steps answer the one before, and have none. */
  subject: boolean;
  subjectMax: number;
  bodyMax: number;
  /** What only this kind asks of a subject, and of a body, once they are there and in their length: the problems found. */
  subjectAlso?(subject: string): Extra[];
  bodyAlso?(body: string): Extra[];
  /** A problem said for the person who wrote the words. */
  say(issue: EmailIssue<Extra>): string;
  /** What the sender adds that a preview does not draw, said in one line. */
  foot: string;
}

/**
 * Everything wrong with an email's words, in the order a person is told: the subject's, the body's, the slots each names
 * (one the kind does not have, a brace left with no pair), then what the kind adds. Pure over the words as given: the
 * entry points that take them from a person clean them first.
 */
export function emailIssues<Extra extends string>(
  input: { subject: string | null; body: string },
  rules: EmailRules<Extra>,
): Array<EmailIssue<Extra>> {
  const out: Array<EmailIssue<Extra>> = [];
  const at = (field: "subject" | "body", problem: EmailProblem | Extra, slot?: string) =>
    out.push(slot === undefined ? { field, problem } : { field, problem, slot });
  const subject = rules.subject ? (input.subject ?? "") : null;
  if (subject !== null) {
    if (!subject) at("subject", "subject_missing");
    else if (subject.length > rules.subjectMax) at("subject", "subject_too_long");
    if (subject) for (const p of rules.subjectAlso?.(subject) ?? []) at("subject", p);
  }
  if (!input.body) at("body", "body_missing");
  else if (input.body.length > rules.bodyMax) at("body", "body_too_long");
  for (const [field, text] of [
    ["subject", subject],
    ["body", input.body],
  ] as const) {
    if (!text) continue;
    const written = slotsWritten(rules.slots, text);
    for (const key of written.keys) if (!rules.slots.keys.includes(key)) at(field, "unknown_slot", key);
    if (written.stray) at(field, "stray_brace");
  }
  if (input.body) for (const p of rules.bodyAlso?.(input.body) ?? []) at("body", p);
  return out;
}

/** The sentence for each thing a campaign message's email may get wrong; `slots` is how many values the message has. */
function campaignSay(slots: number) {
  return (emailIssue: EmailIssue): string => {
    switch (emailIssue.problem) {
      case "subject_missing":
        return "Give the email a subject.";
      case "subject_too_long":
        return `The subject must be under ${EMAIL_SUBJECT_MAX} characters.`;
      case "body_missing":
        return "Write the email.";
      case "body_too_long":
        return `The email must be under ${EMAIL_BODY_MAX} characters.`;
      case "unknown_slot":
        return numberedRefusal(emailIssue.slot ?? "", slots);
      case "stray_brace":
        return "Braces are for values only, two on each side.";
    }
  };
}

/** What a campaign message's email keeps to: its message's numbered slots, a subject up to Meta's heading, a body up to 2,000. */
export function campaignEmailRules(slots: number | SlotSet): EmailRules {
  const set = typeof slots === "number" ? numberedSlots(slots) : slots;
  return {
    slots: set,
    subject: true,
    subjectMax: EMAIL_SUBJECT_MAX,
    bodyMax: EMAIL_BODY_MAX,
    say: campaignSay(set.keys.length),
    foot: "The footer is added when it goes, and an offer also gets its unsubscribe link.",
  };
}

/** An email's words as a person hands them over, checked by its kind's rules: the first thing wrong, or the words and what reads badly. */
function checkEmail<Extra extends string>(
  details: { subject?: unknown; body?: unknown },
  rules: EmailRules<Extra>,
): VersionCheck {
  const subject = rules.subject ? clean(details.subject).replace(/\s+/g, " ") : null;
  const body = clean(details.body);
  const first = emailIssues({ subject, body }, rules)[0];
  if (first) return { ok: false, error: rules.say(first) };
  const warnings: string[] = [];
  if (subject && slotsOut(rules.slots, subject).trim() === "")
    warnings.push("A subject that is only a value reads as empty to anyone it misses.");
  if (/\n{3,}/.test(body)) warnings.push("More than one blank line in a row reads as a gap in most inboxes.");
  return { ok: true, value: { subject, body }, warnings };
}

/**
 * An email version, checked: a subject and a body, each within its length, filling only its message's slots. The second
 * argument is how many numbered slots a campaign message has, or the rules of another kind of email (a reach-out's). The
 * warnings are what reads badly in an inbox, not what fails.
 */
export function validateEmailVersion(details: { subject?: unknown; body?: unknown }, slots: number): VersionCheck;

export function validateEmailVersion<Extra extends string>(
  details: { subject?: unknown; body?: unknown },
  rules: EmailRules<Extra>,
): VersionCheck;

export function validateEmailVersion<Extra extends string>(
  details: { subject?: unknown; body?: unknown },
  rules: number | EmailRules<Extra>,
): VersionCheck {
  return typeof rules === "number" ? checkEmail(details, campaignEmailRules(rules)) : checkEmail(details, rules);
}

/**
 * A text version, checked: a body that, with the STOP line the sender adds, fits the segments a text may take, filling
 * only the message's slots. Over two segments it warns, since each one is billed.
 */
export function validateSmsVersion(details: { body?: unknown }, slots: number, language: string): VersionCheck {
  const body = clean(details.body);
  if (!body) return { ok: false, error: "Write the text." };
  const refusal = versionSlotsRefusal(body, slots);
  if (refusal) return { ok: false, error: refusal };
  const sent = smsVersionSegments(body, language);
  if (sent.segments > SMS_SEGMENTS_MAX)
    return {
      ok: false,
      error: `With the STOP line this text takes ${sent.segments} parts; keep it to ${SMS_SEGMENTS_MAX}.`,
    };
  const warnings: string[] = [];
  if (sent.segments > SMS_SEGMENTS_WARN)
    warnings.push(`With the STOP line this text goes as ${sent.segments} parts, and each part is billed.`);
  return { ok: true, value: { subject: null, body }, warnings };
}

/** One version checked on its own channel's rules. */
export function validateOwnVersion(
  channel: OwnVersionChannel,
  details: { subject?: unknown; body?: unknown },
  slots: number,
  language: string,
): VersionCheck {
  return channel === "email" ? validateEmailVersion(details, slots) : validateSmsVersion(details, slots, language);
}

/** What an email or a text version is stored as: Meta's component shape, an email's subject a text HEADER. */
export function versionComponents(
  channel: OwnVersionChannel,
  versionWords: VersionWords,
): Array<Record<string, unknown>> {
  const body = { type: "BODY", text: versionWords.body };
  return channel === "email" && versionWords.subject
    ? [{ type: "HEADER", format: "TEXT", text: versionWords.subject }, body]
    : [body];
}

function partText(components: unknown, type: string): string | null {
  if (!Array.isArray(components)) return null;
  const part = components.find((c) => {
    const kind = !!c && typeof c === "object" ? (c as { type?: unknown }).type : null;
    return typeof kind === "string" && kind.toUpperCase() === type;
  }) as { text?: unknown } | undefined;
  // A part with no words in it says nothing: the row's preview, or its heading, speaks instead.
  return typeof part?.text === "string" && part.text.trim() ? part.text : null;
}

/**
 * A version's words read back from its row: the subject from the HEADER (an email's only), the body from the BODY,
 * else the row's preview, which every row carries. A row as the templates read sends it to a page has left Meta's
 * component array behind and carries its text heading as `header` (templateParts), which is the same subject.
 */
export function versionWords(row: {
  channel: string;
  components?: unknown;
  header?: string | null;
  body_preview?: string | null;
}): VersionWords {
  return {
    subject: row.channel === "email" ? (partText(row.components, "HEADER") ?? row.header ?? null) : null,
    body: partText(row.components, "BODY") ?? row.body_preview ?? "",
  };
}

/**
 * One person's copy of a version: the slots filled (fillSlots, over `set` where they are named), and for a text the STOP
 * line the sender adds. An email's footer and unsubscribe are the sender's (they name the business and the reason), so
 * they are not drawn here. The one fill: a campaign's send, a reach-out's, and every preview of either.
 */
export function renderOwnVersion(
  channel: OwnVersionChannel,
  versionWords: VersionWords,
  values: readonly SlotValue[],
  language: string,
  set?: SlotSet,
): VersionWords {
  const body = fillSlots(versionWords.body, values, set);
  return {
    subject: channel === "email" && versionWords.subject ? fillSlots(versionWords.subject, values, set) : null,
    body: channel === "sms" ? `${body}\n${smsStopLine(language)}` : body,
  };
}

/** A reach-out's email is a version row too: its name is `reach_out_` and its step's id, with no dashes (00211's writer). */
const REACH_OUT_PREFIX = "reach_out_";

/** Whether a version row is a reach-out's (Reach out Part 4): an email of a chain, edited in its place (step 5). */
export function isReachOutRow(row: { name: string }): boolean {
  return row.name.startsWith(REACH_OUT_PREFIX);
}

/** The name a reach-out step's email is filed under: what reach_out_save writes for the step. */
export function reachOutRowName(stepId: string): string {
  return `${REACH_OUT_PREFIX}${stepId.replace(/-/g, "")}`;
}

/** The step a reach-out email's name says it is the words of: its id with the dashes put back; null for any other name. */
export function reachOutStepOf(name: string): string | null {
  const hex = name.startsWith(REACH_OUT_PREFIX) ? name.slice(REACH_OUT_PREFIX.length) : "";
  const parts = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/.exec(hex);
  return parts ? parts.slice(1).join("-") : null;
}

/**
 * A message's versions among the workspace's template rows: the rows of its name, by channel. The reach-out's emails
 * are no campaign message's (they are filed under a name of their own, edited in place), and a channel a message has
 * nothing on is an empty list.
 */
export function versionsOf<T extends { name: string; channel: string }>(
  rows: readonly T[],
  name: string,
): Record<VersionChannel, T[]> {
  const out: Record<VersionChannel, T[]> = { whatsapp: [], email: [], sms: [] };
  for (const r of rows) {
    if (r.name !== name || isReachOutRow(r)) continue;
    if ((VERSION_CHANNELS as readonly string[]).includes(r.channel)) out[r.channel as VersionChannel].push(r);
  }
  return out;
}

/**
 * The states of a message's version a send can go by: approved, or in WhatsApp's review (a campaign by email too holds
 * its WhatsApp people until it is approved). What a plan reuses a message by (contracts ask/plan/plan.ts, journey/plan.ts).
 */
export const LIVE_VERSION_STATES: ReadonlySet<string> = new Set(["approved", "pending"]);

/** Each `{{…}}` a version's words hold, sorted: what a rewrite of them must keep, one for one. */
const valuesHeld = (w: { subject: string | null; body: string }): string[] =>
  [...`${w.subject ?? ""} ${w.body}`.matchAll(/\{\{[^{}]+\}\}/g)].map((m) => m[0]).sort();

/**
 * Whether words written again keep every value the words before held (`{{1}}`, a reach-out's `{{opening}}`): the same
 * ones, none dropped, none added, the subject's counted with the body's. What Ask's Warmer and Shorter are held to.
 */
export function keepsValues(
  before: { subject: string | null; body: string },
  after: { subject: string | null; body: string },
): boolean {
  const a = valuesHeld(before);
  const b = valuesHeld(after);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
