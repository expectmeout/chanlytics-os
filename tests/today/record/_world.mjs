/**
 * The small world the Today-says-the-truth tests share (decision 0047, task 1.3 of the wiring plan): one clock, a
 * metrics read, a thread waiting on a person, and People's rows with a next step each. The folder is a sibling of
 * tests/today, which holds its twenty modules.
 */
import { nextStepOf, toTodayVM, zoneDayKey } from "@chanlytics/contracts";

export const ZONE = "America/New_York";
/** 4 PM in New York on Friday 18 September 2026. */
export const NOW = new Date("2026-09-18T20:00:00Z");

export const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+13055550123" }],
  window: {
    days: 1,
    since: "2026-09-18T04:00:00+00:00",
    since_local: "2026-09-18T00:00:00",
    now_local: "2026-09-18T16:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 1,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 1,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...over,
  },
});

export const msg = (id, body, at, over = {}) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  created_at: at,
  ...over,
});

/** A thread as the Inbox reads it. `contact` overrides lay a stop or a do-not-contact on the person. */
export const thread = (id, name, messages, over = {}, contact = {}) => ({
  id,
  state: "open",
  paused_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: null,
  last_message_at: messages.at(-1)?.created_at ?? null,
  contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13055550100", ...contact },
  messages,
  ...over,
});

/** Ana Reyes asked for a person two hours ago: one handoff row in the queue. */
export const waiting = () =>
  thread("cv-a", "Ana Reyes", [msg("a1", "I'd rather talk to a person about a refund.", "2026-09-18T18:19:00Z")], {
    state: "needs_human",
  });
export const escalation = () => ({
  id: "e-a",
  conversation_id: "cv-a",
  reason: "human_token",
  details: null,
  state: "open",
  created_at: "2026-09-18T18:20:00Z",
});

/** Today's brief with one person waiting on a person. */
export const handoffDay = () => toTodayVM(metrics(), [waiting()], [escalation()], [], NOW);

/** The day `d` days from NOW by the business's calendar. */
export const dayKey = (d) => zoneDayKey(NOW.getTime() + d * 86_400_000, ZONE);

/**
 * People's rows with a next step each, as the People surface publishes them: [id, name, days from today (null: no step),
 * who it is for]. A step's words are "Call <name>" and its note is "s-<id>".
 */
export const peopleWithSteps = (specs) =>
  specs.map(([id, name, d, forName = null, dealId = null]) => ({
    id,
    name,
    nextStep:
      d === null
        ? null
        : nextStepOf(
            {
              step_id: `s-${id}`,
              step_body: `Call ${name}`,
              step_due_on: dayKey(d),
              step_for_user_id: forName ? `u-${forName}` : null,
              step_for_name: forName,
              step_deal_id: dealId,
            },
            ZONE,
            NOW.getTime(),
          ),
  }));
