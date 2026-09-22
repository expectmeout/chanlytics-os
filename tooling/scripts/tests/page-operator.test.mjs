/**
 * The platform's pager, executed.
 *
 * A condition that is the platform's -- a provider refusing every send, a
 * heartbeat failing many jobs, a ledger nobody drains -- pages one person
 * once per window, and the window is earned only by a delivered page. Proved
 * by driving pageOperator against a fake memory and a fake transport, never
 * by reading it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { pageOperator, pageStates, untoldPages, PAGE_WINDOW_MS } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/page-operator.ts")).href
);

/** A memory of pages: the three calls pageOperator makes, and nothing else. */
function fakePages(initial = {}, readError = null) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    from(table) {
      assert.equal(table, "operator_pages");
      return {
        select() {
          return {
            eq(_col, key) {
              return {
                maybeSingle: async () =>
                  readError ? { data: null, error: readError } : { data: rows.get(key) ?? null, error: null },
              };
            },
          };
        },
        upsert: async (row) => {
          rows.set(row.key, { alerted_at: null, ...(rows.get(row.key) ?? {}), ...row });
          return { data: null, error: null };
        },
        update(patch) {
          return {
            eq: async (_col, key) => {
              rows.set(key, { ...(rows.get(key) ?? {}), ...patch });
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };
}

const T0 = Date.parse("2026-09-11T10:00:00.000Z");
function transport(result = true) {
  const sent = [];
  const send = async (from, to, subject, body) => {
    if (result instanceof Error) throw result;
    sent.push({ from, to, subject, body });
    return result;
  };
  return { sent, send };
}
process.env.LEAD_TO = "ops@example.test";
process.env.LEAD_FROM = "pager@example.test";

test("the first page goes out and stamps the window; the second inside it is counted, not sent; after the window it goes again", async () => {
  const db = fakePages();
  const t = transport();
  assert.equal(
    await pageOperator(
      { db, send: t.send, now: () => T0 },
      "provider_auth:whatsapp",
      "WhatsApp refused a send with 401",
      "tenant t1",
    ),
    "sent",
  );
  assert.equal(t.sent.length, 1);
  assert.deepEqual(t.sent[0].to, ["ops@example.test"]);
  assert.match(t.sent[0].subject, /^\[Chanlytics\] WhatsApp refused/);
  assert.equal(db.rows.get("provider_auth:whatsapp").count, 1);
  assert.equal(db.rows.get("provider_auth:whatsapp").alerted_at, new Date(T0).toISOString());

  assert.equal(
    await pageOperator({ db, send: t.send, now: () => T0 + 60_000 }, "provider_auth:whatsapp", "again", "tenant t1"),
    "suppressed",
  );
  assert.equal(t.sent.length, 1, "no second page inside the window");
  assert.equal(db.rows.get("provider_auth:whatsapp").count, 2, "but the condition is counted");

  assert.equal(
    await pageOperator(
      { db, send: t.send, now: () => T0 + PAGE_WINDOW_MS + 1 },
      "provider_auth:whatsapp",
      "still",
      "tenant t1",
    ),
    "sent",
  );
  assert.equal(t.sent.length, 2);
});

test("a page that did not send earns no quiet: the stamp stays unset and the next call tries again", async () => {
  const db = fakePages();
  const failing = transport(false);
  assert.equal(
    await pageOperator({ db, send: failing.send, now: () => T0 }, "jobs_backlog", "12 due jobs waiting", "…"),
    "failed",
  );
  assert.equal(db.rows.get("jobs_backlog").alerted_at, null);
  const throwing = transport(new Error("resend down"));
  assert.equal(
    await pageOperator({ db, send: throwing.send, now: () => T0 + 1000 }, "jobs_backlog", "12 due jobs waiting", "…"),
    "failed",
  );
  assert.equal(db.rows.get("jobs_backlog").alerted_at, null);
  const ok = transport();
  assert.equal(
    await pageOperator({ db, send: ok.send, now: () => T0 + 2000 }, "jobs_backlog", "12 due jobs waiting", "…"),
    "sent",
  );
  assert.equal(ok.sent.length, 1);
});

test("every platform address is paged: LEAD_TO with two addresses reaches both", async () => {
  const saved = process.env.LEAD_TO;
  process.env.LEAD_TO = "ops@example.test, second@example.test";
  try {
    const db = fakePages();
    const t = transport();
    assert.equal(
      await pageOperator({ db, send: t.send, now: () => T0 }, "jobs_backlog", "12 due jobs waiting", "…"),
      "sent",
    );
    assert.deepEqual(t.sent[0].to, ["ops@example.test", "second@example.test"]);
  } finally {
    process.env.LEAD_TO = saved;
  }
});

test("the memory, judged: a firing that paged is told; one suppressed inside the window is told; a failed one is not, and only the recent untold ones are the operator's to act on", () => {
  const iso = (ms) => new Date(ms).toISOString();
  const H = 3600_000;
  const rows = [
    { key: "paged", first_at: iso(T0 - H), last_at: iso(T0 - H), count: 1, alerted_at: iso(T0 - H) },
    { key: "suppressed", first_at: iso(T0 - 5 * H), last_at: iso(T0 - 60_000), count: 4, alerted_at: iso(T0 - 5 * H) },
    { key: "failed", first_at: iso(T0 - 120_000), last_at: iso(T0 - 120_000), count: 1, alerted_at: null },
    { key: "stale_failed", first_at: iso(T0 - 48 * H), last_at: iso(T0 - 48 * H), count: 1, alerted_at: null },
    {
      key: "refired_after_window",
      first_at: iso(T0 - 20 * H),
      last_at: iso(T0 - 30_000),
      count: 2,
      alerted_at: iso(T0 - 20 * H),
    },
  ];
  const s = Object.fromEntries(pageStates(rows, T0).map((r) => [r.key, r]));
  assert.equal(s.paged.told, true);
  assert.equal(
    s.suppressed.told,
    true,
    "a firing inside the window after a delivered page was suppressed by design, not lost",
  );
  assert.equal(s.failed.told, false);
  assert.equal(s.failed.recent, true);
  assert.equal(s.stale_failed.told, false);
  assert.equal(s.stale_failed.recent, false, "two days old is history, not a condition");
  assert.equal(
    s.refired_after_window.told,
    false,
    "the window had passed, so the last firing was owed a page that did not go",
  );
  assert.deepEqual(untoldPages(rows, T0), ["failed", "refired_after_window"]);
});

test("what the pager writes is what pageStates reads: a failed page shows as untold, a delivered one as told", async () => {
  const db = fakePages();
  await pageOperator({ db, send: transport(false).send, now: () => T0 }, "jobs_backlog", "12 due jobs waiting", "…");
  await pageOperator({ db, send: transport().send, now: () => T0 }, "jobs_mass_failure", "50 jobs failed", "…");
  const rows = [...db.rows].map(([key, r]) => ({ key, first_at: r.last_at, ...r }));
  assert.deepEqual(untoldPages(rows, T0 + 1000), ["jobs_backlog"]);
  assert.deepEqual(
    pageStates(rows, T0 + 1000).map((r) => [r.key, r.told]),
    [
      ["jobs_backlog", false],
      ["jobs_mass_failure", true],
    ],
  );
});

test("with no platform address the page is unaddressed, said in the log, and nothing is stamped", async () => {
  const saved = process.env.LEAD_TO;
  delete process.env.LEAD_TO;
  try {
    const db = fakePages();
    const t = transport();
    assert.equal(
      await pageOperator({ db, send: t.send, now: () => T0 }, "jobs_mass_failure", "50 jobs failed", "…"),
      "unaddressed",
    );
    assert.equal(t.sent.length, 0);
    assert.equal(db.rows.get("jobs_mass_failure").alerted_at, null);
  } finally {
    process.env.LEAD_TO = saved;
  }
});

test("a memory it could not read is a memory it does not overwrite: the running count survives", async () => {
  // The write said `count: (row?.count ?? 0) + 1`, and `row` is null for both
  // "no row yet" and "the row is there and the read failed". On the second it
  // put 1 over the running total -- so the history an operator reads on
  // /api/diag to judge how long a condition has been firing was erased by
  // exactly the database trouble most likely to be firing it.
  const db = fakePages(
    { ledger: { key: "ledger", last_at: new Date(T0 - 60_000).toISOString(), count: 91, alerted_at: null } },
    { message: "statement timeout" },
  );
  const t = transport(true);
  assert.equal(
    await pageOperator({ db, send: t.send, now: () => T0 }, "ledger", "Ledger", "body"),
    "sent",
    "and it still pages: a duplicate beats a silence nobody chose",
  );
  assert.equal(db.rows.get("ledger").count, 91, "the count is left where it was, never reset to 1");
  assert.equal(db.rows.get("ledger").last_at, new Date(T0).toISOString(), "the firing is still stamped");
});

test("a first firing still starts the count at one", async () => {
  const db = fakePages();
  const t = transport(true);
  await pageOperator({ db, send: t.send, now: () => T0 }, "fresh", "Fresh", "body");
  assert.equal(db.rows.get("fresh").count, 1);
});
