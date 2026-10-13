import type { Tone } from "../shell/tone";

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
  "billing.payment_failed": "danger",
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
  "mailbox_connection.connected": "ok",
  "mailbox_connection.resumed": "ok",
  "mailbox_connection.unpaused": "ok",
  "workspace.created": "ok",
  approve: "ok",
  resolve: "ok",
  connect_channel: "ok",
  "deal.won": "ok",
  "member.joined": "ok",
  "appointment.booked": "ok",
  "billing.paid": "ok",
  "capability.activated": "ok",
  // warn -- somebody stopped something, or a rule was stepped around
  "billing.paused": "warn",
  "policy.veto_window_skipped": "warn",
  "line.released": "warn",
  "google.unlinked": "warn",
  "google.disconnected": "warn",
  "mailbox_connection.held": "warn",
  "mailbox_connection.signed_out": "warn",
  "mailbox.offers_paused": "warn",
  "capability.deactivated": "warn",
  "member.left": "warn",
  "appointment.cancelled": "warn",
  "reach_out.lead_stopped": "warn",
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
  "escalation.opened": "info",
  "conversation.owner_replied": "info",
  "line.texting_on": "info",
  take_over: "info",
  hand_back: "info",
  reply: "info",
};

/** The tone for a row, or "plain" where the product does not claim to know. */
export function activityTone(kind: string): Tone {
  return TONES[kind] ?? "plain";
}
