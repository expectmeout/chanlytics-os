/**
 * A People row the way the page reads it: a `people_list` row (PersonRowDto) through contracts' own builder,
 * toPersonRowVM, at a fixed moment in a fixed zone. A list's rule reads facts the builder works out once (decision
 * 0009: local days, standing for a viewer, the deal stage, the two yeses), so a test that means "someone quiet for 40
 * days" says it in the row's own columns and lets the builder say the rest, rather than hand-writing half a view model.
 */
import { toPersonRowVM } from "@chanlytics/contracts";

export const ROW_NOW = Date.parse("2026-09-20T15:00:00.000Z");
export const ROW_TZ = "America/New_York";
export const DAY = 86_400_000;

/** An ISO time `days` before ROW_NOW (or after it, for a negative number). */
export const daysAgo = (days, now = ROW_NOW) => new Date(now - days * DAY).toISOString();

/** Every column people_list answers, empty, then `over`: a person who wrote once, three days ago, on WhatsApp. */
export function personDto(over = {}) {
  return {
    id: "p1",
    display_name: null,
    wa_profile_name: null,
    phone_e164: "+13055550100",
    email: null,
    consent: "opted_in",
    consent_source: "customer_message",
    marketing_consent: "unknown",
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: null,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: daysAgo(3),
    last_message_direction: "inbound",
    last_message_sender: null,
    last_inbound_text: null,
    last_inbound_at: daysAgo(3),
    last_call_at: null,
    last_inbound_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: daysAgo(60),
    earliest_row_at: daysAgo(60),
    has_backfill: false,
    has_chat: true,
    message_channels: ["whatsapp"],
    queued_reply_at: null,
    came_from: "whatsapp",
    visits: null,
    ...over,
  };
}

/** The row as People reads it, for `viewer` (null: no one looking, as a playbook's run). */
export function personRow(over = {}, { now = ROW_NOW, tz = ROW_TZ, viewer = null } = {}) {
  return toPersonRowVM(personDto(over), tz, new Date(now), viewer);
}
