/**
 * A member reads their workspace's days (00317, K10), on a real Postgres.
 *
 * platform_metrics (00277, widened by 00316) is the back office's table: RLS on, no member policy, because latency,
 * provider failures and, since 00316, dollars live in it. The Reports lenses past ninety days need the part of a day
 * that is a workspace's own, so workspace_days returns exactly those columns and no others, to a member of that
 * workspace, and it checks membership itself (a definer function never meets a row policy):
 *   - the answer: a member (an owner, a viewer) reads the workspace's days between two dates, inclusive, oldest first,
 *     in the owner's eight columns and no others (never ai_usd, voice_usd, brain_p95_ms, provider_failures, the
 *     replies_* or the legacy tokens); a day rolled before 00316 reads null where the new columns are, never zero; a
 *     backwards range is empty;
 *   - the door: another workspace's owner, a workspace nobody owns, anon and the service role (no user) are refused
 *     with 42501; a partner's seat reads only on a session that showed its second factor; a span of more than 800
 *     days, or a missing date, is refused with 22023;
 *   - the floor: the table itself is still closed to a member, so the function is the only way in.
 *
 * Runs the way platform-metrics.db.test.mjs does: its own workspaces, users and rows, made with the service key and
 * removed after, against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../_second-factor.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let ownerA;
let viewerA;
let ownerB;
const tenants = [];
const users = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const days = (client, tenant, from, to) =>
  client.rpc("workspace_days", { p_tenant_id: tenant, p_from: from, p_to: to });

/** A signed-in member: the workspace's owner first (a workspace keeps one), then whoever else. */
async function member(tenant, role, tag) {
  const email = `days-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `membership ${tag}`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, signed.error?.message);
  return client;
}

const OWNER_SAFE = ["ai_tokens", "answered", "asks", "day", "handled", "messages_in", "messages_out", "topics"];

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const tag of ["a", "b"]) {
    tenants.push(
      ok(
        await db
          .from("tenants")
          .insert({ slug: `harbor-days-${tag}-${stamp}`, name: `Harbor Days ${tag}` })
          .select("id")
          .single(),
      ).id,
    );
  }
  [A, B] = tenants;
  ownerA = await member(A, "owner", "owner-a");
  viewerA = await member(A, "viewer", "viewer-a");
  ownerB = await member(B, "owner", "owner-b");
  // One insert a row: a batch gives every row the union of its keys, nulling a column a row left to its default.
  // A's days go in out of order (the 5th, the 1st, the 2nd): a table this small is read in the order it was written,
  // so only the function's own ordering can put them oldest first.
  const rows = [
    { tenant_id: A, day: "2026-04-05", asks: 7, answered: 5 },
    {
      tenant_id: A,
      day: "2026-04-01",
      asks: 3,
      answered: 2,
      messages_in: { whatsapp: 3 },
      messages_out: { whatsapp: 2 },
      handled: { ai: 2, held: 1 },
      topics: { booking: 2, pricing: 1 },
      ai_tokens: { receptionist: 1200 },
      // the operator's: none of it may come back
      ai_usd: { receptionist: 0.01 },
      voice_usd: 1.25,
      brain_p95_ms: 2100,
      provider_failures: { retryable: 1 },
      tokens: 999,
      replies_answered: 2,
      replies_held: 1,
      replies_handed_off: 0,
    },
    { tenant_id: A, day: "2026-04-02", asks: 1, answered: 1 }, // rolled before 00316: the new columns are null
    { tenant_id: B, day: "2026-04-01", asks: 99, answered: 99, handled: { ai: 99 } },
  ];
  for (const row of rows) ok(await db.from("platform_metrics").insert(row), `day ${row.day}`);
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a member reads their workspace's days, oldest first, in the owner's columns and no others; an old day is absent, not zero",
  { skip },
  async () => {
    for (const client of [ownerA, viewerA]) {
      const rows = ok(await days(client, A, "2026-04-01", "2026-04-30"), "days");
      assert.deepEqual(
        rows.map((r) => r.day),
        ["2026-04-01", "2026-04-02", "2026-04-05"],
        "A's days, B's not",
      );
      for (const r of rows)
        assert.deepEqual(
          Object.keys(r).sort(),
          OWNER_SAFE,
          "never ai_usd, voice_usd, brain_p95_ms, provider_failures, replies_* or the legacy tokens",
        );
      const [first, old] = rows;
      assert.deepEqual(
        [first.asks, first.answered, first.messages_in, first.handled, first.topics, first.ai_tokens],
        [3, 2, { whatsapp: 3 }, { ai: 2, held: 1 }, { booking: 2, pricing: 1 }, { receptionist: 1200 }],
      );
      assert.deepEqual(
        [old.handled, old.topics, old.ai_tokens],
        [null, null, null],
        "a day rolled before 00316 says nothing of what it did not keep",
      );
    }
  },
);

test("the range is the caller's, inclusive; a backwards one is empty", { skip }, async () => {
  assert.deepEqual(
    ok(await days(ownerA, A, "2026-04-02", "2026-04-02")).map((r) => r.day),
    ["2026-04-02"],
  );
  assert.deepEqual(ok(await days(ownerA, A, "2026-04-03", "2026-04-04")), []);
  assert.deepEqual(ok(await days(ownerA, A, "2026-04-30", "2026-04-01")), []);
});

test(
  "another workspace's owner, a workspace nobody owns, anon and the service role are refused; and a span of years, or no dates, is refused",
  { skip },
  async () => {
    const refused = (r, code) => assert.equal(r.error?.code, code, `${r.error?.message}`);
    refused(await days(ownerB, A, "2026-04-01", "2026-04-30"), "42501");
    refused(await days(ownerA, "00000000-0000-4000-8000-000000000000", "2026-04-01", "2026-04-30"), "42501");
    refused(await days(db, A, "2026-04-01", "2026-04-30"), "42501");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    assert.ok((await days(anon, A, "2026-04-01", "2026-04-30")).error, "anon is refused");
    refused(await days(ownerA, A, "2020-01-01", "2026-04-30"), "22023");
    refused(await days(ownerA, A, null, "2026-04-30"), "22023");
    // And the table itself is still nobody's but the service role's.
    assert.ok(
      (await ownerA.from("platform_metrics").select("asks").eq("tenant_id", A)).error,
      "the table is closed to a member",
    );
    assert.deepEqual(
      ok(await days(ownerB, B, "2026-04-01", "2026-04-30")).map((r) => r.asks),
      [99],
      "B reads B",
    );
  },
);

test(
  "a partner's seat reads only on a session that showed its second factor, as team_roster and recording_opened say",
  { skip },
  async () => {
    const partner = await member(A, "partner", "partner-a");
    const refused = await days(partner, A, "2026-04-01", "2026-04-30");
    assert.equal(
      refused.error?.code,
      "42501",
      `a password alone opens no door the seat opens: ${refused.error?.message}`,
    );
    await showSecondFactor(partner);
    const rows = ok(await days(partner, A, "2026-04-01", "2026-04-30"), "the partner, at aal2");
    assert.deepEqual(
      rows.map((r) => r.day),
      ["2026-04-01", "2026-04-02", "2026-04-05"],
    );
  },
);

test("the longest range is 800 days: the 800th is read, the 801st refused", { skip }, async () => {
  const last = ok(await days(ownerA, A, "2024-02-01", "2026-04-10"), "800 days"); // 2024-02-01 .. 2026-04-10 is 800 days
  assert.deepEqual(
    last.map((r) => r.day),
    ["2026-04-01", "2026-04-02", "2026-04-05"],
  );
  assert.equal((await days(ownerA, A, "2024-01-31", "2026-04-10")).error?.code, "22023", "801 days");
});
