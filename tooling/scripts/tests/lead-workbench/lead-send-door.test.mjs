/**
 * A lead's own email (decision 0094), its door: POST leads/:id/send run through route(), its real handler over a database
 * in memory, and the reads and the "Did you send it?" door that keep a row of it. What is proved: who may press it, the
 * mailbox it leaves from, each refusal said before anything is written, what is written when it goes (the queued email as
 * the send door reads it, its row with no sequence, its job in the member's grace) and that a second press finds the first.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyUnsubscribeToken } from "@chanlytics/channels";
import {
  LEAD_NO_ADDRESS,
  LEAD_OWN_EMAIL_WORDS as W,
  PURPOSE_REFUSALS,
  REACH_OUT_MONTH_EMAILS,
  SEND_GRACE_MS,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.UNSUBSCRIBE_SECRET = "a-secret-only-this-file-holds";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const send = await import(at("apps/dashboard/app/api/v1/leads/[id]/send/route.ts"));
const stage = await import(at("apps/dashboard/app/api/v1/leads/[id]/stage/route.ts"));
const emails = await import(at("apps/dashboard/app/api/v1/leads/[id]/emails/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "cccccccc-2222-4222-8222-cccccccccccc";
const CONTACT = "eeeeeeee-2222-4222-8222-eeeeeeeeeeee";
const THREAD = "ffffffff-2222-4222-8222-ffffffffffff";
const BOX = "99999999-2222-4222-8222-999999999999";
const USER = "11111111-2222-4222-8222-111111111111";
const ADDRESS = "hello@fixture-studio.example";
const WORDS = {
  subject: "A question about your members",
  body: "Hi, we run small-group training nearby. Worth a call?",
};

const mailbox = (over = {}) => ({
  id: BOX,
  tenant_id: A,
  address: "sam@getharbor.example",
  from_name: "Sam at Harbor",
  provider: "google",
  state: "connected",
  connected_by: USER,
  connected_at: "2026-10-01T00:00:00Z",
  resting_until: null,
  signature: "Sam\nHarbor Moving",
  signature_off: false,
  ...over,
});

/** The workspace, one lead, one member, in the shapes the door reads. */
function world(over = {}) {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: over.role ?? "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
    tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/New_York", slug: "harbor" }],
    tenant_config: [
      {
        tenant_id: A,
        version: 1,
        config: {
          brain: {
            business_name: "Harbor Moving Co",
            booking_link: "https://book.example/harbor",
            system_prompt: "Answer as the front desk: brief and warm.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { ...(over.address === null ? {} : { address: "100 Example St, Austin, TX 78701" }) },
          },
        },
      },
    ],
    leads: [
      {
        id: LEAD,
        tenant_id: A,
        business_name: "Fixture Studio",
        email: ADDRESS,
        email_state: "ok",
        stage: "ready",
        contact_id: null,
        city: "Austin",
        kind: "place",
        source: "local_businesses",
        facts: {},
        erased_at: null,
        blanked_at: null,
      },
    ],
    contacts: [{ id: CONTACT, tenant_id: A, email: ADDRESS }],
    mailbox_connections: over.mailboxes ?? [mailbox()],
    sequence_sends: over.sends ?? [],
    messages: [],
    jobs: [],
    ...over.tables,
  };
}

const facts = (over = {}) => ({
  lead_stage: "ready",
  suppressed: false,
  wrote_back: false,
  away: false,
  stopped: false,
  customer: false,
  ...over,
});
const day = (over = {}) => ({
  state: "connected",
  resting_until: null,
  daily_cap: 40,
  customer_domain: false,
  sent_days: 30,
  used: 0,
  sent_today: 0,
  ...over,
});

/** The service role's world: the same tables, and the doors the send asks. */
function service(tables, over = {}) {
  const asked = [];
  const rpcs = {
    reach_out_draft_facts: () => over.facts ?? facts(),
    mailbox_capacity: () => over.day ?? day(),
    reach_out_month_sent: () => over.month ?? 0,
    reach_out_person: (a) => {
      asked.push(["person", a]);
      return over.person ?? { contact_id: CONTACT, conversation_id: THREAD, made: true };
    },
  };
  const db = fakeDb(tables, over.faults ?? {}, rpcs);
  return { db, asked };
}

function ctxOf(tables) {
  return {
    supabase: fakeDb(tables, {}, {}),
    userId: USER,
    email: "ada@example.com",
    aal: "aal2",
    params: { id: LEAD },
  };
}
const req = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });

async function press(over = {}, body = WORDS) {
  const tables = world(over);
  const { db, asked } = service(tables, over);
  setServiceClient(db);
  try {
    const out = await send.POST.run(req(body), ctxOf(tables));
    return { out, tables, asked };
  } finally {
    setServiceClient(null);
  }
}

async function refusedWith(over, words, status = 409) {
  const tables = world(over);
  const { db } = service(tables, over);
  setServiceClient(db);
  try {
    await assert.rejects(send.POST.run(req(WORDS), ctxOf(tables)), (e) => {
      assert.equal(e.message, words);
      assert.equal(e.status, status);
      return true;
    });
  } finally {
    setServiceClient(null);
  }
  assert.equal(tables.messages.length, 0, "no email written");
  assert.equal(tables.sequence_sends.length, over.sends?.length ?? 0, "no row written");
}

test("the door is an operator's, as the draft is, with a rate of its own, and spends nothing", () => {
  assert.deepEqual(send.POST.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "lead_send",
    spend: false,
  });
});

test("sent from the mailbox: a queued email as the send door reads it, its row with no sequence, and its job in the grace", async () => {
  const before = Date.now();
  const { out, tables, asked } = await press();
  assert.equal(asked.length, 1, "the person a first email makes is made once");
  assert.equal(tables.messages.length, 1);
  const m = tables.messages[0];
  assert.deepEqual(
    [m.status, m.channel, m.direction, m.sender, m.sent_by, m.conversation_id, m.contact_id],
    ["queued", "email", "outbound", "human", USER, THREAD, CONTACT],
  );
  assert.equal(m.meta.source, "reach_out", "the month's allowance counts it by its source");
  assert.equal(m.meta.reach_out.lead_id, LEAD, "what the send door judges it by");
  const r = m.meta.email.request;
  assert.equal(r.from, `"Sam at Harbor" <sam@getharbor.example>`);
  assert.deepEqual(r.to, [ADDRESS]);
  assert.equal(
    r.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
    "the door refuses a cold email without it",
  );
  assert.ok(r.text.includes("small-group training"), "the member's words");
  assert.ok(r.text.includes("100 Example St"), "the foot the law asks for");
  const [, token] = /^<https:\/\/[^/]+\/u\/([A-Za-z0-9_-]+)>$/.exec(r.headers["List-Unsubscribe"]) ?? [];
  assert.deepEqual(
    verifyUnsubscribeToken([process.env.UNSUBSCRIBE_SECRET], token),
    { tenantId: A, contactId: CONTACT, messageId: m.id },
    "sealed for this person and this email",
  );

  assert.equal(tables.sequence_sends.length, 1);
  const s = tables.sequence_sends[0];
  assert.deepEqual(
    [
      s.sequence_id ?? null,
      s.batch_id ?? null,
      s.step_id ?? null,
      s.lead_id,
      s.contact_id,
      s.state,
      s.message_id,
      s.mailbox_id,
      s.said_by,
    ],
    [null, null, null, LEAD, CONTACT, "queued", m.id, BOX, USER],
  );

  assert.equal(tables.jobs.length, 1);
  const j = tables.jobs[0];
  assert.equal(j.kind, "outbound_send");
  assert.deepEqual(
    [j.payload.message_id, j.payload.conversation_id, j.payload.to_email, j.payload.purpose, j.payload.proactive],
    [m.id, THREAD, ADDRESS, "outreach", true],
  );
  assert.ok(Date.parse(j.due_at) >= before + SEND_GRACE_MS, "Undo has its grace");
  assert.deepEqual([out.message_id, out.from, out.status], [m.id, "sam@getharbor.example", "queued"]);
  assert.ok(Date.parse(out.cancelable_until) >= before + SEND_GRACE_MS);
});

test("the member's own mailbox goes first, and a lead in a sequence leaves from its sequence's", async () => {
  const other = mailbox({
    id: "99999999-3333-4333-8333-999999999999",
    address: "other@getharbor.example",
    connected_by: null,
  });
  const mine = await press({ mailboxes: [other, mailbox()] });
  assert.equal(mine.out.from, "sam@getharbor.example");
  const held = await press({
    mailboxes: [mailbox(), other],
    sends: [
      {
        id: "s1",
        tenant_id: A,
        lead_id: LEAD,
        sequence_id: "seq",
        batch_id: "b",
        mailbox_id: other.id,
        state: "sent",
        created_at: "2026-10-20T00:00:00Z",
      },
    ],
  });
  assert.equal(held.out.from, "other@getharbor.example");
});

test("no mailbox, one that can't send and one with its day spent each refuse in their own words", async () => {
  await refusedWith({ mailboxes: [] }, W.whyNot.no_mailbox);
  await refusedWith({ mailboxes: [mailbox({ provider: "microsoft" })] }, W.whyNot.no_mailbox);
  await refusedWith({ mailboxes: [mailbox({ state: "reconnect" })] }, W.whyNot.not_sending);
  await refusedWith({ day: day({ used: 40 }) }, W.whyNot.day_full);
});

test("what the send door would refuse is refused at the press, in its words: the door's facts, read once", async () => {
  await refusedWith({ facts: facts({ suppressed: true }) }, PURPOSE_REFUSALS.outreach_suppressed);
  await refusedWith({ facts: facts({ wrote_back: true }) }, PURPOSE_REFUSALS.outreach_wrote_back);
  await refusedWith({ facts: facts({ stopped: true }) }, PURPOSE_REFUSALS.outreach_stopped);
  await refusedWith({ facts: facts({ lead_stage: "converted" }) }, PURPOSE_REFUSALS.outreach_lead_closed);
});

test("an address in People with no link to this lead is theirs, never a cold email's", async () => {
  await refusedWith({ person: { refused: "already_yours" } }, PURPOSE_REFUSALS.outreach_lead_closed);
});

test("a workspace that may not spend, or has written its month's cold email, sends none: as a sequence's send is held", async () => {
  await refusedWith(
    { tables: { billing_accounts: [{ tenant_id: A, mode: "stripe", status: "canceled" }] } },
    W.notActive,
  );
  await refusedWith({ month: REACH_OUT_MONTH_EMAILS }, W.monthSpent);
  const { out } = await press({ month: REACH_OUT_MONTH_EMAILS - 1 });
  assert.equal(out.status, "queued", "one left in the month goes");
});

test("no business address: the foot the law asks for can't be written, so nothing is", async () => {
  await refusedWith({ address: null }, LEAD_NO_ADDRESS, 422);
});

test("a second press while the first is on its way finds it", async () => {
  const sends = [
    {
      id: "s1",
      tenant_id: A,
      lead_id: LEAD,
      sequence_id: null,
      batch_id: null,
      state: "queued",
      message_id: null,
      created_at: "2026-11-04T00:00:00Z",
    },
  ];
  await refusedWith({ sends }, W.onItsWay);
});

/** A press whose row the database refuses, with `faults` naming how; what it rejected with, and the tables after. */
async function pressRefusedRow(faults) {
  const tables = world();
  setServiceClient(service(tables, { faults }).db);
  try {
    const error = await send.POST.run(req(WORDS), ctxOf(tables)).then(
      () => assert.fail("the press answered"),
      (e) => e,
    );
    return { error, tables };
  } finally {
    setServiceClient(null);
  }
}

test("a row the database refuses takes its email back: nothing stays queued that no job will send", async () => {
  const { error, tables } = await pressRefusedRow({
    "sequence_sends.insert": { code: "23502", message: "null value in column" },
  });
  assert.match(error.message, /cannot keep the lead's email/);
  assert.deepEqual(
    tables.messages.map((m) => m.status),
    ["canceled"],
  );
  assert.equal(tables.sequence_sends.length, 0);
  assert.equal(tables.jobs.length, 0);
});

test("the row's failure is what it says, even where the email can't be taken back", async () => {
  const { error } = await pressRefusedRow({
    "sequence_sends.insert": { code: "23502", message: "null value in column" },
    "messages.update": { message: "the door is down" },
  });
  assert.match(error.message, /cannot keep the lead's email/);
});

test("two presses at once: the key refuses the second, whose email goes back, and it finds the first", async () => {
  const { error, tables } = await pressRefusedRow({
    "sequence_sends.insert": { code: "23505", message: "sequence_sends_own_once" },
  });
  assert.equal(error.message, W.onItsWay);
  assert.deepEqual(
    tables.messages.map((m) => m.status),
    ["canceled"],
  );
  assert.equal(tables.jobs.length, 0);
});

test("Did you send it? with the words keeps a row of it: no mailbox, said by the member, and its email on the thread", async () => {
  const tables = world();
  const { db } = service(tables);
  setServiceClient(db);
  try {
    const rpc = {
      lead_set_stage: () => ({
        stage: "nurture",
        closed_reason: null,
        contact_id: null,
        existed: false,
        converted: false,
        op_id: "op",
        version: 4,
      }),
    };
    const ctx = { ...ctxOf(tables), supabase: fakeDb(tables, {}, rpc) };
    const out = await stage.POST.run(req({ kind: "emailed", words: WORDS }), ctx);
    assert.equal(out.toast, "Marked contacted.");
    assert.equal(out.undo, null, "the person it made is not undone from a toast");
  } finally {
    setServiceClient(null);
  }
  assert.equal(tables.sequence_sends.length, 1);
  const s = tables.sequence_sends[0];
  assert.deepEqual(
    [s.state, s.lead_id, s.mailbox_id ?? null, s.sequence_id ?? null, s.said_by, s.contact_id],
    ["sent", LEAD, null, null, USER, CONTACT],
  );
  assert.ok(s.sent_at && s.said_at);
  const m = tables.messages[0];
  assert.deepEqual([m.status, s.message_id, m.body], ["sent", m.id, WORDS.body]);
  assert.equal(tables.jobs.length, 0, "it left from their own mail app: nothing of ours sends it");
});

test("Did you send it? keeps its row even where no person can be made: it went all the same", async () => {
  const tables = world();
  const { db } = service(tables, { person: { refused: "already_yours" } });
  setServiceClient(db);
  try {
    const rpc = { lead_set_stage: () => ({ stage: "nurture", converted: false, op_id: "op", version: 4 }) };
    await stage.POST.run(req({ kind: "emailed", words: WORDS }), {
      ...ctxOf(tables),
      supabase: fakeDb(tables, {}, rpc),
    });
  } finally {
    setServiceClient(null);
  }
  assert.equal(tables.sequence_sends.length, 1);
  assert.equal(tables.sequence_sends[0].message_id ?? null, null);
  assert.equal(tables.messages.length, 0);
});

test("emails answers a lead's own emails alone, oldest first, each with where it left from", async () => {
  const tables = world({
    sends: [
      {
        id: "s2",
        tenant_id: A,
        lead_id: LEAD,
        sequence_id: null,
        batch_id: null,
        state: "sent",
        sent_at: "2026-11-04T00:00:00Z",
        created_at: "2026-11-04T00:00:00Z",
        said_at: "2026-11-04T00:00:00Z",
        mailbox_id: null,
        reason: null,
      },
      {
        id: "s1",
        tenant_id: A,
        lead_id: LEAD,
        sequence_id: null,
        batch_id: null,
        state: "sent",
        sent_at: "2026-11-03T00:00:00Z",
        created_at: "2026-11-03T00:00:00Z",
        said_at: null,
        mailbox_id: BOX,
        mailbox: { address: "sam@getharbor.example" },
        reason: null,
      },
      {
        id: "s0",
        tenant_id: A,
        lead_id: LEAD,
        sequence_id: "seq",
        batch_id: "b",
        state: "sent",
        sent_at: "2026-11-01T00:00:00Z",
        created_at: "2026-11-01T00:00:00Z",
        said_at: null,
        mailbox_id: BOX,
        reason: null,
      },
    ],
  });
  const out = await emails.GET.run(new Request(`http://localhost/api/v1/x?workspace=${A}`), ctxOf(tables));
  assert.deepEqual(out, [
    { id: "s1", state: "sent", at: "2026-11-03T00:00:00Z", from: "sam@getharbor.example", said: false, reason: null },
    { id: "s2", state: "sent", at: "2026-11-04T00:00:00Z", from: null, said: true, reason: null },
  ]);
});
