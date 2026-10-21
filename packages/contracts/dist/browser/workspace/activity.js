import { DECISION_VERBS, EVENT_KINDS, WABA_FIELDS } from "../shared/enums.js";
import { reasonShort } from "../conversations/escalations.js";
import { bookingToolName } from "../calendar/booking-notice.js";
import { LEAD_ENDING_WORDS } from "../leads/search/endings.js";
import {
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CLOSED_WORDS,
  LEAD_NOT_A_FIT_WORDS,
  LEAD_STAGE_WORDS
} from "../leads/lead-words.js";
import { mailboxHoldWords } from "../email/mailbox-standing.js";
import { reviewHeldWords } from "../google/review-reply.js";
import { standingChangeWords } from "../lines/number-standing.js";
import { businessFieldLabel } from "../lines/business-record.js";
import { HELD_REASONS } from "../broadcasts/run-words.js";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../reach-out/reach-out-replies.js";
import { plural } from "../shared/words.js";
import { partnerEventBits } from "./partner.js";
import { broadcastFailureWords } from "../broadcasts/broadcast-failure-words.js";
export const ACTIVITY_NOISE_PREFIXES = ["usage.", "webhook.", "ingest."];
export const ACTIVITY_NOISE_KINDS = [
  "escalation.changed",
  "lead.set_aside",
  // Later, in a pass of the pile (00426): a soft word for this sitting, not a decision the owner reads back.
  "lead.later",
  // The ideas for a search, written or asked for again (00400): how often is Reports', not the owner's day.
  "lead.ideas_written",
  "call.transferred",
  "booking_link.sent",
  "channel.quality_rating",
  // A door's own record of a match (00342, decision 0034): the owner reads contact.added, not every arrival.
  "person.resolved",
  // The calendar's hourly read, one row per appointment it kept (00348, decision 0002): the calendar is where they read it.
  "appointment.changed"
];
export const isActivityMoney = (row) => row.category === "billing";
const WORDS = {
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
  send_broadcast: "Sent a message once",
  cancel_broadcast: "Canceled a send",
  start_playbook: "Started a campaign",
  pause_playbook: "Paused a campaign",
  change_playbook: "Changed a campaign",
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
  mark_visit: "Said whether they came",
  change_step: "Changed a sequence's step",
  leave_sequence: "Took people out of a sequence",
  return_to_sequence: "Put people back in a sequence",
  make_sequence: "Made a sequence",
  discard_sequence: "Let a sequence go",
  answer_booking_request: "Answered a request to book",
  // events
  "message.received": "A customer wrote",
  "message.sent": "A message went out",
  "message.send_failed": "A message could not be sent",
  "message.send_blocked": "A message was held at the wire",
  "message.send_raced_cancel": "A send raced a cancel",
  "contact.consent_changed": "A consent answer changed",
  "contact.added": "A person was added",
  "contact.named": "A person was named",
  "contact.business_linked": "A person was linked to a business",
  "contact.business_unlinked": "A person was unlinked from a business",
  "contact.noted": "A note was written",
  "contact.note_changed": "A note was changed",
  "contact.note_removed": "A note was taken away",
  "contact.note_seen": "A note was read by the one it was for",
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
  "person.resolved": "A door resolved who a person is",
  "appointment.changed": "A booking on the calendar changed",
  // Retired with the Blob store (00151): nothing writes it, but rows written before survive in `events` and still need their sentence.
  "contact.blob_erased": "A person's stored thread was erased",
  "conversation.reopened": "A thread reopened",
  "conversation.pause_expired": "A pause ended",
  "conversation.snooze_expired": "A snooze ended",
  "escalation.changed": "A handover's reason changed",
  "escalation.opened": "A thread was handed to the team",
  "call.recorded": "A call was recorded",
  "call.transferred": "A call was passed to a person",
  "booking_link.sent": "The booking link was sent",
  "broadcast.sent": "A run finished",
  "broadcast.stopped": "A run stopped",
  "playbook.run": "A campaign ran",
  "playbook.changed": "A campaign was edited",
  "template.submitted": "A message was sent to WhatsApp for approval",
  "template.removed": "A message was deleted from Messages",
  "member.joined": "Joined the workspace",
  "member.left": "Left the workspace",
  "reach_out.lead_stopped": "A sequence stopped writing to a lead",
  "reach_out.send_decided": "A held email to a lead was decided",
  "reach_out.lead_added": "Leads were added to a sequence",
  "reach_out.lead_taken_back": "Leads were taken back from a sequence",
  "lead.kept": "A lead was kept from Needs review",
  "lead.excluded": "A lead was left out of Needs review",
  "lead.put_back": "A lead was put back in Needs review",
  "lead.later": "A lead was put off for later",
  "lead.addressee_chosen": "A company's sequence was set to write to someone else",
  "lead.search_renamed": "A search was renamed",
  "lead.search_removed": "A search was removed",
  "reach_out.source_set": "A sequence was set to add a search's new leads, or to stop",
  "contact.kept_apart": "Two records were kept as two people",
  "line.forwarding_set": "Call forwarding was set up",
  "appointment.booked": "A booking arrived by email",
  "appointment.moved": "A booking was changed by email",
  "appointment.cancelled": "A booking was cancelled by email",
  "conversation.owner_replied": "The owner replied from the WhatsApp Business app, and the receptionist stepped back",
  "billing.payment_failed": "A payment did not go through",
  "billing.paid": "A payment went through",
  "billing.trial_ending": "The trial ends in three days",
  "capability.activated": "Answering was switched on",
  "capability.deactivated": "Answering was switched off",
  "channel.quality_rating": "A WhatsApp number's quality rating changed",
  // Meta's own news of the account (contracts WABA_FIELDS), one kind per field: said as what Meta did, never as its field.
  "channel.phone_number_quality_update": "Meta changed a WhatsApp number's quality",
  "channel.account_update": "Meta updated the WhatsApp account",
  "channel.message_template_status_update": "Meta reviewed a message",
  "channel.account_review_update": "Meta reviewed the WhatsApp account",
  "channel.message_template_quality_update": "Meta changed a message's quality",
  "channel.template_category_update": "Meta changed a message's category",
  "channel.phone_number_name_update": "Meta reviewed a WhatsApp number's name",
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
  "mailbox_connection.connected": "A mailbox to write from was connected",
  "mailbox_connection.signed_out": "A mailbox to write from was signed out",
  "mailbox_connection.held": "A mailbox to write from was held",
  "mailbox_connection.resumed": "A mailbox to write from was resumed",
  "mailbox_connection.paused": "A mailbox to write from was paused",
  "mailbox_connection.unpaused": "A mailbox to write from writes again",
  "mailbox_connection.removed": "A mailbox to write from was removed",
  "channel.connected": "A WhatsApp number was connected",
  "lead.stage": "A lead moved",
  "lead.emailed": "A lead was marked as emailed",
  "lead.call": "A call to a lead was logged",
  "lead.not_a_fit": "A lead was marked not a fit",
  "lead.round": "A search for businesses",
  "lead.no_card": "An ask no source covers yet",
  "lead.converted": "A lead is Talking",
  "lead.set_aside": "A lead was set aside",
  "lead.ideas_written": "Ideas for a search were written",
  // A reply to a reach-out, read (Reach out Part 5): the case below says who and what it meant.
  "reach_out.replied": "A business wrote back to a sequence",
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
  "settings.fact_suggested": "The receptionist suggested a note from your correction",
  "settings.fact_kept": "A note from a correction was kept",
  "settings.fact_dismissed": "A note from a correction was dismissed",
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
  "webhook.delivery": "A webhook was delivered"
};
function humanize(kind) {
  const [family, rest] = kind.split(".", 2);
  const tail = (rest ?? "").replace(/_/g, " ");
  return `${family.charAt(0).toUpperCase()}${family.slice(1)}${tail ? ` \xB7 ${tail}` : ""}`;
}
export const activityKindWords = (kind) => WORDS[kind] ?? humanize(kind);
const textAt = (o, k) => typeof o[k] === "string" && o[k] ? o[k] : null;
const numberAt = (o, k) => typeof o[k] === "number" ? o[k] : null;
function settingsChangedWords(p) {
  const from = textAt(p, "from");
  const to = textAt(p, "to");
  if (from && to) return `renamed from \u201C${from}\u201D to \u201C${to}\u201D`;
  const fields = Array.isArray(p.fields) ? p.fields.filter((f) => typeof f === "string") : [];
  return fields.length ? fields.slice(0, 4).join(", ") : null;
}
function importWords(p) {
  const n = (k) => numberAt(p, k) ?? 0;
  const counts = `${n("added")} new, ${n("existed")} already here, ${n("skipped")} skipped`;
  const stopped = n("failed") > 0 ? ", then stopped at a fault" : "";
  return `Imported ${n("rows")} rows from a spreadsheet: ${counts}${stopped}`;
}
const CONVERTED_HOW = {
  call: "after a call",
  reply: "they wrote back",
  booking: "they booked",
  deal: "a deal was opened",
  arrived: "they got in touch",
  added: "they were added to People"
};
function readingWords(kind, p, base) {
  if (kind === "lead.converted") {
    const how = CONVERTED_HOW[textAt(p, "how") ?? ""];
    return how ? `${base} \xB7 ${how}` : base;
  }
  const who = textAt(p, "business") ?? "A business";
  if (textAt(p, "unread")) return `${who} wrote back \xB7 not read yet`;
  return isReplyIntent(p.intent) && p.intent !== "other" ? `${who} wrote back \xB7 ${REPLY_INTENT_WORDS[p.intent]}` : `${who} wrote back`;
}
const OFFERS_PAUSED_WHY = {
  complaints: "too many offers were marked as spam",
  bounces: "too many offers bounced"
};
function offersPausedWords(p, base) {
  const why = OFFERS_PAUSED_WHY[textAt(p, "reason") ?? ""];
  return why ? `${base} \xB7 ${why}` : base;
}
const joinBits = (base, bits) => {
  const said = bits.filter((b) => !!b);
  return said.length ? `${base} \xB7 ${said.join(" \xB7 ")}` : base;
};
const wordOf = (words, key) => key !== null && Object.hasOwn(words, key) ? words[key] ?? null : null;
function leadStageWords(p, base) {
  const n = numberAt(p, "count");
  const head = p.bulk === true && n !== null ? `${plural(n, "lead")} moved` : base;
  return joinBits(head, [wordOf(LEAD_STAGE_WORDS, textAt(p, "stage")), wordOf(LEAD_CLOSED_WORDS, textAt(p, "reason"))]);
}
function leadNotAFitWords(p, base) {
  const n = numberAt(p, "count");
  const head = p.bulk === true && n !== null ? `${plural(n, "lead")} ${n === 1 ? "was" : "were"} marked not a fit` : base;
  return joinBits(head, [wordOf(LEAD_NOT_A_FIT_WORDS, textAt(p, "why"))]);
}
export const REACH_OUT_EMAILED_WORDS = "An email went to a lead";
function leadEmailedWords(p, base) {
  return textAt(p, "by") === "reach_out" ? REACH_OUT_EMAILED_WORDS : base;
}
const ACTIVATED_WORDS = {
  line_live: "its first line is answering",
  first_reply: "its first reply went to a customer",
  first_lead_search: "its first lead search was made"
};
function sendBlockedWords(p, base) {
  return joinBits(base, [wordOf(HELD_REASONS, textAt(p, "reason"))]);
}
const SEND_FAILED_WHY = {
  receipt: "the provider reported it as not delivered, after taking it",
  no_credentials: "the channel has no credentials to send with",
  no_sender_for_channel: "nothing is set up to send on that channel"
};
function sendFailedWords(p, base) {
  const reason = textAt(p, "reason");
  const provider = numberAt(p, "http_status") === 0 ? "the provider gave no answer" : wordOf(HELD_REASONS, "send_failed");
  const why = p.outcome === "unknown" ? "the provider didn't answer in time, so it may have gone" : wordOf(SEND_FAILED_WHY, reason) ?? (reason === "provider" ? provider : null);
  return joinBits(base, [why]);
}
function runEndWords(kind, p, base) {
  const bits = [];
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
  return [base, ...bits].join(" \xB7 ");
}
const replyWords = (p, base) => p.starts === true ? "Began a conversation from the dashboard" : base;
export const CALL_MISSED_WORDS = "A call was missed";
export const CALL_UNANSWERED_WORDS = "A call we placed did not connect";
function callRecordedWords(p, base) {
  if (textAt(p, "status") !== "not_connected") return base;
  return textAt(p, "direction") === "outbound" ? CALL_UNANSWERED_WORDS : CALL_MISSED_WORDS;
}
const SEND_DECIDED_WORDS = {
  include: "A held email to a lead was sent as written",
  rewrite: "A held email to a lead was sent back to be written again",
  skip: "A held email to a lead was skipped",
  not_a_fit: "A held email to a lead was dropped: the lead is not a fit"
};
const FORWARDING_WORDS = { unanswered: "the calls not answered", always: "every call" };
function searchRemovedWords(p, base) {
  const kept = numberAt(p, "kept");
  return joinBits(base, [textAt(p, "name"), kept !== null ? `${kept} kept` : null]);
}
const CAPABILITY_WORDS = { voice: "calls", whatsapp: "WhatsApp", sms: "texts" };
const wordsAt = (o, k) => {
  const list = Array.isArray(o[k]) ? o[k].filter((f) => typeof f === "string") : [];
  return list.length ? list.slice(0, 4).join(", ") : null;
};
const recordChangedWords = (p) => {
  if (!Array.isArray(p.changed)) return null;
  const moved = p.changed.filter((c) => typeof c === "string");
  return moved.length ? moved.slice(0, 4).map(businessFieldLabel).join(", ") : "nothing changed";
};
const WHOLE_SENTENCE = new Map([
  ["broadcast.sent", (p, base) => runEndWords("broadcast.sent", p, base)],
  ["broadcast.stopped", (p, base) => runEndWords("broadcast.stopped", p, base)],
  ["import", (p) => importWords(p)],
  ["reply", replyWords],
  ["lead.converted", (p, base) => readingWords("lead.converted", p, base)],
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
    "mailbox_connection.removed"
  ].map(
    (k) => [
      k,
      (p, base) => joinBits(base, [
        textAt(p, "address"),
        k === "mailbox_connection.held" && textAt(p, "why") ? mailboxHoldWords(textAt(p, "why") ?? "") : null
      ])
    ]
  ),
  ["business.recorded", (p, base) => joinBits(base, [recordChangedWords(p)])],
  // A run the hourly sweep skipped because its day had passed (no approval could send it, S7-3): the system's, named.
  [
    "cancel_broadcast",
    (p, base) => textAt(p, "reason") === "day_passed" ? joinBits("Skipped a run whose day had passed", [textAt(p, "name")]) : base
  ],
  ["channel.standing", (p, base) => joinBits(base, [standingChangeWords(p)])],
  ["workspace.activated", (p, base) => joinBits(base, [wordOf(ACTIVATED_WORDS, textAt(p, "milestone"))])],
  ["google.reply_held", (p, base) => joinBits(base, [reviewHeldWords(textAt(p, "why"))])],
  ["message.send_blocked", sendBlockedWords],
  ["escalation.opened", (p, base) => joinBits(base, [textAt(p, "reason") ? reasonShort(textAt(p, "reason")) : null])],
  ["member.joined", (p, base) => joinBits(base, [textAt(p, "role") ? `as ${textAt(p, "role")}` : null])],
  [
    "member.left",
    (p, base) => joinBits(base, [textAt(p, "how") === "account_deleted" ? "deleted their account" : null])
  ],
  // Team's Resend renews an invitation and emails it again (00371 team_invite_renew); a member's own Leave is a removal
  // by their own hand (team_leave). Each is said as what happened, not as a second invitation or a removal by somebody.
  ["invite", (p, base) => p.resent === true ? "Sent an invitation again" : base],
  ["remove_member", (p, base) => p.left === true ? "Left the team" : base],
  ["call.recorded", callRecordedWords],
  ["reach_out.send_decided", (p, base) => wordOf(SEND_DECIDED_WORDS, textAt(p, "decision")) ?? base],
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
    (k) => [
      k,
      (p, base) => joinBits(base, partnerEventBits(k, p))
    ]
  )
]);
const exportedWords = (what) => what === "workspace" ? "the records" : what === "people" ? "everyone as a CSV" : what === "person" ? "a person's records" : `a ${what}`;
export function activityWords(kind, payload) {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const base = kind === "take_over" && textAt(p, "how") === "transfer" ? "Took over a call" : WORDS[kind] ?? humanize(kind);
  const whole = WHOLE_SENTENCE.get(kind);
  if (whole) return whole(p, base);
  const bits = [];
  switch (kind) {
    case "take_over": {
      if (textAt(p, "how") === "transfer") bits.push("passed to the business's line");
      break;
    }
    case "consent_change":
    case "contact.consent_changed": {
      const purpose = textAt(p, "purpose") === "marketing" ? "offers" : textAt(p, "purpose") === "email_marketing" ? "marketing email" : "messages";
      const consent = textAt(p, "consent");
      bits.push(
        consent === "opted_in" ? `yes to ${purpose}` : consent === "opted_out" ? `no to ${purpose}` : `${purpose}: not asked`
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
      if (what) bits.push(exportedWords(what));
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
      const said = settingsChangedWords(p);
      if (said) bits.push(said);
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
      const state = textAt(p, "state");
      if (state === "ended") {
        bits.push("finished");
        const ending = textAt(p, "ending");
        if (ending && ending in LEAD_ENDING_WORDS) bits.push(LEAD_ENDING_WORDS[ending]);
        const counted = numberAt(p, "counted");
        if (counted !== null) bits.push(`${counted} found`);
      } else if (state) {
        bits.push(
          state === "queued" ? "started" : state === "waiting_on_owner" ? "waiting on your answer" : state.replace(/_/g, " ")
        );
      }
      break;
    }
    case "lead.no_card": {
      const card = textAt(p, "card");
      if (card) bits.push(card.replace(/_/g, " "));
      const asked = textAt(p, "asked");
      if (asked) bits.push(asked.slice(0, 80));
      break;
    }
    default:
      break;
  }
  return bits.length ? `${base} \xB7 ${bits.join(" \xB7 ")}` : base;
}
export const ACTIVITY_KINDS = [
  ...DECISION_VERBS,
  ...EVENT_KINDS,
  ...WABA_FIELDS.map((field) => `channel.${field}`)
];
export function isActivityNoise(kind) {
  return ACTIVITY_NOISE_PREFIXES.some((p) => kind.startsWith(p)) || ACTIVITY_NOISE_KINDS.includes(kind);
}
