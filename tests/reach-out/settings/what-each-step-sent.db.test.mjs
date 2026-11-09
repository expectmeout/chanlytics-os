/**
 * 00567 on the database: how many emails each step sent, in one read (decision 0113), what Cold email counts
 * beside a claim. Sent alone counts; a step that sent nothing is not in the answer; a member reads their own workspace's
 * and a stranger none of it, under sequence_sends' own policy; no one signed out may ask.
 *
 * Local stack only: it makes workspaces, members, steps and sends with the service key, and removes them.
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
      ? "refusing a database that is not on this machine: this suite writes sequences and their sends"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
let db;
let A;
let B;
let templateId;
const steps = {};
const users = [];
const as = {};

async function person(tenant, label) {
  const email = `sent-${label}-${stamp}@fixture-sent.example`;
  const password = `pw-${stamp}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role: "owner" }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return c;
}

/** A first step on a moment, which makes its own sequence (sequence_steps_place), with one batch to carry its sends. */
async function stepOf(label) {
  const step = ok(
    await db
      .from("sequence_steps")
      .insert({
        tenant_id: A,
        name: `Sent ${label}`,
        trigger: "slot_opened",
        template_id: templateId,
        template_name: "fixture_sent",
        template_language: "en_US",
        params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "freed_when" }],
        policy_class: "follow_up",
      })
      .select("id, sequence_id")
      .single(),
  );
  const batch = ok(
    await db
      .from("sequence_batches")
      .insert({
        tenant_id: A,
        name: `Sent ${label}`,
        scheduled_for: new Date().toISOString(),
        sequence_id: step.sequence_id,
        step_id: step.id,
        template_id: templateId,
        template_name: "fixture_sent",
        template_language: "en_US",
        state: "scheduled",
      })
      .select("id")
      .single(),
  );
  return { ...step, batch: batch.id };
}

let contact = 0;
async function sendOf(step, state) {
  contact += 1;
  const person = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, email: `c${contact}-${stamp}@fixture-sent.example`, display_name: `C${contact}` })
      .select("id")
      .single(),
  );
  ok(
    await db.from("sequence_sends").insert({
      tenant_id: A,
      sequence_id: step.sequence_id,
      step_id: step.id,
      batch_id: step.batch,
      contact_id: person.id,
      state,
      ...(state === "sent" ? { sent_at: new Date().toISOString() } : {}),
    }),
  );
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `sent-a-${stamp}`, name: "Harbor Books" })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `sent-b-${stamp}`, name: "Elsewhere Co" })
      .select("id")
      .single(),
  ).id;
  as.owner = await person(A, "owner");
  as.stranger = await person(B, "stranger");
  templateId = ok(
    await db
      .from("templates")
      .insert({ tenant_id: A, channel: "whatsapp", name: "fixture_sent", language: "en_US" })
      .select("id")
      .single(),
  ).id;
  steps.two = await stepOf("two");
  steps.one = await stepOf("one");
  steps.none = await stepOf("none");
  await sendOf(steps.two, "sent");
  await sendOf(steps.two, "sent");
  await sendOf(steps.two, "queued");
  await sendOf(steps.one, "sent");
  await sendOf(steps.none, "queued");
});

after(async () => {
  if (skip || !db) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

const askedBy = (client, tenant) =>
  client.rpc("sequence_sent_by_step", {
    p_tenant_id: tenant,
    p_step_ids: [steps.two.id, steps.one.id, steps.none.id, crypto.randomUUID()],
  });
const byStep = (rows) => new Map(rows.map((r) => [r.step_id, Number(r.sent)]));

test(
  "sent alone counts, each step on its own row, and a step that sent nothing is not in the answer",
  { skip },
  async () => {
    const counts = byStep(ok(await askedBy(as.owner, A)));
    assert.equal(counts.get(steps.two.id), 2);
    assert.equal(counts.get(steps.one.id), 1);
    assert.equal(counts.size, 2);
  },
);

test("only the steps asked for are counted", { skip }, async () => {
  const rows = ok(await as.owner.rpc("sequence_sent_by_step", { p_tenant_id: A, p_step_ids: [steps.one.id] }));
  assert.deepEqual(
    rows.map((r) => r.step_id),
    [steps.one.id],
  );
  assert.deepEqual(ok(await as.owner.rpc("sequence_sent_by_step", { p_tenant_id: A, p_step_ids: [] })), []);
});

test(
  "a stranger's read of another workspace's steps answers nothing, under the sends' own policy",
  { skip },
  async () => {
    assert.deepEqual(ok(await askedBy(as.stranger, A)), []);
  },
);

test("no one signed out may ask", { skip }, async () => {
  const signedOut = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await askedBy(signedOut, A);
  assert.equal(error?.code, "42501");
});
