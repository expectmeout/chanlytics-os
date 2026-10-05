/**
 * A number's quality is kept and said when it changes (00297 channel_keep_quality and the channel-quality clock), on a
 * real Postgres.
 *
 * A connected WhatsApp number's rating (GREEN, YELLOW, RED) is read once, when the number is connected, and kept as
 * tenant_channels.config.quality_rating, which broadcasts are gated on. A six-hourly edge sweep now asks Meta again and
 * hands each answer to channel_keep_quality, which keeps the word and the moment it was read as quality_read and
 * quality_read_at BESIDE quality_rating (never over it) and says channel.quality_rating { from, to } when the word
 * differs from the last one read. This makes a workspace with a WhatsApp number, a voice line and a second workspace's
 * number, and holds the door to what was written:
 *   - the first read is kept beside the connect-time rating and said once with no from; the same word again says nothing
 *     new and still says when it last looked; a change says from and to;
 *   - a channel that is not this workspace's WhatsApp channel (another workspace's, a voice line's, none at all) is gone,
 *     and nothing is written;
 *   - a word that is not 2 to 12 capital letters is refused (22023) and written nowhere;
 *   - the merge and the event are one transaction: a ledger that refuses the event takes the rating with it;
 *   - the door is the service role's alone;
 *   - the clock: a cron job `channel-quality-sweep` at :41 every sixth hour, registered in sweep_status as judged on its
 *     requests within 19 hours, reported by sweep_health(), asking the edge only when a number is connected.
 *
 * Runs the way tenancy.db.test.mjs does: its own workspaces and channels, made with the service key and removed after,
 * against the database `supabase start` builds on this machine, never production. Two blocks go through the CLI
 * (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it), in a transaction that never
 * commits. A local stack holds no edge address in Vault, so asking the edge posts nothing and is recorded as a note.
 * The cases are in order: the door case reads the rating the first case ended on.
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

/** The clock's silence the register allows: three missed six-hour ticks and an hour. */
const MAX_SILENCE = "19:00:00";

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
      .insert({ tenant_id: tenant, kind, external_id: `harbor-q-${tag}-${stamp}`, config })
      .select("id")
      .single(),
    `channel ${tag}`,
  ).id;
const keep = (tenant, id, rating) =>
  db.rpc("channel_keep_quality", { p_tenant_id: tenant, p_channel_id: id, p_rating: rating });
const config = async (id) =>
  ok(await db.from("tenant_channels").select("config").eq("id", id).single(), "config").config;
const said = async (id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("kind", "channel.quality_rating")
      .eq("subject_id", id)
      .order("created_at"),
    "events",
  );
const GATE = { quality_rating: "GREEN", quality_event: "UPGRADE", messaging_limit: "TIER_1K" };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const tag of ["a", "b"]) {
    const id = ok(
      await db
        .from("tenants")
        .insert({ slug: `harbor-quality-${tag}-${stamp}`, name: `Harbor Quality ${tag}` })
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
 * it `seen`, so everything the block did goes with it: a function, a trigger, a request handed to pg_net, a row. What
 * the block saw leaves as hex, so nothing the CLI adds to a database error can run on into it.
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
  "the first read is kept beside the connect-time rating and said once, with no from; the same word again says nothing; a change says from and to",
  { skip },
  async () => {
    assert.equal(ok(await keep(A, wa, "YELLOW"), "first"), "first");
    let cfg = await config(wa);
    assert.deepEqual([cfg.quality_read, typeof cfg.quality_read_at], ["YELLOW", "string"]);
    assert.ok(Math.abs(Date.parse(cfg.quality_read_at) - Date.now()) < MIN_MS, "read now");
    assert.deepEqual(
      [cfg.quality_rating, cfg.quality_event, cfg.messaging_limit],
      ["GREEN", "UPGRADE", "TIER_1K"],
      "what broadcasts are gated on, and what the webhook keeps, are not touched",
    );
    assert.deepEqual(await said(wa), [{ category: "system", subject_type: "channel", data: { to: "YELLOW" } }]);

    const readAt = cfg.quality_read_at;
    assert.equal(ok(await keep(A, wa, "YELLOW"), "same"), "same");
    cfg = await config(wa);
    assert.ok(Date.parse(cfg.quality_read_at) >= Date.parse(readAt), "it still says when it last looked");
    assert.equal((await said(wa)).length, 1, "and says nothing new");

    assert.equal(ok(await keep(A, wa, "RED"), "changed"), "changed");
    assert.deepEqual(
      (await said(wa)).map((e) => e.data),
      [{ to: "YELLOW" }, { from: "YELLOW", to: "RED" }],
    );
    assert.equal((await config(wa)).quality_read, "RED");
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
      assert.equal(ok(await keep(tenant, id, "GREEN"), "gone"), "gone");
    assert.deepEqual([await config(theirs), await config(voice)], before_);
    assert.equal((await said(theirs)).length + (await said(voice)).length, 0);
  },
);

test("a word that is not a rating is refused and written nowhere", { skip }, async () => {
  const cfg = await config(wa);
  const events = (await said(wa)).length;
  for (const word of [null, "", "green", "GREEN; drop table x", "A", "ABCDEFGHIJKLMN"]) {
    const r = await keep(A, wa, word);
    assert.equal(r.error?.code, "22023", `${JSON.stringify(word)}`);
  }
  assert.deepEqual(await config(wa), cfg);
  assert.equal((await said(wa)).length, events);
});

test(
  "the merge and its event are one: a ledger that refuses the event takes the rating with it",
  { skip },
  async () => {
    const c = await channel(A, "whatsapp", "atomic", GATE);
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then raise exception 'not_this_database'; end if;
    perform public.channel_keep_quality('${A}', '${c}', 'GREEN');
    seen := seen || jsonb_build_object('control', (select count(*) from public.events where kind = 'channel.quality_rating' and subject_id = '${c}'));
    create function public.__quality_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __quality_refused before insert on public.events
      for each row when (new.kind = 'channel.quality_rating' and new.tenant_id = '${A}') execute function public.__quality_refused();
    begin
      perform public.channel_keep_quality('${A}', '${c}', 'RED');
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('read', (select config ->> 'quality_read' from public.tenant_channels where id = '${c}'));
  `);
    assert.equal(seen.control, 1, "the control: a working ledger writes it");
    assert.deepEqual([seen.raised, seen.read], [true, "GREEN"], JSON.stringify(seen));
    assert.equal((await config(c)).quality_read, undefined, "and nothing the block did was kept");
  },
);

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const r = await anon.rpc("channel_keep_quality", { p_tenant_id: A, p_channel_id: wa, p_rating: "RED" });
  assert.ok(r.error, "refused");
  assert.equal((await config(wa)).quality_read, "RED", "and the row is as the service role left it");
});

test(
  "the clock: a job at :41 every sixth hour, registered as judged on its requests within 19 hours, reported by sweep_health(), asking the edge only when a number is connected",
  { skip },
  async () => {
    const jobs = ok(await db.rpc("sweep_schedules"), "schedules");
    const job = jobs.find((j) => j.jobname === "channel-quality-sweep");
    assert.ok(job, "no cron job named channel-quality-sweep is scheduled");
    assert.deepEqual([job.schedule, job.active], ["41 */6 * * *", true]);
    const row = ok(
      await db
        .from("sweep_status")
        .select("sweep, jobname, judged_by, max_silence")
        .eq("sweep", "channel_quality")
        .single(),
      "register",
    );
    assert.deepEqual(row, {
      sweep: "channel_quality",
      jobname: "channel-quality-sweep",
      judged_by: "request",
      max_silence: MAX_SILENCE,
    });
    const health = ok(await db.rpc("sweep_health"), "health").find((r) => r.sweep === "channel_quality");
    assert.ok(health, "sweep_health() does not report the clock");
    assert.equal(health.scheduled, true, "and finds its job");

    // Inside a transaction that never commits: with no active WhatsApp channel the tick only says it looked; with one it
    // asks the edge (a local stack has no edge address in Vault, so asking is recorded as that note).
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then raise exception 'not_this_database'; end if;
    update public.tenant_channels set status = 'disabled' where kind = 'whatsapp';
    update public.sweep_status set note = null where sweep = 'channel_quality';
    perform public.trigger_channel_quality_sweep();
    seen := jsonb_build_object('idle', (select note from public.sweep_status where sweep = 'channel_quality'));
    update public.tenant_channels set status = 'active' where id = '${wa}';
    perform public.trigger_channel_quality_sweep();
    seen := seen || jsonb_build_object('asked', (select note from public.sweep_status where sweep = 'channel_quality'));
  `);
    assert.equal(seen.idle, null, "no number connected: it looked and asked nothing");
    assert.match(seen.asked, /missing cron_sweep_key or edge_base_url/, "a number connected: it asked the edge");
  },
);
