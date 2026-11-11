/**
 * Where a drawing on a machine stands (packages/channels/src/files/machine.ts), read from two things: what the machine's script
 * last said of itself, and how its process ended. The platform does not say a background command ended until it is asked to
 * wait for it (read on real machines, 10 Nov 2026: a drawing finished at seven seconds read as running for four minutes, and
 * every video would have been taken for stalled). So the script's own last word is what says a video is drawn, and the
 * process's end is asked for only to tell a drawing still going from one that died without a word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { renderStateOf } = await import(at("packages/channels/src/files/machine.ts"));

test("a drawing whose script said done is done, whatever the platform has yet said of its process", () => {
  const done = { stage: "done", progress: 1, bytes: 1_158_015, frames: 360 };
  // Its process ended and nobody has been told: the word is enough.
  assert.deepEqual(renderStateOf(done, null), { stage: "done", bytes: 1_158_015 });
  assert.deepEqual(renderStateOf(done, 0), { stage: "done", bytes: 1_158_015 });
  // A done with no bytes is no video.
  assert.equal(renderStateOf({ stage: "done", bytes: 0 }, 0).stage, "failed");
});

test("a drawing that said what went wrong failed in its own words", () => {
  assert.deepEqual(renderStateOf({ stage: "error", message: "cut-0.mp4: a part answered 403" }, null), {
    stage: "failed",
    error: "cut-0.mp4: a part answered 403",
  });
  assert.deepEqual(renderStateOf({ stage: "error" }, 1), { stage: "failed", error: "exit 1" });
});

test("a drawing still going says how far it is; one that has said nothing yet is at none", () => {
  assert.deepEqual(renderStateOf({ stage: "drawing", progress: 0.62 }, null), { stage: "working", progress: 0.62 });
  assert.deepEqual(renderStateOf({ stage: "fetching", progress: 0 }, null), { stage: "working", progress: 0 });
  assert.deepEqual(renderStateOf(null, null), { stage: "working", progress: 0 });
});

test("a process that ended without a word of a video failed: killed, or ended early", () => {
  // Killed for its memory, with its last word still "drawing".
  assert.deepEqual(renderStateOf({ stage: "drawing", progress: 0.4 }, 137), { stage: "failed", error: "exit 137" });
  assert.deepEqual(renderStateOf({ stage: "drawing", progress: 1 }, 0), {
    stage: "failed",
    error: "the drawing ended without a video",
  });
  assert.deepEqual(renderStateOf(null, 0), { stage: "failed", error: "the drawing ended without a video" });
});
