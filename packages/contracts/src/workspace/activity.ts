import { DECISION_VERBS, EVENT_KINDS, type DecisionVerb } from "../shared/enums";
import { LEAD_ENDING_WORDS } from "../leads/search/endings";
import type { LeadRoundEnding } from "../leads/search/sets";
import {
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CLOSED_WORDS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_STAGE_WORDS,
} from "../leads/lead-words";
import { domainHoldWords } from "../email/sending-domains";
import { standingChangeWords } from "../lines/number-standing";
import { HELD_REASONS } from "../broadcasts/run-words";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../reach-out/reach-out-replies";
import { plural } from "../shared/words";
import type { Tone } from "../shell/tone";
import type { ActivationMilestone } from "./activation";
import { partnerEventBits } from "./partner";
import { broadcastFailureWords } from "../broadcasts/broadcast-failure-words";

/**
 * The activity log: both ledgers, in an owner's words.
 *
 * The decisions ledger says what a person did (or the receptionist, or the
 * system, on their behalf); the events ledger says what happened. Both have
 * existed since the first slice and neither was readable by an owner except
 * inside one person's timeline. One row shape, one sentence per kind, and
 * nothing of a payload but the few fields a sentence names -- the payloads
 * carry numbers, addresses and provider ids from every corner of the product
 * and none of that belongs on a screen by accident.
 */
export interface ActivityRowDto {
  id: string;
  at: string;
  /** Which ledger: a decision (somebody did) or an event (something happened). */
  source: "decision" | "event";
  /** The verb or the kind, as the ledger spells it. */
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  /** The member who did it, when a member did; null for the receptionist and the system. */
  actor_user_id: string | null;
  actor_type: string | null;
  /** The sentence. */
  text: string;
  /**
   * The family its emitter filed an event under (events.category: billing, contact, lead, ...), as it was written;
   * null for a decision, which has none. What says a row is about money (isActivityMoney).
   */
  category: string | null;
}

export interface ActivityPageDto {
  rows: ActivityRowDto[];
  /** Member id → the name to show (their name, else the address they signed in with). */
  actors: Record<string, string>;
  /**
   * Where this page ended, not how far down it started: `next_cursor` is
   * `"<created_at>|<row id>"` and is what asks for the page behind it. An
   * offset made every page read the whole log above it (server/activity.ts).
   */
  page: { limit: number; has_more: boolean; next_cursor: string | null };
  /** The kinds the page may filter by, both ledgers', for the picker. */
  kinds: string[];
}

/** Ledger families that are evidence rather than activity: hidden unless asked for by name. */
export const ACTIVITY_NOISE_PREFIXES = ["usage.", "webhook.", "ingest."] as const;

/**
 * Kinds, one by one, that are a record kept for Reports and that no owner reads as activity: hidden unless asked for by
 * name. Each is named, never its family, so an owner-facing kind added under the same prefix later (an `escalation.` one)
 * is shown and not hidden with them.
 */
export const ACTIVITY_NOISE_KINDS = [
  "escalation.changed",
  "lead.set_aside",
  "call.transferred",
  "booking_link.sent",
  "channel.quality_rating",
] as const;

/**
 * Whether a row of the log is about money: an event its emitter filed under billing -- the subscription's
 * (billing.updated, .paused, .resumed, apps/edge/lib/billing/billing.ts) and a partner's share, its reversal, its payment and
 * its standing (partner.earned, .reversed, .paid, .standing_set, written by 00203/00205/00207/00214). Read from the row's
 * own category, which every emitter writes beside the kind, so a money kind added later is money here without a list
 * to keep; a decision carries none. Ask leaves these out (the charter: anything about money), and the page shows them.
 */
export const isActivityMoney = (row: Pick<ActivityRowDto, "category">): boolean => row.category === "billing";

const WORDS: Record<string, string> = {
  // decisions
  approve: "Approved a reply",
  edit: "Edited a reply",
  decline: "Declined a reply",
  snooze: "Snoozed a thread",
  wake: "Woke a thread",
  take_over: "Took over a thread",
  hand_back: "Handed a thread back to the receptionist",
  resolve: "Resolved an escalation",
  archive: "Archived a thread",
  reply: "Replied from the dashboard",
  cancel_send: "Stopped a reply before it sent",
  pause_agent: "Paused the receptionist",
  resume_agent: "Resumed the receptionist",
  invite: "Invited a member",
  revoke_invite: "Withdrew an invitation",
  change_role: "Changed a member's role",
  remove_member: "Removed a member",
  erase: "Erased a person",
  merge: "Merged two records of one person",
  whisper: "Whispered to the phone receptionist",
  connect_channel: "Connected a channel",
  consent_change: "Recorded a consent answer",
  send_broadcast: "Sent a broadcast",
  cancel_broadcast: "Canceled a broadcast",
  start_playbook: "Started a playbook",
  pause_playbook: "Paused a playbook",
  reply_review: "Replied to a Google review",
  export: "Exported data",
  import: "Imported people from a spreadsheet",
  open_recording: "Listened to a call's recording",
  end_call: "Ended a call",
  record_deal: "Recorded a deal",
  make_list: "Made a list",
  rename_list: "Renamed a list",
  change_list_rule: "Changed who is on a list",
  add_to_list: "Put people on a list",
  drop_from_list: "Took people off a list",
  archive_list: "Archived a list",
  restore_list: "Restored a list",
  delete_list: "Deleted a list",
  // events
  "message.received": "A customer wrote",
  "message.sent": "A message went out",
  "message.send_failed": "A message could not be sent",
  "message.send_blocked": "A message was held at the wire",
  "message.send_raced_cancel": "A send raced a cancel",
  "contact.consent_changed": "A consent answer changed",
  "contact.added": "A person was added",
  "contact.named": "A person was named",
  "contact.noted": "A note was written",
  "contact.note_changed": "A note was changed",
  "contact.note_removed": "A note was taken away",
  "contact.note_suggested": "The receptionist suggested a note",
  "contact.note_kept": "A suggested note was kept",
  "contact.note_dismissed": "A suggested note was dismissed",
  "contact.note_done": "A step was done",
  "contact.note_undone": "A step was opened again",
  "contact.email_set": "A person's email address changed",
  "contact.proposal_set": "A person's proposal link changed",
  // A deal is a record (0004): each move of one, in the owner's words.
  "deal.proposed": "A proposal went out",
  "deal.won": "A person became a client",
  "deal.lost": "A person passed on a proposal",
  "deal.ended": "An engagement ended",
  "contact.email_suppressed": "A person's email address stopped being sent to",
  "contact.erased": "A person was erased",
  "contact.merged": "Two records of one person became one",
  // Retired with the Blob store (00151): nothing writes it, but rows written before survive in `events` and still need their sentence.
  "contact.blob_erased": "A person's stored thread was erased",
  "conversation.reopened": "A thread reopened",
  "conversation.pause_expired": "A pause ended",
  "conversation.snooze_expired": "A snooze ended",
  "escalation.changed": "A handover's reason changed",
  "call.recorded": "A call was recorded",
  "call.transferred": "A call was passed to a person",
  "booking_link.sent": "The booking link was sent",
  "broadcast.sent": "A broadcast finished",
  "broadcast.stopped": "A broadcast stopped",
  "playbook.run": "A playbook ran",
  "channel.quality_rating": "A WhatsApp number's quality rating changed",
  "channel.standing": "A WhatsApp number's standing with Meta changed",
  "setup.requested": "Setup was requested",
  "voice.provisioned": "The phone receptionist was provisioned",
  "line.answering": "A line started answering",
  "line.failed": "A line failed",
  "line.released": "A line was released",
  "line.forwarding_verified": "Forwarding was verified",
  "line.texting_on": "Texting turned on",
  "line.texting_approved": "The carriers approved texting",
  "line.texting_rejected": "The carriers sent the registration back",
  "business.recorded": "The business record was saved",
  "platform.acted": "Chanlytics acted on the workspace",
  "google.linked": "A Google listing was linked",
  "google.unlinked": "The Google listing was unlinked",
  "google.reviews": "New Google reviews were read",
  "google.connected": "Google Business Profile was connected",
  "google.disconnected": "Google Business Profile was disconnected",
  "google.replied": "A Google review was answered",
  "google.reply_held": "A review reply was written and not posted",
  "mailbox.created": "The workspace's email address was set up",
  "mailbox.renamed": "The name on the workspace's email changed",
  "mailbox.offers_paused": "Offers by email were paused",
  "mailbox.offers_resumed": "Offers by email were turned back on",
  "sending_domain.added": "A domain to send from was added",
  "sending_domain.verified": "A domain to send from was verified",
  "sending_domain.held": "A domain to send from was held",
  "sending_domain.released": "A domain to send from is sending again",
  "sending_domain.resumed": "A domain to send from was resumed",
  "sending_domain.removed": "A domain to send from was removed",
  "channel.connected": "A WhatsApp number was connected",
  "lead.stage": "A lead moved",
  "lead.emailed": "A lead was marked as emailed",
  "lead.call": "A call to a lead was logged",
  "lead.not_a_fit": "A lead was marked not a fit",
  "lead.round": "A search for businesses",
  "lead.no_card": "An ask no source covers yet",
  "lead.converted": "A lead is Talking",
  "lead.set_aside": "A lead was set aside",
  // A reply to a reach-out, read (Reach out Part 5): the case below says who and what it meant.
  "reach_out.replied": "A business wrote back to a reach-out",
  "reach_out.reply_undone": "A reply read as no was undone",
  "workspace.created": "The workspace was created",
  "workspace.activated": "The workspace passed a milestone",
  // The partner programme (0012), as the workspace's owner reads it; partnerEventBits says the rest of each.
  "partner.attributed": "The workspace was made through a partner's link",
  "partner.code_ignored": "A partner's code was not used",
  "partner.earned": "A partner earned a share of a payment",
  "partner.reversed": "A partner's share changed",
  "partner.standing_set": "A partner's share was judged",
  "partner.paid": "A partner was paid their share",
  "partner.handover_sent": "A partner sent the workspace to its owner",
  "partner.handover_accepted": "The owner accepted the workspace from its partner",
  "partner.handover_declined": "The owner declined the workspace from its partner",
  "partner.invited": "The workspace asked a partner to join",
  "partner.invite_withdrawn": "The invitation to a partner was taken back",
  "partner.invite_accepted": "A partner joined the workspace",
  "partner.invite_declined": "A partner declined to join the workspace",
  "settings.changed": "Settings changed",
  "policy.changed": "An autonomy setting changed",
  "billing.updated": "Billing changed",
  "billing.paused": "Billing paused the workspace",
  "billing.resumed": "Billing resumed the workspace",
  "ingest.allowlist_skip": "A message was skipped by the allowlist",
  "ingest.unreachable_sender": "A sender could not be answered",
  "ingest.unroutable": "A message could not be placed on a workspace",
  "policy.veto_window_skipped": "A veto window was skipped",
  "usage.llm_tokens": "Model usage",
  "usage.ask_tokens": "Assistant usage",
  "usage.voice_seconds": "Call minutes",
  "usage.wa_conversation": "A WhatsApp conversation opened",
  "webhook.auth": "A webhook signature was checked",
  "webhook.delivery": "A webhook was delivered",
};

/** "line.texting_approved" → "Line · texting approved", for a kind the table above does not name (a channel.* field, or a new one). */
function humanize(kind: string): string {
  const [family, rest] = kind.split(".", 2);
  const tail = (rest ?? "").replace(/_/g, " ");
  return `${family.charAt(0).toUpperCase()}${family.slice(1)}${tail ? ` · ${tail}` : ""}`;
}

const textAt = (o: Record<string, unknown>, k: string): string | null =>
  typeof o[k] === "string" && o[k] ? o[k] : null;
const numberAt = (o: Record<string, unknown>, k: string): number | null => (typeof o[k] === "number" ? o[k] : null);

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

/** How a lead became Talking (00220 lead_convert_by's `how`). */
const CONVERTED_HOW: Record<string, string> = {
  call: "after a call",
  reply: "they wrote back",
  booking: "they booked",
  deal: "a deal was opened",
};

/**
 * A lead's conversion, and a reach-out's reply read (Reach out Part 5): "Harbor Movers wrote back · interested", the
 * business the lead is and what their reply was read as; one not read yet says so.
 */
function readingWords(kind: string, p: Record<string, unknown>, base: string): string {
  if (kind === "lead.converted") {
    const how = CONVERTED_HOW[textAt(p, "how") ?? ""];
    return how ? `${base} · ${how}` : base;
  }
  const who = textAt(p, "business") ?? "A business";
  if (textAt(p, "unread")) return `${who} wrote back · not read yet`;
  return isReplyIntent(p.intent) && p.intent !== "other"
    ? `${who} wrote back · ${REPLY_INTENT_WORDS[p.intent]}`
    : `${who} wrote back`;
}

/** The gates that pause a workspace's offers by email (00299), in the owner's words: which one tripped. */
const OFFERS_PAUSED_WHY: Record<string, string> = {
  complaints: "too many offers were marked as spam",
  bounces: "too many offers bounced",
};

/** A workspace's offers by email were paused by a gate: the kind's words, then why where the row says. */
function offersPausedWords(p: Record<string, unknown>, base: string): string {
  const why = OFFERS_PAUSED_WHY[textAt(p, "reason") ?? ""];
  return why ? `${base} · ${why}` : base;
}

/** A kind's words, then the facts a reader wants after them: each one the payload gave, in order, and none it did not. */
const joinBits = (base: string, bits: readonly (string | null)[]): string => {
  const said = bits.filter((b): b is string => !!b);
  return said.length ? `${base} · ${said.join(" · ")}` : base;
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
function leadEmailedWords(p: Record<string, unknown>, base: string): string {
  return textAt(p, "by") === "reach_out" ? "A reach-out email went to a lead" : base;
}

/** What each activation milestone says of the workspace (contracts ACTIVATION_MILESTONES): a record, so a new one cannot lack its words. */
const ACTIVATED_WORDS: Record<ActivationMilestone, string> = {
  line_live: "its first line is answering",
  first_reply: "its first reply went to a customer",
  first_lead_search: "its first lead search was made",
};

/** Why an automatic review reply was held back (google.reply_held's `why`: contracts autoReplyHold). */
const REPLY_HELD_WHY: Record<string, string> = { price: "it named a price", money: "it named money" };

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
  const why =
    p.outcome === "unknown"
      ? "the provider didn't answer in time, so it may have gone"
      : (wordOf(SEND_FAILED_WHY, reason) ?? (reason === "provider" ? provider : null));
  return joinBits(base, [why]);
}

/**
 * A run's end: a finished one with its tally, a stopped one with why, in the words its own page says it (contracts
 * broadcastFailureWords), and how far it got.
 */
function runEndWords(kind: "broadcast.sent" | "broadcast.stopped", p: Record<string, unknown>, base: string): string {
  const bits: string[] = [];
  const sent = numberAt(p, "sent");
  if (kind === "broadcast.sent") {
    const held = numberAt(p, "held");
    if (sent !== null) bits.push(`${sent} got it`);
    if (held) bits.push(`${held} held`);
  } else {
    const failure = textAt(p, "failure");
    if (failure) bits.push(broadcastFailureWords(failure));
    if (sent !== null) bits.push(sent ? `${sent} got it first` : "nobody got it");
  }
  return [base, ...bits].join(" · ");
}

/** The kinds whose sentence is written whole, by its own function. */
const WHOLE_SENTENCE = new Map<string, (p: Record<string, unknown>, base: string) => string>([
  ["broadcast.sent", (p, base) => runEndWords("broadcast.sent", p, base)],
  ["broadcast.stopped", (p, base) => runEndWords("broadcast.stopped", p, base)],
  ["import", (p) => importWords(p)],
  ["lead.converted", (p, base) => readingWords("lead.converted", p, base)],
  ["reach_out.replied", (p, base) => readingWords("reach_out.replied", p, base)],
  ["mailbox.offers_paused", offersPausedWords],
  ["lead.stage", leadStageWords],
  ["lead.not_a_fit", leadNotAFitWords],
  ["lead.emailed", leadEmailedWords],
  ["lead.call", (p, base) => joinBits(base, [wordOf(LEAD_CALL_OUTCOME_WORDS, textAt(p, "outcome"))])],
  ["channel.connected", (p, base) => joinBits(base, [textAt(p, "verified_name")])],
  ["channel.standing", (p, base) => joinBits(base, [standingChangeWords(p)])],
  ["workspace.activated", (p, base) => joinBits(base, [wordOf(ACTIVATED_WORDS, textAt(p, "milestone"))])],
  ["google.reply_held", (p, base) => joinBits(base, [wordOf(REPLY_HELD_WHY, textAt(p, "why"))])],
  ["message.send_blocked", sendBlockedWords],
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

/**
 * The sentence for a row: the kind's words, then the one or two fields a
 * reader wants and nothing else of the payload.
 */
export function activityWords(kind: string, payload: unknown): string {
  const p = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<
    string,
    unknown
  >;
  // A take-over on a call is the Inbox's verb with a different subject: the
  // receptionist passed the caller to the business's own line.
  const base =
    kind === "take_over" && textAt(p, "how") === "transfer" ? "Took over a call" : (WORDS[kind] ?? humanize(kind));
  // A kind whose sentence is its own, not the kind's words and a field or two.
  const whole = WHOLE_SENTENCE.get(kind);
  if (whole) return whole(p, base);
  const bits: string[] = [];
  switch (kind) {
    case "take_over": {
      if (textAt(p, "how") === "transfer") bits.push("passed to the business's line");
      break;
    }
    case "sending_domain.added":
    case "sending_domain.verified":
    case "sending_domain.held":
    case "sending_domain.released":
    case "sending_domain.resumed":
    case "sending_domain.removed": {
      const host = textAt(p, "host");
      if (host) bits.push(host);
      const why = textAt(p, "why");
      if (kind === "sending_domain.held" && why) bits.push(domainHoldWords(why));
      break;
    }
    case "consent_change":
    case "contact.consent_changed": {
      const purpose =
        textAt(p, "purpose") === "marketing"
          ? "offers"
          : textAt(p, "purpose") === "email_marketing"
            ? "marketing email"
            : "messages about their visit";
      const consent = textAt(p, "consent");
      bits.push(
        consent === "opted_in"
          ? `yes to ${purpose}`
          : consent === "opted_out"
            ? `no to ${purpose}`
            : `${purpose}: not asked`,
      );
      const source = textAt(p, "source");
      if (source && source !== "operator") bits.push(source.replace(/_/g, " "));
      break;
    }
    case "change_role": {
      const role = textAt(p, "role") ?? textAt(p, "to");
      if (role) bits.push(`to ${role}`);
      break;
    }
    case "export": {
      const what = textAt(p, "what");
      if (what) bits.push(what === "workspace" ? "everything" : what === "people" ? "everyone as a CSV" : `a ${what}`);
      const rows = numberAt(p, "rows");
      if (rows !== null) bits.push(`${rows} rows`);
      break;
    }
    case "pause_agent":
    case "resume_agent": {
      const mode = textAt(p, "receptionist_mode");
      if (mode) bits.push(mode === "inherit" ? "follows the workspace" : mode);
      const batch = numberAt(p, "batch");
      if (batch) bits.push(`one of ${batch}`);
      break;
    }
    case "send_broadcast": {
      const name = textAt(p, "name");
      if (name) bits.push(name);
      const n = numberAt(p, "recipients");
      if (n !== null) bits.push(`${n} people`);
      if (p.approved === true) bits.push("approved by hand");
      break;
    }
    case "settings.changed": {
      const fields = Array.isArray(p.fields)
        ? (p.fields as unknown[]).filter((f): f is string => typeof f === "string")
        : [];
      if (fields.length) bits.push(fields.slice(0, 4).join(", "));
      break;
    }
    case "policy.changed": {
      const cls = textAt(p, "class");
      const mode = textAt(p, "mode");
      if (cls) bits.push(cls);
      if (mode) bits.push(mode);
      break;
    }
    case "line.texting_rejected":
    case "line.failed": {
      const why = textAt(p, "error") ?? textAt(p, "reason");
      if (why) bits.push(why.slice(0, 80));
      break;
    }
    case "platform.acted": {
      const action = textAt(p, "action");
      if (action) bits.push(action);
      break;
    }
    case "playbook.run": {
      const outcome = textAt(p, "outcome");
      if (outcome) bits.push(outcome);
      const n = numberAt(p, "recipients") ?? numberAt(p, "count");
      if (n !== null) bits.push(`${n} people`);
      break;
    }
    case "lead.round": {
      // One kind carries a round's whole life (00140), so the state says which
      // moment this row is, and an ended one says why in the words the rest of
      // the product already uses for the nine endings. What it cost is the
      // workspace's business, not the log's.
      const state = textAt(p, "state");
      if (state === "ended") {
        bits.push("finished");
        const ending = textAt(p, "ending");
        if (ending && ending in LEAD_ENDING_WORDS) bits.push(LEAD_ENDING_WORDS[ending as LeadRoundEnding]);
        const counted = numberAt(p, "counted");
        if (counted !== null) bits.push(`${counted} found`);
      } else if (state) {
        bits.push(
          state === "queued"
            ? "started"
            : state === "waiting_on_owner"
              ? "waiting on your answer"
              : state.replace(/_/g, " "),
        );
      }
      break;
    }
    case "lead.no_card": {
      // An ask no source card covers, kept as demand: what was asked for, in
      // the owner's own words, and never a place.
      const card = textAt(p, "card");
      if (card) bits.push(card.replace(/_/g, " "));
      const asked = textAt(p, "asked");
      if (asked) bits.push(asked.slice(0, 80));
      break;
    }
    default:
      break;
  }
  return bits.length ? `${base} · ${bits.join(" · ")}` : base;
}

/**
 * What a row MEANS, in the product's one tone vocabulary (tone.ts).
 *
 * A log where every line is the same grey is a log you read rather than scan,
 * and the thing an owner opens it to find is the line that went wrong. So the
 * kinds whose reading is not in doubt get their tone and the rest stay plain:
 * this says a tone only where the product knows one, rather than guessing from
 * a kind's spelling -- "line.texting_on" contains no failure, and a rule that
 * read words out of names would find one in "message.send_raced_cancel".
 */
const TONES: Record<string, Tone> = {
  // danger -- it failed, it was refused, or something is gone
  "message.send_failed": "danger",
  "message.send_blocked": "danger",
  "line.failed": "danger",
  "broadcast.stopped": "danger",
  "line.texting_rejected": "danger",
  "contact.erased": "danger",
  "contact.blob_erased": "danger",
  "ingest.unroutable": "danger",
  "ingest.unreachable_sender": "danger",
  erase: "danger",
  decline: "danger",
  remove_member: "danger",
  // ok -- it completed, it connected, it is answering
  "line.answering": "ok",
  "line.texting_approved": "ok",
  "line.forwarding_verified": "ok",
  "voice.provisioned": "ok",
  "google.linked": "ok",
  "google.connected": "ok",
  "broadcast.sent": "ok",
  "billing.resumed": "ok",
  "mailbox.created": "ok",
  "mailbox.offers_resumed": "ok",
  "sending_domain.verified": "ok",
  "sending_domain.released": "ok",
  "sending_domain.resumed": "ok",
  "workspace.created": "ok",
  approve: "ok",
  resolve: "ok",
  connect_channel: "ok",
  "deal.won": "ok",
  // warn -- somebody stopped something, or a rule was stepped around
  "billing.paused": "warn",
  "policy.veto_window_skipped": "warn",
  "line.released": "warn",
  "google.unlinked": "warn",
  "google.disconnected": "warn",
  "sending_domain.held": "warn",
  "mailbox.offers_paused": "warn",
  "message.send_raced_cancel": "warn",
  "ingest.allowlist_skip": "warn",
  pause_agent: "warn",
  pause_playbook: "warn",
  cancel_send: "warn",
  cancel_broadcast: "warn",
  revoke_invite: "warn",
  snooze: "warn",
  // info -- it is on its way, or a person took it on
  "message.received": "info",
  "conversation.reopened": "info",
  "line.texting_on": "info",
  take_over: "info",
  hand_back: "info",
  reply: "info",
};

/** The tone for a row, or "plain" where the product does not claim to know. */
export function activityTone(kind: string): Tone {
  return TONES[kind] ?? "plain";
}

/** Every kind either ledger may hold, for the picker: the verbs, then the event kinds. */
export const ACTIVITY_KINDS: readonly string[] = [...DECISION_VERBS, ...EVENT_KINDS];

/** true for a kind an owner is not shown unless they ask for it by name. */
export function isActivityNoise(kind: string): boolean {
  return (
    ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p)) ||
    (ACTIVITY_NOISE_KINDS as readonly string[]).includes(kind)
  );
}

export type { DecisionVerb as ActivityVerb };
