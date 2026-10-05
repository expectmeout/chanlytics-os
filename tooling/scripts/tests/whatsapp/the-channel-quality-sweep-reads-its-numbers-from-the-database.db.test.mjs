/**
 * The channel-quality sweep's two database reads, on a real Postgres (packages/db sweeps.ts, with 00315): the numbers it
 * lists and the word it keeps. The sweep's door test (cron/cron-channel-quality-door.test.mjs) runs them over a database
 * in memory; this holds what that cannot judge, the order PostgREST gives a JSON path (config.quality_read_at), and that
 * the wrapper means what the SQL door answers.
 *   - whatsappNumbersToRead lists the active WhatsApp numbers only (not a disabled one, not a voice line), each as the
 *     sweep reads it (the channel, its workspace, Meta's id for the number, when a rating was last kept), the ones never
 *     read first and then the longest unread;
 *   - keepChannelQuality answers first, same, changed, as the door does, and gone for a channel that is not the
 *     workspace's own, and refuses a word the door refuses, in the door's words, writing nothing.
 *
 * Runs the way a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs does: its own workspaces and channels,
 * made with the service key and removed after, against the database `supabase start` builds on this machine, never
 * production. The database holds other suites' channels too, so the order is judged among this suite's own.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { HOUR_MS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and channels"
      : false;

const stamp = Date.now().toString(36);
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

let db;
let whatsappNumbersToRead;
let keepChannelQuality;
let A;
let B;
const made = [];
const ids = {};
const channel = async (tenant, tag, over = {}) => {
  const row = ok(
    await db
      .from("tenant_channels")
      .insert({ tenant_id: tenant, kind: "whatsapp", external_id: `harbor-r-${tag}-${stamp}`, config: {}, ...over })
      .select("id")
      .single(),
    `channel ${tag}`,
  );
  ids[tag] = row.id;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ whatsappNumbersToRead, keepChannelQuality } = await import("@chanlytics/db"));
  for (const tag of ["a", "b"]) {
    made.push(
      ok(
        await db
          .from("tenants")
          .insert({ slug: `harbor-reads-${tag}-${stamp}`, name: `Harbor Reads ${tag}` })
          .select("id")
          .single(),
      ).id,
    );
  }
  [A, B] = made;
  // Inserted out of the order they are read in, so the order is the database's and not the table's.
  await channel(A, "newer", { config: { quality_read: "GREEN", quality_read_at: ago(7 * HOUR_MS) } });
  await channel(A, "never");
  await channel(A, "older", { config: { quality_read: "RED", quality_read_at: ago(30 * HOUR_MS) } });
  await channel(A, "off", { status: "disabled" });
  await channel(A, "voice", { kind: "voice" });
  await channel(B, "theirs");
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test(
  "the numbers it lists are the active WhatsApp ones, each as the sweep reads it, never read first and then the longest unread",
  { skip },
  async () => {
    const listed = await whatsappNumbersToRead(db, 1000);
    const mine = listed.filter((n) => Object.values(ids).includes(n.channel_id));
    const idsOf = (rows) => rows.map((n) => n.channel_id);
    assert.equal(mine.length, 4);
    assert.deepEqual(idsOf(mine.slice(0, 2)).sort(), [ids.never, ids.theirs].sort(), "the two never read come first");
    assert.deepEqual(
      idsOf(mine.slice(2)),
      [ids.older, ids.newer],
      "then the one read 30 hours ago, then the one read 7",
    );
    assert.ok(
      !listed.some((n) => n.channel_id === ids.off || n.channel_id === ids.voice),
      "neither a disabled number nor a voice line",
    );
    const older = mine.find((n) => n.channel_id === ids.older);
    assert.deepEqual(older, {
      channel_id: ids.older,
      tenant_id: A,
      phone_number_id: `harbor-r-older-${stamp}`,
      read_at: older.read_at,
    });
    assert.ok(
      Math.abs(Date.parse(older.read_at) - (Date.now() - 30 * HOUR_MS)) < HOUR_MS / 60,
      "when it was last kept",
    );
    assert.equal(mine.find((n) => n.channel_id === ids.never).read_at, null);
  },
);

test(
  "the word it keeps is answered first, the same and changed as the door answers it, and gone for another workspace's channel",
  { skip },
  async () => {
    assert.equal(await keepChannelQuality(db, A, ids.never, "YELLOW"), "first");
    assert.equal(await keepChannelQuality(db, A, ids.never, "YELLOW"), "same");
    assert.equal(await keepChannelQuality(db, A, ids.never, "RED"), "changed");
    assert.equal(
      await keepChannelQuality(db, A, ids.theirs, "RED"),
      "gone",
      "B's channel is not A's to keep a word for",
    );
    assert.equal(await keepChannelQuality(db, A, ids.voice, "RED"), "gone", "a voice line has no rating");
    // The number just kept is no longer the longest unread: it has moved behind the one that was read 30 hours ago.
    const listed = await whatsappNumbersToRead(db, 1000);
    const order = listed.map((n) => n.channel_id).filter((id) => [ids.never, ids.older].includes(id));
    assert.deepEqual(order, [ids.older, ids.never]);
  },
);

test("a word the door refuses is refused in the door's words, and nothing is written", { skip }, async () => {
  const before_ = ok(await db.from("tenant_channels").select("config").eq("id", ids.older).single()).config;
  await assert.rejects(
    keepChannelQuality(db, A, ids.older, "not a word"),
    /^Error: channel_keep_quality: .*not a rating word/,
  );
  const after_ = ok(await db.from("tenant_channels").select("config").eq("id", ids.older).single()).config;
  assert.deepEqual(after_, before_);
});
