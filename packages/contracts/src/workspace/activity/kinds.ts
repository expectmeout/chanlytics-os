/** Activity: kinds. */

import { EVENT_KINDS } from "../../shared/enums";
import { reasonShort } from "../../conversations/escalations";
import { bookingToolName } from "../../calendar/booking-notice";
import { LEAD_CALL_OUTCOME_WORDS, LEAD_CLOSED_WORDS, LEAD_STAGE_WORDS } from "../../leads/words/lists";
import { LEAD_NOT_A_FIT_WORDS } from "../../leads/words/refusals";
import { mailboxHoldWords } from "../../email/mailbox-standing";
import { reviewHeldWords } from "../../google/review-reply";
import { standingChangeWords } from "../../lines/number-standing";
import { businessFieldLabel } from "../../lines/business-record";
import { HELD_REASONS } from "../../campaigns/broadcasts/run-words";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../campaigns/reach-out/replies/intents";
import { plural } from "../../shared/words";
import type { ActivationMilestone } from "../activation";
import { partnerEventBits } from "../partner/platform";
import { broadcastFailureWords } from "../../campaigns/broadcasts/failure-words";
import { WORDS } from "./dtos";
import { listOrEmpty } from "../../shared/unknown";

/** "line.texting_approved" → "Line · texting approved", for a kind the table above does not name (a channel.* field, or a new one). */
export function humanize(kind: string): string {
  const [family, rest] = kind.split(".", 2);
  const tail = (rest ?? "").replace(/_/g, " ");
  return `${family.charAt(0).toUpperCase()}${family.slice(1)}${tail ? ` · ${tail}` : ""}`;
}

/** A kind's own words with nothing of a row's payload: what the picker calls it, and a folded line's fallback. */
export const activityKindWords = (kind: string): string => WORDS[kind] ?? humanize(kind);

export const textAt = (o: Record<string, unknown>, k: string): string | null =>
  typeof o[k] === "string" && o[k] ? o[k] : null;

export const numberAt = (o: Record<string, unknown>, k: string): number | null =>
  typeof o[k] === "number" ? o[k] : null;

/**
 * What a settings change says: which settings moved, four at most; or a rename, by the names it changed from and to
 * (X4-5; Ruben, 15 October 2026), the one setting the log says in full. Null when the row names neither.
 */
export function settingsChangedWords(p: Record<string, unknown>): string | null {
  const from = textAt(p, "from");
  const to = textAt(p, "to");
  if (from && to) return `renamed from “${from}” to “${to}”`;
  const fields = listOrEmpty(p.fields).filter((f): f is string => typeof f === "string");
  return fields.length ? fields.slice(0, 4).join(", ") : null;
}

/**
 * An import's sentence. One row per part of fifty, and the counts are the news: the sentence is them, not the verb's
 * words. A part that stopped at a fault says so, or it would read as a clean import.
 */
function importWords(p: Record<string, unknown>): string {
  const n = (k: string) => numberAt(p, k) ?? 0;
  const counts = `${n("added")} new, ${n("existed")} already here, ${n("skipped")} skipped`;
  const stopped = n("failed") > 0 ? ", then stopped at a fault" : "";
  return `Imported ${n("rows")} rows from a spreadsheet: ${counts}${stopped}`;
}

/** How a lead became Talking (00220 lead_convert_by's `how`; arrived and added are the person door's link, 00346). */
const CONVERTED_HOW: Record<string, string> = {
  call: "after a call",
  reply: "they wrote back",
  booking: "they booked",
  deal: "a deal was opened",
  arrived: "they got in touch",
  added: "they were added to People",
};

/**
 * A lead's conversion, and a reach-out's reply read (Reach out Part 5): "Harbor Movers wrote back · interested", the
 * business the lead is and what their reply was read as; one not read yet says so.
 */
function readingWords(kind: string, record: Record<string, unknown>, base: string): string {
  if (kind === "lead.converted") {
    const how = CONVERTED_HOW[textAt(record, "how") ?? ""];
    return how ? `${base} · ${how}` : base;
  }
  const text = textAt(record, "business") ?? "A business";
  if (textAt(record, "unread")) return `${text} wrote back · not read yet`;
  return isReplyIntent(record.intent) && record.intent !== "other"
    ? `${text} wrote back · ${REPLY_INTENT_WORDS[record.intent]}`
    : `${text} wrote back`;
}

/** The gates that pause a workspace's offers by email (00299), in the owner's words: which one tripped. */
const OFFERS_PAUSED_WHY: Record<string, string> = {
  complaints: "too many offers were marked as spam",
  bounces: "too many offers bounced",
};

/** A workspace's offers by email were paused by a gate: the kind's words, then why where the row says. */
function offersPausedWords(p: Record<string, unknown>, base: string): string {
  const reason = OFFERS_PAUSED_WHY[textAt(p, "reason") ?? ""];
  return reason ? `${base} · ${reason}` : base;
}

/** A kind's words, then the facts a reader wants after them: each one the payload gave, in order, and none it did not. */
const joinBits = (base: string, bits: readonly (string | null)[]): string => {
  const sentence = bits.filter((b): b is string => !!b);
  return sentence.length ? `${base} · ${sentence.join(" · ")}` : base;
};

/** A word out of a closed set a ledger row names by its key: nothing for a key the set does not hold (never a guess). */
const wordOf = (words: Readonly<Record<string, string>>, key: string | null): string | null =>
  key !== null && Object.hasOwn(words, key) ? (words[key] ?? null) : null;

/**
 * A lead moved to a stage (lead_set_stage, the bulk door, a reply's undo): the stage it went to, and why when it was
 * closed, in the words the Leads page says them. The bulk door writes one row for the act, with the count.
 */
function leadStageWords(p: Record<string, unknown>, base: string): string {
  const n = numberAt(p, "count");
  const head = p.bulk === true && n !== null ? `${plural(n, "lead")} moved` : base;
  return joinBits(head, [wordOf(LEAD_STAGE_WORDS, textAt(p, "stage")), wordOf(LEAD_CLOSED_WORDS, textAt(p, "reason"))]);
}

/** A lead marked not a fit, one or many (the bulk door's one row has the count), and why where one was given. */
function leadNotAFitWords(p: Record<string, unknown>, base: string): string {
  const n = numberAt(p, "count");
  const head =
    p.bulk === true && n !== null ? `${plural(n, "lead")} ${n === 1 ? "was" : "were"} marked not a fit` : base;
  return joinBits(head, [wordOf(LEAD_NOT_A_FIT_WORDS, textAt(p, "why"))]);
}

/**
 * A lead emailed has two writers: the owner saying they sent it (what is recorded is their word, never that it left), and a
 * reach-out's own email, which names itself as the author.
 */
export const REACH_OUT_EMAILED_WORDS = "An email went to a lead";

function leadEmailedWords(p: Record<string, unknown>, base: string): string {
  return textAt(p, "by") === "reach_out" ? REACH_OUT_EMAILED_WORDS : base;
}

/** What each activation milestone says of the workspace (contracts ACTIVATION_MILESTONES): a record, so a new one cannot lack its words. */
const ACTIVATED_WORDS: Record<ActivationMilestone, string> = {
  line_live: "its first line is answering",
  first_reply: "its first reply went to a customer",
  first_lead_search: "its first lead search was made",
};

/** A message the send door held at the wire: the reason it refused, in the words a run's held people are given (HELD_REASONS). */
function sendBlockedWords(p: Record<string, unknown>, base: string): string {
  return joinBits(base, [wordOf(HELD_REASONS, textAt(p, "reason"))]);
}

/** Why a send failed that is not the provider's own answer, by the reason the send door (or a receipt) filed. */
const SEND_FAILED_WHY: Record<string, string> = {
  receipt: "the provider reported it as not delivered, after taking it",
  no_credentials: "the channel has no credentials to send with",
  no_sender_for_channel: "nothing is set up to send on that channel",
};

/**
 * A message that could not be sent: why, as far as the event knows. A send the provider did not answer in time may have
 * gone, and says so; one it gave no answer to at all (status 0) says that; otherwise the door's reason, or the provider's
 * refusal. The provider's own words and code are on the message (the thread says them) and never in this line.
 */
function sendFailedWords(p: Record<string, unknown>, base: string): string {
  const reason = textAt(p, "reason");
  const provider =
    numberAt(p, "http_status") === 0 ? "the provider gave no answer" : wordOf(HELD_REASONS, "send_failed");
  const otherReason =
    p.outcome === "unknown"
      ? "the provider didn't answer in time, so it may have gone"
      : (wordOf(SEND_FAILED_WHY, reason) ?? (reason === "provider" ? provider : null));
  return joinBits(base, [otherReason]);
}

/**
 * A run's end: a finished one with its tally, a stopped one with why, in the words its own page says it (contracts
 * broadcastFailureWords), and how far it got.
 */
function runEndWords(
  kind: "broadcast.sent" | "broadcast.stopped",
  record: Record<string, unknown>,
  base: string,
): string {
  const bits: string[] = [];
  const sent = numberAt(record, "sent");
  if (kind === "broadcast.sent") {
    const held = numberAt(record, "held");
    if (sent !== null) bits.push(`${sent} got it`);
    if (held) bits.push(`${held} held`);
  } else {
    const failure = textAt(record, "failure");
    if (failure) bits.push(broadcastFailureWords(failure));
    if (sent !== null) bits.push(sent ? `${sent} got it first` : "nobody got it");
  }
  return [base, ...bits].join(" · ");
}

/** A reply's row says when it began the conversation (core conversations/begin.ts): the first thing they heard there. */
const replyWords = (p: Record<string, unknown>, base: string): string =>
  p.starts === true ? "Began a conversation from the dashboard" : base;

/** A call that never connected (Retell's not_connected, contracts neverConnected), by who dialled: a customer's is missed. */
export const CALL_MISSED_WORDS = "A call was missed";

export const CALL_UNANSWERED_WORDS = "A call we placed did not connect";

/** A call's first sighting: recorded, unless the dial never connected, which is all there was of it. */
function callRecordedWords(p: Record<string, unknown>, base: string): string {
  if (textAt(p, "status") !== "not_connected") return base;
  return textAt(p, "direction") === "outbound" ? CALL_UNANSWERED_WORDS : CALL_MISSED_WORDS;
}

/** What was decided of a held reach-out email (contracts REACH_OUT_DECISIONS), as the sentence's last words. */
const SEND_DECIDED_WORDS: Record<string, string> = {
  include: "A held email to a lead was sent as written",
  rewrite: "A held email to a lead was sent back to be written again",
  skip: "A held email to a lead was skipped",
  not_a_fit: "A held email to a lead was dropped: the lead is not a fit",
  // Undo of a rewrite (00505): the opening it replaced is back.
  rewrite_undone: "An email to a lead got its earlier opening back",
};

/** Which calls a kept number forwards (contracts FORWARDING_MODES), in an owner's words. */
const FORWARDING_WORDS: Record<string, string> = { unanswered: "the calls not answered", always: "every call" };

/** A search removed: how many of its leads were kept, where the door said. */
function searchRemovedWords(p: Record<string, unknown>, base: string): string {
  const kept = numberAt(p, "kept");
  return joinBits(base, [textAt(p, "name"), kept !== null ? `${kept} kept` : null]);
}

/** What the workspace answers, as an owner says it: the capability's stored word, in theirs. */
const CAPABILITY_WORDS: Record<string, string> = { voice: "calls", whatsapp: "WhatsApp", sms: "texts" };

/** A list of a row's own short words (the parts of a playbook that moved): each as written, four at most. */
const wordsAt = (o: Record<string, unknown>, k: string): string | null => {
  const list = listOrEmpty(o[k]).filter((f): f is string => typeof f === "string");
  return list.length ? list.slice(0, 4).join(", ") : null;
};

/**
 * What a save of the business on record moved, by the form's labels (four at most), or that nothing did: the ledger keeps
 * the columns' names, never their values (the wiring's second audit, X4-3). A row from before it said nothing of them.
 */
const recordChangedWords = (p: Record<string, unknown>): string | null => {
  if (!Array.isArray(p.changed)) return null;
  const moved = p.changed.filter((c): c is string => typeof c === "string");
  return moved.length ? moved.slice(0, 4).map(businessFieldLabel).join(", ") : "nothing changed";
};

/**
 * Why the system canceled a run, by the reason its decision keeps: the sweep's and the send's (decision 0082), and a
 * waiting run's whose every send left it before anyone answered (00532).
 */
const CANCELED_BY_SYSTEM: Readonly<Record<string, string>> = {
  day_passed: "Skipped a run whose day had passed",
  time_passed: "Skipped a freed time's run when its time came",
  taken: "Stopped a freed time's run: someone booked the time",
  nothing_to_send: "Skipped a run with nothing left to send",
};

/** The kinds whose sentence is written whole, by its own function. */
export const WHOLE_SENTENCE = new Map<string, (p: Record<string, unknown>, base: string) => string>([
  ["broadcast.sent", (p, base) => runEndWords("broadcast.sent", p, base)],
  ["broadcast.stopped", (p, base) => runEndWords("broadcast.stopped", p, base)],
  ["import", (p) => importWords(p)],
  ["reply", replyWords],
  ["lead.converted", (p, base) => readingWords("lead.converted", p, base)],
  ["preview.claimed", (p, base) => (textAt(p, "preview_id") ? base : "This workspace began as a preview")],
  ["reach_out.replied", (p, base) => readingWords("reach_out.replied", p, base)],
  ["mailbox.offers_paused", offersPausedWords],
  ["lead.stage", leadStageWords],
  ["lead.not_a_fit", leadNotAFitWords],
  ["lead.emailed", leadEmailedWords],
  ["lead.call", (p, base) => joinBits(base, [wordOf(LEAD_CALL_OUTCOME_WORDS, textAt(p, "outcome"))])],
  ["channel.connected", (p, base) => joinBits(base, [textAt(p, "verified_name")])],
  // A mailbox a business connected (decision 0056): its address, and a hold with why.
  ...[
    "mailbox_connection.connected",
    "mailbox_connection.signed_out",
    "mailbox_connection.held",
    "mailbox_connection.resumed",
    "mailbox_connection.paused",
    "mailbox_connection.unpaused",
    "mailbox_connection.removed",
  ].map(
    (k) =>
      [
        k,
        (p: Record<string, unknown>, base: string) =>
          joinBits(base, [
            textAt(p, "address"),
            k === "mailbox_connection.held" && textAt(p, "why") ? mailboxHoldWords(textAt(p, "why") ?? "") : null,
          ]),
      ] as const,
  ),
  ["business.recorded", (p, base) => joinBits(base, [recordChangedWords(p)])],
  // A run the hourly sweep skipped because its day had passed (no approval could send it, S7-3), or a freed time's whose
  // time came first or was booked before it went (decision 0082): the system's, named.
  [
    "cancel_broadcast",
    (p, base) => {
      const sentence = CANCELED_BY_SYSTEM[textAt(p, "reason") ?? ""];
      return sentence ? joinBits(sentence, [textAt(p, "name")]) : base;
    },
  ],
  ["channel.standing", (p, base) => joinBits(base, [standingChangeWords(p)])],
  ["workspace.activated", (p, base) => joinBits(base, [wordOf(ACTIVATED_WORDS, textAt(p, "milestone"))])],
  ["google.reply_held", (p, base) => joinBits(base, [reviewHeldWords(textAt(p, "why"))])],
  ["message.send_blocked", sendBlockedWords],
  ["escalation.opened", (p, base) => joinBits(base, [textAt(p, "reason") ? reasonShort(textAt(p, "reason")) : null])],
  ["member.joined", (p, base) => joinBits(base, [textAt(p, "role") ? `as ${textAt(p, "role")}` : null])],
  [
    "member.left",
    (p, base) => joinBits(base, [textAt(p, "how") === "account_deleted" ? "deleted their account" : null]),
  ],
  // Team's Resend renews an invitation and emails it again (00371 team_invite_renew); a member's own Leave is a removal
  // by their own hand (team_leave). Each is said as what happened, not as a second invitation or a removal by somebody.
  ["invite", (p, base) => (p.resent === true ? "Sent an invitation again" : base)],
  ["remove_member", (p, base) => (p.left === true ? "Left the team" : base)],
  ["call.recorded", callRecordedWords],
  ["reach_out.send_decided", (p, base) => wordOf(SEND_DECIDED_WORDS, textAt(p, "decision")) ?? base],
  [
    "reach_out.lead_words_changed",
    (p, base) => (p.kept === false ? "An email to a lead went back to the sequence's words" : base),
  ],
  ["lead.search_renamed", (p, base) => joinBits(base, [textAt(p, "name")])],
  ["lead.search_removed", searchRemovedWords],
  ["line.forwarding_set", (p, base) => joinBits(base, [wordOf(FORWARDING_WORDS, textAt(p, "mode"))])],
  ["appointment.booked", (p, base) => joinBits(base, [bookingToolName(textAt(p, "tool"))])],
  ["appointment.moved", (p, base) => joinBits(base, [bookingToolName(textAt(p, "tool"))])],
  ["appointment.cancelled", (p, base) => joinBits(base, [bookingToolName(textAt(p, "tool"))])],
  ["playbook.changed", (p, base) => joinBits(base, [textAt(p, "name"), wordsAt(p, "fields")])],
  ["template.submitted", (p, base) => joinBits(base, [textAt(p, "name")])],
  ["template.removed", (p, base) => joinBits(base, [textAt(p, "name")])],
  ["capability.activated", (p, base) => joinBits(base, [wordOf(CAPABILITY_WORDS, textAt(p, "capability"))])],
  ["capability.deactivated", (p, base) => joinBits(base, [wordOf(CAPABILITY_WORDS, textAt(p, "capability"))])],
  ["message.send_failed", sendFailedWords],
  // A partner's standing is between the platform and the partner: the owner reads that it was judged, never the
  // verdict or who gave it (the raw label said no more before these words).
  ...EVENT_KINDS.filter((k) => k.startsWith("partner.") && k !== "partner.standing_set").map(
    (k): [string, (p: Record<string, unknown>, base: string) => string] => [
      k,
      (p, base) => joinBits(base, partnerEventBits(k, p)),
    ],
  ),
]);
