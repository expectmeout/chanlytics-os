/**
 * A held reply goes now on a member's word (00503 message_send_now; the thread canvas's Send now), on a real Postgres. A
 * reply the receptionist holds before it sends is a queued message and the outbound_send job that sends it at the
 * window's end; Send now brings that job to now, and the ledger's tick sends it within seconds:
 *
 *   - only a row still queued that no run has claimed (sending_at, 00352): a claimed row is on its way, and a withdrawn
 *     or sent one has nothing to bring forward;
 *   - only the job that would send that row, of the workspace named: never another message's, never another workspace's;
 *   - the job moved and the member's approve on the message in one transaction, and nothing written when nothing moved;
 *   - on a member's own session, with the floor every member door has: a viewer, or a member of another workspace, is
 *     told the workspace is not there, and nothing moves.
 *
 * Runs against the database `supabase start` builds on this machine, never production; makes its own accounts and
 * workspaces and removes them.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and threads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const RUN = Date.now().toString(36);
let db;
let core;
let ports;
let serial = 0;
const made = { users: [], tenants: [] };

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  core = await import(at("packages/core/src/index.ts"));
  ports = await import(at("apps/dashboard/src/server/ports/core-ports.ts"));
  (await import(at("apps/dashboard/src/server/service-db.ts"))).setServiceClient(db);
});

after(async () => {
  if (skip) return;
  for (const id of made.tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A real account, made with the admin API. */
async function person(tag) {
  const email = `send-now-${tag}-${++serial}-${RUN}@example.com`;
  const password = `pw-${RUN}-${serial}-Aa1!`;
  const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
  made.users.push(u.id);
  return { id: u.id, email, password };
}

/** A workspace with a seat for each role given, answering the seats. */
async function workspace(tag, roles) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Send now ${tag}`, slug: `send-now-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const seats = [];
  for (const [n, role] of roles.entries()) {
    const who = await person(`${tag}-${n}`);
    ok(await db.from("memberships").insert({ tenant_id: t, user_id: who.id, role }), "membership");
    seats.push({ ...who, role });
  }
  return { t, seats };
}

/** A signed-in session for someone, as the dashboard's own client is. */
async function session(who) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email: who.email, password: who.password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

/** A thread of a person of its own in workspace `t`. */
async function thread(t) {
  serial += 1;
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+1555${String(3000000 + serial).slice(-7)}` })
      .select("id")
      .single(),
    "contact",
  );
  const conv = ok(
    await db.from("conversations").insert({ tenant_id: t, contact_id: contact.id }).select("id").single(),
    "conversation",
  );
  return { id: conv.id, tenant_id: t, contactId: contact.id };
}

/** The window's end, a minute and a half away: when a held reply's job is due. */
const later = () => new Date(Date.now() + 90_000).toISOString();

/** The receptionist's held reply on the thread with the send job due at the window's end; `row` sets its status or claim. */
async function held(conv, row = {}) {
  const m = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: conv.tenant_id,
        conversation_id: conv.id,
        contact_id: conv.contactId,
        channel: "whatsapp",
        direction: "outbound",
        sender: "ai",
        body: "Of course: 11:30 on Saturday is yours.",
        status: "queued",
        ...row,
      })
      .select("id")
      .single(),
    "message",
  );
  const j = ok(
    await db
      .from("jobs")
      .insert({ tenant_id: conv.tenant_id, kind: "outbound_send", due_at: later(), payload: { message_id: m.id } })
      .select("id")
      .single(),
    "job",
  );
  return { messageId: m.id, jobId: j.id };
}

/** Whether a send's job is due now (within the test's own few seconds), and its state. */
async function jobOf(send) {
  const j = ok(await db.from("jobs").select("due_at, state").eq("id", send.jobId).single(), "job");
  return { now: Date.parse(j.due_at) <= Date.now() + 1000, state: j.state };
}

const ledger = async (t) =>
  ok(
    await db
      .from("decisions")
      .select("verb, subject_type, subject_id, actor_type, actor_user_id, payload")
      .eq("tenant_id", t),
    "decisions",
  );

test(
  "Send now brings a held reply's job to now and writes the member's approve, in one write, and nothing when it is on its way",
  { skip },
  async () => {
    const { t, seats } = await workspace("go", ["operator"]);
    const [operator] = seats;
    const conv = await thread(t);
    const draft = await held(conv);
    const other = await held(conv);
    const ctx = { supabase: await session(operator), userId: operator.id, email: operator.email, via: null };
    const msg = { id: draft.messageId, tenant_id: t, status: "queued" };

    const done = await core.sendNow(ports.sendNowPorts(ctx), { msg });
    assert.equal(done.status, "sending");
    assert.match(done.decision_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await jobOf(draft), { now: true, state: "scheduled" }, "its job is due now, for the tick to send");
    assert.deepEqual(await jobOf(other), { now: false, state: "scheduled" }, "another message's job is left alone");
    assert.deepEqual(await ledger(t), [
      {
        verb: "approve",
        subject_type: "message",
        subject_id: draft.messageId,
        actor_type: "user",
        actor_user_id: operator.id,
        payload: {},
      },
    ]);

    // A reply its run has claimed is on its way: nothing to bring forward, and no line.
    const flying = await held(conv, { sending_at: new Date().toISOString() });
    await assert.rejects(
      core.sendNow(ports.sendNowPorts(ctx), { msg: { id: flying.messageId, tenant_id: t, status: "queued" } }),
      (e) => e.code === "conflict",
    );
    assert.deepEqual(await jobOf(flying), { now: false, state: "scheduled" });
    // One already sent is refused before the door is asked.
    await assert.rejects(
      core.sendNow(ports.sendNowPorts(ctx), { msg: { id: other.messageId, tenant_id: t, status: "sent" } }),
      (e) => e.code === "conflict",
    );
    assert.equal((await ledger(t)).length, 1, "a Send now that moved nothing wrote nothing");
  },
);

test(
  "a viewer, and a member of another workspace, move nothing: the workspace is not theirs to act in",
  { skip },
  async () => {
    const { t, seats } = await workspace("floor", ["viewer"]);
    const [viewer] = seats;
    const stranger = (await workspace("floor-other", ["owner"])).seats[0];
    const conv = await thread(t);
    const draft = await held(conv);
    for (const who of [viewer, stranger]) {
      const r = await (await session(who)).rpc("message_send_now", { p_tenant_id: t, p_message_id: draft.messageId });
      assert.equal(r.error?.code, "P0002", `${who.role}: not found`);
    }
    assert.deepEqual(await jobOf(draft), { now: false, state: "scheduled" }, "and its job still waits for its window");
    assert.equal((await ledger(t)).length, 0);
  },
);
