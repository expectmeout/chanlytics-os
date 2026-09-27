import { DECISION_VERBS, EVENT_KINDS, type DecisionVerb } from "../shared/enums";
import { LEAD_ENDING_WORDS, type LeadRoundEnding } from "../leads/lead-search";
import { domainHoldWords } from "../email/sending-domains";
import type { Tone } from "../shell/tone";

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
 * Whether a row of the log is about money: an event its emitter filed under billing -- the subscription's
 * (billing.updated, .paused, .resumed, apps/edge/lib/billing.ts) and a partner's share, its reversal, its payment and
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
  // Retired with the Blob store (00151): nothing writes it, but rows written before survive in `events` and still need their sentence.
  "contact.blob_erased": "A person's stored thread was erased",
  "conversation.reopened": "A thread reopened",
  "conversation.pause_expired": "A pause ended",
  "conversation.snooze_expired": "A snooze ended",
  "call.recorded": "A call was recorded",
  "broadcast.sent": "A broadcast finished",
  "playbook.run": "A playbook ran",
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
  "mailbox.created": "The workspace's email address was set up",
  "mailbox.renamed": "The name on the workspace's email changed",
  "sending_domain.added": "A domain to send from was added",
  "sending_domain.verified": "A domain to send from was verified",
  "sending_domain.held": "A domain to send from was held",
  "sending_domain.released": "A domain to send from is sending again",
  "sending_domain.resumed": "A domain to send from was resumed",
  "sending_domain.removed": "A domain to send from was removed",
  "lead.round": "A search for businesses",
  "lead.no_card": "An ask no source covers yet",
  "workspace.created": "The workspace was created",
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

const str = (o: Record<string, unknown>, k: string): string | null =>
  typeof o[k] === "string" && (o[k] as string) ? (o[k] as string) : null;
const num = (o: Record<string, unknown>, k: string): number | null =>
  typeof o[k] === "number" ? (o[k] as number) : null;

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
    kind === "take_over" && str(p, "how") === "transfer" ? "Took over a call" : (WORDS[kind] ?? humanize(kind));
  const bits: string[] = [];
  switch (kind) {
    case "take_over": {
      if (str(p, "how") === "transfer") bits.push("passed to the business's line");
      break;
    }
    case "sending_domain.added":
    case "sending_domain.verified":
    case "sending_domain.held":
    case "sending_domain.released":
    case "sending_domain.resumed":
    case "sending_domain.removed": {
      const host = str(p, "host");
      if (host) bits.push(host);
      const why = str(p, "why");
      if (kind === "sending_domain.held" && why) bits.push(domainHoldWords(why));
      break;
    }
    case "consent_change":
    case "contact.consent_changed": {
      const purpose =
        str(p, "purpose") === "marketing"
          ? "offers"
          : str(p, "purpose") === "email_marketing"
            ? "marketing email"
            : "messages about their visit";
      const consent = str(p, "consent");
      bits.push(
        consent === "opted_in"
          ? `yes to ${purpose}`
          : consent === "opted_out"
            ? `no to ${purpose}`
            : `${purpose}: not asked`,
      );
      const source = str(p, "source");
      if (source && source !== "operator") bits.push(source.replace(/_/g, " "));
      break;
    }
    case "change_role": {
      const role = str(p, "role") ?? str(p, "to");
      if (role) bits.push(`to ${role}`);
      break;
    }
    case "export": {
      const what = str(p, "what");
      if (what) bits.push(what === "workspace" ? "everything" : what === "people" ? "everyone as a CSV" : `a ${what}`);
      const rows = num(p, "rows");
      if (rows !== null) bits.push(`${rows} rows`);
      break;
    }
    case "import": {
      // One row per part of fifty, and the counts are the news: the sentence is them, not the verb's words. A part
      // that stopped at a fault says so, or it would read as a clean import.
      const n = (k: string) => num(p, k) ?? 0;
      const counts = `${n("added")} new, ${n("existed")} already here, ${n("skipped")} skipped`;
      const stopped = n("failed") > 0 ? ", then stopped at a fault" : "";
      return `Imported ${n("rows")} rows from a spreadsheet: ${counts}${stopped}`;
    }
    case "pause_agent":
    case "resume_agent": {
      const mode = str(p, "receptionist_mode");
      if (mode) bits.push(mode === "inherit" ? "follows the workspace" : mode);
      const batch = num(p, "batch");
      if (batch) bits.push(`one of ${batch}`);
      break;
    }
    case "send_broadcast": {
      const name = str(p, "name");
      if (name) bits.push(name);
      const n = num(p, "recipients");
      if (n !== null) bits.push(`${n} people`);
      if (p.approved === true) bits.push("approved by hand");
      break;
    }
    case "broadcast.sent": {
      const sent = num(p, "sent");
      const held = num(p, "held");
      if (sent !== null) bits.push(`${sent} got it`);
      if (held) bits.push(`${held} held`);
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
      const cls = str(p, "class");
      const mode = str(p, "mode");
      if (cls) bits.push(cls);
      if (mode) bits.push(mode);
      break;
    }
    case "line.texting_rejected":
    case "line.failed": {
      const why = str(p, "error") ?? str(p, "reason");
      if (why) bits.push(why.slice(0, 80));
      break;
    }
    case "platform.acted": {
      const action = str(p, "action");
      if (action) bits.push(action);
      break;
    }
    case "playbook.run": {
      const outcome = str(p, "outcome");
      if (outcome) bits.push(outcome);
      const n = num(p, "recipients") ?? num(p, "count");
      if (n !== null) bits.push(`${n} people`);
      break;
    }
    case "lead.round": {
      // One kind carries a round's whole life (00140), so the state says which
      // moment this row is, and an ended one says why in the words the rest of
      // the product already uses for the nine endings. What it cost is the
      // workspace's business, not the log's.
      const state = str(p, "state");
      if (state === "ended") {
        bits.push("finished");
        const ending = str(p, "ending");
        if (ending && ending in LEAD_ENDING_WORDS) bits.push(LEAD_ENDING_WORDS[ending as LeadRoundEnding]);
        const counted = num(p, "counted");
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
      const card = str(p, "card");
      if (card) bits.push(card.replace(/_/g, " "));
      const asked = str(p, "asked");
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
  return ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p));
}

export type { DecisionVerb as ActivityVerb };
