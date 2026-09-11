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
const { pageOperator, PAGE_WINDOW_MS } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/page-operator.ts")).href);

/** A memory of pages: the three calls pageOperator makes, and nothing else. */
function fakePages(initial = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    from(table) {
      assert.equal(table, "operator_pages");
      return {
        select() {
          return { eq(_col, key) { return { maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }) }; } };
        },
        upsert: async (row) => { rows.set(row.key, { alerted_at: null, ...(rows.get(row.key) ?? {}), ...row }); return { data: null, error: null }; },
        update(patch) {
          return { eq: async (_col, key) => { rows.set(key, { ...(rows.get(key) ?? {}), ...patch }); return { data: null, error: null }; } };
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
  assert.equal(await pageOperator({ db, send: t.send, now: () => T0 }, "provider_auth:whatsapp", "WhatsApp refused a send with 401", "tenant t1"), "sent");
  assert.equal(t.sent.length, 1);
  assert.deepEqual(t.sent[0].to, ["ops@example.test"]);
  assert.match(t.sent[0].subject, /^\[Chanlytics\] WhatsApp refused/);
  assert.equal(db.rows.get("provider_auth:whatsapp").count, 1);
  assert.equal(db.rows.get("provider_auth:whatsapp").alerted_at, new Date(T0).toISOString());

  assert.equal(await pageOperator({ db, send: t.send, now: () => T0 + 60_000 }, "provider_auth:whatsapp", "again", "tenant t1"), "suppressed");
  assert.equal(t.sent.length, 1, "no second page inside the window");
  assert.equal(db.rows.get("provider_auth:whatsapp").count, 2, "but the condition is counted");

  assert.equal(await pageOperator({ db, send: t.send, now: () => T0 + PAGE_WINDOW_MS + 1 }, "provider_auth:whatsapp", "still", "tenant t1"), "sent");
  assert.equal(t.sent.length, 2);
});

test("a page that did not send earns no quiet: the stamp stays unset and the next call tries again", async () => {
  const db = fakePages();
  const failing = transport(false);
  assert.equal(await pageOperator({ db, send: failing.send, now: () => T0 }, "jobs_backlog", "12 due jobs waiting", "…"), "failed");
  assert.equal(db.rows.get("jobs_backlog").alerted_at, null);
  const throwing = transport(new Error("resend down"));
  assert.equal(await pageOperator({ db, send: throwing.send, now: () => T0 + 1000 }, "jobs_backlog", "12 due jobs waiting", "…"), "failed");
  assert.equal(db.rows.get("jobs_backlog").alerted_at, null);
  const ok = transport();
  assert.equal(await pageOperator({ db, send: ok.send, now: () => T0 + 2000 }, "jobs_backlog", "12 due jobs waiting", "…"), "sent");
  assert.equal(ok.sent.length, 1);
});

test("with no platform address the page is unaddressed, said in the log, and nothing is stamped", async () => {
  const saved = process.env.LEAD_TO;
  delete process.env.LEAD_TO;
  try {
    const db = fakePages();
    const t = transport();
    assert.equal(await pageOperator({ db, send: t.send, now: () => T0 }, "jobs_mass_failure", "50 jobs failed", "…"), "unaddressed");
    assert.equal(t.sent.length, 0);
    assert.equal(db.rows.get("jobs_mass_failure").alerted_at, null);
  } finally {
    process.env.LEAD_TO = saved;
  }
});
