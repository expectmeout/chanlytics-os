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

/**
 * The row as People reads it, for `viewer` (null: no one looking, as a playbook's run), against what the workspace can
 * send on (`ready`, contracts channelsReady; null counts WhatsApp alone, as a page that could not read it does).
 */
export function personRow(over = {}, { now = ROW_NOW, tz = ROW_TZ, viewer = null, ready = null } = {}) {
  return toPersonRowVM(personDto(over), tz, new Date(now), viewer, ready);
}

/**
 * `record_consent` (00356) over a test's own doors, for a database in memory: the purpose's door as the test fakes it
 * (`set_contact_consent`, or `set_marketing_consent` with the person's workspace), then the consent_change decision
 * as the caller's, written to `tables.decisions` with the fields the function writes; the door's answer with the
 * decision's id beside it. A door that throws leaves no decision, as the function's one transaction does. Spread over
 * the test's rpcs: `fakeDb(tables, {}, consentDoor(tables, rpcs, USER))`. Here, beside the consent suites' other
 * helper, rather than in the tests' root: only they use it.
 */
export function consentDoor(tables, rpcs, userId) {
  return {
    ...rpcs,
    record_consent: (a) => {
      const person = (tables.contacts ?? []).find((c) => c.id === a.p_contact_id);
      if (!person) throw Object.assign(new Error("Contact not found."), { code: "P0002" });
      const offers = a.p_purpose === "marketing";
      const before = (offers ? person.marketing_consent : person.consent) ?? null;
      const said = {
        p_contact_id: a.p_contact_id,
        p_consent: a.p_consent,
        p_source: a.p_source,
        ...(a.p_note ? { p_note: a.p_note } : {}),
        ...(a.p_message_id ? { p_message_id: a.p_message_id } : {}),
      };
      const door = offers
        ? rpcs.set_marketing_consent({ p_tenant_id: person.tenant_id, ...said })
        : rpcs.set_contact_consent(said);
      const decisions = (tables.decisions ??= []);
      const decision = {
        id: `decision-${decisions.length + 1}`,
        tenant_id: person.tenant_id,
        subject_type: "contact",
        subject_id: a.p_contact_id,
        verb: "consent_change",
        actor_type: "user",
        actor_user_id: userId,
        payload: {
          consent: a.p_consent,
          source: a.p_source,
          note: a.p_note ?? null,
          previous: before,
          ...(offers ? { purpose: "marketing" } : {}),
          ...(a.p_message_id ? { message_id: a.p_message_id } : {}),
          ...(a.p_batch ? { batch: a.p_batch } : {}),
          ...(a.p_via ? { via: a.p_via } : {}),
        },
        undo_of: a.p_undo_of ?? null,
      };
      decisions.push(decision);
      return { ...door, decision_id: decision.id, undo_dropped: false };
    },
  };
}
