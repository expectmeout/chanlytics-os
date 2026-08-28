/**
 * getThread must tell "this thread is new" apart from "I could not read it",
 * and it must get the FIRST one right — every first-time customer takes that
 * path.
 *
 * This exists because the fix for the second case broke the first. The Vercel
 * Blob SDK signals a missing blob by returning `null` ("resolves to
 * { stream, blob } or null if not found"), not by throwing BlobNotFoundError.
 * A version of getThread that only special-cased the throw classified every
 * brand-new customer as state-unavailable — no greeting, an escalation, and a
 * staff email instead of a reply. Under PG_READS=on the main path was shielded
 * by Postgres, which is exactly why it could have shipped unnoticed and then
 * detonated the moment anyone flipped the rollback switch.
 *
 * The module reads BLOB_READ_WRITE_TOKEN at import time and calls the real SDK,
 * so rather than mock the network these tests drive the memory backend (no
 * token) for behaviour, and assert the Blob branch's not-found handling against
 * the source. That is a weaker guarantee than executing it, and it is stated
 * here rather than implied: what it pins is the DISTINCTION the code has to
 * make, and the specific mistake that was made.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(here, "../../../apps/edge/lib/store.ts");
const src = fs.readFileSync(STORE, "utf8");

// No BLOB_READ_WRITE_TOKEN in the test env -> the memory backend.
// pathToFileURL, because a bare Windows absolute path is not a legal ESM
// specifier ("Received protocol 'c:'").
const { getThread, saveThread, isThreadUnknown } = await import(pathToFileURL(STORE).href);

test("an unseen thread is BLANK, not unknown", async () => {
  const t = await getThread(`probe-new-${Date.now()}`);
  assert.equal(isThreadUnknown(t), false, "a first-time customer must not be state-unavailable");
  assert.equal(t.pausedUntil, 0, "a blank thread is not paused");
  assert.deepEqual(t.history, []);
  assert.deepEqual(t.seen, []);
});

test("a saved thread round-trips", async () => {
  const id = `probe-rt-${Date.now()}`;
  const t = await getThread(id);
  t.history.push({ role: "user", content: "hello" });
  t.pausedUntil = 123;
  assert.equal(await saveThread(id, t), true, "saveThread must report whether it persisted");
  const back = await getThread(id);
  assert.equal(back.pausedUntil, 123);
  assert.equal(back.history.length, 1);
});

test("an unknown state is never persisted, and saveThread says so", async () => {
  // Writing it would turn a transient read failure into a durable one.
  const id = `probe-unknown-${Date.now()}`;
  const poisoned = { history: [], seen: [], pausedUntil: -1, replies: [], unknown: true };
  assert.equal(await saveThread(id, poisoned), false);
  const back = await getThread(id);
  assert.equal(back.pausedUntil, 0, "the refused write must not have landed");
});

test("each call returns its OWN object — no shared sentinel", async () => {
  // The first version exported a module-level THREAD_UNKNOWN compared by
  // identity. Callers mutate what getThread returns (thread.seen.push(...),
  // t.pausedUntil = ...), so every mutation accumulated on one shared object
  // and leaked between customers inside a warm lambda.
  const a = await getThread(`probe-iso-a-${Date.now()}`);
  const b = await getThread(`probe-iso-b-${Date.now()}`);
  assert.notEqual(a, b, "two reads returned the same object");
  a.seen.push("poison");
  a.pausedUntil = 999;
  assert.deepEqual(b.seen, [], "mutating one thread's state changed another's");
  assert.equal(b.pausedUntil, 0);
});

/* ------------------------- the Blob branch, by source ----------------------- */

test("a null result from the SDK is treated as NOT FOUND, not as a failure", () => {
  // The regression in one line. `get()` returns null for a missing blob; if
  // that falls through to the unreadable branch, no new customer is ever
  // greeted.
  assert.match(
    src,
    /if \(res === null\) return blank\(\);/,
    "getThread must map a null SDK result to blank() before any failure handling",
  );
  const nullCheck = src.indexOf("if (res === null) return blank();");
  const unreadableReturn = src.indexOf("return unreadable();");
  assert.ok(nullCheck !== -1 && nullCheck < unreadableReturn, "the not-found check must come first");
});

test("a read failure is still distinguished from an empty thread", () => {
  assert.match(src, /catch \(e\)/, "the read is wrapped");
  assert.match(src, /return unreadable\(\);/, "a failed read must yield the unknown state");
  assert.match(
    src,
    /if \(e instanceof BlobNotFoundError\) return blank\(\);/,
    "a thrown not-found must still be blank, defensively",
  );
});

test("saveThread reports success rather than returning void", () => {
  // It used to return void, so a caller could not tell a durable write from a
  // fall-through into a per-lambda Map the next invocation cannot see. The
  // admin pause mirror reports "paused" to the operator on the strength of it.
  assert.match(src, /export async function saveThread\([\s\S]*?\): Promise<boolean>/);
});
