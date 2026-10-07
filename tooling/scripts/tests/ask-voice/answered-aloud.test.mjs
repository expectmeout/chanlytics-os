/**
 * A question spoken on the Line, answered aloud (apps/dashboard/src/legacy-bridge/ask/aloud.ts), run over a stand-in
 * for the speech module and a clock the test turns. The hold goes the typed way since 5 Oct 2026: the reads are drawn
 * as they run and the voice says none of them. It says one thing while Ask works, the waiting words, once, when
 * ASK_VOICE_FIRST_WORDS_MS pass with no answer begun, in the question's language; then the answer as it lands: after
 * the waiting words while they are being said, over them while their clip is still on its way. The voice agent's
 * door said every read's label and a filler the vendor held back until the answer's first sentence: "hold on" was
 * heard at the start of the answer, as many times as there were reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { askAloud } = await import(at("apps/dashboard/src/legacy-bridge/ask/aloud.ts"));
const { ASK_VOICE_FIRST_WORDS_MS } = await import("@chanlytics/contracts");

/** The speech module stood in for: each clip loads, plays and ends when the test says; every read recorded. */
function speechWorld() {
  const spoken = [];
  let state = "idle";
  const watchers = new Set();
  const move = (s) => {
    state = s;
    for (const w of [...watchers]) w();
  };
  let settle = null;
  return {
    spoken,
    speech: {
      state: () => state,
      watchSpeech: (on) => {
        watchers.add(on);
        return () => watchers.delete(on);
      },
      speak: (text, purpose) => {
        spoken.push({ text, purpose });
        move("loading");
        return new Promise((resolve, reject) => {
          settle = { resolve, reject };
        });
      },
    },
    /** The clip plays. */
    plays: () => {
      move("speaking");
      settle?.resolve();
    },
    /** The clip could not be made or played. */
    fails: (why) => {
      move("idle");
      settle?.reject(new Error(why));
    },
    /** The clip finished. */
    ends: () => move("idle"),
    watching: () => watchers.size,
  };
}

/** A clock the test turns: each timer recorded with its delay, fired when the test says. */
function clock() {
  const timers = [];
  return {
    timers,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms, live: true });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].live = false;
    },
    /** Every live timer of this delay fires. */
    pass: (ms) => {
      for (const t of timers.filter((x) => x.live && x.ms === ms)) {
        t.live = false;
        t.fn();
      }
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));
/** Where a page's draw puts the waiting words' turn: the top of the set, so a test knows the words it will hear. */
const FIRST = () => 0;

test("a spoken question slow to its first words hears the waiting words once, in its language, as ASK_VOICE_FIRST_WORDS_MS pass; one answered sooner hears nothing but its answer", async () => {
  const w = speechWorld();
  const c = clock();
  const aloud = askAloud(w.speech, c, FIRST);
  let answered = false;
  aloud.waitAloud("en", () => answered);
  assert.deepEqual(w.spoken, [], "nothing said as the question goes");
  assert.equal(c.timers.length, 1);
  assert.equal(c.timers[0].ms, ASK_VOICE_FIRST_WORDS_MS, "the one clock for when Ask says it is working");
  c.pass(ASK_VOICE_FIRST_WORDS_MS);
  assert.deepEqual(w.spoken, [{ text: "One moment.", purpose: "answer" }], "the waiting words, once");
  c.pass(ASK_VOICE_FIRST_WORDS_MS);
  assert.equal(w.spoken.length, 1, "never twice: one timer, spent");
  // In Spanish for a question asked in Spanish.
  const w2 = speechWorld();
  const c2 = clock();
  askAloud(w2.speech, c2, FIRST).waitAloud("es", () => false);
  c2.pass(ASK_VOICE_FIRST_WORDS_MS);
  assert.deepEqual(w2.spoken, [{ text: "Un momento.", purpose: "answer" }]);
  // A language Ask does not speak hears English, as the voice door's own lines did.
  const w5 = speechWorld();
  const c5 = clock();
  askAloud(w5.speech, c5, FIRST).waitAloud("other", () => false);
  c5.pass(ASK_VOICE_FIRST_WORDS_MS);
  assert.deepEqual(w5.spoken, [{ text: "One moment.", purpose: "answer" }]);
  // Answered before the clock: the Say drawn, the turn landed, or another question asked over it. Nothing is said.
  const w3 = speechWorld();
  const c3 = clock();
  const quick = askAloud(w3.speech, c3, FIRST);
  quick.waitAloud("en", () => {
    answered = true;
    return answered;
  });
  c3.pass(ASK_VOICE_FIRST_WORDS_MS);
  assert.deepEqual(w3.spoken, [], "no waiting words for an answer already begun");
  const read = quick.answerAloud("Two people need you.");
  w3.plays();
  await read;
  assert.deepEqual(w3.spoken, [{ text: "Two people need you.", purpose: "answer" }], "the answer alone");
});

test("the answer follows the waiting words: after them while they are being said, over them while their clip is on its way; it never waits past its cap, nor on a clip that is not the waiting words", async () => {
  // Being said: the answer waits for their end, then is read.
  const w = speechWorld();
  const c = clock();
  const aloud = askAloud(w.speech, c, FIRST);
  aloud.waitAloud("en", () => false);
  c.pass(ASK_VOICE_FIRST_WORDS_MS);
  w.plays();
  const read = aloud.answerAloud("Nobody canceled last week.");
  await tick();
  assert.equal(w.spoken.length, 1, "not over the waiting words while they are said");
  w.ends();
  await tick();
  assert.deepEqual(w.spoken.at(-1), { text: "Nobody canceled last week.", purpose: "answer" }, "then the answer");
  assert.equal(w.watching(), 0, "and the wait lets go of the module");
  w.plays();
  await read;
  // On their way: the answer is read at once, over them (the module's read replaces a clip still loading).
  const w2 = speechWorld();
  const c2 = clock();
  const aloud2 = askAloud(w2.speech, c2, FIRST);
  aloud2.waitAloud("en", () => false);
  c2.pass(ASK_VOICE_FIRST_WORDS_MS);
  void aloud2.answerAloud("Two visits tomorrow.");
  await tick();
  assert.deepEqual(
    w2.spoken.map((s) => s.text),
    ["One moment.", "Two visits tomorrow."],
    "over waiting words not yet heard",
  );
  // Said and never ending (an element that reports no end): the answer goes after the cap.
  const w3 = speechWorld();
  const c3 = clock();
  const aloud3 = askAloud(w3.speech, c3, FIRST);
  aloud3.waitAloud("en", () => false);
  c3.pass(ASK_VOICE_FIRST_WORDS_MS);
  w3.plays();
  void aloud3.answerAloud("A good month.");
  await tick();
  assert.equal(w3.spoken.length, 1);
  const cap = c3.timers.slice(1).find((t) => t.live);
  assert.ok(cap, "the wait has a cap");
  c3.pass(cap.ms);
  await tick();
  assert.equal(w3.spoken.at(-1).text, "A good month.", "read once the cap passes");
  assert.equal(w3.watching(), 0);
  // Something else being read (no waiting words this turn): the answer does not wait on it.
  const w4 = speechWorld();
  const aloud4 = askAloud(w4.speech, clock(), FIRST);
  void w4.speech.speak("An older answer.", "answer");
  w4.plays();
  void aloud4.answerAloud("The new answer.");
  await tick();
  assert.equal(w4.spoken.at(-1).text, "The new answer.", "read at once");
});

test("waiting words that could not be said are let go of quietly: the person is told nothing for them, and the answer is still read", async () => {
  const w = speechWorld();
  const c = clock();
  const aloud = askAloud(w.speech, c, FIRST);
  aloud.waitAloud("en", () => false);
  c.pass(ASK_VOICE_FIRST_WORDS_MS);
  w.fails("The sound was held back on this device. Tap again to hear it.");
  await tick();
  const read = aloud.answerAloud("Two people need you.");
  await tick();
  assert.equal(w.spoken.at(-1).text, "Two people need you.");
  w.fails("Voice is off while this workspace is paused or its plan has ended.");
  await assert.rejects(read, /paused/, "the answer's own failure is the caller's to say");
});

test("the waiting words take turns, as a person's would: each spoken question that waits says the next of a set, never the same twice running, every one a short whole sentence in the question's language; a page starts the turn where its draw puts it", async () => {
  /** The words said for this many waits in a row, on one page whose draw is `pick`. */
  const said = (language, waits, pick = FIRST) => {
    const w = speechWorld();
    const c = clock();
    const aloud = askAloud(w.speech, c, pick);
    for (let i = 0; i < waits; i++) {
      aloud.waitAloud(language, () => false);
      c.pass(ASK_VOICE_FIRST_WORDS_MS);
      w.ends();
    }
    return w.spoken.map((x) => x.text);
  };
  const en = said("en", 24);
  const set = [...new Set(en)];
  assert.ok(set.length >= 6, `a set to take turns from, not one line (${set.length})`);
  assert.equal(en[0], "One moment.", "the top of the set");
  for (let i = 1; i < en.length; i++) assert.notEqual(en[i], en[i - 1], `never the same twice running (${i})`);
  assert.deepEqual(
    en.slice(set.length, 2 * set.length),
    en.slice(0, set.length),
    "the whole set before any comes again",
  );
  for (const words of set) {
    assert.match(words, /^[A-Z¡¿].*[.!?]$/u, `a whole sentence: ${words}`);
    assert.ok(words.length <= 32, `short, said before the answer: ${words}`);
  }
  const es = said("es", 24);
  const setEs = [...new Set(es)];
  assert.equal(es[0], "Un momento.");
  assert.ok(setEs.length >= 6);
  for (const words of setEs) assert.ok(!set.includes(words), `Spanish for a question in Spanish: ${words}`);
  assert.deepEqual(said("other", 3), en.slice(0, 3), "a language Ask does not speak hears the English set");
  // Another page's draw starts the turn elsewhere in the set, and takes the same turns from there.
  const later = said("en", set.length, () => 0.5);
  assert.notEqual(later[0], en[0], "a page that draws another place starts there");
  assert.deepEqual([...later].sort(), [...set].sort(), "and says the whole set before any comes again");
});
