/**
 * The order a customer's message is taken through (./answer.ts), as data: every place a message can stop, and the steps
 * between them, in the order they are asked. The order is the product, and it was written by hand in three places that
 * each said something else (the review of 3 Nov 2026, D3). Now it is said once: tests/inbound/the-gates-run-in-their-
 * order.test.mjs runs the verb against this list, and the gate tables in docs/system-prd.md and
 * docs/conversation-flow.md are written from it (tooling/scripts/gen/inbound-gates.mjs; a stale one fails the suite).
 *
 * A gate stops the message, and says so in its log line; a step is something that happens to every message that gets
 * that far, and stops nothing by itself. `hold` is the hold a gate opens for a person when it trips the ordinary way
 * (the Inbox's reason, contracts ESCALATION_REASONS), or null where nobody is asked: set aside, a STOP, or a person or
 * a newer message already has it. `then` says the variants.
 */
import type { EscalationReason } from "@chanlytics/contracts";

export interface InboundGate {
  /** Its name, as the test and the docs say it. */
  key: string;
  /** A gate stops the message; a step happens to every message that gets this far. */
  kind: "gate" | "step";
  /** When it applies, in a sentence. */
  when: string;
  /** What happens then. */
  then: string;
  /** The hold a gate opens for a person, the ordinary way; null where nobody is asked. */
  hold: EscalationReason | null;
  /** The log line a gate writes when it stops a message (apps/edge/lib/log-events.ts); null for a step. */
  log: string | null;
}

export const INBOUND_GATES: readonly InboundGate[] = [
  {
    key: "short_code",
    kind: "gate",
    when: "The sender is a short code: a carrier notice, a bank alert",
    then: "Recorded and set aside: nothing can be sent back to a short code",
    hold: null,
    log: "short_code_set_aside",
  },
  {
    key: "one_time_code",
    kind: "gate",
    when: "The message is a one-time code a service sent (contracts `oneTimeCodeOf`, every wire's one reader)",
    then: "Recorded and set aside",
    hold: null,
    log: "one_time_code_set_aside",
  },
  {
    key: "pilot_allowlist",
    kind: "gate",
    when: "On the environment's own WhatsApp number, a sender off `WHATSAPP_TEST_ALLOWLIST`",
    then: "Recorded and set aside",
    hold: null,
    log: "wa_skip_allowlist",
  },
  {
    key: "persist",
    kind: "step",
    when: "Every other message",
    then: "`ingest_inbound` keeps it, its STOP or START and the yeses it carries, in one transaction; a write that fails is a 503, and the provider sends it again",
    hold: null,
    log: null,
  },
  {
    key: "replay",
    kind: "gate",
    when: "A message already handled, or one a reply already names (a turn that died before its stamp)",
    then: "Stopped before its memory is read: nothing is said twice",
    hold: null,
    log: "wa_skip_pg_dupe",
  },
  {
    key: "person_mode",
    kind: "step",
    when: "This person's own receptionist mode",
    then: "Read before any branch that can speak, and in force for this message",
    hold: null,
    log: null,
  },
  {
    key: "thread_unknown",
    kind: "gate",
    when: "The thread's history cannot be read",
    then: "Nothing answered from an invented empty history; held for a person",
    hold: "state_unavailable",
    log: "wa_state_unavailable",
  },
  {
    key: "opt_out",
    kind: "gate",
    when: "This message is a STOP, or a stop is on record",
    then: "No reply and no hold (decision 0048): the owner is told once, from the consent event",
    hold: null,
    log: "wa_skip_opt_out",
  },
  {
    key: "carriers",
    kind: "gate",
    when: "A text on a line the carriers have not approved for texting yet",
    then: "Held for a person",
    hold: "carriers",
    log: "sms_held_for_carriers",
  },
  {
    key: "no_request",
    kind: "gate",
    when: "A reaction, or a system notice",
    then: "Recorded: nothing was asked",
    hold: null,
    log: "wa_skip_no_request",
  },
  {
    key: "readable_non_text",
    kind: "gate",
    when: "A location, a contact card, or a post shared in a DM",
    then: "Held for a person, with no apology: a person can read it",
    hold: "non_text",
    log: "wa_escalate_readable_nontext",
  },
  {
    key: "stale",
    kind: "gate",
    when: "More than two hours late (ten minutes to two hours late is answered, and logged)",
    then: "Held for a person",
    hold: "stale",
    log: "wa_stale_escalated",
  },
  {
    key: "unreadable",
    kind: "gate",
    when: "Anything else that is not words the receptionist may read (a voice note, a document, a photo with vision off)",
    then: "Acknowledged where the mode may speak, and held; the thread pauses when the acknowledgement left, and a thread a person has is held for them (`wrote_while_held`)",
    hold: "non_text",
    log: "wa_nontext",
  },
  {
    key: "confirmed_yes",
    kind: "gate",
    when: "A START, or YES OFFERS on WhatsApp",
    then: "The confirmation goes, and nothing else is said; one that cannot go is held (`send_failed`, or `paused`)",
    hold: null,
    log: "wa_opt_in_confirmed",
  },
  {
    key: "human_has_it",
    kind: "gate",
    when: "A person on the team has the thread (its pause)",
    then: "Nothing said; held for them, one hold a stretch (00454)",
    hold: "wrote_while_held",
    log: "wa_skip_paused",
  },
  {
    key: "daily_cap",
    kind: "gate",
    when: "The thread's automatic replies for the day are used (twenty, the owner's dial)",
    then: "Held for a person",
    hold: "rate_cap",
    log: "wa_skip_ratecap",
  },
  {
    key: "workspace_paused",
    kind: "gate",
    when: "The workspace is paused (billing)",
    then: "Held for a person",
    hold: "paused",
    log: "wa_skip_workspace_paused",
  },
  {
    key: "mode_holds",
    kind: "gate",
    when: "Replies are set to Asks you or Stays quiet, for the workspace or for this person (decided with the three above, before the live hold and the budget are asked)",
    then: "Held for a person (`person_hold` for a hold set on this person), told once a hold",
    hold: "policy_block",
    log: "wa_held_by_policy",
  },
  {
    key: "live_hold",
    kind: "gate",
    when: "A call in progress on the thread, or a person who took it over (00132)",
    then: "Set aside: the call or the person has them, and the wire would refuse the words",
    hold: null,
    log: "wa_refused_at_wire",
  },
  {
    key: "budget",
    kind: "gate",
    when: "The day of model tokens is spent (`limits.max_llm_tokens_day`), asked of a message bound for the model",
    then: "Held for a person",
    hold: "budget",
    log: "wa_skip_budget",
  },
  {
    key: "no_persona",
    kind: "gate",
    when: "There is no persona, or the workspace's settings cannot be read or are broken",
    then: "Held for a person, in words that say which: nothing is answered in a voice that may not be the business's",
    hold: "policy_block",
    log: "wa_held_by_policy",
  },
  {
    key: "photo_unseen",
    kind: "gate",
    when: "A photo the receptionist would look at, whose bytes could not be used",
    then: "Handled as anything else that is not words",
    hold: "non_text",
    log: "wa_photo_not_seen",
  },
  {
    key: "superseded",
    kind: "gate",
    when: "A newer message of the thread holds its reply turn (00284), asked as the turn is claimed and again before the words leave",
    then: "Stopped: the newest message answers both",
    hold: null,
    log: "wa_superseded",
  },
  {
    key: "model",
    kind: "step",
    when: "The brain composes, by the job's deadline",
    then: "No model key: the greeting, labelled a fallback, a person asked and the platform paged. An error, or past the deadline: the fallback words and `brain_error`",
    hold: null,
    log: null,
  },
  {
    key: "layer_two",
    kind: "step",
    when: "Layer two checks the words in code",
    then: "A price it may not say is blocked (`policy_block`); money, and under Asks you a booking or a service question, are a person's (`policy_ask`)",
    hold: null,
    log: null,
  },
  {
    key: "hold_window",
    kind: "gate",
    when: "Veto, or a confidence below the owner's dial",
    then: "The reply waits as a draft in the hold window, for a person to change or let go",
    hold: null,
    log: "wa_reply_queued",
  },
  {
    key: "send",
    kind: "step",
    when: "Everything else",
    then: "Sent through the one send door (`deliver()`), which asks consent, the pause and the workspace's standing again at the wire; a handoff holds the thread and tells the owner",
    hold: null,
    log: null,
  },
];
