/**
 * A slot box's own undo (surfaces/campaigns/templates/slots/slot-history.ts; the review of 3 Oct 2026): Enter, a paste, a cut,
 * a slot taken whole and a value put in are edits made in place, which no browser's undo stack knows, so Ctrl+Z after one
 * restored nothing or the wrong words. The box keeps its own history of the stored words, and these hold what it keeps: one
 * Ctrl+Z takes back a run of typing, a paste, an Enter or a cut as one step, the caret goes where the edit began, redo is the
 * edit again, and an edit after an undo ends what could be redone. Pure, over a clock the test hands in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_RUN_MS,
  HISTORY_STEPS,
  keeperOf,
  recorded,
  redone,
  startOf,
  undone,
} from "../../../../apps/dashboard/src/surfaces/campaigns/templates/slots/slot-history.ts";

/** A keeper over a clock the test moves. */
function boxOf(opening) {
  const clock = { now: 1_000_000 };
  const keeper = keeperOf(opening, () => clock.now);
  /** One edit as the box tells it: it begins at `from`, and the box then holds `text` with the caret at `caret`. */
  const edit = (kind, from, text, caret) => {
    keeper.begin(kind, from);
    keeper.record(text, caret);
  };
  return { keeper, clock, edit };
}

/* ---------------------------------- the pure steps ---------------------------------- */

test("a history opens on the words the box opens with, and has nothing to undo or redo", () => {
  const h = startOf("Hi {{1}}");
  assert.deepEqual(h.done, [{ text: "Hi {{1}}", caret: 8, from: 8 }]);
  assert.equal(undone(h), null);
  assert.equal(redone(h), null);
});

test("an edit is a step, undone to the words before it with the caret where it began, and redone to the words after it", () => {
  let h = startOf("Hi ");
  h = recorded(h, { text: "Hi there", caret: 8, from: 3 }, "insertFromPaste", 10);
  const back = undone(h);
  assert.deepEqual(back.to, { text: "Hi ", caret: 3 }, "the paste is taken back, the caret where it began");
  const again = redone(back.history);
  assert.deepEqual(again.to, { text: "Hi there", caret: 8 }, "and put back, the caret where it left it");
  assert.equal(redone(again.history), null, "nothing more to redo");
  assert.equal(undone(back.history), null, "nothing before the opening words");
});

test("words that did not change are no step: a caret that moved, an event that did nothing", () => {
  const h = startOf("Hi");
  assert.equal(recorded(h, { text: "Hi", caret: 1, from: 1 }, "insertText", 5), h);
});

test("typing and deleting a letter at a time join one step while they run on, as a browser's own undo groups them", () => {
  let h = startOf("");
  let at = 100;
  for (const [text, caret] of [
    ["H", 1],
    ["Hi", 2],
    ["Hi ", 3],
    ["Hi t", 4],
  ]) {
    h = recorded(h, { text, caret, from: caret - 1 }, "insertText", at);
    at += 50;
  }
  assert.equal(h.done.length, 2, "the opening words and one run of typing");
  assert.deepEqual(undone(h).to, { text: "", caret: 0 }, "one undo takes back the whole run, to where it began");
  // Deleting letters is a run of its own: a different kind of edit ends the run before it.
  h = recorded(h, { text: "Hi ", caret: 3, from: 4 }, "deleteContentBackward", at);
  h = recorded(h, { text: "Hi", caret: 2, from: 3 }, "deleteContentBackward", at + 50);
  assert.equal(h.done.length, 3, "the backspaces are one more step, not two");
  assert.deepEqual(undone(h).to, { text: "Hi t", caret: 4 });
});

test("a pause ends a run, and so does any other kind of edit: a paste, Enter and a cut are steps of their own", () => {
  let h = startOf("");
  h = recorded(h, { text: "a", caret: 1, from: 0 }, "insertText", 0);
  h = recorded(h, { text: "ab", caret: 2, from: 1 }, "insertText", HISTORY_RUN_MS);
  assert.equal(h.done.length, 2, "within the pause: joined");
  h = recorded(h, { text: "abc", caret: 3, from: 2 }, "insertText", HISTORY_RUN_MS * 3);
  assert.equal(h.done.length, 3, "after the pause: its own");
  h = recorded(h, { text: "abcd", caret: 4, from: 3 }, "insertText", HISTORY_RUN_MS * 3 + 10);
  assert.equal(h.done.length, 3, "and a run again");
  h = recorded(h, { text: "abcd\n", caret: 5, from: 4 }, "insertParagraph", HISTORY_RUN_MS * 3 + 20);
  h = recorded(h, { text: "abcd\ne", caret: 6, from: 5 }, "insertText", HISTORY_RUN_MS * 3 + 30);
  h = recorded(h, { text: "abcd\ne\nf", caret: 8, from: 6 }, "insertParagraph", HISTORY_RUN_MS * 3 + 40);
  assert.equal(h.done.length, 6, "the opening, two runs, then Enter, a letter and Enter: Enter is never joined");
});

test("an edit after an undo ends what could be redone", () => {
  let h = startOf("one");
  h = recorded(h, { text: "one two", caret: 7, from: 3 }, "insertFromPaste", 0);
  const back = undone(h);
  assert.equal(back.history.undone.length, 1);
  const next = recorded(back.history, { text: "one 2", caret: 5, from: 3 }, "insertFromPaste", 10);
  assert.equal(next.undone.length, 0, "the undone paste is gone");
  assert.equal(redone(next), null);
});

test("the history keeps its latest steps and drops the oldest", () => {
  let h = startOf("");
  for (let i = 1; i <= HISTORY_STEPS + 50; i += 1)
    h = recorded(h, { text: "x".repeat(i), caret: i, from: i - 1 }, "insertFromPaste", i);
  assert.equal(h.done.length, HISTORY_STEPS);
  assert.equal(h.done[h.done.length - 1].text.length, HISTORY_STEPS + 50, "the latest is what the box holds");
});

/* ---------------------------------- the box's keeper: Ctrl+Z after what the browser does not know ---------------------------------- */

test("Ctrl+Z after a paste restores the words and the caret; Ctrl+Shift+Z puts the paste back", () => {
  const { keeper, edit } = boxOf("Hello world");
  // A paste of "big " over nothing, at 6.
  edit("insertFromPaste", 6, "Hello big world", 10);
  assert.deepEqual(keeper.step("undo"), { text: "Hello world", caret: 6 });
  assert.equal(keeper.step("undo"), null, "no more");
  assert.deepEqual(keeper.step("redo"), { text: "Hello big world", caret: 10 });
  assert.equal(keeper.step("redo"), null);
});

test("Ctrl+Z after Enter restores the words: the newline is one step, however the box made it", () => {
  const { keeper, edit } = boxOf("Hi Rosa");
  edit("insertParagraph", 2, "Hi\nRosa", 3);
  edit("insertText", 3, "Hi\nXRosa", 4);
  assert.deepEqual(keeper.step("undo"), { text: "Hi\nRosa", caret: 3 }, "the letter typed after Enter");
  assert.deepEqual(keeper.step("undo"), { text: "Hi Rosa", caret: 2 }, "and the Enter before it");
});

test("Ctrl+Z after a cut puts the words back, with the caret where the cut began", () => {
  const { keeper, edit } = boxOf("Hi Rosa, welcome");
  edit("deleteByCut", 3, "Hi welcome", 3);
  assert.deepEqual(keeper.step("undo"), { text: "Hi Rosa, welcome", caret: 3 });
  assert.deepEqual(keeper.step("redo"), { text: "Hi welcome", caret: 3 });
});

test("a slot taken whole and a value put in are steps too, and typed braces that became a chip", () => {
  const { keeper, edit } = boxOf("Hi {{1}}!");
  edit("deleteContentBackward", 8, "Hi !", 3);
  assert.deepEqual(
    keeper.step("undo"),
    { text: "Hi {{1}}!", caret: 8 },
    "Backspace at a slot took it whole: back it comes",
  );
  edit("insertSlot", 3, "Hi {{2}}{{1}}!", 8);
  edit("insertText", 8, "Hi {{2}}{{1}}!{{3}", 14);
  assert.deepEqual(keeper.step("undo"), { text: "Hi {{2}}{{1}}!", caret: 8 });
  assert.deepEqual(keeper.step("undo"), { text: "Hi {{1}}!", caret: 3 });
});

test("typing is joined by the keeper's own clock: a pause of the run's length is still one step, longer is two", () => {
  const { keeper, clock, edit } = boxOf("");
  edit("insertText", 0, "a", 1);
  clock.now += HISTORY_RUN_MS;
  edit("insertText", 1, "ab", 2);
  clock.now += HISTORY_RUN_MS + 1;
  edit("insertText", 2, "abc", 3);
  assert.deepEqual(keeper.step("undo"), { text: "ab", caret: 2 });
  assert.deepEqual(keeper.step("undo"), { text: "", caret: 0 });
});

test("a step of undo ends a run: typing after it is a step of its own, and the redo it left is gone", () => {
  const { keeper, edit } = boxOf("");
  edit("insertText", 0, "a", 1);
  edit("insertText", 1, "ab", 2);
  assert.deepEqual(keeper.step("undo"), { text: "", caret: 0 });
  edit("insertText", 0, "z", 1);
  assert.equal(keeper.step("redo"), null, "what was undone cannot come back over new words");
  assert.deepEqual(keeper.step("undo"), { text: "", caret: 0 });
});

test("an edit that was refused, or whose words did not change, leaves the history as it was", () => {
  const { keeper, edit } = boxOf("Hi");
  edit("insertText", 2, "Hi", 2);
  assert.equal(keeper.step("undo"), null);
});
