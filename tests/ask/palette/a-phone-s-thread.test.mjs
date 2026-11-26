/**
 * A phone's thread (2026-09-27-ask-chat-on-a-phone): the conversation as a phone draws it, the composer under the
 * thumb, and a card in reach.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AskAnswerKit,
  AskHome,
  AskHooks,
  CLOSED,
  MASCOT,
  OPEN,
  Palette,
  TH,
  all,
  ask,
  askCalls,
  askText,
  asks,
  byClass,
  byTestId,
  closes,
  find,
  heldTurns,
  holdAsk,
  holdWorld,
  inputOf,
  keyed,
  later,
  nowOf,
  opens,
  phoneWindow,
  press,
  pressOf,
  render,
  said,
  sent,
  settle,
  speechStub,
  textOf,
  typed,
  withNext,
} from "./_palette.mjs";

test("on a phone a conversation is one thread: an earlier answer stays drawn in full under its question as a sent bubble, with no fold, and the newest question carries the id the thread stands at its top (D1, D2, D5)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: said(`m-${calls.sent.length}`, `Answer ${calls.sent.length}.`) });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "how was the week?");
    tree = await asks(tree, props, "and the week before?");
    assert.deepEqual(calls.sent, ["how was the week?", "and the week before?"]);
    assert.equal(byTestId(tree, "ask-fold"), null, "no fold on a phone");
    assert.deepEqual(
      all(tree, (n) => n.props?.["data-testid"] === "ask-q").map(textOf),
      ["how was the week?", "and the week before?"],
      "every question is a sent bubble, in order",
    );
    assert.ok(textOf(byTestId(tree, "ask-thread")).includes("Answer 1."), "the earlier answer is drawn in full");
    assert.equal(textOf(find(tree, (n) => n.props?.id === "ask-now-q")), "and the week before?");
    assert.equal(textOf(byTestId(nowOf(tree), "ask-say")), "Answer 2.", "the newest answer under the newest question");
    assert.equal(textOf(byTestId(tree, "ask-clear-head")), "New", "the head offers New in a conversation");
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-thread"), null, "New goes home");
    assert.equal(byTestId(tree, "ask-q"), null);
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone the three lead the newest answer: large while AI reads with what it has read, the newest live; at the answer's start, speaking, while the words arrive; a still mark once it is whole; one face in the thread (D3, D11-D13)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  let say = () => {};
  let land = () => {};
  const saying = new Promise((r) => (say = r));
  const landed = new Promise((r) => (land = r));
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(6).id, title: input.text });
      on({ t: "trace", text: "Looking through People" });
      on({ t: "trace", text: "Reading the inbox…" });
      on({ t: "trace", text: "Reading the inbox…" });
      await saying;
      on({ t: "say", headline: "Two people wrote", detail: "" });
      await landed;
      on({ t: "final", message: said("m-1", "Two people wrote today.") });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "who wrote today?");
    const hero = (tr) => byTestId(tr, "ask-hero");
    assert.equal(hero(tree).props.className, "ask-hero thinking", "large while AI reads");
    const reads = byClass(byTestId(hero(tree), "ask-reading"), "ask-read");
    assert.deepEqual(
      reads.map(textOf),
      ["Looking through People", "Reading the inbox…"],
      "what it has read, a repeat once",
    );
    assert.deepEqual(
      reads.map((n) => n.props.className),
      ["ask-read done", "ask-read now"],
      "the newest live, the earlier done (D12)",
    );
    assert.equal(inputOf(tree).props.placeholder, askText("en").follow, "the field says Follow up (D13)");
    assert.equal(textOf(byTestId(tree, "ask-q")), "who wrote today?", "the question is the bubble over them");
    assert.equal(byClass(hero(tree), "ask-turn-q").length, 0, "not a line under the three");
    say();
    tree = await later(Palette, props);
    assert.equal(hero(tree).props.className, "ask-hero sig speaking", "at the answer's start, speaking (D11)");
    assert.equal(byTestId(tree, "ask-acts"), null, "no Copy while the words arrive");
    land();
    tree = await later(Palette, props);
    assert.equal(hero(tree).props.className, "ask-hero sig", "a still mark once the answer is whole");
    const faces = all(tree, (n) => /-face$/.test(String(n.props?.["data-testid"] || "")));
    assert.deepEqual(
      faces.map((n) => n.props["data-testid"]),
      ["ask-line-face"],
      "one face in the conversation, the hero's",
    );
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone the field in use in a conversation brings the three forward over it to listen: the thread dims and stays drawn, its own face hidden; letting go puts them back (D4)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: said("m-1", "Answer 1.") });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "how was the week?");
    assert.equal(byTestId(tree, "ask-listen"), null, "no band while the field rests");
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    assert.ok(byTestId(byTestId(tree, "ask-listen"), "ask-listen-face"), "the three come forward over the field");
    assert.ok(byClass(tree, "dim").length, "the conversation dims");
    assert.ok(textOf(nowOf(tree)).includes("Answer 1."), "and stays drawn");
    typed(tree, "and last");
    tree = await later(Palette, props);
    assert.ok(byTestId(tree, "ask-listen"), "typing keeps them listening");
    assert.ok(textOf(nowOf(tree)).includes("Answer 1."), "the words typed do not take the conversation's place");
    inputOf(tree).props.onBlur();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-listen"), null, "let go: the band goes");
    assert.equal(inputOf(tree).props.value, "and last", "the words stay in the field");
    assert.ok(
      textOf(nowOf(tree)).includes("Answer 1."),
      "REGRESSION: a draft let go hid the conversation behind its rows",
    );
    assert.equal(byClass(tree, "ask-rows").length, 0, "no rows for the words over a conversation");
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero sig", "the Answered state: the still mark");
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone the newest answer's next questions ride over the field, not inside it; an earlier answer shows none, and none stand while AI reads or the field is in use (D6)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const nexts = (tree) => all(tree, (n) => n.props?.["data-testid"] === "ask-next");
  try {
    const calls = ask([]);
    let land = () => {};
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      const n = calls.sent.length;
      on({ t: "thread", id: TH(5).id, title: input.text });
      if (n === 2) await new Promise((r) => (land = r));
      on({ t: "final", message: { ...said(`m-${n}`, `Answer ${n}.`), answer: withNext(n) } });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "first?");
    assert.deepEqual(nexts(byTestId(tree, "ask-next-row")).map(textOf), ["Follow 1 up?"], "over the field");
    assert.equal(nexts(tree).length, 1, "and nowhere inside the answer");
    assert.equal(nexts(tree)[0].props.id, "ask-move-0", "the id the keys walk, as inside the answer");
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-next-row"), null, "not while the field is in use");
    inputOf(tree).props.onBlur();
    tree = await later(Palette, props);
    press(nexts(tree)[0]);
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["first?", "Follow 1 up?"], "a press asks it");
    assert.equal(byTestId(tree, "ask-next-row"), null, "not while AI reads");
    land();
    tree = await later(Palette, props);
    assert.deepEqual(nexts(tree).map(textOf), ["Follow 2 up?"], "the newest answer's alone; the earlier shows none");
  } finally {
    await closes();
    ph.restore();
  }
});

test("REGRESSION: on a phone a question asked from the keyboard lets the keyboard go, so its answer lands to be read -- the field kept its focus and the answer landed dimmed under the three listening (D4)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: { ...said("m-1", "Answer 1."), answer: withNext(1) } });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    let blurred = 0;
    // The field as a browser has it: letting go of it is heard by its own onBlur.
    inputOf(tree).props.ref.current = {
      focus() {},
      blur: () => {
        blurred++;
        inputOf(tree).props.onBlur();
      },
    };
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    typed(tree, "how was the week?");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["how was the week?"]);
    assert.equal(blurred, 1, "the keyboard goes as the question is asked");
    assert.equal(byTestId(tree, "ask-listen"), null, "no band over the field");
    assert.ok(
      !byClass(tree, "ask-line-body")[0].props.className.split(" ").includes("dim"),
      "the answer is not dimmed",
    );
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero sig", "the three's still mark at its start");
    assert.deepEqual(
      all(byTestId(tree, "ask-next-row"), (n) => n.props?.["data-testid"] === "ask-next").map(textOf),
      ["Follow 1 up?"],
      "its next questions over the field",
    );
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone the newest question stands at the top once per question, never again as its answer lands, and again from Earlier; Earlier and New start at their top (D5, D10)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const pins = [];
  // The thread's scroller, as far as the Line reads it: the newest question 1,500px down, a 600px screen.
  const body = {
    scrollTop: 0,
    clientHeight: 600,
    querySelector: (sel) => (sel === "#ask-now-q" ? { offsetTop: 1500 } : null),
    scrollTo({ top }) {
      pins.push(top);
      this.scrollTop = top;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  let land = () => {};
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      const n = calls.sent.length;
      on({ t: "thread", id: TH(5).id, title: input.text });
      if (n === 2) await new Promise((r) => (land = r));
      on({ t: "final", message: said(`m-${n}`, `Answer ${n}.`) });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    byClass(tree, "ask-line-body")[0].props.ref.current = body;
    tree = await asks(tree, props, "first?");
    assert.deepEqual(pins, [1486], "the question stands a breath under the top");
    tree = await asks(tree, props, "second?");
    assert.deepEqual(pins, [1486, 1486], "the next question, once");
    land();
    tree = await later(Palette, props);
    assert.deepEqual(pins, [1486, 1486], "never again as its answer lands");
    body.scrollTop = 1500;
    press(byTestId(tree, "ask-earlier"));
    tree = await later(Palette, props);
    assert.equal(body.scrollTop, 0, "REGRESSION: Earlier opened at the conversation's old offset");
    press(byTestId(tree, "ask-earlier"));
    tree = await later(Palette, props);
    assert.equal(pins.length, 3, "back from Earlier, the newest question stands at the top again");
    body.scrollTop = 1500;
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, props);
    assert.equal(body.scrollTop, 0, "REGRESSION: New opened the home at the conversation's old offset");
  } finally {
    await closes();
    ph.restore();
  }
});

test("REGRESSION: on a phone Latest holds back while a new question glides to the top -- it flashed on every follow-up in a thread longer than the screen (D7)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const heard = {};
  const fire = (type) => {
    for (const fn of [...(heard[type] || [])]) fn({ type });
  };
  // The thread's scroller as the glide begins: the newest question 1,500px down, a 600px screen, 400px scrolled.
  const body = {
    scrollTop: 0,
    clientHeight: 600,
    dataset: {},
    querySelector: (sel) => (sel === "#ask-now-q" ? { offsetTop: 1500 } : null),
    scrollTo() {
      this.scrollTop = 400;
    },
    addEventListener(type, fn) {
      (heard[type] ||= new Set()).add(fn);
    },
    removeEventListener(type, fn) {
      if (heard[type]) heard[type].delete(fn);
    },
    dispatchEvent(ev) {
      fire(ev.type);
      return true;
    },
  };
  const raf = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
  globalThis.requestAnimationFrame = (fn) => {
    fn();
    return 0;
  };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: said(`m-${calls.sent.length}`, `Answer ${calls.sent.length}.`) });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    byClass(tree, "ask-line-body")[0].props.ref.current = body;
    tree = await asks(tree, props, "first?");
    tree = await asks(tree, props, "second?");
    assert.equal(body.dataset.pinning, "1", "the question glides up");
    fire("scroll");
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-latest"), null, "REGRESSION: Latest while the question was on its way up");
    body.scrollTop = 1486;
    fire("scrollend");
    tree = await later(Palette, props);
    assert.equal(body.dataset.pinning, undefined, "the glide is over");
    assert.equal(byTestId(tree, "ask-latest"), null, "the question at the top: nothing to offer");
    body.scrollTop = 0;
    fire("scroll");
    tree = await later(Palette, props);
    assert.ok(byTestId(tree, "ask-latest"), "scrolled back by hand: Latest");
  } finally {
    [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = raf;
    await closes();
    ph.restore();
  }
});

test("REGRESSION: a hold on the three keeps its pointer, so a mouse's hold outlasts the three hiding under it as they listen -- it ended at once in a narrow desktop window (D4)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  try {
    ask([]);
    render(Palette, props);
    const tree = await later(Palette, props);
    const stage = byTestId(tree, "ask-hero-stage");
    const captured = [];
    stage.props.onPointerDown({
      ...pressOf(),
      pointerId: 7,
      clientX: 20,
      clientY: 20,
      currentTarget: { setPointerCapture: (id) => captured.push(id) },
    });
    assert.deepEqual(captured, [7], "the press keeps its pointer");
    assert.equal(typeof stage.props.onLostPointerCapture, "function", "and a pointer lost ends the hold");
    stage.props.onPointerUp();
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone the next questions over the field keep the ids the keys walk after the answer's rows and its Open, and the arrows reach them (D6)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const person = {
    kind: "person",
    id: "00000000-0000-4000-8000-0000000000aa",
    label: "Ana",
    to: "clients",
    door: true,
  };
  const answer = {
    ...withNext(1),
    show: {
      figures: [],
      breakdown: null,
      items: [{ title: "Ana", meta: "WhatsApp", line: "Asked to book.", source: person }],
    },
    do: { open: { to: "reports", label: "Open Reports", now: false }, next: ["Follow 1 up?"] },
  };
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: { ...said("m-1", "Answer 1."), answer } });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "first?");
    const chip = () => byTestId(byTestId(tree, "ask-next-row"), "ask-next");
    assert.equal(chip().props.id, "ask-move-2", "after the row and Open, as inside the answer");
    for (let i = 0; i < 3; i++) {
      keyed(tree, "ArrowDown");
      tree = await later(Palette, props);
    }
    assert.ok(chip().props.className.split(" ").includes("sel"), "the arrows reach it");
    assert.equal(inputOf(tree).props["aria-activedescendant"], "ask-move-2", "and the field names it");
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone the newest answer carries Copy, which copies its words and the rows it showed; an earlier one carries none (D14)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const copied = [];
  const had = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (w) => copied.push(w) },
  });
  try {
    const calls = ask([]);
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      const n = calls.sent.length;
      on({ t: "thread", id: TH(5).id, title: input.text });
      // The second answer shows a row: Copy takes it too (15 Oct: it copied the headline alone).
      const answer = {
        ...withNext(n),
        show: {
          figures: [],
          breakdown: null,
          items: [
            {
              title: "Ana",
              meta: "WhatsApp",
              line: "Asked to book.",
              source: {
                kind: "person",
                id: "00000000-0000-4000-8000-0000000000aa",
                label: "Ana",
                to: "clients",
                door: true,
              },
            },
          ],
        },
      };
      on({
        t: "final",
        message: n === 2 ? { ...said(`m-${n}`, `Answer ${n}.`), answer } : said(`m-${n}`, `Answer ${n}.`),
      });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "first?");
    tree = await asks(tree, props, "second?");
    const acts = byTestId(nowOf(tree), "ask-acts");
    assert.ok(acts, "under the newest answer");
    assert.equal(byTestId(byTestId(tree, "ask-thread"), "ask-acts"), null, "an earlier answer carries none");
    press(byTestId(acts, "ask-copy"));
    tree = await later(Palette, props);
    assert.deepEqual(copied, ["Answer 2.\nAna · WhatsApp · Asked to book."], "its words and its row, copied");
  } finally {
    await closes();
    if (had) Object.defineProperty(globalThis.navigator, "clipboard", had);
    else delete globalThis.navigator.clipboard;
    ph.restore();
  }
});

test("REGRESSION: on a phone an answer read aloud stops when another question is asked or another conversation is opened -- it went on over the next answer, whose Read then said Stop (D14)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  try {
    const calls = ask([TH(1)]);
    Object.assign(askCalls(), {
      ...s.stub,
      send: async (input, on) => {
        calls.sent.push(input.text);
        const n = calls.sent.length;
        on({ t: "thread", id: TH(5).id, title: input.text });
        on({ t: "final", message: said(`m-${n}`, `Answer ${n}.`) });
      },
    });
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "first?");
    press(byTestId(nowOf(tree), "ask-read"));
    s.land();
    tree = await later(Palette, props);
    assert.deepEqual(s.spoken, [{ text: "Answer 1.", purpose: "answer" }], "the answer's say, read in AI's voice");
    assert.equal(byTestId(nowOf(tree), "ask-read").props["aria-pressed"], true);
    let stops = s.stops;
    tree = await asks(tree, props, "second?");
    assert.ok(s.stops > stops, "a question asked: the reading stops");
    assert.equal(
      byTestId(nowOf(tree), "ask-read").props["aria-pressed"],
      false,
      "and the new answer's Read is not pressed",
    );
    press(byTestId(nowOf(tree), "ask-read"));
    s.land();
    tree = await later(Palette, props);
    stops = s.stops;
    press(byTestId(tree, "ask-earlier"));
    tree = await later(Palette, props);
    press(byTestId(tree, "ask-row-thread"));
    tree = await later(Palette, props);
    assert.equal(textOf(byTestId(nowOf(tree), "ask-say")), "The answer to Question 1.", "another conversation is open");
    assert.ok(s.stops > stops, "and the reading stops");
  } finally {
    await closes();
    ph.restore();
  }
});

test("Read aloud speaks the answer's say in AI's one voice: the button says it is getting the voice until the clip plays, Stop while it does, and a press then stops it; a clip that could not be made says why, in the server's words, and nothing else speaks", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  try {
    const calls = ask([TH(1)]);
    Object.assign(askCalls(), {
      ...s.stub,
      send: async (input, on) => {
        calls.sent.push(input.text);
        on({ t: "thread", id: TH(5).id, title: input.text });
        on({ t: "final", message: said("m-1", "Answer 1.") });
      },
    });
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "first?");
    press(byTestId(nowOf(tree), "ask-read"));
    tree = await later(Palette, props);
    assert.deepEqual(
      s.spoken,
      [{ text: "Answer 1.", purpose: "answer" }],
      "one clip asked for: the say, not the whole text",
    );
    let read = byTestId(nowOf(tree), "ask-read");
    assert.equal(read.props["aria-busy"], true, "getting the voice until the clip plays");
    assert.equal(read.props["aria-pressed"], false, "not Stop yet");
    s.land();
    tree = await later(Palette, props);
    read = byTestId(nowOf(tree), "ask-read");
    assert.equal(read.props["aria-pressed"], true, "Stop while it plays");
    assert.equal(read.props["aria-busy"], undefined);
    const stops = s.stops;
    press(read);
    tree = await later(Palette, props);
    assert.ok(s.stops > stops, "a press stops the clip");
    assert.equal(byTestId(nowOf(tree), "ask-read").props["aria-pressed"], false);
    assert.equal(byClass(tree, "pp-toast").length, 0, "nothing said: it worked");
    // The clip could not be made (the mint refused, the vendor down): why, once, in the server's words; nothing else speaks.
    press(byTestId(nowOf(tree), "ask-read"));
    s.fail("Voice is off while this workspace is paused or its plan has ended.");
    tree = await later(Palette, props);
    const toasts = byClass(tree, "pp-toast");
    assert.equal(toasts.length, 1, "one flash");
    assert.match(textOf(toasts[0]), /paused or its plan has ended/, "the server's words");
    assert.equal(byTestId(nowOf(tree), "ask-read").props["aria-pressed"], false, "and Read is at rest again");
    assert.equal(
      "speechSynthesis" in globalThis.window && globalThis.window.speechSynthesis,
      false,
      "the browser's own voice is never asked",
    );
  } finally {
    await closes();
    ph.restore();
  }
});

test("a reply's card draws the message as the bubble it will be, the undo's words for what follows, and Not now apart; after Send its line leads with the clock and says Undo until its window closes (D16)", () => {
  const { AskCard } = AskAnswerKit;
  const t = askText("en");
  const A = askCalls();
  const reply = {
    id: "p1",
    kind: "reply",
    needs: "operator",
    title: "Reply to Rosa",
    summary: "Friday at 11:30 works, see you then.",
    payload: { conversation_id: "c1", text: "Friday at 11:30 works, see you then.", who: "Rosa" },
    undo: "Sends 15 seconds after you approve; cancel within them",
    // Not now is offered on Ask's own idea: what the person asked for has no need of it.
    origin: { by: "idea", strangers: false },
  };
  holdAsk({
    ...A,
    undoOpen: (kind, u, at, now) => typeof u.cancelable_until === "string" && now < Date.parse(u.cancelable_until),
  });
  try {
    let tree = render(AskCard, { p: reply, messageId: "x", t, onNav() {} });
    assert.ok(
      byClass(tree, "ask-card-change")[0].props.className.split(" ").includes("bubble"),
      "the message as a bubble",
    );
    assert.equal(textOf(byClass(tree, "ask-card-summary")[0]), reply.summary);
    assert.equal(textOf(byClass(tree, "ask-card-foot")[0]), reply.undo, "what follows, in the undo's own words");
    assert.equal(textOf(byClass(tree, "ask-card-not-now")[0]), t.notNow, "Not now, apart");
    // Outside the 24-hour window only a template can go: the card says so and promises no send in 15 seconds.
    const shut = { ...reply, payload: { ...reply.payload, window_open: false } };
    tree = render(AskCard, { p: shut, messageId: "x", t, onNav() {} });
    assert.equal(textOf(byClass(tree, "ask-card-note")[0]), t.windowNote);
    assert.equal(byClass(tree, "ask-card-foot").length, 0, "REGRESSION: it promised a send the route refuses");

    const at = Date.now() - 3_000;
    const sending = {
      ...reply,
      outcome: {
        state: "done",
        receipt: "On its way to Rosa",
        atMs: at,
        undo: { message_id: "m1", cancelable_until: new Date(at + 15_000).toISOString() },
      },
    };
    tree = render(AskCard, { p: sending, messageId: "x", t, onNav() {} });
    assert.ok(byTestId(tree, "ask-card-ring"), "the clock leads the line");
    const undo = byClass(tree, "ask-card-undo")[0];
    assert.equal(textOf(undo), t.undo, "it says Undo");
    assert.equal(undo.props["data-tip"], reply.undo);
    assert.equal(byClass(tree, "ask-card-foot").length, 0, "the words for what follows are the card's, before the act");

    const sent = {
      ...sending,
      outcome: {
        ...sending.outcome,
        atMs: at - 20_000,
        undo: { message_id: "m1", cancelable_until: new Date(at - 5_000).toISOString() },
      },
    };
    tree = render(AskCard, { p: sent, messageId: "x", t, onNav() {} });
    assert.equal(byTestId(tree, "ask-card-ring"), null, "the window closed: no clock");
    assert.equal(byClass(tree, "ask-card-undo").length, 0, "and no Undo");
    assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("On its way to Rosa"));
  } finally {
    holdAsk(A);
  }
});

test("the reads say Thinking before the first and a repeat once, at its newest; a send's clock stands where its window is, and its end takes the ring and the Undo with it (D12, D16)", () => {
  const { AskCard } = AskAnswerKit;
  const { AskReads } = AskHome;
  const t = askText("en");
  const readsOf = (traces) => byClass(render(AskReads, { traces, t }), "ask-read");
  assert.deepEqual(
    readsOf([]).map((n) => [textOf(n), n.props.className]),
    [[t.thinking, "ask-read now"]],
    "Thinking, live, before the first read",
  );
  assert.deepEqual(
    readsOf(["Reading the inbox…", "Looking through People", "Reading the inbox…"]).map(textOf),
    ["Looking through People", "Reading the inbox…"],
    "a read again is said once, where it was last",
  );

  const A = askCalls();
  // The rule keeps the window open: the ring's own end is what takes the Undo away, a frame before or after the rule.
  holdAsk({ ...A, undoOpen: () => true });
  try {
    const at = Date.now() - 3_000;
    const props = {
      p: {
        id: "p1",
        kind: "reply",
        needs: "operator",
        title: "Reply to Rosa",
        summary: "See you Friday.",
        payload: { conversation_id: "c1", text: "See you Friday.", who: "Rosa" },
        undo: "Sends 15 seconds after you approve; cancel within them",
        outcome: {
          state: "done",
          receipt: "On its way to Rosa",
          atMs: at,
          undo: { message_id: "m1", cancelable_until: new Date(at + 15_000).toISOString() },
        },
      },
      messageId: "x",
      t,
      onNav() {},
    };
    let tree = render(AskCard, props);
    const ring = byTestId(tree, "ask-card-ring");
    assert.ok(ring, "the clock leads the line");
    const arc = find(ring, (n) => typeof n.props?.onAnimationEnd === "function");
    const left = parseFloat(arc.props.style.animationDuration);
    assert.ok(left > 11_000 && left <= 12_000, `it runs for what is left of the window, not all of it: ${left}ms`);
    const gone = arc.props.style.strokeDashoffset;
    assert.ok(gone > 7.5 && gone < 8.5, `a fifth of it is gone as it is drawn: ${gone}`);
    arc.props.onAnimationEnd();
    tree = settle(AskCard, props);
    assert.equal(byTestId(tree, "ask-card-ring"), null, "empty: the ring goes");
    assert.equal(byClass(tree, "ask-card-undo").length, 0, "and the Undo with it");
    assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("On its way to Rosa"), "the line stays");
  } finally {
    holdAsk(A);
  }
});

test("the thread's arithmetic: the newest question stands a breath under the thread's top edge, the first at the very top; Latest is offered once the newest question is below what the thread shows (D5, D7)", () => {
  const H = AskHooks;
  assert.equal(H.pinTop(14), 0, "the first question: the conversation's own top");
  assert.equal(H.pinTop(620), 606, "a later one, 14px under the edge");
  assert.equal(H.latestShown({ qTop: 900, scrollTop: 0, clientHeight: 600 }), true, "scrolled up: below");
  assert.equal(H.latestShown({ qTop: 900, scrollTop: 600, clientHeight: 600 }), false, "in sight");
  assert.equal(H.latestShown({ qTop: 560, scrollTop: 0, clientHeight: 600 }), false, "its first line in sight");
});

test("a question spoken where the agent's session cannot come up (no microphone for the agent, a mint refused) is still answered aloud, by the clip: the answer's say goes to AI's voice as it lands, with Read showing it is getting the voice then Stop; a typed question stays quiet (the spec's §3.5 as amended 4 Oct)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  const recs = [];
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.onend();
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  const down = () => ({ ...pressOf(), pointerId: 7, currentTarget: { setPointerCapture: () => {} } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const calls = ask([]);
    Object.assign(askCalls(), {
      ...s.stub,
      canVoice: () => false,
      send: async (input, on) => {
        calls.sent.push(input.text);
        const n = calls.sent.length;
        on({ t: "thread", id: TH(5).id, title: input.text });
        on({ t: "final", message: said(`m-${n}`, `Answer ${n}.`) });
      },
    });
    render(Palette, props);
    let tree = await later(Palette, props);
    // A hold dictates; the recogniser hears the question and the lift asks it (no agent here: the typed way).
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    await wait(340);
    assert.equal(recs.length, 1, "the hold dictates");
    hears(recs[0], "how did the week go");
    tree = await later(Palette, props);
    byTestId(tree, "ask-talk").props.onPointerUp();
    for (let i = 0; i < 4; i++) tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["how did the week go"], "the words heard are asked");
    assert.deepEqual(
      s.spoken,
      [{ text: "Answer 1.", purpose: "answer" }],
      "and the answer's say is read aloud by itself, nobody pressing Read",
    );
    let read = byTestId(nowOf(tree), "ask-read");
    assert.equal(read.props["aria-busy"], true, "Read says it is getting the voice");
    s.land();
    tree = await later(Palette, props);
    read = byTestId(nowOf(tree), "ask-read");
    assert.equal(read.props["aria-pressed"], true, "then Stop while it plays");
    // A typed question: the clip stops with the asking (one voice at a time) and the new answer is not read aloud.
    const stops = s.stops;
    tree = await asks(tree, props, "and the month?");
    assert.ok(s.stops > stops, "the typed question stops the clip");
    assert.deepEqual(calls.sent, ["how did the week go", "and the month?"]);
    assert.equal(s.spoken.length, 1, "a typed question's answer stays quiet");
    assert.equal(byTestId(nowOf(tree), "ask-read").props["aria-pressed"], false, "Read at rest, there to press");
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("the Line's recogniser listens in the Line's language: Spanish where the Line speaks it, the browser's own elsewhere", () => {
  const H = AskHooks;
  const langs = [];
  globalThis.window.SpeechRecognition = class {
    start() {
      langs.push(this.lang);
    }
    stop() {}
  };
  try {
    for (const lang of ["es", "en"]) {
      let talk;
      const Probe = () => {
        talk = H.useAskTalk({ lang, onWords() {}, onHeard() {}, disabled: false });
        return null;
      };
      render(Probe, {});
      talk.start();
    }
    assert.deepEqual(langs, ["es-US", navigator.language || "en-US"]);
  } finally {
    delete globalThis.window.SpeechRecognition;
  }
});

test("on a phone the mic keeps the finger: the lift asks what was heard, and Type instead leaves it in the field", async () => {
  const ph = phoneWindow();
  const recs = [];
  // The browser's recogniser, as far as the Line uses it: stopping it ends it, and what it heard comes back then.
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.onend();
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  const captured = [];
  const down = () => ({ ...pressOf(), pointerId: 7, currentTarget: { setPointerCapture: (id) => captured.push(id) } });
  try {
    const calls = ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    hears(recs[0], "how did the week go");
    tree = await later(Palette, OPEN);
    assert.deepEqual(captured, [7], "the mic holds the finger");
    assert.ok(byTestId(tree, "ask-letgo"), "Let go to ask, while it listens");
    assert.ok(byTestId(tree, "ask-talk"), "over the band, still drawn, so the lift reaches the mic");
    let focused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    press(byTestId(tree, "ask-type-instead"));
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, [], "REGRESSION: Type instead asked what was heard");
    assert.equal(inputOf(tree).props.value, "how did the week go", "the words are the field's, to finish");
    assert.equal(focused, 1, "and the field takes focus");
    assert.equal(byTestId(tree, "ask-letgo"), null);
    // With words in the field the one button is Send; cleared, it is the mic again (S12).
    assert.equal(byTestId(tree, "ask-talk"), null, "with words, the button is Send");
    assert.equal(byTestId(tree, "ask-send").props.disabled, false);
    typed(tree, "");
    tree = await later(Palette, OPEN);

    byTestId(tree, "ask-talk").props.onPointerDown(down());
    hears(recs[1], "how did the weekend go");
    tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerUp();
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["how did the weekend go"], "the lift off the mic asks");
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("the hold is the one mic, and its words go the typed way (the spec's §3.5 as amended 5 Oct, evening): the press stops what AI's voice was reading, readies its element inside itself and warms the model's cache, and dictates at once, asking the voice agent for nothing; the lift asks the words as a typed turn whose reads are drawn and never said; the answer is read aloud as it lands, a ring on the mic while it is, and the next hold stops it", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  const { recs, hears, down } = holdWorld();
  let readied = 0;
  let warmed = 0;
  const agent = [];
  try {
    const calls = ask([]);
    const held = heldTurns(calls);
    Object.assign(askCalls(), {
      ...s.stub,
      readySpeech: () => {
        readied += 1;
      },
      warmModel: () => {
        warmed += 1;
      },
      // The voice agent's calls are still on the bridge (its session and spoken turn, kept unused): a hold uses none.
      canVoice: () => true,
      warmVoice: () => agent.push("warmVoice"),
      ensureVoice: async () => {
        agent.push("ensureVoice");
        return { threadId: "t-voice" };
      },
      sendSpoken: async () => {
        agent.push("sendSpoken");
        return true;
      },
      hushVoice: () => agent.push("hushVoice"),
      send: held.send,
    });
    render(Palette, props);
    let tree = await later(Palette, props);
    const stops = s.stops;
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    assert.equal(recs.length, 1, "the press dictates at once");
    assert.ok(s.stops > stops, "what AI's voice was reading stops");
    assert.equal(readied, 1, "its element readied inside the press");
    assert.equal(warmed, 1, "and the model's cache warmed for the words on their way");
    hears(recs[0], "did anybody cancel last week");
    tree = await later(Palette, props);
    byTestId(tree, "ask-talk").props.onPointerUp();
    assert.equal(readied, 2, "readied again inside the lift: a press going down is no gesture to some phones");
    for (let i = 0; i < 4; i++) tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["did anybody cancel last week"], "the words heard go the typed way");
    assert.deepEqual(agent, [], "and the voice agent is asked for nothing");
    held.turn.on({ t: "trace", text: "Searching what was said" });
    tree = await later(Palette, props);
    assert.ok(textOf(tree).includes("Searching what was said"), "the read drawn while it runs, as a typed turn's is");
    assert.deepEqual(s.spoken, [], "and never said");
    held.turn.on({ t: "final", message: said("m-1", "Nobody canceled last week.") });
    held.turn.end();
    for (let i = 0; i < 3; i++) tree = await later(Palette, props);
    assert.deepEqual(
      s.spoken,
      [{ text: "Nobody canceled last week.", purpose: "answer" }],
      "the answer read aloud as it lands",
    );
    s.land();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-talk").props["data-state"], "speaking", "a ring on the mic while it is read");
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-talk").props["data-state"], undefined, "the next hold stops it, and the ring");
    byTestId(tree, "ask-talk").props.onPointerUp();
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("a spoken question asks AI's voice to say it is working, once, in the question's own language (ask/aloud.ts): only while the answer has not begun, so not once its Say is drawn, its turn has landed or Stop has ended it; a typed question asks nothing of the voice", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  const { recs, hears, down } = holdWorld();
  const waits = [];
  // The beat after a lift in which a click on the button is the lift's own and swallowed (line/place.ts AR_LIFT_MS,
  // 400 ms) is held here and passed by hand (`aBeat`): a loaded machine re-renders slower than the beat, and the Stop
  // pressed below as the lift's click must land inside it, as a finger's does (11 Oct 2026: it missed it, three runs).
  const LIFT_MS = 400;
  const timeout = globalThis.window.setTimeout;
  const beats = [];
  globalThis.window.setTimeout = (fn, ms) => (ms === LIFT_MS ? beats.push(fn) : timeout(fn, ms));
  const aBeat = () => beats.splice(0).forEach((fn) => fn());
  try {
    const calls = ask([]);
    const held = heldTurns(calls);
    Object.assign(askCalls(), {
      ...s.stub,
      readySpeech: () => {},
      waitAloud: (lang, answered) => waits.push({ lang, answered }),
      send: held.send,
    });
    render(Palette, props);
    let tree = await later(Palette, props);
    const holdAndAsk = async (words) => {
      byTestId(tree, "ask-talk").props.onPointerDown(down());
      hears(recs.at(-1), words);
      tree = await later(Palette, props);
      byTestId(tree, "ask-talk").props.onPointerUp();
      for (let i = 0; i < 4; i++) tree = await later(Palette, props);
    };
    await holdAndAsk("did anybody cancel last week");
    assert.equal(waits.length, 1, "asked once as the turn starts");
    assert.equal(waits[0].lang, "en", "in the question's language");
    assert.equal(waits[0].answered(), false, "nothing begun yet: the words are due");
    held.turn.on({ t: "say", headline: "Nobody canceled.", detail: "" });
    tree = await later(Palette, props);
    assert.equal(waits[0].answered(), true, "the Say drawn: the answer has begun");
    held.turn.on({ t: "final", message: said("m-1", "Nobody canceled.") });
    held.turn.end();
    for (let i = 0; i < 3; i++) tree = await later(Palette, props);
    aBeat();
    await holdAndAsk("¿alguien canceló la semana pasada?");
    assert.equal(waits.length, 2);
    assert.equal(waits[1].lang, "es", "a question in Spanish hears it in Spanish");
    assert.equal(waits[1].answered(), false);
    held.turn.on({ t: "final", message: said("m-2", "Nadie canceló.") });
    held.turn.end();
    for (let i = 0; i < 3; i++) tree = await later(Palette, props);
    assert.equal(waits[1].answered(), true, "a turn landed with no Say drawn has its answer too");
    aBeat();
    await holdAndAsk("and the week before");
    assert.equal(waits[2].answered(), false);
    // Stop: the lift's own click on what the button has become is swallowed, and the press after it stops the turn.
    press(byTestId(tree, "ask-stop"));
    tree = await later(Palette, props);
    press(byTestId(tree, "ask-stop"));
    tree = await later(Palette, props);
    assert.equal(waits[2].answered(), true, "Stop ended the turn: nothing is said for it");
    held.turn.end();
    aBeat();
    tree = await later(Palette, props);
    tree = await asks(tree, props, "how did the week go?");
    assert.equal(waits.length, 3, "a typed question asks nothing of the voice");
  } finally {
    globalThis.window.setTimeout = timeout;
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("a quick question spoken is answered aloud too: the Line answers it itself, with no turn, and its words go to AI's voice; asked by typing it stays quiet", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  const { recs, hears, down } = holdWorld();
  try {
    const calls = ask([]);
    Object.assign(askCalls(), { ...s.stub, readySpeech: () => {} });
    render(Palette, props);
    let tree = await later(Palette, props);
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    hears(recs[0], "who needs me");
    tree = await later(Palette, props);
    byTestId(tree, "ask-talk").props.onPointerUp();
    for (let i = 0; i < 4; i++) tree = await later(Palette, props);
    assert.deepEqual(calls.sent, [], "the Line's own answer: no turn");
    assert.equal(s.spoken.length, 1, "read aloud");
    assert.equal(s.spoken[0].purpose, "answer");
    assert.ok(
      s.spoken[0].text.length > 0 && textOf(tree).includes(s.spoken[0].text),
      "the words drawn are the words read",
    );
    s.ends();
    // New (a phone's Clear, the head's) and the same words typed.
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, props);
    tree = await asks(tree, props, "who needs me?");
    assert.equal(s.spoken.length, 1, "typed, it stays quiet");
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("a press while AI is still working on a spoken answer starts no recogniser and stops nothing: the recogniser cannot listen then, and the one line AI's voice says while it works goes on", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const s = speechStub();
  const { recs, hears, down } = holdWorld();
  try {
    const calls = ask([]);
    const held = heldTurns(calls);
    Object.assign(askCalls(), { ...s.stub, readySpeech: () => {}, send: held.send });
    render(Palette, props);
    let tree = await later(Palette, props);
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    hears(recs[0], "how did the week go");
    tree = await later(Palette, props);
    byTestId(tree, "ask-talk").props.onPointerUp();
    for (let i = 0; i < 4; i++) tree = await later(Palette, props);
    // Working: the line is being said, and the field's button is Stop. A phone's three held a beat is a press too.
    void askCalls().speak("One moment.", "answer");
    s.land();
    const stops = s.stops;
    tree = await later(Palette, props);
    assert.ok(byTestId(tree, "ask-stop"), "Stop while the turn runs");
    byTestId(tree, "ask-hero-stage").props.onPointerDown({ ...down(), pointerId: 8, clientX: 20, clientY: 20 });
    await new Promise((r) => setTimeout(r, 340));
    tree = await later(Palette, props);
    byTestId(tree, "ask-hero-stage").props.onPointerUp();
    tree = await later(Palette, props);
    assert.equal(recs.length, 1, "no recogniser while a turn runs");
    assert.equal(s.stops, stops, "and the line being said goes on");
    held.turn.end();
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("one button at the field's end: the mic with no words, Send with words, and Send alone where the browser cannot listen (S12)", async () => {
  // Where the browser listens: the mic at rest, Send once there are words, the mic again once they are cleared.
  globalThis.window.SpeechRecognition = class {
    start() {}
    stop() {}
  };
  try {
    ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    const mic = byTestId(tree, "ask-talk");
    assert.ok(mic, "the mic, with no words");
    assert.equal(mic.props.className, "line-send line-talk ask-send", "the same circle Send is");
    assert.equal(mic.props["aria-pressed"], false);
    assert.equal(byTestId(tree, "ask-send"), null, "and no second button");
    typed(tree, "who wrote today?");
    tree = await later(Palette, OPEN);
    assert.equal(byTestId(tree, "ask-talk"), null, "with words, the mic gives way");
    assert.equal(byTestId(tree, "ask-send").props.disabled, false, "to Send, filled");
    typed(tree, "   ");
    tree = await later(Palette, OPEN);
    assert.ok(byTestId(tree, "ask-talk"), "spaces are no words: the mic again");
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
  }
  // Where it cannot: Send alone, faint until there are words; no mic that only says it cannot listen.
  ask([]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-talk"), null, "no mic where the browser cannot listen");
  assert.equal(byTestId(tree, "ask-talk-off"), null, "and none that only says so");
  assert.equal(byTestId(tree, "ask-send").props.disabled, true, "Send, faint");
  typed(tree, "who wrote today?");
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, false);
  await closes();
});

test("a hold whose recogniser ends on its own asks the words heard, and the lift's click does not press the Stop the button has become", async () => {
  const recs = [];
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.onend();
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  const tick = () => new Promise((r) => setImmediate(r));
  try {
    const calls = ask([]);
    let release;
    // A turn held open, so the button is Stop while the finger is still down.
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(1).id, title: input.text });
      await new Promise((r) => {
        release = r;
      });
      on({ t: "final", message: said("m-h", "Nobody yet.") });
    };
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerDown({ ...pressOf(), pointerId: 3, currentTarget: {} });
    hears(recs[0], "who wrote today");
    // A pause ended it (Android Chrome, iOS Safari), the finger still down: the words are asked at once.
    recs[0].onend();
    await tick();
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["who wrote today"], "the words heard are asked");
    assert.ok(byTestId(tree, "ask-stop"), "and the held button is Stop now");
    // The lift: the browser's click lands on what the button has become.
    press(byTestId(tree, "ask-stop"));
    tree = await later(Palette, OPEN);
    assert.ok(byTestId(tree, "ask-stop"), "REGRESSION: the lift's click stopped the turn just asked");
    // A press after the lift is a press.
    press(byTestId(tree, "ask-stop"));
    tree = await later(Palette, OPEN);
    assert.equal(byTestId(tree, "ask-stop"), null, "Stop stops it");
    release();
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
  }
});

test("REGRESSION (G:0): closing Ask while it listens drops what it heard -- the recogniser's end asked it in a Line that was gone", async () => {
  const recs = [];
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.stopped = true;
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  // The field the words are for, focused as listening begins; closing the Line takes it off the page.
  const field = { isConnected: true };
  const was = globalThis.document.activeElement;
  try {
    const calls = ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    globalThis.document.activeElement = field;
    byTestId(tree, "ask-talk").props.onPointerDown({ ...pressOf(), pointerId: 4, currentTarget: {} });
    hears(recs[0], "who wrote today");
    field.isConnected = false;
    hears(recs[0], "who wrote today and");
    assert.equal(recs[0].stopped, true, "a word after the close stops the recogniser");
    recs[0].onend();
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, [], "nothing is asked in a Line that is gone");

    // The Line still there: its end asks, as it always did.
    field.isConnected = true;
    typed(tree, "");
    tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerDown({ ...pressOf(), pointerId: 5, currentTarget: {} });
    hears(recs[1], "how did the week go");
    recs[1].onend();
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["how did the week go"]);
  } finally {
    globalThis.document.activeElement = was;
    await closes();
    delete globalThis.window.SpeechRecognition;
  }
});

test("the phone's three listen to a press held a beat; a shorter press, or one that drags, does nothing (S11, S7)", async () => {
  const said = [];
  const talk = { start: () => said.push("start"), stop: () => said.push("stop") };
  let press3 = null;
  const Probe = () => {
    press3 = AskHooks.useHoldPress({ talk, onHold: () => said.push("buzz") });
    return null;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  render(Probe, {});
  const down = pressOf();
  press3.onPointerDown(down);
  assert.equal(down.prevented, true, "the press opens no keyboard and selects nothing");
  await wait(360);
  assert.deepEqual(said, ["buzz", "start"], "held: a buzz, then listening");
  press3.onPointerDown(pressOf());
  assert.deepEqual(said, ["buzz", "start"], "a second down while held starts nothing");
  press3.onPointerUp();
  assert.deepEqual(said, ["buzz", "start", "stop"], "let go: it asks");

  press3.onPointerDown(pressOf());
  press3.onPointerUp();
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop"], "a tap started nothing");
  press3.onPointerDown(pressOf());
  press3.onPointerCancel();
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop"], "nor a press the browser took back");
  // A pull down that starts on the three closes the takeover; it is never a hold.
  press3.onPointerDown({ ...pressOf(), clientX: 195, clientY: 200 });
  press3.onPointerMove({ clientX: 196, clientY: 204 });
  press3.onPointerMove({ clientX: 196, clientY: 240 });
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop"], "nor a press that drags");
  press3.onPointerUp();
  press3.onPointerDown({ ...pressOf(), clientX: 195, clientY: 200 });
  press3.onPointerMove({ clientX: 197, clientY: 205 });
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop", "buzz", "start"], "a finger that trembles still holds");
  press3.onPointerUp();
});

test("a quick answer nods, and a failed turn shakes: the palette says how a turn ended", async () => {
  const said = [];
  const stop = MASCOT.mood.subscribe((ev) =>
    said.push(ev.t === "state" ? ev.state : ev.t === "react" ? ev.kind : ev.t),
  );
  const calls = ask([]);
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "error", text: "Network error — nothing was asked." });
  };
  try {
    render(Palette, CLOSED);
    // "who needs me?" is one the Line answers itself (contracts askIntent, ask/answer/normalize.ts): no turn, a nod. First,
    // because a conversation left open takes every later question to the model.
    sent("ask:seed", { prompt: "who needs me?" });
    await opens();
    assert.deepEqual(calls.sent, [], "the quick question sent nothing");
    assert.ok(said.includes("nod"), `a quick answer nods: ${said.join(",")}`);
    await closes();
    said.length = 0;
    sent("ask:seed", { prompt: "how did the weekend go?" });
    await opens();
    assert.deepEqual(calls.sent, ["how did the weekend go?"]);
    assert.ok(said.includes("shake"), `a failure shakes: ${said.join(",")}`);
    await closes();
  } finally {
    stop();
    MASCOT.mood.set("idle");
  }
});
