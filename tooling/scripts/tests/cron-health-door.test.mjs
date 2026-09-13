/**
 * The watcher for the watchdogs, run: POST /api/cron/health over a database in
 * memory and a captured wire to the mailer. Until 13 Sep 2026 its text was
 * pinned by two assertions and its POST had never been called.
 *
 * The clocks sweep_health() reports unhealthy are named in the answer. Which of
 * them may be mailed about is decided per clock -- a delivered alert buys six
 * hours of quiet for that clock and no other -- and the mail goes to the
 * PLATFORM mailbox, with no tenant looked up: a broken sweep is nobody's
 * customer. Only a delivered mail earns the stamp. A healthy run pages nobody;
 * a clock that was alerted about and is answering again earns an all-clear,
 * but only when nothing else is broken. Due jobs nobody claims page the
 * operator once per window through a row that remembers. And the route answers
 * 200 even while reporting a broken sweep, because pg_net records its reply
 * and /api/diag reads it: a non-2xx here would make the watchdog report itself
 * broken and never recover.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, wire, withEnv, refusedAtTheDoor, vault } from "./_cron-doors-world.mjs";

// Each test file is its own process, so this is the whole environment. The
// mailer and the platform mailbox are configured: what is NOT mailed below is
// not mailed by decision, not for want of an address.
process.env.BLOB_SHADOW = "off";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/health.ts"));
after(() => setPg(null));

const H = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
/** One row of sweep_health(): a clock, and whether it is answering. */
const clock = (sweep, healthy, over = {}) => ({
  sweep,
  healthy,
  detail: healthy ? null : 'the edge answered 503: {"ok":false,"error":"no_provider_credentials"}',
  last_request_at: ago(20 * 60_000),
  status_code: healthy ? 200 : 503,
  scheduled: true,
  alerted_at: null,
  ...over,
});

/* -------------------------------------------------------------- the world */

/** The clocks as sweep_health() reports them, the jobs backlog, and the pager's memory. */
function world(rows, { backlog = 0, faults = {}, sweep_health = () => rows } = {}) {
  const tables = { operator_pages: [], notifications: [], tenant_config: [] };
  const marks = [];
  const db = fakeDb(tables, faults, {
    ...vault,
    sweep_health,
    jobs_backlog: () => backlog,
    sweep_mark_alerted: (a) => { marks.push(a); return a.p_alerted.length + a.p_healthy.length; },
  });
  setPg(db);
  return { db, tables, marks, tick: () => knock(POST, "health") };
}

/* -------------------------------------------------------------- the door */

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "health", setPg);
});

/* --------------------------------------------------------------- broken */

test("two clocks broken: both are named, still 200; the one outside its quiet window is mailed to the platform -- no tenant looked up -- and stamped once; the one inside it is not", async () => {
  const w = world([
    clock("deadman", false),
    // Told an hour ago: quiet for five more. Suppression is PER CLOCK.
    clock("calls", false, { alerted_at: ago(H) }),
    clock("jobs", true),
    // Answering again after an alert -- but no all-clear while something else is broken.
    clock("purge_events", true, { alerted_at: ago(7 * H) }),
  ]);
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200, "200 even while reporting a broken sweep: pg_net records this reply and /api/diag reads it");
    assert.deepEqual(body, { ok: true, healthy: false, broken: ["deadman", "calls"] });

    const mail = line.mail();
    assert.equal(mail.length, 1, "one mail: the calls clock is inside its quiet window, and no all-clear while something is broken");
    assert.equal(mail[0].subject, "A background sweep is not running: deadman");
    assert.deepEqual([mail[0].to, mail[0].from], [["ops@platform.test"], "Pager <pager@platform.test>"], "the platform's mailbox, from the platform");
    assert.match(mail[0].text, /deadman — the edge answered 503/);
    assert.match(mail[0].text, /no longer flagged when nobody picks it up/, "what the failure costs, in the owner's terms");
    assert.doesNotMatch(mail[0].text, /calls —/, "the suppressed clock is not re-described");

    assert.deepEqual(w.marks, [{ p_alerted: ["deadman"], p_healthy: ["jobs", "purge_events"] }], "stamped once, the delivered clock only; every healthy clock's stamp cleared");
    assert.ok(!w.db.seen.some((s) => s.table === "tenant_config"), "a platform fault looks no tenant up -- that lookup is how a failed read defaults to tenant #1's owner");
    assert.deepEqual(w.tables.notifications, [], "and rings no workspace's bell");
    assert.deepEqual(w.tables.operator_pages, [], "nothing due is waiting, so nobody is paged");
  } finally { line.restore(); }
});

test("a mail the mailer refuses, or one with nowhere to go, earns no quiet: the clock is named, nothing is stamped, and the next tick tries again", async () => {
  const w = world([clock("deadman", false), clock("jobs", true)]);
  const refused = wire(() => new Response("invalid api key", { status: 401 }));
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body.broken, ["deadman"]);
    assert.equal(refused.mail().length, 1, "it tried");
    assert.deepEqual(w.marks, [{ p_alerted: [], p_healthy: ["jobs"] }], "undelivered: not stamped");
  } finally { refused.restore(); }

  const nowhere = wire();
  try {
    await withEnv({ LEAD_TO: undefined }, async () => {
      const [status] = await answer(await w.tick());
      assert.equal(status, 200);
    });
    assert.deepEqual(nowhere.mail(), [], "no platform mailbox: nothing to send it to");
    assert.deepEqual(w.marks.at(-1), { p_alerted: [], p_healthy: ["jobs"] }, "unaddressed: not stamped either");
  } finally { nowhere.restore(); }

  const delivered = wire();
  try {
    await w.tick();
    assert.equal(delivered.mail().length, 1);
    assert.deepEqual(w.marks.at(-1), { p_alerted: ["deadman"], p_healthy: ["jobs"] }, "the tick that delivers is the one that stamps");
  } finally { delivered.restore(); }
});

/* -------------------------------------------------------------- healthy */

test("every clock healthy and none alerted before: nobody is mailed, nobody is paged, every stamp is cleared", async () => {
  const w = world([clock("jobs", true), clock("deadman", true), clock("calls", true), clock("partitions", true)]);
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, healthy: true, broken: [] });
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.marks, [{ p_alerted: [], p_healthy: ["jobs", "deadman", "calls", "partitions"] }]);
    assert.deepEqual(w.tables.operator_pages, []);
    assert.deepEqual(w.tables.notifications, []);
  } finally { line.restore(); }
});

test("a clock that was alerted about and is answering again earns an all-clear to the platform, and its stamp is cleared", async () => {
  const w = world([clock("deadman", true, { alerted_at: ago(7 * H) }), clock("jobs", true)]);
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, healthy: true, broken: [] });
    const mail = line.mail();
    assert.equal(mail.length, 1);
    assert.equal(mail[0].subject, "Background sweeps are answering again");
    assert.deepEqual(mail[0].to, ["ops@platform.test"]);
    assert.match(mail[0].text, /^These were failing and are now answering normally:\n\n {2}- deadman\n$/);
    assert.deepEqual(w.marks, [{ p_alerted: [], p_healthy: ["deadman", "jobs"] }]);
  } finally { line.restore(); }
});

/* --------------------------------------------------------- the backlog */

test("due jobs nobody claims page the operator -- once per window, remembered in a row -- while the clocks themselves read healthy", async () => {
  const w = world([clock("jobs", true)], { backlog: 7 });
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, healthy: true, broken: [] }, "the heartbeat is scheduled and answering; not draining is the pager's condition, not this answer's");
    const mail = line.mail();
    assert.equal(mail.length, 1);
    assert.equal(mail[0].subject, "[Chanlytics] 7 due jobs have waited more than two minutes");
    assert.deepEqual(mail[0].to, ["ops@platform.test"]);
    assert.match(mail[0].text, /sweep_health for 'jobs'/);
    assert.equal(w.tables.operator_pages.length, 1);
    const page = w.tables.operator_pages[0];
    assert.equal(page.key, "jobs_backlog");
    assert.equal(page.count, 1);
    assert.ok(page.alerted_at && Date.now() - Date.parse(page.alerted_at) < 60_000, "stamped as told, because it was");

    // Still backlogged at the next tick: counted, not re-paged.
    await w.tick();
    assert.equal(line.mail().length, 1, "one page per window");
    assert.equal(w.tables.operator_pages[0].count, 2, "the row remembers the second firing");
  } finally { line.restore(); }
});

/* ------------------------------------------------------- cannot be read */

test("a health function that cannot be read is a 500 with a slug, and nothing is mailed, stamped or paged", async () => {
  const w = world(null, { sweep_health: () => { throw new Error("permission denied for schema cron"); } });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [500, { ok: false, error: "query_failed" }]);
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.marks, []);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally { line.restore(); }
});
