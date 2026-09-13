/**
 * The whisper door, run: POST /api/admin/whisper over a captured wire to the
 * provider's update-live-call. Until 13 Sep 2026 its text was pinned by two
 * files and its POST had never been called.
 *
 * A sentence only the phone receptionist hears, worked into its next answer.
 * Executed here: the knock; the body (a call id and one answer's worth of
 * words); the frame -- the owner's words reach the provider as the owner's
 * instruction within the standing rules, never bare, and read back out of
 * the frame as the owner's; the nudge to speak now, only when asked; the
 * provider's refusal as a status in a sentence; and the log line, which
 * carries how many characters were whispered and never which.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { frameWhisper, whisperText } from "@chanlytics/contracts";

// The door reads both at call time; each test file is its own process.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RETELL_API_KEY = "retell-key-for-this-file";
delete process.env.DIAG_KEY;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { POST } = await import(at("apps/edge/api/admin/whisper.ts"));

const AUD = "/api/admin/whisper";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALL = "call_7f3a9c1e2b4d";
const WORDS = "tell them we have a haircut special this week";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) => signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: "workspace" in o ? o.workspace : A, user: "u1" });
const knock = (body, headers = { "x-edge-token": token() }) =>
  POST(new Request(`http://edge${AUD}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }));
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
/** Every request to the provider, captured and answered with the status given. */
function provider(status = 200) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), method: init?.method, headers: init?.headers ?? {}, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response("{}", { status });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
/** A wire nothing may reach. */
const unreachable = (why) => { const p = provider(); globalThis.fetch = async () => { throw new Error(why); }; return p; };
/** The door's log lines, kept instead of printed. */
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the door -------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403 with nothing sent; a bad token beside the right key is not rescued by the key; without the secret the key decides", async () => {
  const net = unreachable("a refused whisper must not reach the provider");
  try {
    assert.deepEqual(await answer(await knock({ call_id: CALL, text: WORDS }, { "x-edge-token": token({ aud: "/api/admin/stop-call" }) })), [403, { ok: false, error: "token_audience" }]);
    assert.deepEqual(await answer(await knock({ call_id: CALL, text: WORDS }, { "x-edge-token": token({ secret: "not-the-secret" }) })), [403, { ok: false, error: "token_signature" }]);
    assert.deepEqual(await answer(await knock({ call_id: CALL, text: WORDS }, {})), [403, { ok: false }]);
    await withEnv({ DIAG_KEY: "diag-key-for-this-file" }, async () => {
      assert.deepEqual(await answer(await knock({ call_id: CALL, text: WORDS }, { "x-edge-token": "garbage", "x-diag-key": "diag-key-for-this-file" })), [403, { ok: false, error: "token_malformed" }]);
      await withEnv({ EDGE_CALL_SECRET: undefined }, async () => {
        // The key opened the door: what follows is the door's own complaint about an empty body.
        assert.equal((await knock({}, { "x-diag-key": "diag-key-for-this-file" })).status, 400);
        assert.deepEqual(await answer(await knock({}, { "x-diag-key": "diag-key-for-this-file-but-longer" })), [403, { ok: false }]);
      });
    });
    assert.equal(net.seen.length, 0);
  } finally { net.restore(); }
});

test("without a provider key there is nobody to whisper to, said before the body is read; a call id that is not one, no words, or more than one answer's worth are refused, with nothing sent", async () => {
  const net = unreachable("a refused whisper must not reach the provider");
  try {
    assert.deepEqual(await answer(await withEnv({ RETELL_API_KEY: undefined }, () => knock({ call_id: CALL, text: WORDS }))), [503, { ok: false, error: "no_provider_key" }]);
    for (const body of [{}, { call_id: "not-a-call", text: WORDS }, { call_id: "call_short", text: WORDS }, { call_id: CALL }, { call_id: CALL, text: "   " }, { call_id: CALL, text: "x".repeat(501) }]) {
      assert.deepEqual(await answer(await knock(body)), [400, { ok: false, error: "call_id + text (1-500 chars) required" }], JSON.stringify(body));
    }
    assert.equal(net.seen.length, 0);
  } finally { net.restore(); }
});

/* ------------------------------- the whisper ------------------------------ */

test("the whisper: the owner's words reach the provider framed as the owner's instruction within the standing rules -- never bare -- on the one call named, with no nudge unless asked; and read back out of the frame as the owner's own", async () => {
  const p = provider(200);
  const log = quiet();
  let res;
  try {
    res = await knock({ call_id: CALL, text: `  ${WORDS}  ` });
  } finally { log.restore(); }
  try {
    assert.deepEqual(await answer(res), [200, { ok: true }]);
    assert.equal(p.seen.length, 1, "one update to the live call");
    const [req] = p.seen;
    assert.equal(req.url, `https://api.retellai.com/v2/update-live-call/${CALL}`);
    assert.equal(req.method, "PATCH");
    assert.equal(req.headers.Authorization, `Bearer ${process.env.RETELL_API_KEY}`, "the provider key lives here, so this is where the provider is spoken to");
    assert.deepEqual(req.body, { call_control: { additional_context: frameWhisper(WORDS), trigger_response: false } }, "framed, trimmed, and no nudge: a whisper is used when it fits");
    const framed = req.body.call_control.additional_context;
    assert.ok(framed.startsWith("A whisper from the business owner, who is listening to this call."), "the agent is told whose words these are");
    assert.ok(framed.includes(`Owner: "${WORDS}"`) && framed.includes("Your standing rules still hold"), "influence, never override: a whisper is not the way around the price rule");
    assert.notEqual(framed, WORDS, "REGRESSION: the first real whisper went in bare and lost to a direct question");
    assert.equal(whisperText(framed), WORDS, "the Live page reads the owner's words back out of the frame");
    // The log: how many characters, whose call, what the provider said -- never the words.
    const line = log.lines.find((l) => l.startsWith("admin_whisper"));
    assert.ok(line, "one line");
    assert.deepEqual(JSON.parse(line.slice("admin_whisper ".length)), { call_id: CALL, chars: WORDS.length, ok: true, status: 200 });
    assert.ok(!log.lines.some((l) => l.includes("haircut")), "the words are the operator's and stay out of the log");
  } finally { p.restore(); }

  const nudge = provider(200);
  try {
    assert.equal((await knock({ call_id: CALL, text: WORDS, trigger: true })).status, 200);
    assert.equal(nudge.seen[0].body.call_control.trigger_response, true, "asked to speak now");
    assert.equal((await knock({ call_id: CALL, text: WORDS, trigger: "yes" })).status, 200);
    assert.equal(nudge.seen[1].body.call_control.trigger_response, false, "only a real true nudges");
    // The door checks no workspace: RLS on the dashboard's route has already proved the call is the operator's.
    assert.equal((await knock({ call_id: CALL, text: WORDS }, { "x-edge-token": token({ workspace: null }) })).status, 200, "a token about no workspace opens it too");
  } finally { nudge.restore(); }
});

test("a call that just ended is a status in a sentence, not an exception in a route", async () => {
  const gone = provider(404);
  const log = quiet();
  let res;
  try { res = await knock({ call_id: CALL, text: WORDS }); } finally { log.restore(); gone.restore(); }
  assert.deepEqual(await answer(res), [502, { ok: false, error: "provider_refused", status: 404 }]);
  assert.deepEqual(JSON.parse(log.lines.find((l) => l.startsWith("admin_whisper")).slice("admin_whisper ".length)), { call_id: CALL, chars: WORDS.length, ok: false, status: 404 });
});
