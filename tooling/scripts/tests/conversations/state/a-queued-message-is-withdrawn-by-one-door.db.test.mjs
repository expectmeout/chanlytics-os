/**
 * A queued message is withdrawn by one door (00379), on a real Postgres. Eight places withdrew a queued message, each
 * its own way; now each goes through withdraw_queued, which holds the one rule:
 *
 *   - by message, never by thread: only the rows named, of the workspace named;
 *   - only a row still queued that no run has claimed (sending_at, 00352): a claimed row is on its way to the person
 *     and is left, with its job, to say what became of it;
 *   - the row and the outbound_send job that would send it, in one transaction: never a row canceled with its job left
 *     to fire, nor a job withdrawn with its row left "Sending…" for ever;
 *   - the reason on the row when one is given, and the row's error left as it was when none is (a call-back's).
 *
 * The receptionist's drafts on a thread (withdraw_ai_drafts) are its drafts alone, never a colleague's queued words.
 * The member's doors stand on a member's own session with the floor every member door has; the call-back writes its
 * line as the member's in the same transaction, and nothing when it was too late.
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
  const email = `withdraw-${tag}-${++serial}-${RUN}@example.com`;
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
      .insert({ name: `Withdraw ${tag}`, slug: `withdraw-${tag}-${++serial}-${RUN}` })
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
      .insert({ tenant_id: t, phone_e164: `+1555${String(2000000 + serial).slice(-7)}` })
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

/** An outbound message on the thread with the send job that would fire it; `row` sets its status or its claim. */
async function queued(conv, sender, row = {}) {
  const m = ok(
    await db
      .from("messages")
      .insert({
        tenant_id: conv.tenant_id,
        conversation_id: conv.id,
        contact_id: conv.contactId,
        channel: "whatsapp",
        direction: "outbound",
        sender,
        body: sender === "ai" ? "The receptionist's held draft." : "A colleague's reply, still in its grace.",
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
      .insert({
        tenant_id: conv.tenant_id,
        kind: "outbound_send",
        due_at: new Date().toISOString(),
        payload: { message_id: m.id },
      })
      .select("id")
      .single(),
    "job",
  );
  return { messageId: m.id, jobId: j.id };
}

const messageOf = async (id) => ok(await db.from("messages").select("status, error").eq("id", id).single(), "message");
const jobOf = async (id) => ok(await db.from("jobs").select("state").eq("id", id).single(), "job").state;
const sendOf = async (send) => [(await messageOf(send.messageId)).status, await jobOf(send.jobId)];
const ledger = async (t) =>
  ok(
    await db
      .from("decisions")
      .select("verb, subject_type, subject_id, actor_type, actor_user_id, payload, undo_of")
      .eq("tenant_id", t),
    "decisions",
  );

/* ------------------------------------------------------------------------------------------- the rule */

test(
  "the one rule: by message, only a row still queued that no run has claimed, the row and its job together, the reason kept",
  { skip },
  async () => {
    const { t } = await workspace("rule", []);
    const conv = await thread(t);
    const waiting = await queued(conv, "ai");
    const claimed = await queued(conv, "ai", { sending_at: new Date().toISOString() });
    const sent = await queued(conv, "ai", { status: "sent" });
    const unnamed = await queued(conv, "ai");
    const other = await thread((await workspace("rule-other", [])).t);
    const theirs = await queued(other, "ai");

    const ids = ok(
      await db.rpc("withdraw_queued", {
        p_tenant_id: t,
        p_message_ids: [waiting.messageId, claimed.messageId, sent.messageId, theirs.messageId],
        p_reason: { reason: "superseded_by_human" },
      }),
      "withdraw",
    );
    assert.deepEqual(ids, [waiting.messageId], "the one row that was still waiting, and nothing else named");
    assert.deepEqual(await messageOf(waiting.messageId), {
      status: "canceled",
      error: { reason: "superseded_by_human" },
    });
    assert.equal(await jobOf(waiting.jobId), "canceled", "its job went with it, in the same write");
    assert.deepEqual(await sendOf(claimed), ["queued", "scheduled"], "a claimed row is on its way: left to its run");
    assert.deepEqual(await sendOf(sent), ["sent", "scheduled"], "a sent row is not withdrawn");
    assert.deepEqual(await sendOf(unnamed), ["queued", "scheduled"], "by message: a row not named is not touched");
    assert.deepEqual(await sendOf(theirs), ["queued", "scheduled"], "another workspace's row is not this one's");

    // No reason given: the row's error is left as it was, as a call-back writes it.
    const quiet = await queued(conv, "human", { error: { note: "kept" } });
    ok(await db.rpc("withdraw_queued", { p_tenant_id: t, p_message_ids: [quiet.messageId] }), "quiet");
    assert.deepEqual(await messageOf(quiet.messageId), { status: "canceled", error: { note: "kept" } });

    const shapeless = await db.rpc("withdraw_queued", {
      p_tenant_id: t,
      p_message_ids: [unnamed.messageId],
      p_reason: { why: "no reason named" },
    });
    assert.equal(shapeless.error?.code, "22023", "a reason names its reason");
    assert.deepEqual(await sendOf(unnamed), ["queued", "scheduled"]);
  },
);

test("the receptionist's drafts on a thread are its own alone, all but the one kept", { skip }, async () => {
  const { t } = await workspace("drafts", []);
  const conv = await thread(t);
  const draft = await queued(conv, "ai");
  const holding = await queued(conv, "ai");
  const colleague = await queued(conv, "human");
  const elsewhere = await queued(await thread(t), "ai");
  const ids = ok(
    await db.rpc("withdraw_ai_drafts", {
      p_tenant_id: t,
      p_conversation_id: conv.id,
      p_reason: { reason: "superseded_by_human" },
      p_keep_message_id: holding.messageId,
    }),
    "drafts",
  );
  assert.deepEqual(ids, [draft.messageId]);
  assert.deepEqual(await sendOf(draft), ["canceled", "canceled"]);
  assert.deepEqual(await sendOf(holding), ["queued", "scheduled"], "the holding message the handoff queued stays");
  assert.deepEqual(await sendOf(colleague), ["queued", "scheduled"], "a colleague's words stay, and their job");
  assert.deepEqual(await sendOf(elsewhere), ["queued", "scheduled"], "another thread's draft stays");
});

/* ------------------------------------------------------------------------------------------- the doors */

test(
  "the service role's doors are closed to a session, and the member's doors have the member's floor",
  { skip },
  async () => {
    const { t, seats } = await workspace("floor", ["owner", "viewer"]);
    const [owner, viewer] = seats;
    const stranger = (await workspace("floor-other", ["owner"])).seats[0];
    const conv = await thread(t);
    const draft = await queued(conv, "ai");
    const mine = await session(owner);

    const service = await mine.rpc("withdraw_queued", { p_tenant_id: t, p_message_ids: [draft.messageId] });
    assert.ok(service.error, "a member's session cannot call the service role's door");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    assert.ok(
      (await anon.rpc("member_withdraw_drafts", { p_tenant_id: t, p_conversation_id: conv.id })).error,
      "nor may anyone signed out",
    );
    const asService = await db.rpc("member_withdraw_drafts", { p_tenant_id: t, p_conversation_id: conv.id });
    assert.equal(asService.error?.code, "28000", "the service role with no person is no member");
    for (const who of [viewer, stranger]) {
      const r = await (
        await session(who)
      ).rpc("member_withdraw_drafts", { p_tenant_id: t, p_conversation_id: conv.id });
      assert.equal(
        r.error?.code,
        "P0002",
        `${who.role} of ${who === viewer ? "this" : "another"} workspace: not found`,
      );
    }
    assert.deepEqual(await sendOf(draft), ["queued", "scheduled"], "and nothing was withdrawn by any of them");

    // The owner, through the reply path's own adapter: the drafts withdrawn, counted.
    const verbs = await import(at("apps/dashboard/src/server/verbs.ts"));
    const n = await verbs.cancelPendingAiReply({ supabase: mine, userId: owner.id }, { id: conv.id, tenant_id: t });
    assert.equal(n, 1);
    assert.deepEqual(await sendOf(draft), ["canceled", "canceled"]);
  },
);

test(
  "a call-back withdraws the send and writes the member's line in one write, and nothing when it was too late",
  { skip },
  async () => {
    const { t, seats } = await workspace("callback", ["operator"]);
    const [operator] = seats;
    const conv = await thread(t);
    const send = await queued(conv, "human");
    const ctx = { supabase: await session(operator), userId: operator.id, email: operator.email, via: "ask" };
    const msg = { id: send.messageId, tenant_id: t, status: "queued" };

    const done = await core.cancelSend(ports.cancelSendPorts(ctx), { msg });
    assert.equal(done.status, "canceled");
    assert.match(done.decision_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await sendOf(send), ["canceled", "canceled"], "the row and its job");
    assert.equal((await messageOf(send.messageId)).error, null, "a call-back keeps no reason on the row");
    assert.deepEqual(await ledger(t), [
      {
        verb: "cancel_send",
        subject_type: "message",
        subject_id: send.messageId,
        actor_type: "user",
        actor_user_id: operator.id,
        payload: { via: "ask" },
        undo_of: null,
      },
    ]);

    // Again: too late, and nothing more on the ledger.
    await assert.rejects(core.cancelSend(ports.cancelSendPorts(ctx), { msg }), (e) => e.code === "conflict");
    // A send its run has claimed: too late too, the row and its job left to the run, and no line.
    const flying = await queued(conv, "human", { sending_at: new Date().toISOString() });
    await assert.rejects(
      core.cancelSend(ports.cancelSendPorts(ctx), { msg: { id: flying.messageId, tenant_id: t, status: "queued" } }),
      (e) => e.code === "conflict" && /^Too late/.test(e.message),
    );
    assert.deepEqual(await sendOf(flying), ["queued", "scheduled"]);
    assert.equal((await ledger(t)).length, 1, "a call-back that withdrew nothing wrote nothing");

    // An undo link onto another workspace's line is dropped and said, never a failure.
    const other = (await workspace("callback-other", [])).t;
    const theirs = ok(
      await db
        .from("decisions")
        .insert({
          tenant_id: other,
          subject_type: "workspace",
          subject_id: other,
          verb: "export",
          actor_type: "system",
        })
        .select("id")
        .single(),
      "their decision",
    );
    const later = await queued(conv, "human");
    const r = await ctx.supabase.rpc("message_call_back", {
      p_tenant_id: t,
      p_message_id: later.messageId,
      p_undo_of: theirs.id,
    });
    assert.equal(r.error, null, r.error?.message);
    assert.equal(r.data.undo_dropped, true);
    assert.deepEqual(await sendOf(later), ["canceled", "canceled"]);
  },
);

test(
  "the take-over withdraws through the one door: the receptionist's unclaimed drafts and their jobs",
  { skip },
  async () => {
    const { t, seats } = await workspace("take", ["owner"]);
    const [owner] = seats;
    const conv = await thread(t);
    const draft = await queued(conv, "ai");
    const claimed = await queued(conv, "ai", { sending_at: new Date().toISOString() });
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const r = await (
      await session(owner)
    ).rpc("conversation_take_over", {
      p_tenant_id: t,
      p_conversation_id: conv.id,
      p_paused_until: until,
    });
    assert.equal(r.error, null, r.error?.message);
    assert.equal(r.data.withdrawn_drafts, 1);
    assert.deepEqual(await sendOf(draft), ["canceled", "canceled"]);
    assert.deepEqual(await messageOf(draft.messageId), {
      status: "canceled",
      error: { reason: "superseded_by_human" },
    });
    assert.deepEqual(await sendOf(claimed), ["queued", "scheduled"]);
  },
);
