/**
 * The bridge's speech module, run (apps/dashboard/src/legacy-bridge/ask/speech.ts) over a stand-in window whose Audio
 * element the test drives and a recorder for the speech route: the one holder of what is happening (idle, loading,
 * speaking), told to every watcher; the element made and started on silence inside the press, so a phone may play
 * the clip after the fetch; a Stop during the fetch, or during the start of play, that is a stop and never a failure,
 * with the late clip let go of; a clip that could not be made rejecting in the server's words with the state idle
 * again; and a second read superseding the first, whose late callbacks change nothing. The browser's own synthesis
 * is gone: nothing here can reach `speechSynthesis`.
 *
 * And the first sentence first (9 Oct 2026): words of more than one sentence asked for as two clips at once, the first
 * played as it lands and the rest behind it on the same element; the clips of the last readings kept, so a second
 * listen asks nothing; and a press that has begun asking before it lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { askSpeech, speechParts } = await import(at("apps/dashboard/src/legacy-bridge/ask/speech.ts"));

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
    speech: (text, purpose, more) => {
      calls.push(more ? { text, purpose, more } : { text, purpose });
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

test("a hold readies the element inside its press, reading nothing and stopping nothing, so the answer read once it lands (after the fetch, outside any gesture) plays on a phone; a readying the browser refused is tried again in the next press", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const silences = () => w.elements[0].log.filter((l) => l.includes("audio/wav")).length;
  s.readySpeech();
  assert.equal(w.elements.length, 1, "the element made in the press");
  assert.equal(silences(), 1, "and started on silence there");
  assert.equal(s.state(), "idle", "nothing read");
  assert.deepEqual(a.calls, [], "no clip asked for");
  // A press iOS does not count as a gesture (a pointer going down): refused, and the lift readies it again.
  w.refuses();
  await tick();
  s.readySpeech();
  assert.equal(silences(), 2, "tried again inside the next press");
  w.plays();
  await tick();
  s.readySpeech();
  assert.equal(silences(), 2, "readied once it has played");
  // The answer lands later, outside any press: it plays on the readied element.
  const read = s.speak("Two people need you.", "answer");
  assert.equal(silences(), 2, "no silence of its own");
  a.land();
  await tick();
  w.plays();
  await read;
  assert.equal(s.state(), "speaking");
  s.readySpeech();
  assert.equal(s.state(), "speaking", "a readying stops nothing");
  assert.doesNotThrow(() => askSpeech({}, { api: a }).readySpeech(), "a device with no Audio readies nothing");
});

test("the device is told what the page's audio is (WebKit's Audio Session API): a hold's readying says it listens, play-and-record; every read says playback before it plays, so the answer comes out of the loudspeaker and not the earpiece a phone gives a call; a device without the API is left alone", async () => {
  const w = world();
  const a = api();
  const said = [];
  w.win.navigator = {
    audioSession: {
      get type() {
        return said.at(-1) ?? "auto";
      },
      set type(t) {
        said.push(t);
      },
    },
  };
  const s = askSpeech(w.win, { api: a });
  s.readySpeech();
  assert.deepEqual(said, ["play-and-record"], "a hold: the page listens");
  const read = s.speak("Two people need you.", "answer");
  assert.deepEqual(said, ["play-and-record", "playback"], "a read: playback, said before anything plays");
  a.land();
  await tick();
  assert.equal(said.at(-1), "playback", "still playback as the clip starts");
  w.plays();
  await read;
  // Read aloud or Listen with no hold before them: playback too.
  s.stopSpeaking();
  void s.speak("The brief.", "brief");
  assert.equal(said.at(-1), "playback");
  // A device whose session refuses the word plays as it would have.
  const w2 = world();
  w2.win.navigator = {
    audioSession: {
      set type(_) {
        throw new Error("NotSupportedError");
      },
    },
  };
  const s2 = askSpeech(w2.win, { api: api() });
  assert.doesNotThrow(() => s2.readySpeech());
  assert.equal(s2.state(), "idle");
  // No Audio Session API at all (every browser but WebKit's): nothing is told and nothing breaks.
  const w3 = world();
  const s3 = askSpeech(w3.win, { api: api() });
  assert.doesNotThrow(() => s3.readySpeech());
  void s3.speak("Hello.", "answer");
  assert.equal(s3.state(), "loading");
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
  // Its first sentence and the rest, two clips: together, the words as far as one request may carry them.
  assert.equal(a.calls.length, 2);
  assert.equal(a.calls[0].text, sentence.trim());
  const sent = `${a.calls[0].text} ${a.calls[1].text}`;
  assert.ok(sent.length <= ASK_SPEECH_MAX_CHARS, `within the route's bound (${sent.length})`);
  assert.ok(sent.length > ASK_SPEECH_MAX_CHARS - sentence.length, "as much as fits");
  assert.ok(sent.endsWith("waiting on a time."), "ended on a whole sentence");
  assert.ok(long.startsWith(sent), "the words from the start, unchanged");
  s.stopSpeaking();
  // Words with no sentence end inside the bound are cut at a word, and short words go as they are.
  void s.speak("word ".repeat(400), "answer");
  assert.ok(a.calls[2].text.length <= ASK_SPEECH_MAX_CHARS);
  assert.ok(a.calls[2].text.endsWith("word"), "cut between words");
  s.stopSpeaking();
  void s.speak("  Two   people need you. ", "brief");
  assert.equal(a.calls[3].text, "Two people need you.", "folded, as the route folds it");
  s.stopSpeaking();
});

/* ------------------------------------------------------------------ the first sentence first (9 Oct 2026) */

const FIRST = "Two people need you, and the oldest has waited forty minutes.";
const REST = "Your calendar has five appointments today. One campaign is waiting for your word.";
const BRIEF = `${FIRST} ${REST}`;

/** The words as the clips they are asked for, in order: one where there is no rest. */
const partsOf = (text) => {
  const { first, rest } = speechParts(text);
  return rest === null ? [first] : [first, rest];
};

test("the words as the clips they are asked for: the first sentence by itself where more follows, then the rest; one clip for one sentence, for a first sentence that runs long, and never a cut at a title, a figure or a time", () => {
  assert.deepEqual(speechParts(BRIEF), { first: FIRST, rest: REST });
  assert.deepEqual(speechParts("Nobody is waiting on you right now."), {
    first: "Nobody is waiting on you right now.",
    rest: null,
  });
  assert.deepEqual(partsOf("  Two   people need you.   3 are booked. "), ["Two people need you.", "3 are booked."]);
  // A title's full stop, a decimal and a clock's are no sentence's end; "p.m." before a capital is one.
  assert.deepEqual(partsOf("Dr. Reyes wrote at 3.30 about Thursday. She is waiting."), [
    "Dr. Reyes wrote at 3.30 about Thursday.",
    "She is waiting.",
  ]);
  assert.deepEqual(partsOf("The next is at 2 p.m. today and nothing after."), [
    "The next is at 2 p.m. today and nothing after.",
  ]);
  assert.deepEqual(partsOf("The next is at 2 p.m. Nothing follows it."), [
    "The next is at 2 p.m.",
    "Nothing follows it.",
  ]);
  // A question, a quote closed after the mark, and words that are not English.
  assert.deepEqual(partsOf('She asked "Can I come Friday?" We have not answered.'), [
    'She asked "Can I come Friday?"',
    "We have not answered.",
  ]);
  assert.deepEqual(partsOf("Dos personas te esperan. ¿Les respondo ahora?"), [
    "Dos personas te esperan.",
    "¿Les respondo ahora?",
  ]);
  // A first sentence too long to be worth a clip of its own: the whole, as one.
  const long = `${"and then another thing happened, ".repeat(9)}which is all. Short end.`;
  assert.ok(long.indexOf(". ") > 240);
  assert.deepEqual(partsOf(long), [long]);
  // Too short to be a sentence to stop after: the cut is at the next end.
  assert.deepEqual(partsOf("No. We are closed on Sunday. Monday at nine."), [
    "No. We are closed on Sunday.",
    "Monday at nine.",
  ]);
});

test("words of more than one sentence are asked for as two clips at once, the rest told what came before it; the first plays the moment it lands, whatever the rest is doing; the rest plays on the same element as the first ends; speaking from the first word to the last, with no move between the two", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const seen = [];
  s.watchSpeech(() => seen.push(s.state()));
  const read = s.speak(BRIEF, "brief");
  assert.deepEqual(
    a.calls,
    [
      { text: FIRST, purpose: "brief" },
      { text: REST, purpose: "brief", more: { before: FIRST } },
    ],
    "REGRESSION: the whole brief was one clip, read to its last byte before its first word played",
  );
  // The first sentence lands; the rest has not.
  a.land(0);
  await tick();
  const el = w.elements[0];
  const first = el.src;
  assert.match(first, /audio\/mpeg$/);
  w.plays();
  await read;
  assert.equal(s.state(), "speaking", "speaking on the first sentence alone");
  // It ends before the rest is in hand: the voice waits for it, and says nothing else of itself.
  w.ends();
  await tick();
  assert.equal(s.state(), "speaking", "still the one reading");
  assert.equal(w.elements.length, 1);
  a.land(1);
  await tick();
  assert.notEqual(el.src, first, "the rest, on the same element");
  assert.match(el.src, /audio\/mpeg$/);
  assert.ok(w.urls.revoked.includes(first), "the first sentence's clip let go of");
  w.plays();
  await tick();
  assert.equal(s.state(), "speaking");
  w.ends();
  assert.equal(s.state(), "idle");
  assert.deepEqual(seen, ["loading", "speaking", "idle"], "one reading: no move between its two clips");

  // The rest in hand before the first ends: it starts as the first ends, with no wait.
  const w2 = world();
  const a2 = api();
  const s2 = askSpeech(w2.win, { api: a2 });
  const again = s2.speak(BRIEF, "brief");
  a2.land(1);
  a2.land(0);
  await tick();
  w2.plays();
  await again;
  const playing = w2.elements[0].src;
  w2.ends();
  await tick();
  assert.notEqual(w2.elements[0].src, playing, "the rest started the moment the first ended");
  assert.equal(s2.state(), "speaking");
});

test("a rest that could not be made ends the reading after its first sentence, quietly, and is not kept; a Stop on the first sentence plays nothing more when the rest lands", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const read = s.speak(BRIEF, "brief");
  a.land(0);
  await tick();
  w.plays();
  await read;
  a.fail("Ask's voice could not be reached just now.", 1);
  await tick();
  assert.equal(s.state(), "speaking", "the first sentence is still being read");
  w.ends();
  await tick();
  assert.equal(s.state(), "idle", "and the reading ends there: nothing thrown, nothing else said");
  // Not kept: the next press asks for both again.
  void s.speak(BRIEF, "brief");
  assert.equal(a.calls.length, 4, "a failure is never kept");
  s.stopSpeaking();

  const w2 = world();
  const a2 = api();
  const s2 = askSpeech(w2.win, { api: a2 });
  const stopped = s2.speak(BRIEF, "brief");
  a2.land(0);
  await tick();
  w2.plays();
  await stopped;
  s2.stopSpeaking();
  assert.equal(s2.state(), "idle");
  const plays = w2.elements[0].log.filter((l) => l.startsWith("play:")).length;
  a2.land(1);
  await tick();
  assert.equal(
    w2.elements[0].log.filter((l) => l.startsWith("play:")).length,
    plays,
    "the rest, landing late, never plays",
  );
  assert.equal(s2.state(), "idle");
});

test("the clips of the last readings are kept: Listen pressed again asks nothing and plays at once, to the end, whether or not the first reading was heard out; other words ask anew, and only the last few readings are held", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const read = s.speak(BRIEF, "brief");
  a.land(0);
  a.land(1);
  await tick();
  w.plays();
  await read;
  s.stopSpeaking();
  assert.equal(a.calls.length, 2);
  // Again: nothing asked, and the first sentence on the element at once.
  const again = s.speak(BRIEF, "brief");
  assert.equal(a.calls.length, 2, "REGRESSION: a second listen made the same clips a second time");
  await tick();
  assert.match(w.elements[0].src, /audio\/mpeg$/, "played from what was kept, with no clip to wait for");
  w.plays();
  await again;
  assert.equal(s.state(), "speaking");
  w.ends();
  await tick();
  w.plays();
  await tick();
  w.ends();
  assert.equal(s.state(), "idle", "and to the end of the rest");
  // Other words are other clips.
  void s.speak("Nobody is waiting on you right now.", "brief");
  assert.equal(a.calls.length, 3);
  s.stopSpeaking();
  // Six readings are held; the seventh lets go of the oldest.
  for (let i = 0; i < 5; i += 1) {
    void s.speak(`Reading number ${i} is this one.`, "answer");
    s.stopSpeaking();
  }
  assert.equal(a.calls.length, 8);
  void s.speak(BRIEF, "brief");
  assert.equal(a.calls.length, 10, "the brief, read seven readings ago, is asked for again");
  s.stopSpeaking();
});

test("a press that has begun asks for the clips before it lands: nothing plays and nothing moves, and the read that follows asks nothing more; a device that cannot play asks nothing", async () => {
  const w = world();
  const a = api();
  const s = askSpeech(w.win, { api: a });
  const seen = [];
  s.watchSpeech(() => seen.push(s.state()));
  s.warmSpeech(BRIEF, "brief");
  assert.equal(a.calls.length, 2, "both clips, asked for as the pointer went down");
  assert.equal(s.state(), "idle");
  assert.deepEqual(seen, []);
  assert.equal(w.elements.length, 0, "no element: that is the press's own to make");
  // The first sentence lands before the click does.
  a.land(0);
  await tick();
  const read = s.speak(BRIEF, "brief");
  assert.equal(a.calls.length, 2, "the press asks nothing more");
  assert.equal(w.elements.length, 1, "the element, made and started on silence inside the press");
  await tick();
  w.plays();
  await read;
  assert.equal(s.state(), "speaking");
  // A warm of words already on their way, or of nothing, asks nothing.
  s.warmSpeech(BRIEF, "brief");
  s.warmSpeech("   ", "brief");
  assert.equal(a.calls.length, 2);
  const bare = api();
  askSpeech({}, { api: bare }).warmSpeech(BRIEF, "brief");
  assert.deepEqual(bare.calls, [], "a device with no Audio is asked for no clip");
});
