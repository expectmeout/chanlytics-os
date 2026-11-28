/**
 * A version set in place of the posts still waiting, with another session in the way (00727 post_approve_whole, over
 * 00713; the outside review of 28 Nov 2026, R3.6), on a real database with two connections.
 *
 * The owner's press names the posts they saw still waiting, and the door swaps exactly those. It now takes the
 * workspace's posts lock before it reads them (the one every approval takes, post_approve), so nothing of the piece can
 * be added between that read and the swap:
 *
 *   - a place added in between (another press's approval, written and not yet committed) is seen once the swap's turn
 *     comes: refused as changed, nothing let go. Before 00727 the swap read the waiting posts first, saw only its own,
 *     let them go and approved, and the place added in between went up beside the new version, unseen;
 *   - a post that began to send in between is no longer what they approved: changed;
 *   - two presses of one swap at once: one wins, the other finds the posts changed;
 *   - a waiting post whose time moved since the owner looked is replaced all the same: it is being replaced.
 *
 * A race is run by holding the first door's transaction open through the Supabase CLI (a `do` block that calls it, then
 * sleeps) and calling the second on its own connection while the first still holds, as
 * partners/a-refund-racing-the-first-share-is-applied.db.test.mjs does. Never production: it makes a workspace, a
 * member and rows.
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
/** How long the first door's transaction stays open: past the CLI's start for the second, which then waits on it. */
const HOLD_S = 8;
const SUM = (c) => c.repeat(64);

let db;
let A;
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

/** The words that find the held transaction in pg_stat_activity, spelt so no other query's text holds them whole. */
const heldBy = (tag) => `'%' || 'held-' || '${tag}-${RUN}' || '%'`;
const isHeld = (tag) =>
  `exists (select 1 from pg_stat_activity where query like ${heldBy(tag)} and pid <> pg_backend_pid() and state = 'active')`;

/**
 * Holds `first` open (it runs, then its transaction sleeps), and once it is sleeping runs `second` on its own
 * connection, which first asks that `first` is still open: the race, run. `second` may keep an answer in `a` and raise
 * where it is not the one expected. Settles when both have.
 */
async function race(tag, first, second) {
  const held = running(`do $$ begin ${first} perform pg_sleep(${HOLD_S}); end $$ /* held-${tag}-${RUN} */`);
  const deadline = Date.now() + HOLD_S * 1000;
  for (;;) {
    const [row] = query(
      `select count(*)::int as n from pg_stat_activity where query like ${heldBy(tag)} and wait_event = 'PgSleep'`,
    );
    if (row?.n >= 1) break;
    assert.ok(Date.now() < deadline, `${tag}: the first door's transaction never got to its sleep`);
  }
  query(`do $$ declare a jsonb; begin
    if not ${isHeld(tag)} then
      raise exception 'the first door''s transaction ended before the second came: no race was run';
    end if;
    ${second}
  end $$`);
  const first_ = await held;
  assert.equal(first_.status, 0, `${tag}: the held door failed: ${first_.said.slice(-600)}`);
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

async function madeFile() {
  const id = randomUUID();
  ok(
    await db.from("files").insert({
      id,
      tenant_id: A,
      status: "filed",
      source: "made",
      name: `swap-${id.slice(0, 8)}`,
      mime: "image/jpeg",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      made: { from: null, plan: { line: "Open late" } },
    }),
    "the made file",
  );
  return id;
}

/** An approval of a picture for one place an hour or more on, as a press sends it. */
function approvalOf(fileId, { place = "instagram", hours = 2, ...over } = {}) {
  const when = new Date(Date.now() + hours * 3_600_000).toISOString();
  const shape = place === "google" ? "google" : "4x5";
  const kept = `${A}/${fileId}/${place === "google" ? "google" : "original"}.jpg`;
  return {
    snapshot: {
      revision: null,
      renditions: [{ shape, file_id: fileId, path: kept, checksum: SUM("a") }],
      placements: [{ place, kind: "picture", at: when, caption: "Open late on Fridays." }],
      uses: ["post"],
      spend: null,
      facts: [],
    },
    intent: null,
    renditions: [{ shape, path: kept, checksum: SUM("a"), bytes: 1000 }],
    placements: [{ place, kind: "picture", at: when, caption: "Open late on Fridays.", capability_edition: 1 }],
    via: "press",
    ...over,
  };
}

/** The owner's press through the whole door, on their own session: what it answered. */
const press = async (fileId, approval) =>
  ok(
    await owner.client.rpc("post_approve_whole", { p_tenant_id: A, p_file_id: fileId, p_approval: approval }),
    "the press",
  );

/** A picture with one post waiting on Instagram: the file, and the post the owner sees. */
async function waiting() {
  const file = await madeFile();
  const answer = await press(file, approvalOf(file));
  assert.equal(answer.fate, "approved");
  return { file, post: answer.posts[0].post_id };
}

/** The file's posts as they stand: each place, status and id, oldest first. */
const postsOf = async (file) =>
  ok(
    await db.from("posts").select("id, place, status").eq("tenant_id", A).eq("file_id", file).order("created_at"),
    "the file's posts",
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ name: `Swap ${RUN}`, slug: `swap-${RUN}` })
      .select("id")
      .single(),
    "the workspace",
  ).id;
  const email = `swap-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }), "the seat");
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), "the owner signs in");
  owner = { client, id: made.data.user.id };
});

after(async () => {
  if (skip || !A) return;
  for (const table of [
    "jobs",
    "posts",
    "approvals",
    "piece_renditions",
    "piece_revisions",
    "pieces",
    "files",
    "events",
    "memberships",
  ])
    await db.from(table).delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  if (owner) await db.auth.admin.deleteUser(owner.id).catch(() => {});
});

test(
  "a place added between the owner's look and their press: the swap waits its turn, then is refused as changed",
  { skip },
  async () => {
    const { file, post } = await waiting();
    await race(
      "added",
      // Another press adds Google for the same piece, written and not yet committed.
      `${asOwner()} perform public.post_approve('${A}', '${file}', ${jsonb(approvalOf(file, { place: "google" }))});`,
      // The owner's swap of the one post they saw.
      `${asOwner()}
       a := public.post_approve_whole('${A}', '${file}', ${jsonb(approvalOf(file, { replace: true, expected: [post] }))});
       if a ->> 'fate' is distinct from 'changed' then
         raise exception 'the swap answered %, not changed', a ->> 'fate';
       end if;`,
    );
    const posts = await postsOf(file);
    assert.deepEqual(
      posts.map((p) => [p.place, p.status]),
      [
        ["instagram", "queued"],
        ["google", "queued"],
      ],
      "nothing was let go, and nothing set in its place",
    );
    assert.equal(posts[0].id, post);
  },
);

test(
  "a post that began to send between the look and the press is no longer what they approved: changed",
  { skip },
  async () => {
    const { file, post } = await waiting();
    await race(
      "sending",
      `${AS_SERVICE} perform public.post_moved('${post}', array['queued'], 'publishing');`,
      `${asOwner()}
     a := public.post_approve_whole('${A}', '${file}', ${jsonb(approvalOf(file, { replace: true, expected: [post] }))});
     if a ->> 'fate' is distinct from 'changed' then
       raise exception 'the swap answered %, not changed', a ->> 'fate';
     end if;`,
    );
    assert.deepEqual(
      (await postsOf(file)).map((p) => [p.id, p.status]),
      [[post, "publishing"]],
    );
  },
);

test("two presses of one swap at once: one wins, and the other finds the posts changed", { skip }, async () => {
  const { file, post } = await waiting();
  const swap = jsonb(approvalOf(file, { replace: true, expected: [post] }));
  await race(
    "twice",
    `${asOwner()} perform public.post_approve_whole('${A}', '${file}', ${swap});`,
    `${asOwner()}
     a := public.post_approve_whole('${A}', '${file}', ${swap});
     if a ->> 'fate' is distinct from 'changed' then
       raise exception 'the second swap answered %, not changed', a ->> 'fate';
     end if;`,
  );
  const posts = await postsOf(file);
  assert.deepEqual(
    posts.map((p) => p.status),
    ["pulled", "queued"],
    "the post they saw let go once, one set in its place",
  );
  assert.equal(posts[0].id, post);
});

test("a waiting post whose time moved since the owner looked is replaced all the same", { skip }, async () => {
  const { file, post } = await waiting();
  const later = new Date(Date.now() + 5 * 3_600_000).toISOString();
  const moved = ok(await owner.client.rpc("post_move", { p_post_id: post, p_when: later }), "the move");
  assert.equal(moved.fate, "moved");
  const answer = await press(file, approvalOf(file, { replace: true, expected: [post] }));
  assert.equal(answer.fate, "approved", "compared by id: it is being replaced");
  assert.deepEqual(
    (await postsOf(file)).map((p) => p.status),
    ["pulled", "queued"],
  );
});
