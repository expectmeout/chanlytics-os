/**
 * Retell signs each delivery as its documentation says: X-Retell-Signature is
 * `v={unix ms},d={hex}`, the digest an HMAC-SHA256 over the raw body with the
 * timestamp appended, keyed with the API key that carries the webhook badge.
 * The verifier is run here against signatures made that way, so a delivery
 * that fails to verify in production is a key question, never a scheme one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { verifyRetellSignature } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/voice/retell.ts")).href);

const KEY = "key_with_the_webhook_badge";
const sign = (raw, key = KEY, ts = Date.now()) =>
  `v=${ts},d=${createHmac("sha256", key)
    .update(raw + ts)
    .digest("hex")}`;
const raw = '{"event":"call_ended","call":{"call_id":"c1","transcript":"Hola — ¿tienen turno mañana?"}}';

test("a delivery signed the documented way verifies against the raw body and the badged key", () => {
  assert.equal(verifyRetellSignature(raw, sign(raw), KEY), true);
});

test("another key, a stale timestamp, a forged digest, a malformed header, no header: each refused", () => {
  assert.equal(
    verifyRetellSignature(raw, sign(raw, "some_other_key"), KEY),
    false,
    "the key the edge calls with is not the key Retell signs with unless it carries the badge",
  );
  assert.equal(
    verifyRetellSignature(raw, sign(raw, KEY, Date.now() - 6 * 60_000), KEY),
    false,
    "older than five minutes: a replay",
  );
  const [v] = sign(raw).split(",");
  assert.equal(verifyRetellSignature(raw, `${v},d=${"0".repeat(64)}`, KEY), false);
  assert.equal(verifyRetellSignature(raw, "sha256=abc", KEY), false);
  assert.equal(verifyRetellSignature(raw, null, KEY), false);
  assert.equal(verifyRetellSignature(raw, sign(raw), undefined), false, "no key configured is a refusal, never a pass");
});

test("the raw bytes are what is signed: a re-serialised body verifies only when it is byte-identical", () => {
  const escaped = JSON.stringify({
    event: "call_ended",
    call: { call_id: "c1", transcript: "Hola — ¿tienen turno mañana?" },
  });
  // JSON.stringify keeps non-ASCII as is; an encoder that escapes it produces different bytes, so a signature over one form fails over the other.
  const asciiEscaped = escaped.replace("—", "\\u2014").replace("ñ", "\\u00f1");
  assert.notEqual(escaped, asciiEscaped);
  assert.equal(verifyRetellSignature(asciiEscaped, sign(asciiEscaped), KEY), true);
  assert.equal(
    verifyRetellSignature(escaped, sign(asciiEscaped), KEY),
    false,
    "which is why the webhook tries both forms and records which one verified",
  );
});
