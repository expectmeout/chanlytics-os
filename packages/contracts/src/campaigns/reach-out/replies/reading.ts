/** Replies: reading. */

import { isSiteRoot, siteHost } from "../../../leads/search/clean";
import { wallClockAt, zoneDayKey } from "../../../shared/clock";
import { normalizeEmail } from "../../../shared/email-address";
import { draftExcerpt } from "../reply-draft";
import { REPLY_INTENT_WORDS, type ReplyIntent, type ReplyReading, type Unread, withinChars } from "./intents";
import {
  BACK_MAX_DAYS,
  REPLY_QUOTE_MAX,
  STEP_WORDS_MAX,
  awayUntilOf,
  backDayOf,
  notNowDayOf,
  stepDayFor,
} from "./words";

/* ---------------------------------------------------------------- the reach of a no (N6) */

/**
 * The address's domain when it is the business's own website's host (siteHost: "www." removed, a platform's host is
 * nobody's own); null otherwise. So one person's no closes a business's own domain, and never a shared ISP's or a
 * free-mail one, which is never a lead's own website. No free-mail list is asked. A website that is a page under the
 * host rather than the host itself (an ISP's "/~joe/", a directory's "/listing/42") is no proof the host is theirs, so
 * only a site's root owns its domain. A lead keeps only its website's host, so `root` is what the finder saw of the
 * whole address (leads.website_root, 00237): false is a page under the host, null a lead found before it was kept.
 * The check's customer-domain hold (customerDomainOf, F6) is another rule and keeps its own.
 */
export function ownedDomainOf(
  address: string | null | undefined,
  website: string | null | undefined,
  root: boolean | null = null,
): string | null {
  const a = normalizeEmail(address);
  const host = siteHost(website);
  if (!a || !host || root === false || !isSiteRoot(website)) return null;
  const domain = a.slice(a.lastIndexOf("@") + 1);
  return domain === host ? domain : null;
}

/* ---------------------------------------------------------------- what a reading does (G6) */

/**
 * What the intake claimed the email is, from its headers (channels' classifyReceived); a report is never kept, so
 * never read. `automated` counts as writing back (00181) and is read as a person's. `owner` is no email at all: what the
 * business wrote back to an email its owner sent from their own inbox, as the owner says it on the lead (00429). It is
 * read as a person's, tells nobody (the owner said it) and drafts nothing (there are no words to answer).
 */
export type ReplyClaim = "person" | "automated" | "auto_reply" | "owner";

export interface ReplyContext {
  claim: ReplyClaim;
  /** When it arrived, and the business's zone. */
  receivedAt: number;
  tz: string;
  /** The lead's business, as its steps and notices name it. */
  business: string;
  /**
   * The address the reach-out wrote to, the lead's website, and the address that wrote back. Each address is a bare
   * one (the intake's `from.address`, channels' addressOf): a display-name form ("Dana <dana@…>") is a header, which
   * normalizeEmail refuses, so it would suppress nothing.
   */
  leadAddress: string | null;
  leadWebsite: string | null;
  /** Whether the finder saw the website as its host's root (00237); null when it was not kept. */
  leadWebsiteRoot?: boolean | null;
  replyFrom: string | null;
  /** A re-read of a reply that was not read when it arrived (G4). */
  reread: boolean;
  /** When this reading is made: a step due "today" is never due before it (a re-read comes days after the reply). */
  readAt: number;
}

/** A step on the lead's person, due a day, for anyone (G11). */
export interface ReplyStep {
  dueOn: string;
  words: string;
}

/** What a step's note is: the check-back a not-now asked for, or a first note to the person a wrong person named. */
export type ReplyAheadKind = "again" | "referral";

/**
 * The note a step arrives with (decision 0120, D7): written by the reply's own job at `at`, the morning of a not-now's
 * day, or at once for a wrong person who named an address, and kept with the step, never sent by itself. `to` is the
 * address a wrong person named, whom the note is to; null for a not-now, whose note goes on their own thread.
 */
export interface ReplyAhead {
  kind: ReplyAheadKind;
  at: string;
  to: string | null;
}

export interface ReadingPlan {
  /** The chain stops for this lead. */
  stops: boolean;
  /** The lead moves to Talking (lead_convert_by, how 'reply'). */
  convert: boolean;
  /** Said no, through the one consent door (set_email_marketing, source 'reply'). */
  saidNo: boolean;
  /** A no's reach beside the addresses the consent door suppresses: the reply's own From when it is another address. */
  suppressFrom: string | null;
  /** And the business's own domain (N6). */
  suppressDomain: string | null;
  /** leads.resume_at: 9:00 in the business's zone on the day they named (G12). */
  resumeAt: string | null;
  /** An automatic out-of-office's until_at (G8). */
  awayUntil: string | null;
  step: ReplyStep | null;
  /** The lead's planned and held sends in live runs are skipped at once, with the door's own refusal as the reason. */
  skipSends: "outreach_wrote_back" | "outreach_away" | null;
  /** What the receptionist drafts (PR 5): an answer, or a line of thanks. */
  draft: "answer" | "thanks" | null;
  /** The note the step on Today arrives with, written on its day (decision 0120, D7); null for none. */
  ahead: ReplyAhead | null;
  /** The owner is told (G16). */
  tell: boolean;
  /** The signer is taken as the writer's name without a press (0052, automatic naming: off until its evals pass). */
  adoptSigner?: boolean;
}

const NO_EFFECT: ReadingPlan = {
  stops: false,
  convert: false,
  saidNo: false,
  suppressFrom: null,
  suppressDomain: null,
  resumeAt: null,
  awayUntil: null,
  step: null,
  skipSends: null,
  draft: null,
  ahead: null,
  tell: false,
};

/** A reply that could not be read is `other` (§4.12): the reading its door is handed. */
export const UNREAD_READING: ReplyReading = { intent: "other", summary: "", day: null, referTo: null, signer: null };

/** The address that wrote, when it is another than the one the reach-out wrote to. */
function otherWriter(leadAddress: string | null, replyFrom: string | null): string | null {
  const from = normalizeEmail(replyFrom);
  return from && from !== normalizeEmail(leadAddress) ? from : null;
}

/** An address as it may stand in free text: a word with one @ and a dot after it. */
const ADDRESS_IN_TEXT = /[^\s<>()[\],;:"'@]+@[^\s<>()[\],;:"'@]+\.[^\s<>()[\],;:"'@.]{2,}/;

/**
 * The address a wrong person named, as they wrote it ("write to Dana, dana@harbor.example.com"): the first one in their
 * words that is an address and is neither the one we wrote to nor the one that answered (they named someone else).
 * Null when they named nobody by address ("ask our office manager"), and the step is the owner's to work out.
 */
export function addressNamedIn(
  referTo: string | null,
  leadAddress: string | null,
  replyFrom: string | null,
): string | null {
  const found = normalizeEmail((referTo ?? "").match(ADDRESS_IN_TEXT)?.[0]?.replace(/\.$/, ""));
  if (!found) return null;
  return found === normalizeEmail(leadAddress) || found === normalizeEmail(replyFrom) ? null : found;
}

/**
 * A dated step's words: what the step is for, naming the business, and the address that wrote when it is another than
 * the lead's. Null for an intent that makes no step.
 */
export function replyStepWords(
  reading: ReplyReading,
  params: { business: string; writer: string | null; automatic: boolean },
): string | null {
  const text = params.business.trim() || "The business";
  let words: string;
  if (reading.intent === "not_now")
    words = `Write to ${text} again: they said not now${reading.summary ? ` ("${reading.summary}")` : ""}.`;
  else if (reading.intent === "wrong_person") {
    const referTo = reading.referTo ?? "someone else";
    words = params.automatic
      ? `${text}'s automatic reply says to write to ${referTo}.`
      : `${text} said to write to ${referTo} instead.`;
  } else if (reading.intent === "away") words = `${text} is back today: write to them.`;
  else return null;
  return withinChars(params.writer ? `${words} (${params.writer} wrote it.)` : words, STEP_WORDS_MAX);
}

/** What an automatic reply's reading does: only a no and a wrong person apply, as a person's would (B1). */
function automaticPlan(r: ReplyReading, c: ReplyContext, today: string): ReadingPlan | null {
  if (r.intent === "away")
    return {
      ...NO_EFFECT,
      awayUntil: new Date(awayUntilOf(r.day, today, c.tz)).toISOString(),
      skipSends: "outreach_away",
    };
  return r.intent === "no" || r.intent === "wrong_person" ? null : NO_EFFECT;
}

/**
 * The one table of effects (G6): what a reading of a reply does, which the database's door executes. `reading` null is
 * a reply that was not read: `other`. A re-read (G4) applies the same effects, never drafts, and tells only for a no or for an automatic reply (whose first reading, unread, told nobody).
 */
export function readingPlan(reading: ReplyReading | null, replyContext: ReplyContext): ReadingPlan {
  const item = reading ?? UNREAD_READING;
  const automatic = replyContext.claim === "auto_reply";
  const sentence = replyContext.claim === "owner";
  const today = zoneDayKey(replyContext.receivedAt, replyContext.tz);
  const ruled = automatic ? automaticPlan(item, replyContext, today) : null;
  if (ruled) return ruled;
  const writer = otherWriter(replyContext.leadAddress, replyContext.replyFrom);
  const step = (dueOn: string): ReplyStep => ({
    dueOn,
    words: replyStepWords(item, { business: replyContext.business, writer, automatic }) ?? "",
  });
  const at9 = (day: string): string => new Date(wallClockAt(replyContext.tz, day, 9, 0)).toISOString();
  const stopped: ReadingPlan = {
    ...NO_EFFECT,
    stops: true,
    skipSends: "outreach_wrote_back",
    // A re-read tells what nobody was told before: a no, and anything an automatic reply's first reading told nobody of.
    // What the owner said is never told back to them.
    tell: !sentence && (!replyContext.reread || item.intent === "no" || automatic),
  };
  const drafts = (d: "answer" | "thanks") => (replyContext.reread || sentence ? null : d);
  switch (item.intent) {
    case "interested":
    case "question":
      return { ...stopped, convert: true, draft: drafts("answer") };
    case "not_now": {
      const day = notNowDayOf(item.day, today);
      const due = stepDayFor(day);
      // The note they asked for, written the morning its step is due (decision 0120, D7), for the owner to send or change.
      const ahead: ReplyAhead = { kind: "again", at: at9(due), to: null };
      return { ...stopped, resumeAt: at9(day), step: step(due), ahead, draft: drafts("thanks") };
    }
    case "no":
      return {
        ...stopped,
        saidNo: true,
        suppressFrom: writer,
        suppressDomain:
          ownedDomainOf(replyContext.leadAddress, replyContext.leadWebsite, replyContext.leadWebsiteRoot) ??
          ownedDomainOf(replyContext.replyFrom, replyContext.leadWebsite, replyContext.leadWebsiteRoot),
      };
    case "wrong_person": {
      // Due the day it is read: a re-read days after the reply never makes a step already overdue.
      const readDay = zoneDayKey(replyContext.readAt, replyContext.tz);
      // Who they named, by address: a first note to them is written at once (decision 0120, D7). By name alone, nobody.
      const to = addressNamedIn(item.referTo, replyContext.leadAddress, replyContext.replyFrom);
      const ahead: ReplyAhead | null = to
        ? { kind: "referral", at: new Date(replyContext.readAt).toISOString(), to }
        : null;
      return { ...stopped, step: step(readDay > today ? readDay : today), ahead };
    }
    case "away": {
      const day = backDayOf(item.day, today, BACK_MAX_DAYS);
      return { ...stopped, resumeAt: at9(day), step: step(day) };
    }
    default:
      return stopped;
  }
}

/* ---------------------------------------------------------------- the notice (G16) */

/** Why a reply was not read, as the notice says it. */
const UNREAD_WORDS: Record<Unread, string> = {
  no_model: "no reader was available",
  may_not_spend: "the workspace may not spend on it",
  day_spent: "today's reads are spent",
  model_failed: "the reader failed",
};

/** What was done, as the notice says it after their words. */
function doneWords(intent: ReplyIntent): string {
  switch (intent) {
    case "interested":
    case "question":
      return "They are Talking now, and your sequence stops for them.";
    case "not_now":
      return "Your sequence stops for them. On the day they named, a step to write again is on Today, its note written.";
    case "no":
      return "They are marked Said no: nothing more will be written to them.";
    case "wrong_person":
      return "Your sequence stops for them, and a step on Today names who to write to.";
    case "away":
      return "Your sequence stops for them, and a step is on Today for the day they are back.";
    default:
      return "Your sequence stops for them. Nothing is sent without you.";
  }
}

function subjectOf(p: { intent: ReplyIntent; business: string; automatic: boolean }): string {
  if (p.intent === "no")
    return p.automatic ? `${p.business}'s automatic reply asks to be taken off your list` : `${p.business} said no`;
  if (p.intent === "wrong_person" && p.automatic)
    return `${p.business}'s automatic reply names someone else to write to`;
  return p.intent === "other"
    ? `${p.business} wrote back`
    : `${p.business} wrote back · ${REPLY_INTENT_WORDS[p.intent]}`;
}

/** What the platform may be told of a reading: its intent, never the business or their words. */
function redactedReadAs(intent: ReplyIntent, unread: Unread | null): string {
  if (unread) return "; the reply could not be read yet";
  return intent === "other" ? "" : `, read as ${REPLY_INTENT_WORDS[intent]}`;
}

/**
 * The notice a reading sends (G16): the bell's title and body, the mail's subject and body, and what the platform may
 * be told when the workspace cannot be (`redacted`: no business, no words of theirs). A phone shows the body's first
 * line (today/push.ts pushFor), so the first line is the summary, never their words: `push` is that line.
 * "The receptionist drafted an answer" is said only when a draft was made, with its first lines (PR 5): never in
 * `redacted`, which holds no words of anyone's. A no says it can be undone on the thread for seven days (PR 7).
 */
export function replyNoticeWords(params: {
  intent: ReplyIntent;
  business: string;
  summary: string;
  quote: string;
  /** The receptionist's draft, when one was written before the owner was told. */
  draft: string | null;
  unread: Unread | null;
  automatic: boolean;
  reread: boolean;
  /** The reply's signer offered as its writer's name (0052): the body's last line says so; never in `redacted`. */
  signer?: string | null;
}): { subject: string; body: string; redacted: string; push: string } {
  const business = params.business.trim() || "A business";
  const intent = params.unread ? "other" : params.intent;
  const summary = params.summary.trim();
  const push = summary
    ? `${(summary[0] ?? "").toUpperCase()}${summary.slice(1)}${/[.!?]$/.test(summary) ? "" : "."}`
    : params.unread
      ? "Their reply could not be read yet."
      : "They wrote back.";
  const quote = params.quote.replace(/\s+/g, " ").trim();
  const body = [
    push,
    quote ? `“${withinChars(quote, REPLY_QUOTE_MAX)}”` : null,
    doneWords(intent),
    intent === "no" ? "If that's a misreading, undo it on the thread within seven days." : null,
    params.unread ? `It could not be read (${UNREAD_WORDS[params.unread]}), so it is read again later.` : null,
    params.draft
      ? `The receptionist drafted an answer: “${draftExcerpt(params.draft)}” Nothing is sent without you.`
      : null,
    params.signer ? `Signed ${params.signer} · Use this name on the thread.` : null,
  ].filter((l): l is string => l !== null);
  return {
    subject: `${subjectOf({ intent, business, automatic: params.automatic })}${params.reread ? " (read again later)" : ""}`,
    body: body.join("\n"),
    redacted: `A business wrote back to a workspace's sequence${redactedReadAs(intent, params.unread)}.`,
    push,
  };
}
