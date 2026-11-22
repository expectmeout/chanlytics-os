/**
 * booking_lapse, the job (packages/jobs/src/handlers/booking-lapse.ts), run through the dispatcher over a database in
 * memory: a time a customer asked for that ran out with no answer (decision 0061, as amended 22 Nov 2026). The verb's
 * own rule is a-request-nobody-answered-is-told.test.mjs's, beside this file; these are the handler's: what it
 * reads of the request and its conversation from the rows, what it hands the database's door, and what is left of a
 * request whose job will not finish.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { dispatchJob } from "../../../packages/jobs/src/handlers/handlers.ts";
import { MAX_ATTEMPTS } from "../../../packages/jobs/src/runner/ledger.ts";
import { settleJob } from "../../../packages/jobs/src/runner/settle.ts";

const T = "11111111-1111-4111-8111-111111111111";
const ROW = "dddddddd-0000-4000-8000-00000000d001";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const K = "bbbbbbbb-0000-4000-8000-00000000b001";
const H = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

/** A request asked 23 hours and five minutes ago, for a time two days on: it ran out five minutes ago. */
function world(over = {}) {
  const now = Date.now();
  const asked = now - 23 * H - 5 * 60_000;
  const held = {
    tenants: [{ id: T, timezone: "America/New_York", status: "active" }],
    contacts: [
      { id: K, tenant_id: T, phone_e164: "+13055550142", display_name: "Ana Ruiz", consent: "opted_in", dnc: false },
    ],
    conversations: [
      {
        id: CONV,
        tenant_id: T,
        contact_id: K,
        state: "needs_human",
        last_inbound_on_whatsapp: iso(asked),
        last_inbound_on_instagram: null,
        set_aside_at: null,
        control_kind: null,
        control_ref: null,
        control_until: null,
        ...(over.conversation ?? {}),
      },
    ],
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: CONV,
        channel: "whatsapp",
        type: "text",
        direction: "inbound",
        sender: "customer",
        status: "received",
        body: "Saturday at 2 works",
        meta: {},
        created_at: iso(asked),
      },
      ...(over.messages ?? []),
    ],
    escalations: [
      {
        id: "e1",
        tenant_id: T,
        conversation_id: CONV,
        reason: over.holdReason ?? "booking_request",
        details: "Asked for Sat, Oct 17, 2:00 PM · Balayage",
        state: "open",
        created_at: iso(asked),
      },
    ],
    conversation_drafts: [],
    appointments: [
      {
        id: ROW,
        tenant_id: T,
        contact_id: K,
        conversation_id: CONV,
        source: "receptionist",
        status: "proposed",
        starts_at: iso(now + 48 * H),
        ends_at: iso(now + 50 * H),
        service: "Balayage",
        timezone: "America/New_York",
        expires_at: iso(asked + 23 * H),
        created_at: iso(asked),
        client_phone: "+13055550142",
        client_name: "Ana Ruiz",
        lapse_told: null,
        ...(over.appointment ?? {}),
      },
    ],
  };
  const doors = [];
  const written = [];
  const ctx = {
    db: fakeDb(
      held,
      {},
      {
        booking_request_lapse: (a) => {
          doors.push(a);
          return over.door ?? (a.p_message ? { outcome: "told", message_id: "msg-1" } : { outcome: "reply" });
        },
      },
    ),
    deadline: now + 40_000,
    wire: {},
    alert: async () => {},
    schedule: async () => {},
    scheduleOnce: async () => "scheduled",
    drafts: {
      write: {
        reply: async (tenantId, ask) => {
          written.push({ tenantId, ask });
          if (over.write instanceof Error) throw over.write;
          return over.write ?? { text: "Sorry, we couldn't confirm Saturday at 2.", subject: "", used: [] };
        },
        brief: async () => ({ why: "not_drafted" }),
      },
      readSender: async () => null,
    },
    lapses: { posture: async () => over.posture ?? { mode: "auto", delayMs: 0, paused: false } },
    ...(over.ctx ?? {}),
  };
  const run = (attempts = 1) =>
    dispatchJob(ctx, { id: "job-1", tenant_id: T, kind: "booking_lapse", payload: { appointment_id: ROW }, attempts });
  return { ctx, held, doors, written, run, now, asked };
}

test("nobody answered: the job reads the rows, asks AI once, and hands the door the message with the close", async () => {
  const w = world();
  assert.equal(await w.run(), "done");
  assert.equal(w.written.length, 1);
  assert.equal(w.written[0].ask.conversationId, CONV);
  assert.equal(w.written[0].ask.wire, "whatsapp");
  assert.equal(w.written[0].ask.theirWords, "Saturday at 2 works");
  assert.match(w.written[0].ask.instruction, /Nobody confirmed it in time/);
  assert.equal(w.doors.length, 1);
  const [door] = w.doors;
  assert.equal(door.p_appointment_id, ROW);
  assert.match(door.p_reply_words, / · Balayage wasn't confirmed in time: reply to them$/);
  assert.deepEqual(door.p_message, {
    tenant_id: T,
    conversation_id: CONV,
    contact_id: K,
    channel: "whatsapp",
    sender: "ai",
    type: "text",
    body: "Sorry, we couldn't confirm Saturday at 2.",
    // What it is, which request it closes, and where it goes, frozen on the row; no reply_to, so the send door measures
    // its lateness from its own writing.
    meta: { source: "booking_lapse", appointment_id: ROW, to: "+13055550142" },
  });
  // Never more than two hours after the request ran out.
  assert.equal(door.p_payload.to_phone, "+13055550142");
  assert.equal(Date.parse(door.p_payload.stale_after), w.asked + 23 * H + 2 * H);
  assert.ok(Math.abs(Date.parse(door.p_due_at) - Date.now()) < 5_000, "under Auto it leaves now");
});

test("a person typed a reply since they asked: no model is asked, and the door is handed no message", async () => {
  const w = world({
    messages: [
      {
        id: "m2",
        tenant_id: T,
        conversation_id: CONV,
        channel: "whatsapp",
        type: "text",
        direction: "outbound",
        sender: "human",
        status: "sent",
        body: "We'll call you about Saturday",
        meta: {},
        created_at: iso(Date.now() - 3 * H),
      },
    ],
  });
  assert.equal(await w.run(), "done");
  assert.equal(w.written.length, 0);
  assert.equal(w.doors.length, 1);
  assert.equal("p_message" in w.doors[0], false);
});

test("the customer wrote again since they asked: AI sends nothing of its own, and the door is handed no message", async () => {
  // What they wrote since has no answer yet. AI's own message would take it up too, in a draft's voice ("I'll find
  // out and come back to you", the walk of 22 Nov 2026), with nobody left to find out: a person reads the draft first.
  const w = world({
    messages: [
      {
        id: "m2",
        tenant_id: T,
        conversation_id: CONV,
        channel: "whatsapp",
        type: "text",
        direction: "inbound",
        sender: "customer",
        status: "received",
        body: "Also, do you do keratin?",
        meta: {},
        created_at: iso(Date.now() - 3 * H),
      },
    ],
  });
  assert.equal(await w.run(), "done");
  assert.equal(w.written.length, 0);
  assert.equal(w.doors.length, 1);
  assert.equal("p_message" in w.doors[0], false);
});

test("the message they asked in is not writing again: written a moment before its request, they are still told", async () => {
  const w = world({ appointment: { created_at: iso(Date.now() - 23 * H - 4 * 60_000) } });
  assert.equal(await w.run(), "done");
  assert.equal(w.written.length, 1);
  assert.ok(w.doors[0].p_message);
});

test("a campaign's send since they asked is no person speaking: they are still told", async () => {
  const w = world({
    messages: [
      {
        id: "m2",
        tenant_id: T,
        conversation_id: CONV,
        channel: "whatsapp",
        type: "template",
        direction: "outbound",
        sender: "human",
        status: "sent",
        body: "Our autumn offer",
        meta: { source: "broadcast" },
        created_at: iso(Date.now() - 3 * H),
      },
    ],
  });
  await w.run();
  assert.equal(w.written.length, 1);
  assert.ok(w.doors[0].p_message);
});

test("a person holds the conversation right now: nothing is sent", async () => {
  const w = world({ conversation: { control_kind: "person", control_ref: "u1", control_until: iso(Date.now() + H) } });
  await w.run();
  assert.equal(w.written.length, 0);
  assert.equal("p_message" in w.doors[0], false);
});

test("a hold that ran out long ago holds nothing", async () => {
  const w = world({ conversation: { control_kind: "person", control_ref: "u1", control_until: iso(Date.now() - H) } });
  await w.run();
  assert.equal(w.written.length, 1);
});

test("a workspace that asks first, or has everything stopped, sends nothing", async () => {
  const w = world({ posture: { mode: "ask", delayMs: 0, paused: false } });
  await w.run();
  assert.equal(w.written.length, 0);
  assert.equal("p_message" in w.doors[0], false);
});

test("a request answered meanwhile is no work: the job says so and touches nothing", async () => {
  const w = world({ appointment: { status: "booked" } });
  assert.deepEqual(await w.run(), { skipped: "answered" });
  assert.equal(w.doors.length, 0);
  assert.equal(w.written.length, 0);
});

test("a writer that throws is thrown on, so the ledger tries again; its last try leaves the reply for a person", async () => {
  const w = world({ write: new Error("the model timed out") });
  await assert.rejects(w.run(1), /timed out/);
  assert.equal(w.doors.length, 0, "nothing closed, nothing sent");
  assert.equal(await w.run(MAX_ATTEMPTS), "done");
  assert.equal(w.doors.length, 1);
  assert.equal("p_message" in w.doors[0], false);
});

test("a runtime with no writer fails loudly rather than guess", async () => {
  const w = world({ ctx: { drafts: undefined } });
  await assert.rejects(w.run(), /holds no writer/);
});

test("a job that will not finish closes its request for a person, with nothing sent", async () => {
  const w = world();
  const settled = await settleJob(
    w.ctx.db,
    { id: "job-1", kind: "booking_lapse", tenant_id: T, payload: { appointment_id: ROW } },
    true,
  );
  assert.deepEqual(settled, [{ what: "request", changed: true }]);
  assert.equal(w.doors.length, 1);
  assert.equal(w.doors[0].p_appointment_id, ROW);
  assert.equal("p_message" in w.doors[0], false);
  assert.match(w.doors[0].p_reply_words, /wasn't confirmed in time: reply to them$/);
  assert.equal(w.written.length, 0);
});

test("a job that will not finish for a request already answered moves nothing", async () => {
  const w = world({ appointment: { status: "cancelled" } });
  const settled = await settleJob(
    w.ctx.db,
    { id: "job-1", kind: "booking_lapse", tenant_id: T, payload: { appointment_id: ROW } },
    true,
  );
  assert.deepEqual(settled, [{ what: "request", changed: false }]);
  assert.equal(w.doors.length, 0);
});
