/**
 * The bridge's speech module, run (apps/dashboard/src/legacy-bridge/ask/speech.ts) over a stand-in window whose Audio
 * element the test drives and a recorder for the speech route: the one holder of what is happening (idle, loading,
 * speaking), told to every watcher; the element made and started on silence inside the press, so a phone may play
 * the clip after the fetch; a Stop during the fetch, or during the start of play, that is a stop and never a failure,
 * with the late clip let go of; a clip that could not be made rejecting in the server's words with the state idle
 * again; and a second read superseding the first, whose late callbacks change nothing. The browser's own synthesis
 * is gone: nothing here can reach `speechSynthesis`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { askSpeech } = await import(at("apps/dashboard/src/legacy-bridge/ask/speech.ts"));

/** A window with an Audio element the test drives: play() settles when the test says; src, pause and load recorded. */
function world() {
  const elements = [];
  const urls = { made: [], revoked: [] };
  let n = 0;
  class Audio {
    constructor() {
      this.src = "";
      this.paused = true;
      this.onended = null;
      this.onerror = null;
      this.log = [];
      this.pending = null;
      elements.push(this);
    }
    play() {
      this.log.push(`play:${this.src}`);
      this.paused = false;
      return new Promise((resolve, reject) => {
        this.pending = { resolve, reject };
      });
    }
    pause() {
      this.log.push("pause");
      this.paused = true;
      if (this.pending) {
        // A pause while play() is still starting is what a browser reports as an abort of that play().
        this.pending.reject(
          Object.assign(new Error("The play() request was interrupted by a call to pause()."), { name: "AbortError" }),
        );
        this.pending = null;
      }
    }
    removeAttribute(name) {
      this.log.push(`remove:${name}`);
      if (name === "src") this.src = "";
    }
    load() {
      this.log.push("load");
    }
  }
  const win = {
    Audio,
    Blob,
    URL: {
      createObjectURL: (blob) => {
        const u = `blob:test/${++n}/${blob.type || "clip"}`;
        urls.made.push(u);
        return u;
      },
      revokeObjectURL: (u) => urls.revoked.push(u),
    },
  };
  return {
    win,
    elements,
    urls,
    /** The element plays: its pending play() settles. */
    plays: () => elements[0].pending && (elements[0].pending.resolve(), (elements[0].pending = null)),
    /** The element refuses to play (iOS with no gesture). */
    refuses: () =>
      elements[0].pending &&
      (elements[0].pending.reject(
        Object.assign(new Error("play() failed because the user didn't interact"), { name: "NotAllowedError" }),
      ),
      (elements[0].pending = null)),
    /** The clip finished. */
    ends: () => elements[0].onended && elements[0].onended(),
  };
}
/** The speech route, recorded: each clip lands (or fails) when the test says, the latest asked for unless named. */
function api() {
  const calls = [];
  const settles = [];
  return {
    calls,
    speech: (text, purpose) => {
      calls.push({ text, purpose });
      return new Promise((resolve, reject) => {
        settles.push({ resolve, reject });
      });
    },
    land: (i = settles.length - 1) =>
      settles[i] && settles[i].resolve(new Blob([new Uint8Array([0xff, 0xfb])], { type: "audio/mpeg" })),
    fail: (why, i = settles.length - 1) => settles[i] && settles[i].reject(new Error(why)),
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test("a read: the element made and started on silence inside the press (a phone plays only from a gesture), loading until the clip lands, then the clip on the same element and speaking; every move told to the watchers; the end lets go of the clip and the URL", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  assert.equal(s.canSpeak(), true);
  assert.equal(s.state(), "idle");
  const seen = [];
  const off = s.watchSpeech(() => seen.push(s.state()));
  const read = s.speak("Two people need you.", "brief");
  assert.equal(s.state(), "loading");
  assert.equal(w.elements.length, 1, "one element, made in the press");
  const el = w.elements[0];
  assert.match(el.log[0], /^play:blob:test\/1\/audio\/wav$/, "started on silence, synchronously, before any await");
  assert.deepEqual(a.calls, [{ text: "Two people need you.", purpose: "brief" }]);
  a.land();
  await tick();
  assert.match(el.src, /^blob:test\/2\/audio\/mpeg$/, "the clip on the same element");
  assert.equal(s.state(), "loading", "not speaking until play() has started");
  w.plays();
  await read;
  assert.equal(s.state(), "speaking");
  assert.deepEqual(seen, ["loading", "speaking"]);
  w.ends();
  assert.equal(s.state(), "idle");
  assert.deepEqual(seen, ["loading", "speaking", "idle"]);
  assert.ok(w.urls.revoked.includes("blob:test/2/audio/mpeg"), "the clip's URL let go of");
  assert.ok(el.log.includes("pause") && el.log.includes("remove:src"), "the element cleared");
  off();
  w.ends();
  assert.equal(seen.length, 3, "a watcher that let go hears nothing more");
});

test("Stop during the fetch: idle at once, and the clip that lands late is let go of (no play, no throw, idle still); a Stop during the start of play is a stop too, never a failure", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const first = s.speak("One.", "answer");
  assert.equal(s.state(), "loading");
  s.stopSpeaking();
  assert.equal(s.state(), "idle");
  a.land();
  await tick();
  await first;
  assert.equal(s.state(), "idle", "the late clip changed nothing");
  assert.equal(
    w.elements[0].log.filter((l) => l.startsWith("play:blob:test/2")).length,
    0,
    "the real clip never played",
  );
  // A second read on the same element: the silent unlock is not repeated.
  const second = s.speak("Two.", "answer");
  a.land();
  await tick();
  assert.equal(w.elements.length, 1, "the one element, kept");
  assert.equal(w.elements[0].log.filter((l) => l.includes("audio/wav")).length, 1, "unlocked once");
  s.stopSpeaking();
  await second;
  assert.equal(s.state(), "idle", "the abort play() reports is our own stop, not a failure");
});

test("a clip that could not be made rejects with the server's words and the state is idle again; an element that will not play (no gesture) rejects in words a person can act on, never the browser's own", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const moves = [];
  s.watchSpeech(() => moves.push(s.state()));
  const read = s.speak("Hello.", "brief");
  a.fail("Voice is off while this workspace is paused or its plan has ended.");
  await assert.rejects(read, /paused or its plan has ended/);
  assert.equal(s.state(), "idle");
  const again = s.speak("Hello.", "brief");
  a.land();
  await tick();
  w.refuses();
  await assert.rejects(again, (e) => {
    assert.equal(e.message, "The sound was held back on this device. Tap again to hear it.");
    assert.doesNotMatch(e.message, /interact|play\(\)/, "the browser's own sentence is not shown to a person");
    return true;
  });
  assert.equal(s.state(), "idle");
  assert.deepEqual(moves, ["loading", "idle", "loading", "idle"]);
});

test("a second read supersedes the first: the first's clip, landing late, is let go of; the second plays; a device with no Audio cannot speak and says so", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const first = s.speak("One.", "answer");
  const second = s.speak("Two.", "answer");
  assert.equal(a.calls.length, 2);
  assert.equal(w.elements.length, 1, "the one element");
  // The route answers the second first: it plays.
  a.land(1);
  await tick();
  w.plays();
  await second;
  assert.equal(s.state(), "speaking");
  const playing = w.elements[0].src;
  assert.match(playing, /audio\/mpeg$/);
  // The first lands late: let go of before a URL is made for it; the element still plays the second.
  a.land(0);
  await first;
  assert.equal(s.state(), "speaking", "the first, superseded, changed nothing");
  assert.equal(w.elements[0].src, playing);
  assert.equal(w.urls.made.length, 2, "the silence and the second's clip; none for the late first");
  const bare = askSpeech({}, { api: a });
  assert.equal(bare.canSpeak(), false);
  await assert.rejects(bare.speak("x", "brief"), /cannot play audio/);
});

test("a read that began outside a press (an answer read aloud by itself) does not spend the unlock: refused for want of a gesture, the element is started on silence again inside the next press", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const silences = () => w.elements[0].log.filter((l) => l.includes("audio/wav")).length;
  // No gesture: the browser refuses the silence, and then the clip.
  const first = s.speak("One.", "answer");
  assert.equal(silences(), 1);
  w.refuses();
  await tick();
  a.land();
  await tick();
  w.refuses();
  await assert.rejects(first, /Tap again/);
  // The person taps: this press must unlock the element, or a phone never plays a clip again until the page reloads.
  const second = s.speak("One.", "answer");
  assert.equal(silences(), 2, "started on silence again, inside the press");
  w.plays();
  await tick();
  a.land();
  await tick();
  w.plays();
  await second;
  assert.equal(s.state(), "speaking");
  // Unlocked now: a third read does not start on silence again.
  s.stopSpeaking();
  void s.speak("Two.", "answer");
  assert.equal(silences(), 2, "unlocked once it has played from a press");
});

test("words longer than a clip may be are read up to the last whole sentence that fits, never refused: the route takes ASK_SPEECH_MAX_CHARS, and an answer over it could not be read aloud at all", async () => {
  const { ASK_SPEECH_MAX_CHARS } = await import("@chanlytics/contracts");
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const sentence = "Nora wrote twice about Thursday and is still waiting on a time. ";
  const long = sentence.repeat(40);
  assert.ok(long.length > ASK_SPEECH_MAX_CHARS);
  void s.speak(long, "answer");
  const sent = a.calls[0].text;
  assert.ok(sent.length <= ASK_SPEECH_MAX_CHARS, `within the route's bound (${sent.length})`);
  assert.ok(sent.length > ASK_SPEECH_MAX_CHARS - sentence.length, "as much as fits");
  assert.ok(sent.endsWith("waiting on a time."), "ended on a whole sentence");
  assert.ok(long.startsWith(sent), "the words from the start, unchanged");
  s.stopSpeaking();
  // Words with no sentence end inside the bound are cut at a word, and short words go as they are.
  void s.speak("word ".repeat(400), "answer");
  assert.ok(a.calls[1].text.length <= ASK_SPEECH_MAX_CHARS);
  assert.ok(a.calls[1].text.endsWith("word"), "cut between words");
  s.stopSpeaking();
  void s.speak("  Two   people need you. ", "brief");
  assert.equal(a.calls[2].text, "Two people need you.", "folded, as the route folds it");
  s.stopSpeaking();
});
