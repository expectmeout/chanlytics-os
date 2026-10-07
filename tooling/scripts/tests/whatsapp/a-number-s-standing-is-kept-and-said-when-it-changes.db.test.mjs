/**
 * What Meta holds about a number is kept and said when it changes (00338 channel_keep_standing), on a real Postgres.
 *
 * The edge asks Meta what a connected WhatsApp number may do (can it send, what stands in the way, its display name, the
 * business's verification and tier) at connection, on the six-hourly clock and when an owner asks, and hands each answer
 * whole to channel_keep_standing. It keeps the standing and the moment it was read as standing and standing_read_at on the
 * channel's config, BESIDE what broadcasts are gated on and what the quality clock keeps (never over them), and says
 * channel.standing { from, to } when the word of can_send differs from the last one read. This makes a workspace with a
 * WhatsApp number, a voice line and a second workspace's number, and holds the door to what was written:
 *   - the first read is kept whole and said once with no from; the same word again keeps the new standing and says nothing
 *     new; a change says from and to;
 *   - a channel that is not this workspace's WhatsApp channel (another workspace's, a voice line's, none at all) is gone,
 *     and nothing is written;
 *   - a standing that is not an object with Meta's word for can_send, or is over 16 KB, is refused (22023) and written nowhere;
 *   - the merge and the event are one transaction: a ledger that refuses the event takes the standing with it;
 *   - the door is the service role's alone.
 *
 * Runs the way a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs does: its own workspaces and channels, made
 * with the service key and removed after, against the database `supabase start` builds on this machine, never production.
 * One block goes through the CLI (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it), in
 * a transaction that never commits. The cases are in order: the second case reads what the first ended on.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { MIN_MS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces and channels"
      : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let wa;
let voice;
let theirs;
const made = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const channel = async (tenant, kind, tag, config = {}) =>
  ok(
    await db
      .from("tenant_channels")
      .insert({ tenant_id: tenant, kind, external_id: `harbor-s-${tag}-${stamp}`, config })
      .select("id")
      .single(),
    `channel ${tag}`,
  ).id;
/** A standing as the edge keeps it (contracts NumberStanding). */
const standing = (can_send, over = {}) => ({
  can_send,
  problems: [],
  notes: [],
  name: "Harbor Moving",
  name_status: "APPROVED",
  verification: "verified",
  limit: "TIER_250",
  has_payment_method: true,
  owner_business_id: "410540000000001",
  waba_id: "205540000000001",
  ...over,
});
const keep = (tenant, id, value) =>
  db.rpc("channel_keep_standing", { p_tenant_id: tenant, p_channel_id: id, p_standing: value });
const config = async (id) =>
  ok(await db.from("tenant_channels").select("config").eq("id", id).single(), "config").config;
const said = async (id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("kind", "channel.standing")
      .eq("subject_id", id)
      .order("created_at"),
    "events",
  );
const GATE = { quality_rating: "GREEN", quality_event: "UPGRADE", messaging_limit: "TIER_1K", quality_read: "GREEN" };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const tag of ["a", "b"]) {
    const id = ok(
      await db
        .from("tenants")
        .insert({ slug: `harbor-standing-${tag}-${stamp}`, name: `Harbor Standing ${tag}` })
        .select("id")
        .single(),
    ).id;
    made.push(id);
  }
  [A, B] = made;
  wa = await channel(A, "whatsapp", "wa", GATE);
  voice = await channel(A, "voice", "voice");
  theirs = await channel(B, "whatsapp", "theirs", GATE);
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

/**
 * A transaction on this machine's database that never commits. `body` runs inside a DO block that ends by raising what
 * it `seen`, so everything the block did goes with it: a function, a trigger, a row. What the block saw leaves as hex, so
 * nothing the CLI adds to a database error can run on into it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const told = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(told);
  if (/not_this_database/.test(told))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${told.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "the first read is kept whole beside what broadcasts are gated on and said once, with no from; the same word again keeps the new standing and says nothing; a change says from and to",
  { skip },
  async () => {
    const first = standing("LIMITED", { notes: ["Your display name has not been approved yet."] });
    assert.equal(ok(await keep(A, wa, first), "first"), "first");
    let cfg = await config(wa);
    assert.deepEqual(cfg.standing, first, "kept whole, as it was handed");
    assert.ok(Math.abs(Date.parse(cfg.standing_read_at) - Date.now()) < MIN_MS, "read now");
    assert.deepEqual(
      [cfg.quality_rating, cfg.quality_event, cfg.messaging_limit, cfg.quality_read],
      ["GREEN", "UPGRADE", "TIER_1K", "GREEN"],
      "what broadcasts are gated on, what the webhook keeps and what the quality clock keeps are not touched",
    );
    assert.deepEqual(await said(wa), [{ category: "system", subject_type: "channel", data: { to: "LIMITED" } }]);

    const readAt = cfg.standing_read_at;
    const again = standing("LIMITED", { notes: ["Your display name is in review."] });
    assert.equal(ok(await keep(A, wa, again), "same"), "same");
    cfg = await config(wa);
    assert.deepEqual(cfg.standing, again, "the standing is kept whole each time: its notes moved");
    assert.ok(Date.parse(cfg.standing_read_at) >= Date.parse(readAt), "and it still says when it last looked");
    assert.equal((await said(wa)).length, 1, "and says nothing new");

    const blocked = standing("BLOCKED", {
      problems: [{ entity: "WABA", code: 141006, said: "A payment method is required", fix: null }],
    });
    assert.equal(ok(await keep(A, wa, blocked), "changed"), "changed");
    assert.deepEqual(
      (await said(wa)).map((e) => e.data),
      [{ to: "LIMITED" }, { from: "LIMITED", to: "BLOCKED" }],
    );
    assert.equal((await config(wa)).standing.can_send, "BLOCKED");
  },
);

test(
  "a channel that is not this workspace's WhatsApp channel is gone: another workspace's, a voice line's, none at all; nothing is written",
  { skip },
  async () => {
    const before_ = [await config(theirs), await config(voice)];
    for (const [tenant, id] of [
      [A, theirs],
      [B, wa],
      [A, voice],
      [A, "00000000-0000-4000-8000-000000000000"],
    ])
      assert.equal(ok(await keep(tenant, id, standing("AVAILABLE")), "gone"), "gone");
    assert.deepEqual([await config(theirs), await config(voice)], before_);
    assert.equal((await said(theirs)).length + (await said(voice)).length, 0);
  },
);

test(
  "a standing that is no object, or has no word of Meta's for can_send, or is too large, is refused and written nowhere",
  { skip },
  async () => {
    const cfg = await config(wa);
    const events = (await said(wa)).length;
    for (const value of [
      null,
      {},
      [],
      "BLOCKED",
      { can_send: "" },
      { can_send: 5 },
      { can_send: "blocked" },
      { can_send: "B" },
      { can_send: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
      { ...standing("AVAILABLE"), notes: ["x".repeat(20000)] },
    ]) {
      const r = await keep(A, wa, value);
      assert.equal(r.error?.code, "22023", `${JSON.stringify(value)?.slice(0, 60)}`);
    }
    assert.deepEqual(await config(wa), cfg);
    assert.equal((await said(wa)).length, events);
  },
);

test(
  "the merge and its event are one: a ledger that refuses the event takes the standing with it",
  { skip },
  async () => {
    const c = await channel(A, "whatsapp", "atomic", GATE);
    // The block makes its trigger before the keeper's first insert and has it refuse only once a flag is set: DDL after an insert is a
    // lock upgrade on `events`, and two such blocks at once (`pnpm test:db` runs the files together) can each wait for the other.
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then raise exception 'not_this_database'; end if;
    create function public.__standing_refused() returns trigger language plpgsql as $f$
    begin
      if current_setting('standing.refuse', true) = 'on' then raise exception 'the ledger is unavailable'; end if;
      return new;
    end $f$;
    create trigger __standing_refused before insert on public.events
      for each row when (new.kind = 'channel.standing' and new.tenant_id = '${A}') execute function public.__standing_refused();
    perform public.channel_keep_standing('${A}', '${c}', '{"can_send":"AVAILABLE"}'::jsonb);
    seen := seen || jsonb_build_object('control', (select count(*) from public.events where kind = 'channel.standing' and subject_id = '${c}'));
    perform set_config('standing.refuse', 'on', true);
    begin
      perform public.channel_keep_standing('${A}', '${c}', '{"can_send":"BLOCKED"}'::jsonb);
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('read', (select config -> 'standing' ->> 'can_send' from public.tenant_channels where id = '${c}'));
  `);
    assert.equal(seen.control, 1, "the control: a working ledger writes it");
    assert.deepEqual([seen.raised, seen.read], [true, "AVAILABLE"], JSON.stringify(seen));
    assert.equal((await config(c)).standing, undefined, "and nothing the block did was kept");
  },
);

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const r = await anon.rpc("channel_keep_standing", {
    p_tenant_id: A,
    p_channel_id: wa,
    p_standing: standing("AVAILABLE"),
  });
  assert.ok(r.error, "refused");
  assert.equal((await config(wa)).standing.can_send, "BLOCKED", "and the row is as the service role left it");
});
