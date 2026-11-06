/**
 * The daily canary call (decision 0092, apps/edge/lib/voice/watch/voice-canary.ts): its own key opens its door and nothing
 * else does; with any setting missing it places nothing; and the verdict names every part of a customer's call the
 * canary's call failed to leave behind -- the row, the business's facts composed, the analysis, the line in the thread,
 * the notice claimed and told, the audio, the hold let go, Retell's signature on the inbound door and the webhook.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const k of [
  "VOICE_CANARY_KEY",
  "VOICE_CANARY_TENANT",
  "VOICE_CANARY_FROM",
  "VOICE_CANARY_CALLER_AGENT",
  "RETELL_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { canaryKeyMatches, judgeCanary, voiceCanary } = await import(at("apps/edge/lib/voice/watch/voice-canary.ts"));

/** A canary call that left everything behind. */
const whole = () => ({
  call: {
    retell_call_id: "call_canary_1",
    status: "ended",
    analysed: true,
    thread_line: true,
    notice_claimed: true,
    notice_told: true,
    recording: "stored",
    composed: true,
    hold_released: true,
  },
  doors: {
    inbound: { signed: 1, secret_only: 0, unsigned: 0, last_at: new Date().toISOString() },
    webhook: { signed: 4, secret_only: 0, unsigned: 0, last_at: new Date().toISOString() },
  },
});

test("a call that left everything behind holds; each part it did not leave is named", () => {
  assert.deepEqual(judgeCanary(whole()).failed, []);
  assert.equal(judgeCanary(whole()).ok, true);
  const missing = {
    status: ["not_connected", "call_ended"],
    analysed: [false, "analysed"],
    thread_line: [false, "thread_line"],
    notice_claimed: [false, "notice_claimed"],
    notice_told: [false, "notice_told"],
    recording: ["pending", "recording_stored"],
    composed: [false, "composed"],
    hold_released: [false, "hold_released"],
  };
  for (const [field, [value, check]] of Object.entries(missing)) {
    const f = whole();
    f.call[field] = value;
    const v = judgeCanary(f);
    assert.equal(v.ok, false, field);
    assert.deepEqual(v.failed, [check], field);
  }
});

test("no call at all fails every part of the call; a door that took no signature is named", () => {
  const none = judgeCanary({ call: null, doors: whole().doors });
  assert.equal(none.ok, false);
  assert.ok(none.failed.includes("call_placed") && none.failed.includes("notice_told"));
  const f = whole();
  f.doors = {
    webhook: { signed: 2, secret_only: 0, unsigned: 0, last_at: new Date().toISOString() },
    inbound: { signed: 0, secret_only: 1, unsigned: 0, last_at: new Date().toISOString() },
  };
  assert.deepEqual(judgeCanary(f).failed, ["inbound_signed"]);
  // The availability door is the model's to reach for on a script: said, never judged.
  f.doors.inbound.signed = 1;
  assert.equal(judgeCanary(f).ok, true);
});

const knock = (key) =>
  new Request("https://edge.test/api/voice-canary", {
    method: "POST",
    headers: key === null ? {} : { "x-canary-key": key },
  });

test("only the canary's own key opens its door, and an unset key opens it for nobody", () => {
  assert.equal(canaryKeyMatches(knock("anything")), false, "unset");
  process.env.VOICE_CANARY_KEY = "canary-key-for-this-file";
  try {
    assert.equal(canaryKeyMatches(knock(null)), false);
    assert.equal(canaryKeyMatches(knock("canary-key-for-this-fil")), false);
    assert.equal(canaryKeyMatches(knock("canary-key-for-this-file")), true);
  } finally {
    delete process.env.VOICE_CANARY_KEY;
  }
});

test("with a setting missing nothing is placed; an op it does not know, or a verdict with no time, is refused", async () => {
  const unset = await voiceCanary({ op: "place" });
  assert.equal(unset.status, 503);
  assert.equal((await unset.json()).error, "voice_canary_unset");
  Object.assign(process.env, {
    VOICE_CANARY_TENANT: "aaaaaaaa-0000-4000-8000-000000000001",
    VOICE_CANARY_FROM: "+13055550142",
    VOICE_CANARY_CALLER_AGENT: "agent_canary_caller",
    RETELL_API_KEY: "api-key-for-this-file",
  });
  try {
    const odd = await voiceCanary({ op: "dance" });
    assert.deepEqual([odd.status, (await odd.json()).error], [400, "unknown_op"]);
    const noTime = await voiceCanary({ op: "verdict" });
    assert.deepEqual([noTime.status, (await noTime.json()).error], [400, "bad_request"]);
  } finally {
    for (const k of ["VOICE_CANARY_TENANT", "VOICE_CANARY_FROM", "VOICE_CANARY_CALLER_AGENT", "RETELL_API_KEY"])
      delete process.env[k];
  }
});
