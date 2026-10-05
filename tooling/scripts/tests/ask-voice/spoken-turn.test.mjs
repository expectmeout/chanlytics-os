/**
 * A spoken turn, in the shape of a typed one (apps/dashboard/src/legacy-bridge/ask/spoken.ts), run over stand-ins for
 * the voice session and the thread read. The Line asks a question two ways: typed, through the stream (`send`), and
 * spoken to the agent's session. Both now tell it the same events (`thread`, `trace`, `say`, `final`), so it draws a
 * turn one way. What is proved here: words that cannot go to the agent are refused before anything is told (they go
 * the typed way); the thread is named the moment the words are taken; the agent's reads and its Say arrive as the
 * stream's do; the stored answer is read off the thread when the turn lands, and only this turn's answer is its
 * answer (the thread is read as the words go, to know what it already held); a turn that ended with nothing new stored
 * says the agent's own words as what went wrong; a turn the session ended under is over, with the answer if it was
 * stored; and a question asked over one still unanswered ends the first without an answer, the vendor's late word
 * about the first changing nothing of the second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { spokenTurns } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/legacy-bridge/ask/spoken.ts")).href
);

const INPUT = { threadId: null, scope: null, surface: "today", context: null };
const user = (id, text) => ({ id, role: "user", text });
const answer = (id, text) => ({ id, role: "assistant", text });

/** The session and the thread read, stood in for: what the session takes, who hears it, what the thread holds. */
function world({ up = { threadId: "t-1" }, takes = true, messages = [] } = {}) {
  const w = {
    said: [],
    hearers: [],
    reads: [],
    messages,
    voice: {
      soonVoice: async () => up,
      sayVoice: (words, on) => {
        if (!takes) return false;
        w.said.push(words);
        w.hearers.push(on);
        return true;
      },
    },
    api: {
      thread: async (id) => {
        w.reads.push(id);
        return w.messages === null ? null : { thread: { id, title: "Voice" }, messages: w.messages };
      },
    },
  };
  w.turns = spokenTurns(w.voice, w.api);
  return w;
}
const tick = () => new Promise((r) => setImmediate(r));

test("words the agent cannot take go the typed way, and nothing is told first: no session up by the lift, or a session that would not take them", async () => {
  for (const w of [world({ up: null }), world({ takes: false })]) {
    const heard = [];
    assert.equal(await w.turns.sendSpoken(INPUT, "how did the week go", (ev) => heard.push(ev)), false);
    assert.deepEqual(heard, [], "nothing drawn for a turn that did not begin");
    assert.deepEqual(w.reads, [], "and no thread read");
  }
});

test("a spoken turn tells the Line what a typed one does: its thread the moment the words are taken, the reads and the Say as the agent speaks, then the stored answer off the thread", async () => {
  const w = world();
  const heard = [];
  const turn = w.turns.sendSpoken(INPUT, "how did the week go", (ev) => heard.push(ev));
  await tick();
  assert.deepEqual(w.said, ["how did the week go"]);
  assert.deepEqual(heard, [{ t: "thread", id: "t-1", title: "how did the week go" }]);
  const agent = w.hearers[0];
  agent({ t: "trace", text: "Reading today" });
  agent({ t: "say", headline: "Two people need you.", detail: "" });
  agent({ t: "say", headline: "Two people need you.", detail: "Nora first." });
  agent({ t: "mode", mode: "speaking" });
  assert.deepEqual(heard.slice(1), [
    { t: "trace", text: "Reading today" },
    { t: "say", headline: "Two people need you.", detail: "" },
    { t: "say", headline: "Two people need you.", detail: "Nora first." },
  ]);
  assert.deepEqual(w.reads, ["t-1"], "the thread read once as the words went: what it already held");
  w.messages = [user("u1", "how did the week go"), answer("m1", "Two people need you. Nora first.")];
  agent({ t: "landed" });
  assert.equal(await turn, true);
  assert.deepEqual(w.reads, ["t-1", "t-1"], "and once more as the turn landed");
  assert.deepEqual(heard.at(-1), { t: "final", message: answer("m1", "Two people need you. Nora first.") });
});

test("only an answer is an answer: a thread that could not be read, or whose last message is the question still, lands with no final, and the Line says the turn was cut off", async () => {
  for (const messages of [null, [user("u1", "how did the week go")], []]) {
    const w = world({ messages });
    const heard = [];
    const turn = w.turns.sendSpoken(INPUT, "how did the week go", (ev) => heard.push(ev));
    await tick();
    w.hearers[0]({ t: "landed" });
    assert.equal(await turn, true, "the turn was the agent's, however it ended");
    assert.equal(
      heard.some((ev) => ev.t === "final"),
      false,
    );
  }
});

test("a session that ends under a turn ends the turn: with the answer if the door had stored it, without one if not", async () => {
  const stored = world();
  const heard = [];
  const turn = stored.turns.sendSpoken(INPUT, "q", (ev) => heard.push(ev));
  await tick();
  stored.messages = [user("u1", "q"), answer("m1", "Done.")];
  stored.hearers[0]({ t: "gone", reason: "vendor" });
  assert.equal(await turn, true);
  assert.deepEqual(heard.at(-1), { t: "final", message: answer("m1", "Done.") });

  const lost = world({ messages: [user("u1", "q")] });
  const heard2 = [];
  const turn2 = lost.turns.sendSpoken(INPUT, "q", (ev) => heard2.push(ev));
  await tick();
  lost.hearers[0]({ t: "gone", reason: "vendor" });
  assert.equal(await turn2, true);
  assert.deepEqual(heard2, [{ t: "thread", id: "t-1", title: "q" }]);
});

test("a question asked over one still unanswered ends the first with no answer; the vendor's late word about the first (a cut, its landing) changes nothing of the second", async () => {
  const w = world({ messages: [user("u0", "earlier"), answer("m0", "An earlier answer.")] });
  const first = [];
  const second = [];
  const one = w.turns.sendSpoken(INPUT, "how did the week go", (ev) => first.push(ev));
  await tick();
  const two = w.turns.sendSpoken(INPUT, "and the month", (ev) => second.push(ev));
  await tick();
  assert.equal(await one, true, "the first is over");
  assert.equal(
    first.some((ev) => ev.t === "final"),
    false,
    "with no answer of its own: the thread's last answer is an earlier one",
  );
  assert.deepEqual(w.reads, ["t-1", "t-1"], "and no read made at its end: one as each turn's words went");
  // The vendor reports the cut of the first response, and even its landing, after the second was asked.
  w.hearers[0]({ t: "cut" });
  w.hearers[0]({ t: "landed" });
  w.hearers[1]({ t: "cut" });
  await tick();
  assert.deepEqual(second, [{ t: "thread", id: "t-1", title: "and the month" }], "the second still waits");
  w.messages = [...w.messages, user("u2", "and the month"), answer("m2", "A good month.")];
  w.hearers[1]({ t: "landed" });
  assert.equal(await two, true);
  assert.deepEqual(second.at(-1), { t: "final", message: answer("m2", "A good month.") });
});

test("an answer the thread already held is not this turn's: a turn that lands with nothing new stored ends with the agent's own words as what went wrong (a spoken refusal is never stored), or with nothing where it said nothing", async () => {
  const earlier = [user("u0", "earlier"), answer("m0", "An earlier answer.")];
  const w = world({ messages: earlier });
  const heard = [];
  const turn = w.turns.sendSpoken(INPUT, "and the month", (ev) => heard.push(ev));
  await tick();
  // The door's count is spent: it speaks its line and stores nothing.
  w.hearers[0]({ t: "say", headline: "Give me a moment before the next question.", detail: "" });
  w.hearers[0]({ t: "landed" });
  assert.equal(await turn, true);
  assert.equal(
    heard.some((ev) => ev.t === "final"),
    false,
    "the earlier answer is not drawn again as this one",
  );
  assert.deepEqual(heard.at(-1), { t: "error", text: "Give me a moment before the next question." });

  const silent = world({ messages: earlier });
  const heard2 = [];
  const turn2 = silent.turns.sendSpoken(INPUT, "and the month", (ev) => heard2.push(ev));
  await tick();
  silent.hearers[0]({ t: "landed" });
  assert.equal(await turn2, true);
  assert.deepEqual(
    heard2,
    [{ t: "thread", id: "t-1", title: "and the month" }],
    "nothing said: the Line's own cut-off line",
  );
});
