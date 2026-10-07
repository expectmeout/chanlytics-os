/**
 * The pager's door, run: POST /api/admin/page over a database in memory and a captured wire to the mail transport.
 *
 * Two conditions are seen only by GitHub's workflows, the nightly red two runs in a row and production's migrations
 * disagreeing with main's; before this door neither reached anyone outside GitHub (the scorecard's defect 15). What is
 * proven: only the platform's key opens it, a workspace's token does not; only the closed set pages; a page goes to
 * the platform's addresses under the pager's own rules (remembered, once per six hours); and every refusal comes before
 * the database or the wire is touched.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

// Each test file is its own process: this is the whole environment. No Supabase credentials, so `setPg(null)` is no
// database, and the platform's mailbox is made up.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.DIAG_KEY = "diag-key-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/admin/page.ts"));
after(() => setPg(null));

const AUD = "/api/admin/page";
const knock = (body, headers = { "x-diag-key": process.env.DIAG_KEY }) =>
  POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

/** Every request to the transport, captured; a delivered mail is Resend's 200 with an id. */
function wire() {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: "email_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    mail: () => seen.filter((r) => r.url === "https://api.resend.com/emails").map((r) => r.body),
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

const RED = { condition: "nightly_red", detail: "Nightly e2e is red. https://github.com/example/repo/actions/runs/1" };

test("only the platform's key opens it: no credential, a wrong key and a workspace's token are refused before anything is read", async () => {
  const db = fakeDb({ operator_pages: [] });
  setPg(db);
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock(RED, {})), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock(RED, { "x-diag-key": "not-the-key" })), [403, { ok: false }]);
    const token = signEdgeToken(process.env.EDGE_CALL_SECRET, AUD, { workspace: null, user: "u1" });
    const [status, body] = await answer(await knock(RED, { "x-edge-token": token }));
    assert.equal(status, 403);
    assert.equal(body.error, "platform_only");
  } finally {
    net.restore();
  }
  assert.equal(db.seen.length, 0, "nothing was read");
  assert.equal(net.seen.length, 0, "and nothing was sent");
});

test("only the closed set pages, with words; an unknown condition, no detail and an unreadable body are 400", async () => {
  const db = fakeDb({ operator_pages: [] });
  setPg(db);
  for (const body of [{ ...RED, condition: "anything" }, { condition: "nightly_red" }, { ...RED, detail: "  " }, "{"]) {
    const [status, said] = await answer(await knock(body));
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(said.error, "bad_request");
  }
  assert.equal(db.seen.length, 0);
});

test("with no database it says so, and sends nothing", async () => {
  setPg(null);
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock(RED)), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
  assert.equal(net.seen.length, 0);
});

test("a condition pages the platform once, remembered as the pager remembers its own; the next knock inside six hours is suppressed", async () => {
  const tables = { operator_pages: [] };
  setPg(fakeDb(tables));
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock(RED)), [200, { ok: true, condition: "nightly_red", outcome: "sent" }]);
    assert.deepEqual(await answer(await knock(RED)), [
      200,
      { ok: true, condition: "nightly_red", outcome: "suppressed" },
    ]);
    const ledger = {
      condition: "migration_ledger",
      detail: "Production lacks 1 migration main carries: 00281_x.sql, on main for 30 h",
    };
    assert.equal((await answer(await knock(ledger)))[1].outcome, "sent", "another condition is its own page");
  } finally {
    net.restore();
  }
  const mail = net.mail();
  assert.equal(mail.length, 2);
  assert.deepEqual(mail[0].to, ["ops@platform.test"]);
  assert.equal(mail[0].subject, "[Chanlytics] The nightly has been red two runs in a row");
  assert.match(mail[0].text, /actions\/runs\/1/);
  assert.equal(mail[1].subject, "[Chanlytics] Production's migrations disagree with main's");
  const rows = tables.operator_pages.map((r) => [r.key, r.count]);
  assert.deepEqual(rows.sort(), [
    ["outside:migration_ledger", 1],
    ["outside:nightly_red", 2],
  ]);
});

test("every condition a workflow pages for is one the door accepts, so a typo cannot leave the pager mute", async () => {
  const dir = path.join(ROOT, ".github/workflows");
  const named = new Set();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".yml")))
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/--condition\s+([a-z_]+)/g)) named.add(m[1]);
  assert.deepEqual([...named].sort(), ["migration_ledger", "nightly_red"], "the workflows page for these two");
  setPg(fakeDb({ operator_pages: [] }));
  const net = wire();
  try {
    for (const condition of named) {
      const [status, body] = await answer(await knock({ condition, detail: "what a workflow saw" }));
      assert.equal(status, 200, `${condition}: ${JSON.stringify(body)}`);
    }
  } finally {
    net.restore();
  }
});
