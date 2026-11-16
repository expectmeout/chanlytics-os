/**
 * A business's website read again on its own once a month (decision 0134, amended: E4; apps/edge/lib/imports/sites-again.ts),
 * run over a database in memory: the health sweep's pass asks for a read of each site last tried a month ago or more, the
 * longest waiting first, a few a pass and a little apart; never a paused, test or lead's preview workspace's, nor one tried
 * this month; a site read before its runs were kept on the ledger is timed by its read; and a workspace that names no website
 * now has its try kept on the ledger, so it waits a month like any other.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, WEBSITE_UNREAD_WORDS } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const { readSitesAgain, SITES_AGAIN_TAKES } = await importSrc("apps/edge/lib/imports/sites-again.ts");

const NOW = Date.parse("2026-11-16T09:00:00Z");
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();
const ws = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const site = (n) => `https://shop-${n}.example`;

/** A workspace: its status, the website its settings name (null for none), and its site's last run or read. */
function workspace(n, { status = "active", website = site(n), run = null, read = null, state = "done" } = {}) {
  return { n, status, website, run, read, state };
}

function world(spaces) {
  const tenant = (w) => ({ id: ws(w.n), name: `Shop ${w.n}`, timezone: "America/New_York", status: w.status });
  const notes = [];
  const tables = {
    tenants: spaces.map(tenant),
    tenant_config: spaces.map((w) => ({
      tenant_id: ws(w.n),
      config: {
        brain: {
          business_name: `Shop ${w.n}`,
          system_prompt: `You answer for Shop ${w.n}, a business in the neighbourhood.`,
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: w.website ? { website: w.website } : {},
        },
      },
    })),
    google_listings: [],
    // As PostgREST joins them: each row carries its workspace's status.
    imports: spaces
      .filter((w) => w.run)
      .map((w) => ({
        tenant_id: ws(w.n),
        source: "website_media",
        state: w.state,
        started_at: w.run,
        connection_id: null,
        tenants: { status: w.status },
      })),
    business_reads: spaces
      .filter((w) => w.read)
      .map((w) => ({
        tenant_id: ws(w.n),
        source: "website",
        read_at: w.read,
        facts: {},
        read_from: w.website,
        error: null,
        tenants: { status: w.status },
      })),
    jobs: [],
  };
  const db = fakeDb(tables, {}, { import_ledger_note: (a) => (notes.push(a), null) });
  return { db, tables, notes };
}

const asked = (w) =>
  w.tables.jobs
    .filter((j) => j.kind === "website_read")
    .map((j) => [j.tenant_id, j.payload.url, j.payload.again, Date.parse(j.due_at) - NOW]);

test("a site last tried a month ago or more is read again on its own, the longest waiting first, a little apart", async () => {
  const w = world([
    workspace(1, { run: daysAgo(31) }),
    workspace(2, { run: daysAgo(45), state: "failed" }),
    workspace(3, { run: daysAgo(3) }),
  ]);
  assert.equal(await readSitesAgain(w.db, NOW), 2);
  assert.deepEqual(asked(w), [
    [ws(2), `${site(2)}/`, true, 0],
    [ws(1), `${site(1)}/`, true, 30_000],
  ]);
});

test("never a paused, test or lead's preview workspace's site, nor one whose read is under way", async () => {
  const w = world([
    workspace(1, { status: "paused", run: daysAgo(60) }),
    workspace(2, { status: "test", run: daysAgo(60) }),
    workspace(3, { status: "preview", read: daysAgo(60) }),
    workspace(4, { run: daysAgo(60), state: "running" }),
  ]);
  assert.equal(await readSitesAgain(w.db, NOW), 0);
  assert.deepEqual(asked(w), []);
});

test("a site read before its runs were on the ledger is timed by its read, until its first run is", async () => {
  const w = world([
    workspace(1, { read: daysAgo(40) }),
    // Read long ago, but tried this week: its run times it.
    workspace(2, { read: daysAgo(40), run: daysAgo(2) }),
  ]);
  assert.equal(await readSitesAgain(w.db, NOW), 1);
  assert.deepEqual(
    asked(w).map(([t]) => t),
    [ws(1)],
  );
});

test("a pass asks for a few at most; the rest wait for the next", async () => {
  const many = Array.from({ length: SITES_AGAIN_TAKES + 5 }, (_, i) => workspace(i + 1, { run: daysAgo(40 + i) }));
  const w = world(many);
  assert.equal(await readSitesAgain(w.db, NOW), SITES_AGAIN_TAKES);
  // The longest waiting first.
  assert.equal(asked(w)[0][0], ws(SITES_AGAIN_TAKES + 5));
});

test("a workspace that names no website now has its try kept on the ledger, and nothing is read", async () => {
  const w = world([workspace(1, { website: null, run: daysAgo(40) })]);
  assert.equal(await readSitesAgain(w.db, NOW), 0);
  assert.deepEqual(asked(w), []);
  assert.deepEqual(
    w.notes.map((n) => [n.p_tenant_id, n.p_source, n.p_state, n.p_error ?? null]),
    [
      [ws(1), "website_media", "queued", null],
      [ws(1), "website_media", "failed", WEBSITE_UNREAD_WORDS.address],
    ],
  );
});

test("the pass catches its own failure: the sweep goes on", async () => {
  const w = world([workspace(1, { run: daysAgo(40) })]);
  w.db.from = () => {
    throw new Error("the database is away");
  };
  assert.equal(await readSitesAgain(w.db, NOW), 0);
});
