/**
 * A broadcast's email is claimed for the wire from the moment its row is written (messages.sending_at, 00352), as a
 * reply's row is claimed by sendQueued before the wire. The batch wrote it queued and unclaimed, then called the
 * provider: a member's cancel-send (which, since 00362, takes only a row no run has claimed) could win the row in the
 * seconds the provider took to answer, and the person got the email under a row that said canceled for ever, with no
 * provider id and no receipt to match. A send the provider did not take still gives its claim back and is withdrawn,
 * so nothing is left queued for a sweep to call lost.
 *
 * jobs' broadcastSend runs here as the runner dispatches it, with core's batch and the real door, over a database in
 * memory; only the provider is a fake, and the member's call-back is the one the dashboard makes (core-ports
 * cancelSendPorts, message_call_back over the one door, 00387): a queued row no run has claimed, or nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { middayZone } from "../shared/_midday-zone.mjs";
import { broadcastSend } from "../../../../packages/jobs/src/broadcast-send.ts";
import { broadcastEmailId } from "../../../../packages/core/src/campaigns/reach-out-ids.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADDRESS = "dana@example.com";
const VISIT = { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" };

/** A visit run of one person by email, in a workspace where it is midday (the batch asks the day's sending hours). */
function world() {
  const person = {
    consent: "unknown",
    dnc: false,
    marketing_consent: "unknown",
    consent_channels: null,
    marketing_channels: null,
    email_marketing: "unknown",
    erased_at: null,
    erasing_since: null,
    email: ADDRESS,
    email_suppressed_at: null,
  };
  return {
    tenants: [{ id: T, name: "Harbor Nails", status: "active", timezone: middayZone() }],
    tenant_config: [{ tenant_id: T, config: { brain: { business_name: "Harbor Nails" } } }],
    broadcasts: [
      {
        id: "b1",
        tenant_id: T,
        state: "sending",
        name: "Visits tomorrow",
        template_name: "visit_note",
        template_language: "en",
        params: [],
        recipient_count: 1,
        playbook_id: "p1",
        audience: { kind: "playbook", id: "p1", label: "Visit reminders", trigger: "visit_tomorrow" },
        failure: null,
        finished_at: null,
      },
    ],
    broadcast_recipients: [
      {
        tenant_id: T,
        broadcast_id: "b1",
        contact_id: "k1",
        state: "queued",
        reason: null,
        channel: "email",
        attempt: 0,
        facts: VISIT,
        message_id: null,
        sent_at: null,
      },
    ],
    templates: [
      {
        id: "tpl-email",
        tenant_id: T,
        channel: "email",
        source: "chanlytics",
        name: "visit_note",
        language: "en",
        category: "utility",
        meta_status: "approved",
        hidden_at: null,
        title: null,
        rejected_reason: null,
        variables: [],
        body_preview: "See you tomorrow.",
        components: [
          { type: "HEADER", format: "TEXT", text: "Your visit" },
          { type: "BODY", text: "See you tomorrow." },
        ],
      },
    ],
    contacts: [
      {
        id: "k1",
        tenant_id: T,
        phone_e164: null,
        display_name: "Dana",
        wa_profile_name: null,
        merged_into_contact_id: null,
        ...person,
      },
    ],
    conversations: [
      {
        id: "cv1",
        tenant_id: T,
        contact_id: "k1",
        paused_until: null,
        control_kind: null,
        control_until: null,
        contacts: person,
        tenants: { status: "active" },
      },
    ],
    mailboxes: [
      {
        id: "mb1",
        tenant_id: T,
        local_part: "harbornails",
        reply_token: "abcdefghijklmnopqrstuvwx",
        reply_token_prev: null,
        from_name: "Harbor Nails",
      },
    ],
    messages: [],
    events: [],
    jobs: [],
  };
}

/** One batch of the run, as the runner dispatches it, with the provider's answer in `email`. */
async function batch(tables, email) {
  const scheduled = [];
  await broadcastSend(
    {
      db: fakeDb(tables),
      wire: { whatsapp: null, sms: null, email },
      email: { domain: "mail.example.com" },
      alert: async () => {},
      schedule: async (kind, _dueAt, payload) => {
        scheduled.push([kind, payload]);
      },
      deadline: Date.now() + 60_000,
    },
    { id: "j1", tenant_id: T, kind: "broadcast_send", payload: { broadcast_id: "b1" } },
  );
  return scheduled;
}

/**
 * The provider, answering yes, with a member pressing Cancel on the thread while it answers: cancel-send as the dashboard
 * asks it. What the row was at that moment and what the call-back took are kept.
 */
function cancelDuringTheCall(tables) {
  const db = fakeDb(tables);
  const seen = { during: [], calledBack: [] };
  const email = async (to, p) => {
    const row = tables.messages.find((m) => m.id === p.email.idempotency_key);
    seen.during.push({ to, status: row?.status, claimed: !!row?.sending_at });
    const { data } = await db.rpc("message_call_back", { p_tenant_id: T, p_message_id: row.id });
    seen.calledBack.push(data === null ? 0 : 1);
    return { ok: true, wamid: "re_1", status: 200 };
  };
  return { email, seen };
}

test("a member's cancel during the provider's call changes nothing: the email is claimed for the wire, and its row ends sent", async () => {
  const tables = world();
  const { email, seen } = cancelDuringTheCall(tables);
  await batch(tables, email);
  assert.deepEqual(
    seen.during,
    [{ to: ADDRESS, status: "queued", claimed: true }],
    "queued, and claimed before the wire",
  );
  assert.deepEqual(seen.calledBack, [0], "the call-back took nothing: too late, as cancel-send words it");
  const [m] = tables.messages;
  assert.deepEqual([m.status, m.external_id], ["sent", "re_1"], "the row says what reached the person");
  assert.deepEqual(
    tables.events.filter((e) => e.subject_id === m.id).map((e) => e.kind),
    ["message.sent"],
    "no race with a cancel",
  );
  const [r] = tables.broadcast_recipients;
  assert.deepEqual([r.state, r.message_id], ["sent", m.id]);
});

test("a row already there under the email's id, still queued and unclaimed, is claimed before the wire too", async () => {
  // Written by a run of this person's before (under the same attempt), and never sent: the batch that holds the person
  // now sends it, and claims it first.
  const tables = world();
  const id = await broadcastEmailId({ broadcastId: "b1", contactId: "k1", attempt: 0, waits: 0, stalls: 0 });
  tables.messages.push({
    id,
    tenant_id: T,
    conversation_id: "cv1",
    contact_id: "k1",
    channel: "email",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "See you tomorrow.",
    status: "queued",
    sending_at: null,
    meta: { source: "broadcast", broadcast_id: "b1" },
  });
  const { email, seen } = cancelDuringTheCall(tables);
  await batch(tables, email);
  assert.deepEqual(seen.during, [{ to: ADDRESS, status: "queued", claimed: true }]);
  assert.deepEqual(seen.calledBack, [0]);
  assert.deepEqual(
    tables.messages.map((m) => [m.id, m.status]),
    [[id, "sent"]],
    "one row, the one that was there, and it says sent",
  );
});

test("an email the provider did not take gives its claim back and is withdrawn, and the person waits to be tried again", async () => {
  const tables = world();
  const scheduled = await batch(tables, async () => ({
    ok: false,
    outcome: "retryable",
    wamid: null,
    status: 429,
    errorBody: "slow down",
  }));
  const [m] = tables.messages;
  assert.deepEqual([m.status, m.error, m.sending_at ?? null], ["canceled", { reason: "not_taken" }, null]);
  const [r] = tables.broadcast_recipients;
  assert.equal(r.state, "queued", "handed back, to go under a new email next time");
  assert.deepEqual(
    scheduled.map(([kind]) => kind),
    ["broadcast_send"],
    "the run waits, and tries again",
  );
});
