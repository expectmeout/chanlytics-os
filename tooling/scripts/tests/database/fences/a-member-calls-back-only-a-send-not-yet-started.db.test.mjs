/**
 * A member calls back only a send that has not started, and changes nothing else of a message (00361), on a real
 * Postgres with a real session.
 *
 * The update policy asked only that the caller act in the workspace, and a session holds UPDATE on a message's status
 * and error; messages_guard refuses only a move backwards or off a terminal state, and failed outranks every other. So a
 * member could move a sent message to failed or blank a failure's error, which the month's allowances, a sending
 * domain's capacity and its bounce hold all read. And a call-back asked only `queued`, so it won a row its send job had
 * already claimed (sending_at, 00352): the person got the words under a row that said canceled for ever. What the
 * dashboard writes on a session is one move (a queued message called back as canceled, the receptionist's draft with the
 * error that says why), and that is what a member may now write. Runs against the database `supabase start` builds,
 * never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

let admin;
const made = { users: [], tenants: [] };
const PASSWORD = "call-back-fence-test-password-1";
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await admin.from("tenants").delete().eq("id", id);
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

let w;
/** The owner, who acts in the workspace, and a viewer, who reads it. */
const as = {};

/** A member of the workspace in this role, signed in on a session of their own. */
async function member(role) {
  const email = `call-back-fence-${role}-${RUN}@example.com`;
  const u = ok(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), "user").user;
  made.users.push(u.id);
  ok(await admin.from("memberships").insert({ user_id: u.id, tenant_id: w.t, role }), "membership");
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");
  return session;
}

before(async () => {
  if (skip) return;
  const t = ok(
    await admin
      .from("tenants")
      .insert({ name: "Call-back fence", slug: `call-back-fence-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const contact = ok(
    await admin.from("contacts").insert({ tenant_id: t, phone_e164: "+15555550172" }).select("id").single(),
    "contact",
  ).id;
  const conversation = ok(
    await admin.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  w = { t, contact, conversation };
  as.owner = await member("owner");
  as.viewer = await member("viewer");
});

/** A message of the thread as the edge writes it (service role), in the state a case starts from; its id. */
async function message(over) {
  return ok(
    await admin
      .from("messages")
      .insert({
        tenant_id: w.t,
        conversation_id: w.conversation,
        contact_id: w.contact,
        channel: "sms",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: "See you at 3",
        status: "queued",
        ...over,
      })
      .select("id")
      .single(),
    "message",
  ).id;
}

/** The row as the database holds it now. */
async function row(id) {
  return ok(await admin.from("messages").select("status, error, sending_at").eq("id", id).single(), "read back");
}

/** An update on a member's session, counted: an update row security forbids does not raise, it changes nothing. */
async function update(session, id, patch) {
  return session.from("messages").update(patch).eq("id", id).select("id");
}

test(
  "a member calls back a queued send no job has claimed, and the receptionist's draft with the error that says why",
  { skip },
  async () => {
    const reply = await message({});
    assert.equal(
      ok(await update(as.owner, reply, { status: "canceled" }), "cancel").length,
      1,
      "the person's own undo, inside the grace window",
    );
    assert.equal((await row(reply)).status, "canceled");

    const draft = await message({ sender: "ai", meta: { source: "veto_window" } });
    const withdrawn = ok(
      await update(as.owner, draft, { status: "canceled", error: { reason: "superseded_by_human" } }),
      "withdraw",
    );
    assert.equal(withdrawn.length, 1, "a reply or a take-over withdraws the held draft");
    assert.deepEqual(await row(draft), {
      status: "canceled",
      error: { reason: "superseded_by_human" },
      sending_at: null,
    });

    // A claim given back (the provider provably did not take it, db releaseQueuedSend) is a row that can be called back.
    const released = await message({ sending_at: new Date().toISOString() });
    ok(await admin.from("messages").update({ sending_at: null }).eq("id", released), "release");
    assert.equal(ok(await update(as.owner, released, { status: "canceled" }), "cancel released").length, 1);
  },
);

test("a send its job has claimed is on its way: a member's call-back changes nothing", { skip }, async () => {
  const claimed = await message({ sending_at: new Date().toISOString() });
  assert.deepEqual(
    ok(await update(as.owner, claimed, { status: "canceled" }), "cancel claimed"),
    [],
    "REGRESSION: a call-back won a row whose send was in flight, and the person got words the row said never left",
  );
  const draft = await message({ sender: "ai", sending_at: new Date().toISOString(), meta: { source: "veto_window" } });
  assert.deepEqual(
    ok(await update(as.owner, draft, { status: "canceled", error: { reason: "superseded_by_human" } }), "withdraw"),
    [],
  );
  for (const id of [claimed, draft]) {
    const r = await row(id);
    assert.equal(r.status, "queued", "left for its run to say what became of it");
    assert.equal(r.error, null);
  }
});

test(
  "a member cannot rewrite what became of a message: a sent one is not failed, a failure keeps its error",
  { skip },
  async () => {
    const sent = await message({ status: "sent", external_id: `SM-fence-sent-${RUN}` });
    assert.deepEqual(
      ok(await update(as.owner, sent, { status: "failed", error: { reason: "member" } }), "fail a sent message"),
      [],
      "REGRESSION: a member moved a sent message to failed, which the month's allowance no longer counts",
    );
    assert.deepEqual(await row(sent), { status: "sent", error: null, sending_at: null });

    const bounced = { provider: "bounced", kind: "permanent", outcome: "failed" };
    const failed = await message({
      channel: "email",
      status: "failed",
      error: bounced,
      external_id: `email-fence-failed-${RUN}`,
    });
    assert.deepEqual(
      ok(await update(as.owner, failed, { error: null }), "blank a failure"),
      [],
      "REGRESSION: a member blanked a bounce, which the sending domain's hold reads",
    );
    assert.deepEqual((await row(failed)).error, bounced);
  },
);

test(
  "a queued message is called back as canceled and moved nowhere else, nor its error written alone",
  { skip },
  async () => {
    const queued = await message({});
    for (const [what, patch] of [
      ["marked sent", { status: "sent" }],
      ["marked failed", { status: "failed" }],
      ["an error written and the message left waiting", { error: { reason: "member" } }],
    ]) {
      const r = await update(as.owner, queued, patch);
      assert.ok(r.error, `REGRESSION: ${what}`);
      assert.equal(r.error.code, "42501", `${what}: the policy refuses the row it would leave (${r.error.message})`);
    }
    assert.deepEqual(await row(queued), { status: "queued", error: null, sending_at: null });
  },
);

test("a viewer calls back nothing", { skip }, async () => {
  const queued = await message({});
  assert.deepEqual(ok(await update(as.viewer, queued, { status: "canceled" }), "viewer cancel"), []);
  assert.equal((await row(queued)).status, "queued");
});
