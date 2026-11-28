/**
 * AI's approval of a week's placement is one write, and a Stop is heard inside it (00727 plan_slot_place and
 * content_week_approve, over 00714; the outside review of 28 Nov 2026, R3.1 and R3.7), on a real database.
 *
 * One write: an approval readied ahead carries its facts (claims), its words and how the made picture's words stood
 * when it was readied. The door that places it keeps the claim, the words (on the piece and on how the picture was
 * made) and the placement together, or keeps none: a placement refused, or words on the picture that moved since,
 * leave nothing behind. So the owner's Stop it between readying and 8:00 finds nothing of the approval written.
 *
 * A Stop, both orders, with two connections. "Stop it" on the week shares the plan's row with the approval: whichever
 * comes first, the other finds it done. "Stop everything" is read by the approval inside its own transaction, on a lock
 * the stop's own write waits for: pressed first, the approval waits for it and approves nothing (paused, the week let
 * go); pressed second, it waits for the approval, and what was placed before it is held by its own send while
 * everything is stopped. Before 00727 the stop was read by the job before the door, so one pressed in between was
 * missed.
 *
 * A race is run by holding the first door's transaction open through the Supabase CLI (a `do` block that calls it, then
 * sleeps) and calling the second on a connection of its own, which waits inside the database until the first is asleep
 * and then runs. Never production: it makes a workspace, a member and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace, a member and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner this suite signs in as needs it"
        : false;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** How long the first door's transaction stays open once it has run: the second begins the moment it is asleep. */
const HOLD_S = 6;
const WORDS = "Warm colour, all winter.";
const FACT = { kind: "fact", text: "Thursday still has openings", source: "said", valid_until: "2027-01-01" };

let db;
let T;
let owner;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** One statement through the CLI, as the database's own user: its rows, or the failure it printed. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** One statement through the CLI, left running: settles with how it ended. */
function running(sql) {
  return new Promise((resolve) => {
    const child = spawn(CLI, ["db", "query", ...CLI_TARGET, sql], { cwd: ROOT });
    let said = "";
    child.stdout.on("data", (d) => (said += d));
    child.stderr.on("data", (d) => (said += d));
    child.on("close", (status) => resolve({ status, said }));
  });
}

/** The words that find a tagged statement in pg_stat_activity, spelt so no other query's text holds them whole. */
const tagged = (word, tag) => `'%' || '${word}-' || '${tag}-${RUN}' || '%'`;

/**
 * Inside a block: looks every 50 ms until the statement tagged `word-tag` stands as `where` says (its transaction
 * asleep, or waiting on a lock), and raises `otherwise` where it never does. Each look clears the statistics snapshot,
 * which a transaction otherwise keeps from its first read. A tag opens its statement: pg_stat_activity cuts a long one
 * short, and a tag at its end would be cut away.
 */
const until = (word, tag, where, otherwise, looks = 400) => `
    for look in 1..${looks} loop
      perform pg_stat_clear_snapshot();
      exit when exists (select 1 from pg_stat_activity
                         where query like ${tagged(word, tag)} and pid <> pg_backend_pid() and ${where});
      if look = ${looks} then
        raise exception '${otherwise}';
      end if;
      perform pg_sleep(0.05);
    end loop;`;
const ASLEEP = "wait_event = 'PgSleep'";

/** `first`, run and its transaction left sleeping on a connection of its own: the promise of how it ends. */
const hold = (tag, first) =>
  running(`/* held-${tag}-${RUN} */ do $$ begin ${first} perform pg_sleep(${HOLD_S}); end $$`);

/**
 * Holds `first` open (it runs, then its transaction sleeps) and, on a connection of its own, runs `second` the moment
 * `first` is asleep: the race is run inside the database, so nothing hangs on how fast the CLI starts. `second` may
 * keep an answer in `a` and raise where it is not the one expected. Settles when both have.
 */
async function race(tag, first, second) {
  const held = hold(tag, first);
  let failed = null;
  try {
    query(`do $$ declare a jsonb; begin
      ${until("held", tag, ASLEEP, "the first door''s transaction never got to its sleep")}
      ${second}
    end $$`);
  } catch (e) {
    failed = e;
  }
  const first_ = await held;
  assert.equal(first_.status, 0, `${tag}: the held door failed: ${first_.said.slice(-600)}`);
  if (failed) throw failed;
}

/** Inside a block: who the doors after it are called as. */
const asOwner = () =>
  `perform set_config('request.jwt.claims', '{"sub":"${owner.id}","role":"authenticated"}', true);
   perform set_config('request.jwt.claim.sub', '${owner.id}', true);
   perform set_config('request.jwt.claim.role', 'authenticated', true);`;
const AS_SERVICE = `perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
   perform set_config('request.jwt.claim.sub', '', true);
   perform set_config('request.jwt.claim.role', 'service_role', true);`;
/** A value as a jsonb literal inside a block. */
const jsonb = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

const DAY_MS = 86_400_000;
let weeks = 0;
/** The Monday `n` weeks after next week's, as a day: each test's week is its own. */
function mondayAfter(n) {
  const now = new Date();
  const toMonday = (8 - now.getUTCDay()) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + (toMonday + 7 * n) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * A ready week held to a time that has come, under a rung that holds it: its footage, the picture AI drew from it ahead,
 * and one slot on Instagram twenty days on.
 */
async function week() {
  weeks += 1;
  const w = { plan: randomUUID(), foot: randomUUID(), made: randomUUID(), slot: randomUUID() };
  // To the second: the week's snapshot and the slot's placement name its time as text, and must name it exactly.
  w.at = new Date(Math.floor(Date.now() / 1000) * 1000 + 20 * DAY_MS).toISOString();
  const file = (id, source, more = {}) => ({
    id,
    tenant_id: T,
    status: "filed",
    source,
    name: `week-${id.slice(0, 8)}`,
    mime: "image/jpeg",
    bytes: 1000,
    fingerprint: `fp-${id}`,
    ...more,
  });
  ok(
    await db
      .from("files")
      .insert([file(w.foot, "upload"), file(w.made, "made", { made: { from: w.foot, plan: { line: "Warm" } } })]),
    "the footage and the picture drawn from it",
  );
  ok(
    await db.from("content_plans").insert({
      id: w.plan,
      tenant_id: T,
      week_of: mondayAfter(weeks),
      status: "ready",
      asked_by: "clock",
      ready_at: new Date().toISOString(),
      goes_at: new Date(Date.now() - 60_000).toISOString(),
    }),
    "the held week",
  );
  ok(
    await db.from("plan_slots").insert({
      id: w.slot,
      tenant_id: T,
      plan_id: w.plan,
      creative: randomUUID(),
      place: "instagram",
      kind: "picture",
      at: w.at,
      title: "The finish",
      state: "proposed",
      file_id: w.foot,
      words: { caption: WORDS },
    }),
    "its slot",
  );
  return w;
}

/** The approval readying answers for the week's slot, as the placing door takes it, with what 00727 adds. */
const approvalOf = (w, extra = {}) => ({
  snapshot: { revision: null, renditions: [], placements: [], uses: ["post"], spend: null, facts: [] },
  intent: null,
  renditions: [],
  via: "rung",
  placements: [
    { place: "instagram", kind: "picture", at: w.at, caption: WORDS, good_until: null, capability_edition: 1 },
  ],
  ...extra,
});
const WHOLE = { claims: [FACT], words: WORDS, stood: { caption: null } };
const snapshotOf = (w) => ({
  slots: [
    { id: w.slot, place: "instagram", kind: "picture", at: w.at, file_id: w.foot, title: "The finish", intent: null },
  ],
});
const approveArgs = (w) => ({ p_tenant_id: T, p_plan_id: w.plan, p_snapshot: snapshotOf(w) });
/** The week approved by the service, as the 8:00 job asks. */
const approveWeek = async (w) => ok(await db.rpc("content_week_approve", approveArgs(w)), "the week's approval");
const place = async (w, approval) =>
  ok(
    await db.rpc("plan_slot_place", { p_tenant_id: T, p_slot_id: w.slot, p_file_id: w.made, p_approval: approval }),
    "the slot placed",
  );
const prepare = async (w, extra) =>
  ok(
    await db.rpc("plan_slot_prepared", {
      p_tenant_id: T,
      p_slot_id: w.slot,
      p_prepared: { file_id: w.made, from: w.foot, at: w.at, approval: approvalOf(w, extra) },
    }),
    "the slot readied",
  );

/** What a week's picture and its workspace hold of an approval. */
async function kept(w) {
  const made = ok(await db.from("files").select("made").eq("id", w.made).single(), "the picture");
  const claims = ok(await db.from("owner_claims").select("id").eq("tenant_id", T).eq("text", FACT.text), "claims");
  const posts = ok(await db.from("posts").select("id, status, via").eq("file_id", w.made), "posts");
  const pieces = ok(await db.from("pieces").select("id").eq("tenant_id", T).eq("file_id", w.made), "pieces");
  return { caption: made.made?.caption ?? null, claims: claims.length, posts: posts.length, pieces: pieces.length };
}
const planOf = async (w) =>
  ok(await db.from("content_plans").select("status, goes_at, stopped_at").eq("id", w.plan).single(), "the plan");
const stopEverything = async (at) =>
  ok(await db.rpc("workspace_sending_stop", { p_tenant_id: T, p_at: at }), "stop everything");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  T = ok(
    await db
      .from("tenants")
      .insert({ name: `One write ${RUN}`, slug: `one-write-${RUN}`, timezone: "America/New_York" })
      .select("id")
      .single(),
    "the workspace",
  ).id;
  const email = `one-write-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ok(await db.from("memberships").insert({ tenant_id: T, user_id: made.data.user.id, role: "owner" }), "the seat");
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), "the owner signs in");
  owner = { client, id: made.data.user.id };
  // Approve the week: AI holds it (the owner's own setting, through its door).
  const rung = ok(
    await client.rpc("policy_change", { p_tenant_id: T, p_class: "plan_approve", p_mode: "veto" }),
    "the rung",
  );
  assert.equal(rung[0]?.mode, "veto");
});

after(async () => {
  if (skip || !T) return;
  await db.rpc("workspace_sending_stop", { p_tenant_id: T, p_at: null });
  for (const table of [
    "jobs",
    "plan_slots",
    "content_plans",
    "posts",
    "approvals",
    "owner_claims",
    "piece_renditions",
    "piece_revisions",
    "pieces",
    "files",
    "events",
    "policies",
    "memberships",
  ])
    await db.from(table).delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
  if (owner) await db.auth.admin.deleteUser(owner.id).catch(() => {});
});

/* ------------------------------------------------------------------------------------------------ one write -- */

test("an approval that carries its facts and words is kept whole with its placement", { skip }, async () => {
  const w = await week();
  assert.equal((await approveWeek(w)).fate, "approved");
  assert.deepEqual(
    await kept(w),
    { caption: null, claims: 0, posts: 0, pieces: 0 },
    "approved, and nothing placed yet",
  );
  const answer = await place(w, approvalOf(w, WHOLE));
  assert.equal(answer.fate, "approved");
  const now = await kept(w);
  assert.deepEqual(
    { caption: now.caption, posts: now.posts, pieces: now.pieces },
    { caption: WORDS, posts: 1, pieces: 1 },
  );
  assert.equal(now.claims, 1, "the fact is the owner's claim");
  const slot = ok(await db.from("plan_slots").select("post_id").eq("id", w.slot).single(), "the slot");
  assert.equal(slot.post_id, answer.posts[0].post_id, "and the slot names its post");
  await db.from("owner_claims").delete().eq("tenant_id", T);
});

test("a placement the door refuses keeps none of it: no claim, no words, no piece, no post", { skip }, async () => {
  const w = await week();
  await approveWeek(w);
  const late = approvalOf(w, WHOLE);
  // Its reason ends before its time: the approving door answers late.
  late.placements[0].good_until = new Date(Date.now() + DAY_MS).toISOString();
  assert.equal((await place(w, late)).fate, "late");
  assert.deepEqual(await kept(w), { caption: null, claims: 0, posts: 0, pieces: 0 });
});

test("words on the picture that moved since it was readied answer changed, and theirs stand", { skip }, async () => {
  const w = await week();
  await approveWeek(w);
  ok(
    await db
      .from("files")
      .update({ made: { from: w.foot, plan: { line: "Warm" }, caption: "My own words." } })
      .eq("id", w.made),
    "the owner's own words on the picture",
  );
  assert.equal((await place(w, approvalOf(w, WHOLE))).fate, "changed");
  assert.deepEqual(await kept(w), { caption: "My own words.", claims: 0, posts: 0, pieces: 0 });
});

test("at 8:00 the approval places what was readied, whole, in its own transaction", { skip }, async () => {
  const w = await week();
  assert.equal(await prepare(w, WHOLE), true);
  assert.deepEqual(await kept(w), { caption: null, claims: 0, posts: 0, pieces: 0 }, "readying wrote nothing of it");
  const answer = await approveWeek(w);
  assert.deepEqual({ fate: answer.fate, placed: answer.placed }, { fate: "approved", placed: 1 });
  assert.deepEqual(await kept(w), { caption: WORDS, claims: 1, posts: 1, pieces: 1 });
  await db.from("owner_claims").delete().eq("tenant_id", T);
});

test(
  "the owner stops the week between readying and 8:00: nothing of the readied approval was written",
  { skip },
  async () => {
    const w = await week();
    assert.equal(await prepare(w, WHOLE), true);
    const stopped = ok(await owner.client.rpc("content_week_stop", { p_tenant_id: T, p_plan_id: w.plan }), "Stop it");
    assert.equal(stopped.fate, "stopped");
    assert.equal((await approveWeek(w)).fate, "stopped");
    assert.deepEqual(await kept(w), { caption: null, claims: 0, posts: 0, pieces: 0 });
    assert.equal((await planOf(w)).status, "ready");
  },
);

/* --------------------------------------------------------------------------------------- a Stop, both orders -- */

test(
  "Stop it pressed while the week is being approved: pressed first, nothing is approved or written",
  { skip },
  async () => {
    const w = await week();
    await prepare(w, WHOLE);
    await race(
      "stop-it-first",
      `${asOwner()} perform public.content_week_stop('${T}', '${w.plan}');`,
      `${AS_SERVICE}
     a := public.content_week_approve('${T}', '${w.plan}', ${jsonb(snapshotOf(w))});
     if a ->> 'fate' is distinct from 'stopped' then
       raise exception 'the approval answered %, not stopped', a ->> 'fate';
     end if;`,
    );
    assert.deepEqual(await kept(w), { caption: null, claims: 0, posts: 0, pieces: 0 });
    assert.equal((await planOf(w)).status, "ready");
  },
);

test(
  "Stop it pressed while the week is being approved: approved first, the press is told the week is approved",
  { skip },
  async () => {
    const w = await week();
    await prepare(w, { words: WORDS, stood: { caption: null } });
    await race(
      "stop-it-second",
      `${AS_SERVICE} perform public.content_week_approve('${T}', '${w.plan}', ${jsonb(snapshotOf(w))});`,
      `${asOwner()}
     a := public.content_week_stop('${T}', '${w.plan}');
     if a ->> 'fate' is distinct from 'approved' then
       raise exception 'Stop it answered %, not approved', a ->> 'fate';
     end if;`,
    );
    const plan = await planOf(w);
    assert.equal(plan.status, "approved");
    assert.equal(plan.stopped_at, null, "no stop was kept: the press is told to look again");
  },
);

test(
  "Stop everything pressed first: the approval waits for it, approves nothing, and lets the week go",
  { skip },
  async () => {
    const w = await week();
    await prepare(w, WHOLE);
    try {
      await race(
        "stop-all-first",
        `${AS_SERVICE} perform public.workspace_sending_stop('${T}', now());`,
        `${AS_SERVICE}
       a := public.content_week_approve('${T}', '${w.plan}', ${jsonb(snapshotOf(w))});
       if a ->> 'fate' is distinct from 'paused' then
         raise exception 'the approval answered %, not paused', a ->> 'fate';
       end if;`,
      );
      assert.deepEqual(await kept(w), { caption: null, claims: 0, posts: 0, pieces: 0 });
      const plan = await planOf(w);
      assert.deepEqual({ status: plan.status, goes_at: plan.goes_at }, { status: "ready", goes_at: null });
      // And a slot of a week approved before it is not placed while everything is stopped.
      const before8 = await week();
      await stopEverything(null);
      await approveWeek(before8);
      await stopEverything(new Date().toISOString());
      assert.equal((await place(before8, approvalOf(before8, WHOLE))).fate, "stopped");
      assert.deepEqual(await kept(before8), { caption: null, claims: 0, posts: 0, pieces: 0 });
    } finally {
      await stopEverything(null);
    }
  },
);

test("Stop everything pressed second: it waits for the approval, which was whole before it", { skip }, async () => {
  const w = await week();
  await prepare(w, { words: WORDS, stood: { caption: null } });
  try {
    const tag = "stop-all-second";
    const held = hold(
      tag,
      `${AS_SERVICE} perform public.content_week_approve('${T}', '${w.plan}', ${jsonb(snapshotOf(w))});`,
    );
    // The Stop, pressed the moment the approval's transaction is asleep.
    const stop = running(`/* stop-${tag}-${RUN} */ do $$ begin
      ${until("held", tag, ASLEEP, "the approval''s transaction never got to its sleep")}
      ${AS_SERVICE} perform public.workspace_sending_stop('${T}', now());
    end $$`);
    // It waits on a lock while that transaction is open: it is ordered after the approval, never beside it.
    let unwaited = null;
    try {
      query(`do $$ begin
        ${until("stop", tag, "wait_event_type = 'Lock'", "the Stop did not wait for the approval''s transaction", 240)}
      end $$`);
    } catch (e) {
      unwaited = e;
    }
    const [first, second] = await Promise.all([held, stop]);
    assert.equal(first.status, 0, `the approval failed: ${first.said.slice(-600)}`);
    assert.equal(second.status, 0, `the stop failed: ${second.said.slice(-600)}`);
    assert.equal(unwaited, null, `the Stop waited for the approval's transaction to end: ${unwaited?.message}`);
    assert.equal((await planOf(w)).status, "approved");
    const now = await kept(w);
    assert.deepEqual({ caption: now.caption, posts: now.posts }, { caption: WORDS, posts: 1 });
    const tenant = ok(await db.from("tenants").select("sending_stopped_at").eq("id", T).single(), "the workspace");
    assert.ok(tenant.sending_stopped_at, "and everything is stopped from then: each post's own send holds it");
  } finally {
    await stopEverything(null);
  }
});
