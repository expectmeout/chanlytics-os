/**
 * Ask's mood, said once and followed by every face: a new state reaches every face, the same state again reaches
 * none, a face that starts following late starts in the state it missed, reactions, beats and words heard pass
 * through, and a face that stops following hears nothing more.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMood, follow } from "../../../apps/dashboard/src/legacy-bridge/mascot/mood.ts";
import { MASCOT } from "../../../apps/dashboard/src/legacy-bridge/mascot/index.ts";

/** A face that writes down what it was told. */
const face = () => {
  const said = [];
  return {
    said,
    set: (s) => said.push(["set", s]),
    react: (k) => said.push(["react", k]),
    beat: (v) => said.push(["beat", v]),
    hear: (v) => said.push(["hear", v]),
  };
};

test("a new state reaches every face; the same state again, or no state at all, reaches none", () => {
  const mood = createMood();
  const a = face();
  const b = face();
  follow(a, mood);
  follow(b, mood);
  mood.set("thinking");
  mood.set("thinking");
  mood.set("dancing");
  assert.equal(mood.state, "thinking");
  assert.deepEqual(a.said, [
    ["set", "idle"],
    ["set", "thinking"],
  ]);
  assert.deepEqual(b.said, a.said);
});

test("a face that follows late starts in the state it missed", () => {
  const mood = createMood();
  mood.set("speaking");
  const late = face();
  follow(late, mood);
  assert.deepEqual(late.said, [["set", "speaking"]]);
});

test("reactions, beats and words heard pass through as they are", () => {
  const mood = createMood();
  const f = face();
  follow(f, mood);
  mood.react("nod");
  mood.beat(0.9);
  mood.beat();
  mood.hear(0.8);
  assert.deepEqual(f.said.slice(1), [
    ["react", "nod"],
    ["beat", 0.9],
    ["beat", 0.6],
    ["hear", 0.8],
  ]);
});

test("a face that stops following hears nothing more; the others still do", () => {
  const mood = createMood();
  const gone = face();
  const stays = face();
  const stop = follow(gone, mood);
  follow(stays, mood);
  stop();
  mood.set("listening");
  assert.deepEqual(gone.said, [["set", "idle"]]);
  assert.deepEqual(stays.said.at(-1), ["set", "listening"]);
});

test("the bridge publishes one mood for the whole app, and the way to follow it", () => {
  const button = face();
  const stage = face();
  const stopButton = MASCOT.follow(button, MASCOT.mood);
  const stopStage = MASCOT.follow(stage, MASCOT.mood);
  MASCOT.mood.set("thinking");
  assert.deepEqual(button.said.at(-1), ["set", "thinking"], "the button follows the one mood");
  assert.deepEqual(stage.said.at(-1), ["set", "thinking"], "and so does the stage");
  MASCOT.mood.set("idle");
  stopButton();
  stopStage();
});
