/**
 * An escalation's whole life against the real escalations_guard (00106): open -> resolved, once, and a new concern is
 * a new row. Every move is made by the writer that makes it in production, in production's order -- the receptionist
 * handing a thread to a person through the edge's sink (apps/edge/lib/whatsapp/persist.ts pgSink: pause, escalate),
 * a second and a third concern on the same hold, the owner taking the thread over and handing it back (core takeOver
 * and handBack over the dashboard's own threadPorts), a stale tab's resolve, and an explicit resolve (core
 * resolveEscalation over escalationPorts) -- on the owner's own session, so RLS is in the way as it is for them. The
 * rows are asserted where they end, and nothing a writer logs as swallowed may appear (#1100's lesson: a guard proved
 * move by move says nothing about a writer's sequence).
 *
 * Nothing here reaches a provider. Everything is kept in the workspace this file makes and deletes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no service-role credentials in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and a user"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner this suite signs in as needs it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stamp = Date.now().toString(36);

let db;
let T;
let owner; // { client, userId }
let ctx;
let persist;
let core;
let ports;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** What a writer logs when it swallows a refusal or a failed write: none of it may appear. */
const swallowed = [];
const realError = console.error;
const SWALLOWS = /escalation_\w+_failed|resolve_escalation_\w+|pause_conversation_\w+|pg_\w+_failed|_failed"/;

let phones = 400;
/** A customer's WhatsApp message, taken in by the edge (persist.ts pgIngest). */
async function customerWrites(words, digits) {
  phones += 1;
  const ing = await persist.pgIngest(db, T, {
    waId: digits,
    phoneDigits: digits,
    profileName: "Fixture Customer",
    messageId: `wamid.in.${stamp}.${phones}`,
    type: "text",
    kind: "text",
    rawType: "text",
    body: words,
    channelTsIso: new Date().toISOString(),
    media: null,
    optOut: false,
    optIn: false,
    optInMarketing: false,
  });
  assert.ok(ing, "the message was taken in");
  return ing;
}

const escalationsOf = async (conversationId) =>
  ok(
    await db
      .from("escalations")
      .select("id, reason, details, state, resolved_by_user_id, decision_id")
      .eq("conversation_id", conversationId)
      .order("created_at"),
  );
const threadOf = async (id) =>
  ok(
    await db
      .from("conversations")
      .select("id, tenant_id, state, paused_until, assignee_user_id, contact_id")
      .eq("id", id)
      .single(),
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  console.error = (...args) => {
    if (SWALLOWS.test(String(args[0]))) swallowed.push(args.map(String).join(" "));
    realError(...args);
  };
  persist = await import(at("apps/edge/lib/whatsapp/persist.ts"));
  core = await import(at("packages/core/src/index.ts"));
  ports = await import(at("apps/dashboard/src/server/ports/core-ports.ts"));
  // The dashboard's service-role calls (a thread's hold, withdrawing a job) go to this database.
  (await import(at("apps/dashboard/src/server/service-db.ts"))).setServiceClient(db);
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `escalation-life-${stamp}`, name: "Escalation Life Studio" })
      .select("id")
      .single(),
  ).id;
  const email = `escalation-owner-${stamp}@example.com`;
  const password = `pw-${stamp}-Aa1!long`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ok(await db.from("memberships").insert({ tenant_id: T, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = { client, userId: made.data.user.id };
  // The route's context: the owner's own session, as with-route.ts hands it to the ports.
  ctx = { supabase: client, userId: owner.userId, email, metadata: {} };
});

after(async () => {
  console.error = realError;
  if (skip) return;
  if (T) {
    await db.from("events").delete().eq("tenant_id", T);
    await db.from("tenants").delete().eq("id", T);
  }
  if (owner) await db.auth.admin.deleteUser(owner.userId).catch(() => {});
});

test(
  "handed to a person, taken over, handed back: one row opens, changes its reason, and resolves once; a stale resolve is refused and a new concern is a new row",
  { skip },
  async () => {
    const digits = "12135550111";
    let ing = await customerWrites("Can I talk to a real person please?", digits);
    const sink = persist.pgSink(db, T, ing);

    // The receptionist hands the thread over: the pause, then the hold (core inbound's handoff, through the sink).
    await sink.pause(new Date(Date.now() + 3_600_000).toISOString());
    assert.equal(await sink.escalate("human_token", "Asked for a person."), "opened");
    let rows = await escalationsOf(ing.conversation_id);
    assert.deepEqual(
      rows.map((r) => [r.reason, r.state]),
      [["human_token", "open"]],
    );
    assert.equal((await threadOf(ing.conversation_id)).state, "needs_human");

    // The customer writes again: a different reason replaces the first on the same open row, then says itself again.
    ing = await customerWrites("Also, can I get a refund for last week?", digits);
    const again = persist.pgSink(db, T, ing);
    assert.equal(await again.escalate("policy_ask", "Asked for a refund."), "changed");
    assert.equal(await again.escalate("policy_ask", "Asked for a refund, again."), "refreshed");
    rows = await escalationsOf(ing.conversation_id);
    assert.deepEqual(
      rows.map((r) => [r.reason, r.details, r.state]),
      [["policy_ask", "Asked for a refund, again.", "open"]],
      "one hold per thread",
    );
    const first = rows[0];

    // The owner takes the thread over (the dashboard's take-over route): the hold stays open while they have it.
    const thread = await threadOf(ing.conversation_id);
    const conv = { id: thread.id, tenant_id: T, phone_e164: `+${digits}`, paused_until: thread.paused_until };
    const took = await core.takeOver(ports.threadPorts(ctx), { conv, userId: owner.userId });
    assert.equal(took.state, "needs_human");
    const held = await threadOf(ing.conversation_id);
    assert.deepEqual([held.state, held.assignee_user_id], ["needs_human", owner.userId]);
    assert.equal((await escalationsOf(ing.conversation_id))[0].state, "open");

    // ...and hands it back: the receptionist resumes, and the hold resolves, linked to the decision that did it.
    const back = await core.handBack(ports.threadPorts(ctx), {
      conv: { ...conv, paused_until: held.paused_until },
      userId: owner.userId,
    });
    assert.equal(back.state, "open");
    rows = await escalationsOf(ing.conversation_id);
    assert.deepEqual(
      rows.map((r) => [r.id, r.state, r.resolved_by_user_id, r.decision_id]),
      [[first.id, "resolved", owner.userId, back.decision_id]],
    );
    const open = await threadOf(ing.conversation_id);
    assert.deepEqual([open.state, open.paused_until, open.assignee_user_id], ["open", null, null]);

    // A second tab, which read the hold before it was handed back, resolves it too: refused, and nothing moves.
    await assert.rejects(
      core.resolveEscalation(ports.escalationPorts(ctx), { esc: { id: first.id, tenant_id: T, state: "open" } }),
      (e) => e.status === 409,
    );
    assert.deepEqual(
      (await escalationsOf(ing.conversation_id)).map((r) => [r.state, r.decision_id]),
      [["resolved", back.decision_id]],
      "the resolved row is the hand-back's, as it left it",
    );

    // The customer asks for a person again: a new concern, a new row; the old one stays resolved.
    ing = await customerWrites("Hello? Anyone there?", digits);
    const later = persist.pgSink(db, T, ing);
    assert.equal(await later.escalate("human_token", "Asked for a person again."), "opened");
    rows = await escalationsOf(ing.conversation_id);
    assert.deepEqual(
      rows.map((r) => r.state),
      ["resolved", "open"],
    );

    // The owner answers it and resolves it by hand ("no change was needed" is an answer too).
    const done = await core.resolveEscalation(ports.escalationPorts(ctx), {
      esc: { id: rows[1].id, tenant_id: T, state: "open" },
    });
    assert.ok(done.decision_id);
    rows = await escalationsOf(ing.conversation_id);
    assert.deepEqual(
      rows.map((r) => [r.state, r.resolved_by_user_id, r.decision_id]),
      [
        ["resolved", owner.userId, back.decision_id],
        ["resolved", owner.userId, done.decision_id],
      ],
    );
    const verbs = ok(
      await db.from("decisions").select("verb, subject_type").eq("tenant_id", T).order("created_at"),
    ).map((d) => `${d.subject_type}:${d.verb}`);
    assert.deepEqual(verbs, ["conversation:take_over", "conversation:hand_back", "escalation:resolve"]);
    assert.deepEqual(swallowed, [], "no writer swallowed a refusal on the way");
  },
);
