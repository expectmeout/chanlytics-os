/**
 * The reach-out clock, run: POST /api/cron/reach-out over a database in memory (Reach out, Part 3). Each step, each
 * outcome: a queued send reads its email's fate once; a claim left mid-way is adopted or freed; a closed run's sends
 * are skipped; a stale one is planned again (and, after two weeks without room, given up); a run with nothing open
 * finishes. It claims nothing yet: that is the sender's (PR 6).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, refusedAtTheDoor, vault } from "./_cron-doors-world.mjs";

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/reach-out.ts"));
const { sendMessageId } = await import(at("packages/core/src/campaigns/reach-out-ids.ts"));
after(() => setPg(null));

const MIN = 60_000;
const DAY = 86_400_000;
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOT = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const DOM = "33333333-3333-4333-8333-333333333333";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms).toISOString();

let n = 0;
/** A send as reach_out_sends holds one, in a run that goes ahead on a running chain. */
const send = (over = {}) => {
  n += 1;
  return {
    id: `send-${n}`,
    tenant_id: T,
    broadcast_id: RUN,
    playbook_id: ROOT,
    root_id: ROOT,
    lead_id: `lead-${n}`,
    contact_id: null,
    domain_id: DOM,
    message_id: null,
    send_at: ago(MIN),
    state: "planned",
    reason: null,
    attempts: 0,
    claimed_at: null,
    sent_at: null,
    created_at: ago(DAY),
    updated_at: ago(DAY),
    ...over,
  };
};
const email = (id, status, over = {}) => ({
  id,
  tenant_id: T,
  channel: "email",
  direction: "outbound",
  status,
  error: null,
  meta: {},
  created_at: ago(10 * MIN),
  ...over,
});

function world({ sends = [], messages = [], runs = null, playbooks = null, domains = null } = {}) {
  const leadIds = sends.map((s) => s.lead_id);
  const tables = {
    tenants: [{ id: T, timezone: "America/Chicago" }],
    playbooks: playbooks ?? [
      { id: ROOT, tenant_id: T, kind: "reach_out", state: "running", gap_minutes: 12, domain_ids: [] },
    ],
    broadcasts: runs ?? [
      {
        id: RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: ROOT,
        audience: { kind: "reach_out", root_id: ROOT },
        updated_at: ago(DAY),
      },
    ],
    reach_out_sends: sends,
    messages,
    leads: leadIds.map((id) => ({
      id,
      tenant_id: T,
      stage: "ready",
      version: 1,
      contacted_at: null,
      region: "TX",
      hours: [],
    })),
    sending_domains: domains ?? [{ id: DOM, tenant_id: T, state: "verified" }],
    events: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      ...vault,
      sending_domain_capacity: () => ({
        state: "verified",
        clean_since: ago(20 * DAY),
        sent_days: 0,
        used: 0,
        recent: [],
        last_sent_at: null,
      }),
    },
  );
  setPg(db);
  const row = (id) => tables.reach_out_sends.find((s) => s.id === id);
  return { tables, row, tick: async () => answer(await knock(POST, "reach-out")) };
}

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "reach-out", setPg);
});

test("reconcile: each queued send reads what became of its email, once", async () => {
  const sentAt = ago(5 * MIN);
  const s = {
    sent: send({ state: "queued", message_id: "m-sent" }),
    unknown: send({ state: "queued", message_id: "m-unknown" }),
    bounced: send({ state: "queued", message_id: "m-bounced" }),
    failed: send({ state: "queued", message_id: "m-failed" }),
    atCap: send({ state: "queued", message_id: "m-cap", attempts: 1 }),
    wrote: send({ state: "queued", message_id: "m-wrote" }),
    noDomain: send({ state: "queued", message_id: "m-nodomain" }),
    erased: send({ state: "queued", message_id: "m-gone" }),
    waiting: send({ state: "queued", message_id: "m-queued" }),
  };
  const w = world({
    sends: Object.values(s),
    messages: [
      email("m-sent", "sent", { meta: { status_at: { sent: sentAt } } }),
      email("m-unknown", "failed", { error: { outcome: "unknown", http_status: 0 } }),
      email("m-bounced", "failed", { error: { provider: "bounced" } }),
      email("m-failed", "failed", { error: { http_status: 422 } }),
      email("m-cap", "canceled", { error: { reason: "sending_domain_at_cap" } }),
      email("m-wrote", "canceled", { error: { reason: "outreach_wrote_back" } }),
      email("m-nodomain", "canceled", { error: { reason: "outreach_needs_own_domain" } }),
      email("m-queued", "queued"),
    ],
  });
  const [status, body] = await w.tick();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const got = (k) => w.row(s[k].id);
  assert.deepEqual([got("sent").state, got("sent").sent_at], ["sent", sentAt], "sent, when it left");
  const lead = w.tables.leads.find((l) => l.id === s.sent.lead_id);
  assert.deepEqual(
    [lead.stage, lead.last_outcome, lead.version, lead.contacted_at],
    ["nurture", "emailed", 2, sentAt],
    "its lead is written to",
  );
  assert.deepEqual(
    w.tables.events.filter((e) => e.kind === "lead.emailed").map((e) => [e.subject_id, e.data.send_id]),
    [[s.sent.lead_id, s.sent.id]],
  );
  assert.equal(got("unknown").state, "queued", "its receipt settles it");
  assert.deepEqual([got("bounced").state, got("bounced").reason], ["failed", "bounced"]);
  assert.deepEqual([got("failed").state, got("failed").reason], ["failed", "send_failed"]);
  // A wait is planned again, never lost; its email was written, so its next is a new one (attempts moves on).
  // (The rows are the tables' own, moved in place: the numbers they started at are 1 and 0.)
  for (const [k, next] of [
    ["atCap", 2],
    ["noDomain", 1],
  ]) {
    const r = got(k);
    assert.equal(r.state, "planned", k);
    assert.equal(r.message_id, null, k);
    assert.equal(r.attempts, next, k);
    assert.ok(Date.parse(r.send_at) > Date.now(), `${k}: a new moment ahead`);
    assert.equal(r.domain_id, DOM, k);
  }
  assert.deepEqual([got("wrote").state, got("wrote").reason], ["skipped", "outreach_wrote_back"]);
  assert.deepEqual([got("erased").state, got("erased").reason], ["skipped", "erased"]);
  assert.equal(got("waiting").state, "queued", "its job has not run yet");
  // Five settled here; the two waits are counted where they are planned again.
  assert.deepEqual([body.reconciled, body.sent, body.failed, body.skipped, body.replanned], [5, 1, 2, 2, 2]);
  // A second tick moves nothing that the first did.
  const before = JSON.stringify(w.tables.reach_out_sends);
  await w.tick();
  assert.equal(
    JSON.parse(before).filter((r) => r.state !== "planned").length,
    w.tables.reach_out_sends.filter((r) => r.state !== "planned").length,
  );
});

test("unstick: a claim left mid-way is its email's when the email was written, and planned again when it was not", async () => {
  const written = send({ state: "claimed", claimed_at: ago(11 * MIN), attempts: 2 });
  const unwritten = send({ state: "claimed", claimed_at: ago(11 * MIN), attempts: 2 });
  const fresh = send({ state: "claimed", claimed_at: ago(2 * MIN) });
  const w = world({
    sends: [written, unwritten, fresh],
    messages: [email(await sendMessageId(written.id, 2), "queued")],
  });
  const [, body] = await w.tick();
  assert.deepEqual(
    [w.row(written.id).state, w.row(written.id).message_id],
    ["queued", await sendMessageId(written.id, 2)],
    "adopted: the email goes on as its send",
  );
  assert.deepEqual(
    [w.row(unwritten.id).state, w.row(unwritten.id).attempts, w.row(unwritten.id).claimed_at],
    ["planned", 2, null],
    "planned again, keeping its number: its next email is the one it never wrote",
  );
  assert.equal(w.row(fresh.id).state, "claimed", "a writer may still be at it");
  assert.equal(body.adopted, 1);
});

test("close: a canceled or failed run's open sends are skipped; a waiting run's are its owner's", async () => {
  const CANCELED = "44444444-4444-4444-8444-444444444444";
  const WAITING = "55555555-5555-4555-8555-555555555555";
  const a = send({ broadcast_id: CANCELED, send_at: ahead(DAY) });
  const b = send({ broadcast_id: CANCELED, state: "claimed", claimed_at: ago(MIN) });
  const c = send({ broadcast_id: WAITING, send_at: ago(3 * 60 * MIN) });
  const w = world({
    sends: [a, b, c],
    runs: [
      {
        id: CANCELED,
        tenant_id: T,
        state: "canceled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(MIN),
      },
      {
        id: WAITING,
        tenant_id: T,
        state: "pending_approval",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(MIN),
      },
    ],
  });
  const [, body] = await w.tick();
  assert.deepEqual([w.row(a.id).state, w.row(a.id).reason], ["skipped", "run_canceled"]);
  assert.deepEqual([w.row(b.id).state, w.row(b.id).reason], ["skipped", "run_canceled"]);
  assert.deepEqual([w.row(c.id).state, w.row(c.id).send_at], ["planned", c.send_at], "a waiting run keeps its sends");
  assert.equal(body.closed, 2);
});

test("restale: a send left long past its time in a run that goes ahead is planned again from now; a due one, a paused chain's or a waiting run's is not", async () => {
  const stale = send({ send_at: ago(20 * MIN) });
  const due = send({ send_at: ago(5 * MIN) });
  const PAUSED = "66666666-6666-4666-8666-666666666666";
  const PAUSED_RUN = "77777777-7777-4777-8777-777777777777";
  const paused = send({ send_at: ago(3 * 60 * MIN), broadcast_id: PAUSED_RUN, playbook_id: PAUSED, root_id: PAUSED });
  const w = world({
    sends: [stale, due, paused],
    playbooks: [
      { id: ROOT, tenant_id: T, kind: "reach_out", state: "running", gap_minutes: 12, domain_ids: [] },
      { id: PAUSED, tenant_id: T, kind: "reach_out", state: "paused", gap_minutes: 12, domain_ids: [] },
    ],
    runs: [
      {
        id: RUN,
        tenant_id: T,
        state: "sending",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
      {
        id: PAUSED_RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: PAUSED,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
    ],
  });
  const [, body] = await w.tick();
  const r = w.row(stale.id);
  assert.equal(r.state, "planned");
  assert.ok(Date.parse(r.send_at) > Date.now() - MIN, "from now");
  assert.equal(r.attempts, 0, "no email was written: its number keeps");
  assert.equal(w.row(due.id).send_at, due.send_at, "due, not left: the claim's");
  assert.equal(w.row(paused.id).send_at, paused.send_at, "a paused chain keeps its sends until it resumes");
  assert.equal(body.replanned, 1);
});

test("a send with no room tries again tomorrow; after two weeks waiting it is given up, and says why", async () => {
  const young = send({ send_at: ago(20 * MIN), created_at: ago(DAY) });
  const old = send({ send_at: ago(20 * MIN), created_at: ago(15 * DAY) });
  // No verified domain: nowhere to go.
  const w = world({ sends: [young, old], domains: [{ id: DOM, tenant_id: T, state: "held" }] });
  const [, body] = await w.tick();
  const y = w.row(young.id);
  assert.equal(y.state, "planned");
  assert.ok(Date.parse(y.send_at) > Date.now() + DAY - 5 * MIN, "tomorrow");
  assert.deepEqual([w.row(old.id).state, w.row(old.id).reason], ["skipped", "kept_waiting"]);
  assert.deepEqual([body.waiting, body.gave_up], [1, 1]);
});

test("finish: a run that goes ahead with nothing left open is sent, through its own moves; one with a send open is not", async () => {
  const DONE = "88888888-8888-4888-8888-888888888888";
  const BUSY = "99999999-9999-4999-8999-999999999999";
  const w = world({
    sends: [
      send({ broadcast_id: DONE, state: "sent", sent_at: ago(MIN) }),
      send({ broadcast_id: DONE, state: "skipped", reason: "outreach_wrote_back" }),
      send({ broadcast_id: BUSY, state: "sent", sent_at: ago(MIN) }),
      send({ broadcast_id: BUSY, send_at: ahead(DAY) }),
    ],
    runs: [
      {
        id: DONE,
        tenant_id: T,
        state: "scheduled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
      {
        id: BUSY,
        tenant_id: T,
        state: "sending",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
    ],
  });
  const [, body] = await w.tick();
  const done = w.tables.broadcasts.find((b) => b.id === DONE);
  assert.equal(done.state, "sent");
  assert.ok(done.finished_at, "it says when it finished");
  assert.equal(w.tables.broadcasts.find((b) => b.id === BUSY).state, "sending");
  assert.equal(body.finished, 1);
});
