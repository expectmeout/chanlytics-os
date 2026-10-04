/**
 * The agent client's audio worklets are served from this origin, byte for byte what the installed client would
 * inline (tooling/scripts/voice/vendor-worklets.mjs): the dashboard's script-src allows neither blob: nor data:, so a
 * missing or drifted file is a WebRTC conversation that goes down a second after it is up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { WORKLETS, WORKLET_PATHS, workletSource, publicFile } from "../../voice/vendor-worklets.mjs";

test("each worklet the client ships is served under /voice, equal to the client's own source", () => {
  for (const w of WORKLETS) {
    const file = publicFile(w.name);
    assert.ok(existsSync(file), `${w.file} is vendored (node tooling/scripts/voice/vendor-worklets.mjs)`);
    const src = workletSource(w.name);
    assert.ok(src.length > 1000 && src.includes("registerProcessor"), `${w.name} reads as a worklet`);
    assert.equal(readFileSync(file, "utf8"), src, `${w.file} equals the installed client's (re-run the vendoring)`);
  }
});

test("the paths the voice module hands the client are the vendored files, under the dashboard's own origin", () => {
  assert.deepEqual(WORKLET_PATHS, {
    rawAudioProcessor: "/voice/raw-audio-processor.js",
    audioConcatProcessor: "/voice/audio-concat-processor.js",
  });
});
