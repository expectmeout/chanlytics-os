import { DECISION_VERBS, EVENT_KINDS, type DecisionVerb } from "./enums";

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

const WORDS: Record<string, string> = {
  // decisions
  approve: "Approved a reply", edit: "Edited a reply", decline: "Declined a reply", snooze: "Snoozed a thread", wake: "Woke a thread",
  take_over: "Took over a thread", hand_back: "Handed a thread back to the receptionist", resolve: "Resolved an escalation", archive: "Archived a thread",
  reply: "Replied from the dashboard", cancel_send: "Stopped a reply before it sent", pause_agent: "Paused the receptionist", resume_agent: "Resumed the receptionist",
  invite: "Invited a member", revoke_invite: "Withdrew an invitation", change_role: "Changed a member's role", remove_member: "Removed a member",
  erase: "Erased a person", whisper: "Whispered to the phone receptionist", connect_channel: "Connected a channel", consent_change: "Recorded a consent answer",
  send_broadcast: "Sent a broadcast", cancel_broadcast: "Canceled a broadcast", start_playbook: "Started a playbook", pause_playbook: "Paused a playbook",
  reply_review: "Replied to a Google review", export: "Exported data", end_call: "Ended a call",
  // events
  "message.received": "A customer wrote", "message.sent": "A message went out", "message.send_failed": "A message could not be sent",
  "message.send_blocked": "A message was held at the wire", "message.send_raced_cancel": "A send raced a cancel",
  "contact.consent_changed": "A consent answer changed", "contact.added": "A person was added", "contact.named": "A person was named",
  "contact.noted": "A note was written", "contact.email_set": "A person's email address changed", "contact.email_suppressed": "A person's email address stopped being sent to", "contact.erased": "A person was erased", "contact.blob_erased": "A person's stored thread was erased",
  "conversation.reopened": "A thread reopened", "conversation.pause_expired": "A pause ended", "conversation.snooze_expired": "A snooze ended",
  "call.recorded": "A call was recorded", "broadcast.sent": "A broadcast finished", "playbook.run": "A playbook ran",
  "setup.requested": "Setup was requested", "voice.provisioned": "The phone receptionist was provisioned",
  "line.answering": "A line started answering", "line.failed": "A line failed", "line.released": "A line was released", "line.forwarding_verified": "Forwarding was verified",
  "line.texting_on": "Texting turned on", "line.texting_approved": "The carriers approved texting", "line.texting_rejected": "The carriers sent the registration back",
  "business.recorded": "The business record was saved", "platform.acted": "Chanlytics acted on the workspace",
  "google.linked": "A Google listing was linked", "google.unlinked": "The Google listing was unlinked", "google.reviews": "New Google reviews were read",
  "google.connected": "Google Business Profile was connected", "google.disconnected": "Google Business Profile was disconnected", "google.replied": "A Google review was answered",
  "mailbox.created": "The workspace's email address was set up", "mailbox.renamed": "The name on the workspace's email changed",
  "workspace.created": "The workspace was created", "settings.changed": "Settings changed", "policy.changed": "An autonomy setting changed",
  "billing.updated": "Billing changed", "billing.paused": "Billing paused the workspace", "billing.resumed": "Billing resumed the workspace",
  "ingest.allowlist_skip": "A message was skipped by the allowlist", "ingest.unreachable_sender": "A sender could not be answered",
  "ingest.unroutable": "A message could not be placed on a workspace",
  "policy.veto_window_skipped": "A veto window was skipped", "usage.llm_tokens": "Model usage", "usage.ask_tokens": "Assistant usage",
  "usage.voice_seconds": "Call minutes", "usage.wa_conversation": "A WhatsApp conversation opened",
  "webhook.auth": "A webhook signature was checked", "webhook.delivery": "A webhook was delivered",
};

/** "line.texting_approved" → "Line · texting approved", for a kind the table above does not name (a channel.* field, or a new one). */
function humanize(kind: string): string {
  const [family, rest] = kind.split(".", 2);
  const tail = (rest ?? "").replace(/_/g, " ");
  return `${family.charAt(0).toUpperCase()}${family.slice(1)}${tail ? ` · ${tail}` : ""}`;
}

const str = (o: Record<string, unknown>, k: string): string | null => (typeof o[k] === "string" && (o[k] as string) ? (o[k] as string) : null);
const num = (o: Record<string, unknown>, k: string): number | null => (typeof o[k] === "number" ? (o[k] as number) : null);

/**
 * The sentence for a row: the kind's words, then the one or two fields a
 * reader wants and nothing else of the payload.
 */
export function activityWords(kind: string, payload: unknown): string {
  const p = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  // A take-over on a call is the Inbox's verb with a different subject: the
  // receptionist passed the caller to the business's own line.
  const base = kind === "take_over" && str(p, "how") === "transfer" ? "Took over a call" : (WORDS[kind] ?? humanize(kind));
  const bits: string[] = [];
  switch (kind) {
    case "take_over": { if (str(p, "how") === "transfer") bits.push("passed to the business's line"); break; }
    case "consent_change": case "contact.consent_changed": {
      const purpose = str(p, "purpose") === "marketing" ? "offers" : "messages about their visit";
      const consent = str(p, "consent");
      bits.push(consent === "opted_in" ? `yes to ${purpose}` : consent === "opted_out" ? `no to ${purpose}` : `${purpose}: not asked`);
      const source = str(p, "source");
      if (source && source !== "operator") bits.push(source.replace(/_/g, " "));
      break;
    }
    case "change_role": { const role = str(p, "role") ?? str(p, "to"); if (role) bits.push(`to ${role}`); break; }
    case "export": { const what = str(p, "what"); if (what) bits.push(what === "workspace" ? "everything" : what === "people" ? "everyone as a CSV" : `a ${what}`); const rows = num(p, "rows"); if (rows !== null) bits.push(`${rows} rows`); break; }
    case "pause_agent": case "resume_agent": { const mode = str(p, "receptionist_mode"); if (mode) bits.push(mode === "inherit" ? "follows the workspace" : mode); const batch = num(p, "batch"); if (batch) bits.push(`one of ${batch}`); break; }
    case "send_broadcast": { const name = str(p, "name"); if (name) bits.push(name); const n = num(p, "recipients"); if (n !== null) bits.push(`${n} people`); if (p.approved === true) bits.push("approved by hand"); break; }
    case "broadcast.sent": { const sent = num(p, "sent"); const held = num(p, "held"); if (sent !== null) bits.push(`${sent} got it`); if (held) bits.push(`${held} held`); break; }
    case "settings.changed": { const fields = Array.isArray(p.fields) ? (p.fields as unknown[]).filter((f): f is string => typeof f === "string") : []; if (fields.length) bits.push(fields.slice(0, 4).join(", ")); break; }
    case "policy.changed": { const cls = str(p, "class"); const mode = str(p, "mode"); if (cls) bits.push(cls); if (mode) bits.push(mode); break; }
    case "line.texting_rejected": case "line.failed": { const why = str(p, "error") ?? str(p, "reason"); if (why) bits.push(why.slice(0, 80)); break; }
    case "platform.acted": { const action = str(p, "action"); if (action) bits.push(action); break; }
    case "playbook.run": { const outcome = str(p, "outcome"); if (outcome) bits.push(outcome); const n = num(p, "recipients") ?? num(p, "count"); if (n !== null) bits.push(`${n} people`); break; }
    default: break;
  }
  return bits.length ? `${base} · ${bits.join(" · ")}` : base;
}

/** Every kind either ledger may hold, for the picker: the verbs, then the event kinds. */
export const ACTIVITY_KINDS: readonly string[] = [...DECISION_VERBS, ...EVENT_KINDS];

/** true for a kind an owner is not shown unless they ask for it by name. */
export function isActivityNoise(kind: string): boolean {
  return ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p));
}

export type { DecisionVerb as ActivityVerb };
