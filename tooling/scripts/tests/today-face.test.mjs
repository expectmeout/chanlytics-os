/**
 * The band above the queue on a phone, EXECUTED on the stub React: at rest the face with no field; a tap's click wakes
 * it with the field; a press held on it listens (or says the browser cannot); Escape folds it and keeps the answer;
 * Clear forgets and folds. Woken, the field sends through the palette's client and the exchange shows what the stream
 * says; a failed turn shows its sentence and Try again; a follow-up goes on the same thread; Continue in Ask opens the
 * thread in the palette; an answer with a proposal hands off for review; the band says Ask's one mood; and with no
 * client the field seeds the palette. Today's composition, with the band in it, is pinned in today-page.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerFromV1, answerText, needsAnswer, oneDoor } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, byTestId, textOf, press, settle } from "./_legacy-react.mjs";

const asked = [];
const flashes = [];
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
const W = globalThis.window;
const L = "../../../apps/dashboard/src/legacy";
const { MASCOT } = await import("../../../apps/dashboard/src/legacy-bridge/mascot/index.ts");
Object.assign(W, {
  __mascot: MASCOT,
  askAbout: (a) => asked.push(a),
  appNavigate: (to) => asked.push({ nav: to }),
  usePPToast: () => [null, (m) => flashes.push(m)],
});
await import(`${L}/pages/ask-text.jsx`);
await import(`${L}/pages/ask-hooks.jsx`);
await import(`${L}/pages/ask-turn.jsx`);
await import(`${L}/pages/today-face.jsx`);

const msg = (over = {}) => ({
  id: "m1",
  role: "assistant",
  text: "Nora has waited longest.",
  atMs: 0,
  failed: false,
  proposals: [],
  followups: [],
  citations: [],
  navigate: null,
  ...over,
});
/** A client whose send plays a script of events, and remembers what it was asked. */
const client = (script) => {
  const sent = [];
  return {
    sent,
    language: () => "en",
    quick: () => null,
    // What an answer shows is the contract's, as the bridge hands it over (palette.ts `answer`).
    answer: (m) => oneDoor(m.answer ?? answerFromV1(m), m.proposals || []),
    answerText,
    canSpeak: () => false,
    speak: () => false,
    stopSpeaking() {},
    send: async (input, on) => {
      sent.push(input);
      for (const ev of typeof script === "function" ? script(input) : script) on(ev);
    },
  };
};
const draw = () => W.React.createElement(W.TodayFace);
/** A new band: the cells forgotten, then drawn; `again(draw)` redraws over the cells as they are. */
const start = () => {
  fresh();
  return draw();
};
const isOpen = (tree) => byTestId(tree, "today-face").props["data-open"] === "true";
/** The keyboard's press on the stage (a click with no pointer, detail 0): open, drawn again. */
const openBand = (tree) => {
  byTestId(tree, "today-face-stage").props.onClick({ detail: 0 });
  return again(draw);
};
const type = (tree, words) => byTestId(tree, "today-face-input").props.onChange({ target: { value: words } });
const submit = (tree) => byTestId(tree, "today-face-form").props.onSubmit({ preventDefault() {} });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("at rest it is the mark alone: closed, no field, no exchange; a click opens it with the field", () => {
  let tree = start();
  assert.ok(byTestId(tree, "today-face"));
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "rest");
  assert.equal(isOpen(tree), false);
  assert.equal(byTestId(tree, "today-face-stage").props["aria-expanded"], false);
  assert.equal(byTestId(tree, "today-face-input"), null, "no field at rest");
  assert.equal(byTestId(tree, "today-face-exchange"), null, "no exchange at rest");
  tree = openBand(tree);
  assert.equal(isOpen(tree), true);
  assert.equal(byTestId(tree, "today-face-stage").props["aria-expanded"], true);
  assert.equal(byTestId(tree, "today-face-input").props.placeholder, "Ask about today…");
  assert.equal(textOf(byTestId(tree, "today-face-exchange")), "");
});

test("a tap opens on its click, not its release; a press held listens, or says the browser cannot", async () => {
  let tree = start();
  const stage = byTestId(tree, "today-face-stage");
  // A phone's tap: the pointer's down and up, then (after its mouse events, whose mousedown focuses the stage) a click.
  stage.props.onPointerDown({ button: 0 });
  stage.props.onPointerUp();
  tree = again(draw);
  assert.equal(isOpen(tree), false, "the release alone opens nothing, or the mousedown after it would take the focus");
  byTestId(tree, "today-face-stage").props.onClick({ detail: 1 });
  tree = again(draw);
  assert.equal(isOpen(tree), true, "the click opened it");
  tree = start();
  flashes.length = 0;
  byTestId(tree, "today-face-stage").props.onPointerDown({ button: 0 });
  await wait(400);
  assert.equal(flashes.length, 1, "held: this browser has no recogniser, so it says so");
  byTestId(tree, "today-face-stage").props.onPointerUp();
  byTestId(tree, "today-face-stage").props.onClick({ detail: 1 });
  tree = again(draw);
  assert.equal(isOpen(tree), false, "the click after a hold is swallowed: a hold that could not listen opened nothing");
  byTestId(tree, "today-face-stage").props.onClick({ detail: 1 });
  tree = again(draw);
  assert.equal(isOpen(tree), true, "and the next click opens it");
});

test("Escape folds it and keeps the answer for the next opening; Clear forgets and folds", async () => {
  const A = client([
    { t: "thread", id: "th0", title: "who's waited longest?" },
    { t: "final", message: msg() },
  ]);
  W.__ask = A;
  let tree = openBand(start());
  type(tree, "who's waited longest?");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "settled");
  W.dispatchEvent({ type: "keydown", key: "Escape" });
  tree = again(draw);
  assert.equal(isOpen(tree), false, "Escape folded it");
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "settled", "the turn is kept");
  tree = openBand(tree);
  assert.ok(textOf(byTestId(tree, "today-face-exchange")).includes("Nora has waited longest."), "and shown again");
  press(byTestId(tree, "today-face-clear"));
  tree = again(draw);
  assert.equal(isOpen(tree), false, "Clear folded it");
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "rest", "and forgot the turn");
  delete W.__ask;
});

test("a question: it reads, the answer streams, then it settles as the Line draws it; a next question stays on the thread", async () => {
  const A = client([
    { t: "thread", id: "th1", title: "who's waited longest?" },
    { t: "trace", text: "Reading the inbox…" },
    { t: "delta", text: "Nora has " },
    { t: "delta", text: "waited longest." },
    { t: "final", message: msg({ followups: ["Who else is waiting?"] }) },
  ]);
  W.__ask = A;
  let tree = openBand(start());
  type(tree, "who's waited longest?");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(A.sent[0].surface, "today");
  assert.equal(A.sent[0].threadId, null);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "settled");
  const ex = textOf(byTestId(tree, "today-face-exchange"));
  assert.ok(ex.includes("who's waited longest?"));
  assert.ok(ex.includes("Nora has waited longest."));
  assert.equal(byTestId(tree, "today-face-input").props.placeholder, "Follow up…");
  assert.ok(byTestId(tree, "ask-answer"), "the answer's own parts, as the Line draws them");
  const follow = byTestId(tree, "ask-next");
  assert.equal(textOf(follow), "Who else is waiting?");
  press(follow);
  await settle();
  assert.equal(A.sent[1].text, "Who else is waiting?");
  assert.equal(A.sent[1].threadId, "th1");
  tree = again(draw);
  assert.equal(textOf(byTestId(tree, "today-face-continue")), "Continue in Ask");
  press(byTestId(tree, "today-face-continue"));
  assert.deepEqual(asked.at(-1), { thread: "th1" });
  delete W.__ask;
});

test("a failed turn shows its sentence and Try again asks the same question", async () => {
  let n = 0;
  const A = client(() =>
    n++ === 0
      ? [
          { t: "thread", id: "th2", title: "x" },
          { t: "final", message: msg({ failed: true, text: "Ask is not connected to a model yet." }) },
        ]
      : [
          { t: "thread", id: "th2", title: "x" },
          { t: "final", message: msg() },
        ],
  );
  W.__ask = A;
  let tree = openBand(start());
  type(tree, "x");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "failed");
  assert.ok(textOf(byTestId(tree, "today-face-exchange")).includes("Ask is not connected to a model yet."));
  press(byTestId(tree, "today-face-retry"));
  await settle();
  assert.equal(A.sent.length, 2);
  assert.equal(A.sent[1].text, "x");
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "settled");
  delete W.__ask;
});

test("a stream that ends without a final is a cut-off, said in the palette's words", async () => {
  const A = client([
    { t: "thread", id: "th4", title: "y" },
    { t: "delta", text: "Half an" },
  ]);
  W.__ask = A;
  let tree = openBand(start());
  type(tree, "y");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "failed");
  assert.ok(textOf(byTestId(tree, "today-face-exchange")).includes(W.askText("en").cutOff));
  delete W.__ask;
});

test("a quick answer settles without a turn: the person waiting is her own door, and nothing else points there", async () => {
  const A = client([]);
  A.quick = () =>
    Promise.resolve(
      needsAnswer(
        {
          people: [
            {
              id: "c1",
              kind: "thread",
              who: "Nora",
              channel: "WhatsApp",
              when: "waited 2h",
              line: "“Can I come at 3?”",
              to: "inbox/th-c1",
            },
          ],
          runs: [],
        },
        "en",
      ),
    );
  W.__ask = A;
  let tree = openBand(start());
  type(tree, "who needs me?");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(A.sent.length, 0, "no turn was sent");
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "settled");
  assert.ok(textOf(byTestId(tree, "today-face-exchange")).includes("Nora is waiting on you."));
  assert.equal(byTestId(tree, "ask-open"), null, "no second door to the Inbox");
  press(byTestId(tree, "ask-item"));
  assert.deepEqual(asked.at(-1), { nav: "inbox/th-c1" });
  assert.equal(byTestId(tree, "today-face-continue"), null, "no thread to continue");
  delete W.__ask;
});

test("an answer that carries a proposal hands off to the palette for review", async () => {
  const A = client([
    { t: "thread", id: "th3", title: "send" },
    { t: "final", message: msg({ proposals: [{ id: "p1", kind: "broadcast" }] }) },
  ]);
  W.__ask = A;
  let tree = openBand(start());
  type(tree, "send everyone a note");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(textOf(byTestId(tree, "today-face-continue")), "Review in Ask");
  delete W.__ask;
});

test("the band says Ask's one mood, so every face moves with it: reading, answering with a beat per word, then rest", async () => {
  const said = [];
  const stop = MASCOT.mood.subscribe((ev) =>
    said.push(ev.t === "state" ? ev.state : ev.t === "react" ? ev.kind : ev.t),
  );
  // A turn the case steps through by hand, drawing between the events as React would.
  let on = null;
  let finish = null;
  const A = client([]);
  A.send = (input, cb) => {
    A.sent.push(input);
    on = cb;
    return new Promise((r) => (finish = r));
  };
  W.__ask = A;
  try {
    let tree = openBand(start());
    assert.deepEqual(said, [], "a band drawn at rest says nothing: the palette may be reading");
    type(tree, "who has waited longest?");
    tree = again(draw);
    submit(tree);
    await settle();
    tree = again(draw);
    on({ t: "thread", id: "th-m", title: "who has waited longest?" });
    on({ t: "delta", text: "Nora has " });
    tree = again(draw);
    on({ t: "final", message: msg() });
    finish();
    await settle();
    tree = again(draw);
    assert.deepEqual(
      said.filter((s) => s !== "beat"),
      ["thinking", "speaking", "idle"],
      "the row nods on its own as it settles",
    );
    assert.equal(said.filter((s) => s === "beat").length, 1, "a beat for the word");
  } finally {
    stop();
    MASCOT.mood.set("idle");
    delete W.__ask;
  }
});

test("with no client the field seeds the palette and the band rests; Enter on the field is the send", () => {
  delete W.__ask;
  asked.length = 0;
  let tree = openBand(start());
  type(tree, "who needs me?");
  tree = again(draw);
  let prevented = 0;
  byTestId(tree, "today-face-input").props.onKeyDown({
    key: "Enter",
    shiftKey: false,
    preventDefault: () => prevented++,
  });
  assert.equal(prevented, 1, "the form's own submission is not left to the key's character");
  assert.deepEqual(asked.at(-1), { prompt: "who needs me?" });
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face-input").props.value, "", "the field is cleared");
  type(tree, "who needs me?");
  tree = again(draw);
  submit(tree);
  assert.deepEqual(asked.at(-1), { prompt: "who needs me?" });
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "rest");
});
