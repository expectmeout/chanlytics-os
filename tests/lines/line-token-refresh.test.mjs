/**
 * The texting line's token refresh says what the provider's answer was (review F:2, scorecard row 87).
 *
 * `refreshLineToken` (sms.ts) reads a line's subaccount from Twilio as the platform's master account and puts the token
 * it finds back in the Vault. Every answer that was not a 2xx used to be "the provider refused the platform's
 * credentials": a Twilio 503, a 429 or a timeout sent an operator to the master key, and the A2P sync wrote the same
 * sentence on the line's `last_error`. Now the words follow provider-fetch's outcome: a 401 or 403 is the platform's
 * credentials refused, any other 4xx is the provider's no about this subaccount, and an answer that did not come (a
 * gateway's 5xx, a 429, a timeout, an open breaker) is the provider unavailable, said so and asked again next tick.
 *
 * Each case runs the real function over a fake database and a fetch that answers as Twilio would. Nothing leaves this
 * process.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

for (const k of ["VERCEL_ENV", "LINES_DRY_RUN"]) delete process.env[k];
process.env.TWILIO_ACCOUNT_SID = "ACmaster0000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "master-token-for-this-file";

const { refreshLineToken } = await importSrc("apps/edge/lib/sms/sms.ts");
const { syncRegistration } = await importSrc("apps/edge/lib/lines/a2p-sync.ts");

const realFetch = globalThis.fetch;
const realConsole = { log: console.log, warn: console.warn, error: console.error };
after(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
});
beforeEach(resetBreakers);

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "11111111-1111-4111-8111-111111111111";
const line = (over = {}) => ({
  id: LINE,
  tenant_id: TENANT,
  e164: "+13055550142",
  provider: "twilio",
  subaccount_sid: "ACsub",
  messaging_service_sid: "MG0001",
  brand_sid: "BN0001",
  campaign_sid: "QE0001",
  sms_state: "registering",
  voice_state: "ready",
  last_error: null,
  reg_mock: false,
  ...over,
});

/** The edge's log lines, as objects, while `fn` runs. */
async function logged(fn) {
  const lines = [];
  const keep = (l) => {
    try {
      lines.push(JSON.parse(String(l)));
    } catch {
      /* not a log line */
    }
  };
  console.log = keep;
  console.warn = keep;
  console.error = keep;
  try {
    return [await fn(), lines];
  } finally {
    Object.assign(console, realConsole);
  }
}

/** A world: `twilio(url)` answers as Twilio, a Response or a throw; the Vault keeps what was put in it. */
function world(twilio, rows = [line()]) {
  const vault = [];
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return twilio(String(url));
  };
  const db = fakeDb(
    { lines: rows },
    {},
    {
      get_line_credentials: () => ({ auth_token: "the-old-token" }),
      put_line_credentials: (args) => {
        vault.push(args.p_secret);
        return null;
      },
    },
  );
  return { db, vault, urls, rows };
}

const answer = (status, body = {}) => new Response(JSON.stringify(body), { status });
const timeout = () => {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  throw e;
};

test("a subaccount read that answers with its token is stored and handed back", async () => {
  const w = world(() => answer(200, { auth_token: "rotated-token-1" }));
  const r = await refreshLineToken(w.db, line());
  assert.deepEqual(r, { ok: true, account: { sid: "ACsub", token: "rotated-token-1" } });
  assert.deepEqual(w.vault, [{ auth_token: "rotated-token-1" }], "written through the one write path");
});

for (const status of [401, 403]) {
  test(`a ${status} is the platform's credentials refused, and the log says so`, async () => {
    const w = world(() => answer(status, { message: "Authenticate" }));
    const [r, lines] = await logged(() => refreshLineToken(w.db, line()));
    assert.equal(r.ok, false);
    assert.equal(r.error, "provider_unauthorized");
    assert.match(r.detail, new RegExp(`platform's credentials \\(HTTP ${status}\\)`));
    assert.deepEqual(w.vault, [], "nothing stored");
    const refused = lines.find((l) => l.event === "line_token_refresh_refused");
    assert.ok(refused, "the event alerting greps for");
    assert.match(refused.note, /the platform's own Twilio credentials were refused/);
  });
}

for (const [what, twilio, words] of [
  ["a 503 from a gateway", () => answer(503), /HTTP 503/],
  ["a 502", () => answer(502), /HTTP 502/],
  ["a 429, the provider saying not now", () => answer(429), /HTTP 429/],
  ["a timeout", timeout, /timeout/],
]) {
  test(`REGRESSION: ${what} is the provider unavailable, never a refusal of the platform's credentials`, async () => {
    const w = world(twilio);
    const [r, lines] = await logged(() => refreshLineToken(w.db, line()));
    assert.equal(r.ok, false);
    assert.equal(r.error, "unavailable");
    assert.match(r.detail, /could not be asked just now/);
    assert.match(r.detail, words);
    assert.doesNotMatch(r.detail, /platform's credentials/);
    assert.deepEqual(w.vault, [], "nothing stored");
    assert.ok(!lines.some((l) => l.event === "line_token_refresh_refused"), "no master-key alarm for a blip");
    assert.ok(
      lines.some((l) => l.event === "line_token_refresh_failed" && l.level === "warn"),
      "the blip is logged",
    );
  });
}

test("REGRESSION: an open breaker holds the read and reads as the provider unavailable, not as a refused key", async () => {
  const w = world(() => answer(503));
  await logged(async () => {
    // Five reads in a row with no good answer open Twilio's breaker (provider-fetch); the sixth is not made at all.
    for (let i = 0; i < 3; i++) await refreshLineToken(w.db, line());
    const before = w.urls.length;
    const r = await refreshLineToken(w.db, line());
    assert.equal(r.error, "unavailable");
    assert.match(r.detail, /breaker_open/);
    assert.equal(w.urls.length, before, "the held call never left");
  });
});

test("any other 4xx is the provider's no about this subaccount, said as that and not as the platform's key", async () => {
  const w = world(() => answer(404, { message: "The requested resource was not found" }));
  const [r, lines] = await logged(() => refreshLineToken(w.db, line()));
  assert.equal(r.error, "provider_refused");
  assert.match(r.detail, /HTTP 404/);
  assert.doesNotMatch(r.detail, /platform's credentials/);
  assert.ok(lines.some((l) => l.event === "line_token_refresh_failed" && l.level === "error"));
  assert.ok(!lines.some((l) => l.event === "line_token_refresh_refused"));
});

test("REGRESSION: the registration sync writes the blip on the line as a blip, not as a key to check", async () => {
  // The line's own token is dead (its reads answer 401), the platform tries to heal it, and Twilio is having a moment.
  const rows = [line()];
  const w = world(
    (url) => (url.includes("/Accounts/ACsub.json") ? answer(503) : answer(401, { message: "Authenticate" })),
    rows,
  );
  const [out] = await logged(() => syncRegistration(w.db, rows[0]));
  assert.equal(out.ok, false);
  assert.equal(out.error, "unavailable", "the sync hands the refresh's verdict on");
  assert.match(rows[0].last_error, /could not read the registration: the provider could not be asked just now/);
  assert.doesNotMatch(rows[0].last_error, /platform's credentials/);

  // The same sync where the platform's key really is refused keeps saying so.
  const keyRows = [line()];
  const k = world(() => answer(401, { message: "Authenticate" }), keyRows);
  const [refused] = await logged(() => syncRegistration(k.db, keyRows[0]));
  assert.equal(refused.error, "provider_unauthorized");
  assert.match(keyRows[0].last_error, /platform's credentials \(HTTP 401\)/);
});
