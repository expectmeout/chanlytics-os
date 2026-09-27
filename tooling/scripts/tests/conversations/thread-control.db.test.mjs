/**
 * Who is speaking on a thread right now -- on a real database.
 *
 * 00130 splits three facts that shared two columns: who is RESPONSIBLE
 * (`assignee_user_id`), who is SPEAKING now (the hold), and whether the machine
 * may speak (policy). What is proved here is the part only Postgres can answer:
 * a claim that two callers cannot both win, precedence between a person and a
 * call, a release that only its own holder may make, a hold that runs out, and
 * a member who leaves taking their hold with them.
 *
 * Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { claimControl, releaseControl, CALL_CONTROL_S } = await import(
  pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href
);

let db;
let tenantId;
let userId;
const stamp = Date.now().toString(36);
const made = [];

/** A person with a thread of their own, so cases never contend for one. */
async function thread(tag) {
  const { data: contact, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1646${String(Date.now()).slice(-7)}${tag}` })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const { data: conv, error: vErr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id })
    .select("id")
    .single();
  if (vErr) throw new Error(vErr.message);
  return conv.id;
}
const holdOf = async (id) => {
  const { data } = await db
    .from("conversations")
    .select("control_kind, control_by, control_ref, control_until, assignee_user_id")
    .eq("id", id)
    .single();
  return data;
};
const PERSON = () => ({ kind: "person", userId });
const CALL = (id) => ({ kind: "call", callId: id });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `thread-control-${stamp}`, name: "thread-control" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
  const { data: user, error: uErr } = await db.auth.admin.createUser({
    email: `control-${stamp}@example.test`,
    password: "a-long-test-password-1",
    email_confirm: true,
  });
  if (uErr) throw new Error(uErr.message);
  userId = user.user.id;
  made.push(userId);
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  for (const id of made) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a hold is claimed, renewed by its own holder, and never given to two callers at once", { skip }, async () => {
  const id = await thread("1");
  const call = CALL("call_alpha");
  assert.equal(
    await claimControl(db, { tenantId, conversationId: id, holder: call, seconds: CALL_CONTROL_S }),
    "claimed",
  );
  assert.equal(
    await claimControl(db, { tenantId, conversationId: id, holder: call, seconds: CALL_CONTROL_S }),
    "renewed",
    "the same call again is the same call, not a second claimant: this is what keeps a long one from lapsing mid-sentence",
  );
  assert.equal(
    await claimControl(db, { tenantId, conversationId: id, holder: CALL("call_beta"), seconds: CALL_CONTROL_S }),
    "held",
    "another call does not take a thread that is spoken for",
  );

  const held = await holdOf(id);
  assert.equal(held.control_kind, "call");
  assert.equal(held.control_ref, "call_alpha");
  assert.ok(Date.parse(held.control_until) > Date.now(), "and it is live");

  // Two claimants in the same instant. The claim is one locked statement, so
  // exactly one of them can be told the thread was free -- which is the whole
  // reason this is a function and not a read followed by an update.
  const other = await thread("2");
  const [a, b] = await Promise.all([
    claimControl(db, { tenantId, conversationId: other, holder: CALL("call_one"), seconds: 60 }),
    claimControl(db, { tenantId, conversationId: other, holder: CALL("call_two"), seconds: 60 }),
  ]);
  assert.deepEqual(
    [a, b].filter((r) => r === "claimed").length,
    1,
    `one claim, one refusal, never two winners: got ${a} and ${b}`,
  );
  assert.equal([a, b].filter((r) => r === "held").length, 1);

  assert.equal(
    await claimControl(db, {
      tenantId,
      conversationId: "00000000-0000-4000-8000-000000000000",
      holder: call,
      seconds: 60,
    }),
    "gone",
  );
});

test(
  "a person outranks a call, and a call never outranks anybody: stepping in is what stepping in means",
  { skip },
  async () => {
    const id = await thread("3");
    await claimControl(db, { tenantId, conversationId: id, holder: CALL("call_live"), seconds: CALL_CONTROL_S });
    assert.equal(
      await claimControl(db, { tenantId, conversationId: id, holder: PERSON(), seconds: 3600 }),
      "claimed",
      "a person takes the thread from the machine",
    );
    assert.equal((await holdOf(id)).control_by, userId);

    assert.equal(
      await claimControl(db, { tenantId, conversationId: id, holder: CALL("call_live"), seconds: CALL_CONTROL_S }),
      "held",
      "and the call does not take it back while they have it",
    );

    // The call ends and releases -- but the hold is the person's now, and a
    // release names its holder, so a late one clears nothing.
    assert.equal(await releaseControl(db, { tenantId, conversationId: id, holder: CALL("call_live") }), false);
    const after_ = await holdOf(id);
    assert.deepEqual(
      [after_.control_kind, after_.control_by],
      ["person", userId],
      "REGRESSION: a call that ended does not hand the thread back from under the person on it",
    );

    assert.equal(await releaseControl(db, { tenantId, conversationId: id, holder: PERSON() }), true);
    assert.equal((await holdOf(id)).control_kind, null);
  },
);

test("a hold runs out on its own, whatever else is still true of the thread", { skip }, async () => {
  const id = await thread("4");
  await claimControl(db, { tenantId, conversationId: id, holder: PERSON(), seconds: 1 });
  // A take-over leaves an open escalation on purpose, and the pause sweeper
  // skips any thread that has one -- which is exactly how the column this
  // replaces was never cleared, and why the hold is swept on its own terms.
  const { error: eErr } = await db
    .from("escalations")
    .insert({ tenant_id: tenantId, conversation_id: id, reason: "manual", details: "a person is on it" });
  assert.equal(eErr, null, eErr?.message);
  await db
    .from("conversations")
    .update({ state: "needs_human", paused_until: new Date(Date.now() - 1000).toISOString(), assignee_user_id: userId })
    .eq("id", id);

  await new Promise((r) => setTimeout(r, 1100));
  const { error } = await db.rpc("expire_stale_pauses");
  assert.equal(error, null, error?.message);

  const swept = await holdOf(id);
  assert.equal(swept.control_kind, null, "the hold lapsed, so nobody is speaking");
  assert.equal(
    swept.assignee_user_id,
    userId,
    "and the thread is still theirs to answer: responsibility is a different fact from speaking",
  );
  const { data: still } = await db.from("conversations").select("state, paused_until").eq("id", id).single();
  assert.equal(still.state, "needs_human", "the open escalation still holds the pause, exactly as it did before");
  assert.ok(still.paused_until !== null);
});

test(
  "a member who leaves a workspace stops being responsible for its threads and stops holding any",
  { skip },
  async () => {
    const id = await thread("5");
    const { data: user } = await db.auth.admin.createUser({
      email: `leaver-${stamp}@example.test`,
      password: "a-long-test-password-1",
      email_confirm: true,
    });
    made.push(user.user.id);
    const { error: mErr } = await db
      .from("memberships")
      .insert({ tenant_id: tenantId, user_id: user.user.id, role: "operator" });
    assert.equal(mErr, null, mErr?.message);
    await db.from("conversations").update({ state: "needs_human", assignee_user_id: user.user.id }).eq("id", id);
    await claimControl(db, {
      tenantId,
      conversationId: id,
      holder: { kind: "person", userId: user.user.id },
      seconds: 3600,
    });

    await db.from("memberships").delete().eq("tenant_id", tenantId).eq("user_id", user.user.id);

    const left = await holdOf(id);
    // REGRESSION: nothing cleared either of these, so a colleague who had gone
    // went on owning threads that sat in nobody's queue, and the door went on
    // refusing the receptionist's drafts on their behalf for ever.
    assert.equal(left.assignee_user_id, null);
    assert.equal(left.control_kind, null);
  },
);

test("half a hold is not a hold: the table refuses one nobody could release", { skip }, async () => {
  const id = await thread("6");
  const refused = async (patch, why) => {
    const { error } = await db.from("conversations").update(patch).eq("id", id);
    assert.match(error?.message ?? "", /conversations_control_check|violates check/, why);
  };
  await refused(
    { control_kind: "person", control_by: userId },
    "a holder with no expiry is how a thread ends up held for ever",
  );
  await refused(
    { control_until: new Date(Date.now() + 60_000).toISOString() },
    "an expiry with no holder names nobody",
  );
  await refused(
    { control_kind: "person", control_until: new Date(Date.now() + 60_000).toISOString() },
    "a person with no user",
  );
  await refused(
    { control_kind: "call", control_until: new Date(Date.now() + 60_000).toISOString() },
    "a call with no id",
  );
  await refused(
    { control_kind: "whatsapp", control_ref: "x", control_until: new Date(Date.now() + 60_000).toISOString() },
    "a kind nobody reads",
  );
});
