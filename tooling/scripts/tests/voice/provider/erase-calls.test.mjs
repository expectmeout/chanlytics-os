/**
 * An erased person's calls taken off the voice provider (decision 0036's provider leg, decision 0092,
 * apps/edge/lib/voice/erase-calls.ts): each call asked for once, a call the provider has no more counted as deleted
 * (gone is gone), a refusal or a throw counted and never thrown on, so the erasure goes on; and no more calls asked
 * about than one erasure may ask, the rest left to the provider's week.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { eraseCallsAtProvider } = await import(at("apps/edge/lib/voice/erase-calls.ts"));

test("each call is asked for once; a refusal and a throw are counted, never thrown", async () => {
  const asked = [];
  const del = async (cfg, id) => {
    asked.push([cfg.apiKey, id]);
    if (id === "call_refused") return { ok: false, status: 500 };
    if (id === "call_throws") throw new Error("no answer");
    return { ok: true, status: 204 };
  };
  const out = await eraseCallsAtProvider("api-key", ["call_a", "call_refused", "call_throws", "call_b"], del);
  assert.deepEqual(out, { asked: 4, deleted: 2, refused: 2 });
  assert.deepEqual(
    asked.map(([, id]) => id),
    ["call_a", "call_refused", "call_throws", "call_b"],
  );
  assert.ok(asked.every(([key]) => key === "api-key"));
});

test("one erasure asks about two hundred calls at most", async () => {
  let n = 0;
  const ids = Array.from({ length: 250 }, (_, i) => `call_${i}`);
  const out = await eraseCallsAtProvider("api-key", ids, async () => {
    n += 1;
    return { ok: true, status: 204 };
  });
  assert.deepEqual([out.asked, n], [200, 200]);
});
