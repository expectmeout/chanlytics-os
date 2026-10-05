/**
 * One voice at a time, where the clip and the agent's session are composed (apps/dashboard/src/legacy-bridge/ask.ts
 * `oneVoice`), run over stand-ins for the two. A clip read aloud takes the agent's place only while the agent has the
 * floor (an answer on its way, or being spoken): a session up and quiet, or still connecting, is in no clip's way, so
 * the clip that reads a typed-way answer leaves the session the press asked for running for the next hold (the
 * fallback used to end it, and every hold after it started cold). The clip starts inside the press, never after the
 * hang-up's round trip: a phone plays audio only from a gesture. A hold ends the clip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { oneVoice } = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/legacy-bridge/ask.ts")).href);

/** The two modules stood in for: what was asked of each, in order; the session's hang-up never answers by itself. */
function world({ busy = false } = {}) {
  const did = [];
  const clip = {
    speak: (text, purpose) => {
      did.push(`speak:${purpose}:${text}`);
      return Promise.resolve();
    },
    stopSpeaking: () => did.push("stopSpeaking"),
    state: () => "idle",
  };
  const conversation = {
    voiceBusy: () => busy,
    stopVoice: (reason) => {
      did.push(`stopVoice:${reason}`);
      return new Promise(() => {});
    },
    ensureVoice: (input) => {
      did.push(`ensureVoice:${input.threadId}`);
      return Promise.resolve(null);
    },
  };
  return { did, ...oneVoice(clip, conversation, () => did.push("warmModel")) };
}

test("a clip leaves a quiet session running: the session the press asked for is still there for the next hold", async () => {
  const w = world({ busy: false });
  await w.speech.speak("Two people need you.", "answer");
  assert.deepEqual(w.did, ["speak:answer:Two people need you."]);
});

test("a clip takes the agent's place while the agent has the floor, and starts inside the press: the hang-up is not waited for", () => {
  const w = world({ busy: true });
  void w.speech.speak("Two people need you.", "brief");
  assert.deepEqual(
    w.did,
    ["stopVoice:superseded", "speak:brief:Two people need you."],
    "both begun before anything is awaited (the hang-up here never answers)",
  );
});

test("a hold ends the clip, warms the model for the question on its way, then asks for its session; the rest of both modules passes through", () => {
  const w = world();
  void w.voice.ensureVoice({ threadId: "t1" });
  assert.deepEqual(w.did, ["stopSpeaking", "warmModel", "ensureVoice:t1"]);
  assert.equal(w.speech.state(), "idle");
  assert.equal(w.voice.voiceBusy(), false);
});
