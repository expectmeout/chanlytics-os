/**
 * GET /api/admin/lines/codes, run: the one-time codes texted to a workspace's own line, read from the provider's own record,
 * over a database in memory, a vault that answers the line's own subaccount token, and a captured wire to Twilio that answers
 * what the test writes. The rule that says what a code is is held in sms/one-time-code.test.mjs and the provider's list in
 * lines-twilio.test.mjs; this holds the door around them.
 *   - the knock: a token for another door, a forgery and no credential are 403; a token that names no workspace is a 400 (a GET
 *     has no body to name one); no database is a 503;
 *   - the line: none, one the business kept at its carrier, one that failed, one with no subaccount or no token in the vault, and
 *     one of another provider than this deployment's each have no codes -- an empty list, never an error, and Twilio is not asked;
 *   - the codes: asked of the line's own subaccount with its own token, for the line's own number, and answered as { code, from,
 *     at } newest first, only the codes of the last fifteen minutes, none of the other texts and nothing written anywhere;
 *   - Twilio refusing is a 502 and a line that names the workspace, never what a text said; no provider at all is a 503.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers, signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const MASTER = { sid: "ACplatformmasteraccountforthisfile", token: "platform-master-token-for-this-file" };
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.TWILIO_ACCOUNT_SID = MASTER.sid;
process.env.TWILIO_AUTH_TOKEN = MASTER.token;
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LINES_DRY_RUN", "VERCEL_ENV"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/lines/codes.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const AUD = "/api/admin/lines/codes";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "11111111-1111-4111-8111-111111111111";
const LINE = "+16465550100";
const SUB = "ACharborlinesubaccount000000000000";
const LINE_TOKEN = "harbor-line-token-nobody-may-see";
const MESSAGES = `https://api.twilio.com/2010-04-01/Accounts/${SUB}/Messages.json`;

/* ------------------------------- the knock -------------------------------- */

const tokenFor = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: OWNER,
  });
const knock = (headers = { "x-edge-token": tokenFor() }) => door.GET(new Request(`http://edge${AUD}`, { headers }));
const answer = async (res) => [res.status, await res.json()];
/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

const line = (over = {}) => ({
  id: "line-a",
  tenant_id: A,
  e164: LINE,
  provider: "twilio",
  subaccount_sid: SUB,
  messaging_service_sid: "MG1",
  sms_state: "active",
  voice_state: "active",
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
function use({ lines = [line()], secrets = { auth_token: LINE_TOKEN }, faults = {} } = {}) {
  const tables = { lines, events: [] };
  const db = fakeDb(tables, faults, { get_line_credentials: () => secrets });
  setPg(db);
  return { tables, db };
}
const writes = (db) => db.seen.filter((s) => ["insert", "update", "upsert", "delete"].includes(s.op));

/** Twilio's list of messages, answered with `reply`; every request kept. */
function twilio(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    const a = reply();
    return new Response(JSON.stringify(a.body ?? {}), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** A time as Twilio writes date_sent (RFC 2822), `agoMs` before now. */
const sentAt = (agoMs) => new Date(Date.now() - agoMs).toUTCString().replace("GMT", "+0000");
const isoOf = (rfc2822) => new Date(Date.parse(rfc2822)).toISOString();
const MIN = 60_000;
const text = (sid, from, body, agoMs, direction = "inbound") => ({
  sid,
  from,
  body,
  direction,
  date_sent: sentAt(agoMs),
});

test("the knock: a token for another door, a forgery and no credential are 403; a token that names no workspace is a 400; no database is a 503 -- and none of it reaches Twilio or the database", async () => {
  const { db } = use();
  const net = twilio(() => {
    throw new Error("a refused knock must not reach Twilio");
  });
  try {
    assert.deepEqual(await answer(await knock({ "x-edge-token": tokenFor({ aud: "/api/admin/lines" }) })), [
      403,
      { ok: false, error: "token_audience" },
    ]);
    assert.deepEqual(await answer(await knock({ "x-edge-token": tokenFor({ secret: "not-the-secret" }) })), [
      403,
      { ok: false, error: "token_signature" },
    ]);
    assert.deepEqual(await answer(await knock({})), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock({ "x-edge-token": tokenFor({ workspace: null }) })), [
      400,
      { ok: false, error: "bad_tenant" },
    ]);
    assert.equal(db.seen.length, 0);
    setPg(null);
    assert.deepEqual(await answer(await knock()), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
});

test("a workspace with no line of ours has no codes: no line, a line kept at the carrier, a line that failed, one with no number yet, one with no subaccount or no token, one of another provider -- an empty list, and Twilio is not asked", async () => {
  const net = twilio(() => {
    throw new Error("there is nothing to ask Twilio");
  });
  try {
    for (const [what, world] of [
      ["no line", { lines: [] }],
      ["a line kept at the carrier", { lines: [line({ provider: "carrier", subaccount_sid: null })] }],
      ["a line that failed", { lines: [line({ voice_state: "failed" })] }],
      ["a line with no number yet", { lines: [line({ e164: null })] }],
      ["no subaccount", { lines: [line({ subaccount_sid: null })] }],
      ["no token in the vault", { secrets: {} }],
      ["a line of the dry provider on a deployment that texts through Twilio", { lines: [line({ provider: "dry" })] }],
    ]) {
      use(world);
      assert.deepEqual(await answer(await knock()), [200, { ok: true, codes: [] }], what);
    }
    assert.deepEqual(net.seen, []);
  } finally {
    net.restore();
  }
});

test("the codes of the last fifteen minutes, newest first, from the line's own record: asked of its subaccount with its own token for its own number, and nothing else of what was texted comes back or is written", async () => {
  const { db } = use();
  const messages = [
    text("SM6", "+18335550101", "Your WhatsApp code: 788-963\n\nDon't share this code with others", 2 * MIN),
    text("SM5", "+16465550123", "my door code is 4512", 1 * MIN),
    text("SM4", LINE, "We open at 9.", 90_000, "outbound-api"),
    text("SM3", "+15555550102", "123 456 is your Instagram code. Don't share it.", 5 * MIN),
    text("SM2", "+15555550103", "G-123456 is your Google verification code.", 20 * MIN),
    text("SM1", "+15555550104", "Your Apple ID Code is: 123456. Don't share it with anyone.", 14 * MIN),
  ];
  const w = twilio(() => ({ body: { messages } }));
  let res;
  try {
    res = await answer(await knock());
  } finally {
    w.restore();
  }
  assert.deepEqual(res, [
    200,
    {
      ok: true,
      codes: [
        { code: "788-963", from: "WhatsApp", at: isoOf(messages[0].date_sent) },
        { code: "123 456", from: "Instagram", at: isoOf(messages[3].date_sent) },
        { code: "123456", from: "Apple ID", at: isoOf(messages[5].date_sent) },
      ],
    },
  ]);
  assert.equal(w.seen.length, 1, "one read");
  const url = new URL(w.seen[0].url);
  assert.equal(`${url.origin}${url.pathname}`, MESSAGES, "the line's own subaccount's messages");
  assert.deepEqual([url.searchParams.get("To"), url.searchParams.get("PageSize")], [LINE, "20"]);
  assert.equal(
    w.seen[0].init.headers.Authorization,
    `Basic ${Buffer.from(`${SUB}:${LINE_TOKEN}`).toString("base64")}`,
    "the line's own token from the vault, never the platform's",
  );
  assert.ok(
    !JSON.stringify(res).includes("door code") && !JSON.stringify(res).includes("We open"),
    "no other text comes back",
  );
  assert.deepEqual(writes(db), [], "nothing is written: a code is not stored");
});

test("a read Twilio refuses is a 502 and a line that names the workspace and never what was texted; with no provider at all the door is a 503", async () => {
  use();
  const w = twilio(() => ({ status: 401, body: { code: 20003, message: "Authenticate" } }));
  const log = quiet();
  let res;
  try {
    res = await answer(await knock());
  } finally {
    log.restore();
    w.restore();
  }
  assert.deepEqual([res[0], res[1].ok, res[1].error], [502, false, "provider_refused"]);
  const said = log.lines.filter((l) => l.includes('"event":"line_codes_read_failed"'));
  assert.equal(said.length, 1);
  assert.ok(said[0].includes(A), "the workspace");
  assert.ok(!log.lines.some((l) => l.includes(LINE_TOKEN) || l.includes(MASTER.token)), "no token in a line");
  use();
  const none = await withEnv({ TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined }, async () =>
    answer(await knock()),
  );
  assert.deepEqual(none, [503, { ok: false, error: "no_line_provider" }]);
});

test("a preview's dry line answers none: the dry provider holds no texts, and the door says so", async () => {
  use({ lines: [line({ provider: "dry" })] });
  const net = twilio(() => {
    throw new Error("the dry provider never reaches Twilio");
  });
  try {
    const res = await withEnv(
      { TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined, LINES_DRY_RUN: "1" },
      async () => answer(await knock()),
    );
    assert.deepEqual(res, [200, { ok: true, codes: [] }]);
    assert.deepEqual(net.seen, []);
  } finally {
    net.restore();
  }
});
