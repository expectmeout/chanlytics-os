/**
 * Ask's face, and the takeover a phone opens over the page: what it draws, how it closes, and the words it keeps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOSED,
  MASCOT,
  OPEN,
  Palette,
  TH,
  ask,
  askCalls,
  byClass,
  byTestId,
  closes,
  cmdJ,
  draw,
  escBeside,
  inPage,
  inputOf,
  keyed,
  later,
  lineCounted,
  opens,
  phoneWindow,
  press,
  render,
  sent,
  textOf,
  typed,
  until,
} from "./_palette.mjs";

/* ------------------------------ Ask's face ------------------------------ */

test("the Line draws AI's face in the line, and says AI's mood as a turn runs", async () => {
  const said = [];
  const stop = MASCOT.mood.subscribe((ev) =>
    said.push(ev.t === "state" ? ev.state : ev.t === "react" ? ev.kind : ev.t),
  );
  const calls = ask([]);
  const tick = () => new Promise((r) => setImmediate(r));
  // A turn as the stream sends it, one event per tick, so the palette draws between them.
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    const final = { id: "m-f", role: "assistant", text: "Nora has waited longest.", atMs: Date.now(), failed: false };
    for (const ev of [
      { t: "thread", id: TH(3).id, title: input.text },
      { t: "trace", text: "Reading the inbox…" },
      { t: "delta", text: "Nora has " },
      { t: "delta", text: "waited longest." },
      { t: "final", message: { ...final, citations: [], followups: [], proposals: [] } },
    ]) {
      await tick();
      on(ev);
    }
  };
  try {
    render(Palette, CLOSED);
    sent("ask:seed", { prompt: "who has waited longest?" });
    let tree = await opens();
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.ok(byTestId(tree, "ask-line-face"), "the three stand in the line");
    assert.deepEqual(calls.sent, ["who has waited longest?"]);
    assert.deepEqual(
      said.filter((s) => s !== "beat" && s !== "pulse"),
      ["thinking", "speaking", "idle"],
      "reading until the first words, answering while they stream, then at rest (the row nods on its own)",
    );
    assert.equal(said.filter((s) => s === "beat").length, 2, "a beat for each piece of the answer");
    assert.equal(said.filter((s) => s === "pulse").length, 1, "a pulse for the read that landed");
    assert.ok(said.indexOf("pulse") > said.indexOf("thinking"), "while it reads");
    await closes();
  } finally {
    stop();
    MASCOT.mood.set("idle");
  }
});

test("the reads: what AI has read stands under the three, the newest live; Send fills with words, Stop while a turn runs", async () => {
  const calls = ask([]);
  const tick = () => new Promise((r) => setImmediate(r));
  let release;
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(1).id, title: input.text });
    on({ t: "trace", text: "Reading the inbox…" });
    on({ t: "trace", text: "Reading this week's calls…" });
    await new Promise((r) => {
      release = r;
    });
    on({
      t: "final",
      message: {
        id: "m-b",
        role: "assistant",
        text: "Done.",
        atMs: Date.now(),
        failed: false,
        citations: [],
        followups: [],
        proposals: [],
      },
    });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, true, "nothing to send yet");
  assert.equal(byTestId(tree, "ask-reading"), null, "no reading line at rest");
  typed(tree, "how did the week go?");
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, false);
  press(byTestId(tree, "ask-send"));
  await tick();
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["how did the week go?"]);
  const reads = byClass(byTestId(tree, "ask-reading"), "ask-read");
  assert.deepEqual(
    reads.map(textOf),
    ["Reading the inbox…", "Reading this week's calls…"],
    "each read, the newest last",
  );
  assert.ok(reads[1].props.className.split(" ").includes("now"), "the newest is the live one");
  assert.ok(byTestId(tree, "ask-stop"), "Stop while it reads");
  assert.equal(byTestId(tree, "ask-send"), null);
  release();
  for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-reading"), null, "the line goes with the answer");
  await closes();
});

test("on a phone the Line is the screen: focus on the dialog, not the field, the three in the hero, one history entry, Back closes, × goes back", async () => {
  const ph = phoneWindow();
  let closed = 0;
  const props = {
    open: true,
    onClose: () => {
      closed++;
    },
  };
  try {
    ask([]);
    // The field and the dialog are given something to focus on the first draw, before anything awaits, as the
    // desktop test below does: the focus effect fires on a 30ms timer (useAskFocus), and under load the draws that
    // follow can take longer than that. The refs are the same across draws.
    let tree = render(Palette, props);
    let focused = 0;
    let dialogFocused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    byTestId(tree, "ask-real").props.ref.current = {
      focus: () => {
        dialogFocused++;
      },
    };
    tree = await later(Palette, props);
    assert.ok(byTestId(tree, "ask-hero"), "the hero stands on a phone");
    assert.ok(byTestId(byTestId(tree, "ask-hero"), "ask-line-face"), "the three are in the hero, not the band");
    assert.equal(byTestId(byTestId(tree, "ask-line"), "ask-line-face"), null, "and not in the band");
    assert.equal(byTestId(tree, "ask-real").props["aria-modal"], "true");
    await until(() => dialogFocused > 0, "the dialog takes focus on a phone");
    // A focus of the field would be on the same 30ms timer, set on the first draw: one more 30ms cannot end before it.
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(focused, 0, "no keyboard of its own: the field is not focused as the takeover opens (S10)");
    assert.equal(dialogFocused, 1, "the dialog is (S10)");
    assert.deepEqual(
      ph.log,
      [["push", null, "https://app.chanlytics.com/w/studio#/today"]],
      "one entry, null state, same address (S8)",
    );
    // Back: the entry pops and the takeover closes, pushing nothing more. Drawn again, not rendered afresh, so the
    // Line's cleanups run as it closes, as React's do.
    globalThis.window.dispatchEvent(new Event("popstate"));
    assert.equal(closed, 1);
    draw(Palette, CLOSED);
    await later(Palette, CLOSED);
    assert.equal(ph.log.length, 1, "closing by Back goes back no further");
    // Open again; × closes through history.back().
    draw(Palette, props);
    tree = await later(Palette, props);
    press(byTestId(tree, "ask-close"));
    assert.equal(closed, 2);
    draw(Palette, CLOSED);
    await later(Palette, CLOSED);
    assert.deepEqual(ph.log.slice(1), [["push", null, "https://app.chanlytics.com/w/studio#/today"], ["back"]]);
    assert.equal(closed, 2, "the entry taken back is not a second close");
    // A thumb lets go of it across, to either side, as it does down (Ruben, 7 Oct 2026): the dialog's own touch
    // handlers, with the screen taken past a third of its width. Never from the left edge, which is the phone's own
    // back, and a short move settles it where it stood. Each answer is how many closes that touch made.
    const screen = () => ({
      style: {},
      offsetWidth: 375,
      offsetHeight: 700,
      scrollWidth: 375,
      clientWidth: 375,
      scrollHeight: 700,
      clientHeight: 700,
      scrollTop: 0,
      parentElement: null,
      previousElementSibling: null,
      isConnected: true,
      getClientRects: () => [1],
      matches: () => false,
    });
    const across = async (fromX, toX) => {
      draw(Palette, props);
      tree = await later(Palette, props);
      const h = byTestId(tree, "ask-real").props;
      const el = screen();
      const before = closed;
      h.onTouchStart({ touches: [{ clientX: fromX, clientY: 300 }], currentTarget: el, target: el });
      h.onTouchMove({ touches: [{ clientX: (fromX + toX) / 2, clientY: 302 }], currentTarget: el });
      h.onTouchMove({ touches: [{ clientX: toX, clientY: 302 }], currentTarget: el });
      h.onTouchEnd({ changedTouches: [{ clientX: toX, clientY: 302 }], currentTarget: el });
      await new Promise((r) => setTimeout(r, 260));
      const made = closed - before;
      draw(Palette, CLOSED);
      await later(Palette, CLOSED);
      return made;
    };
    assert.equal(await across(300, 100), 1, "taken across to the left, it closes");
    assert.equal(await across(80, 290), 1, "and to the right");
    assert.equal(await across(10, 220), 0, "never from the left edge");
    assert.equal(await across(200, 182), 0, "and a short move across settles it back");
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone a preset question answered without a model offers New in the head, as a conversation does, and New goes home", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose: () => {} };
  try {
    const calls = ask([]);
    render(Palette, props);
    let tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-clear-head"), null, "home: nothing to clear");
    typed(tree, "what's open saturday?");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, [], "a quick answer asks no model");
    assert.ok(byTestId(tree, "ask-say"), "the quick answer is drawn");
    assert.ok(byTestId(tree, "ask-clear-head"), "and the head offers New over it");
    assert.equal(textOf(byTestId(tree, "ask-clear-head")), "New", "it says New (D9), and does what Clear did");
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-say"), null, "cleared: the answer goes");
    assert.ok(byTestId(tree, "ask-row-now"), "home again");
    assert.equal(byTestId(tree, "ask-clear-head"), null);
    await closes();
  } finally {
    ph.restore();
  }
});

test("on a phone a place AI goes to takes the takeover's entry: Back from there is the page AI was opened over", async () => {
  const ph = phoneWindow();
  const went = [];
  const nav = globalThis.window.CHANLY.nav;
  globalThis.window.CHANLY.nav = (to, o) => went.push([to, o]);
  try {
    ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "calendar");
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "ask-row-jump"));
    assert.deepEqual(went, [["calendar", { replace: true }]], "the entry becomes the place, not a second one");
    await closes();
    assert.deepEqual(
      ph.log,
      [["push", null, "https://app.chanlytics.com/w/studio#/today"]],
      "and nothing goes back over the place",
    );
  } finally {
    await closes();
    globalThis.window.CHANLY.nav = nav;
    ph.restore();
  }
});

test("on a desktop Ask pushes no entry of its own and focuses the field; a place it goes to is the shell's own push", async () => {
  const hist = globalThis.window.history;
  const nav = globalThis.window.CHANLY.nav;
  const log = [];
  const went = [];
  globalThis.window.history = {
    replaceState() {},
    pushState: (s, t, u) => log.push(["push", s, u]),
    back: () => log.push(["back"]),
  };
  // As constants.ts has it: CHANLY.nav is the shell's navigate, which pushes.
  globalThis.window.CHANLY.nav = (to, o) => went.push([to, o]);
  try {
    ask([]);
    // The field and the dialog are given something to focus on the first draw, before anything awaits: the focus
    // effect fires on a 30ms timer (useAskFocus), and under load the draws that follow take longer than that, so
    // something given only after them missed the focus it was there to count. The refs are the same across draws.
    let tree = render(Palette, OPEN);
    let focused = 0;
    let dialogFocused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    byTestId(tree, "ask-real").props.ref.current = {
      focus: () => {
        dialogFocused++;
      },
    };
    tree = await later(Palette, OPEN);
    await until(() => focused > 0, "the field takes focus on a desktop");
    // A focus of the dialog would be on the same 30ms timer, set on the first draw: one more 30ms cannot end before it.
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(focused, 1, "the field takes focus on a desktop");
    assert.equal(dialogFocused, 0, "not the dialog");
    const panel = byTestId(tree, "ask-real");
    assert.deepEqual(
      [panel.props.role, panel.props["aria-modal"]],
      ["complementary", undefined],
      "a panel, no takeover",
    );
    typed(tree, "calendar");
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "ask-row-jump"));
    assert.deepEqual(went, [["calendar", undefined]], "the shell's own push, never a replace");
    await closes();
    assert.deepEqual(log, [], "no entry of AI's own, and nothing taken back");
  } finally {
    await closes();
    globalThis.window.history = hist;
    globalThis.window.CHANLY.nav = nav;
  }
});

test("a desk's panel keeps the keys pressed in it, lets the shell's chords by, and closes on Esc", async () => {
  ask([]);
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  render(Palette, props);
  const tree = await later(Palette, props);
  const key = (k, mods = {}) => {
    const e = {
      key: k,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      defaultPrevented: false,
      stopped: false,
      ...mods,
    };
    e.stopPropagation = () => (e.stopped = true);
    e.preventDefault = () => (e.defaultPrevented = true);
    byTestId(tree, "ask-real").props.onKeyDown(e);
    return e;
  };
  assert.equal(key("a").stopped, true, "a letter the Inbox would take stays in the panel");
  assert.equal(key("Enter", { metaKey: true }).stopped, true, "and ⌘↵, which would send the reply box behind");
  assert.equal(key("k", { metaKey: true }).stopped, false, "⌘K goes on to the shell");
  assert.equal(closed, 0, "nothing so far closes it");
  key("Escape");
  assert.equal(closed, 1, "Esc closes it");
  await closes();
});

test("a desk's Ask closes on an Esc pressed in the page beside it: focus on a row, or on nothing yet", async () => {
  const line = await lineCounted();
  escBeside();
  assert.equal(line.closed, 1, "focus on a row in the page");
  escBeside(inPage({ tagName: "BODY" }));
  assert.equal(line.closed, 2, "the moment after F opened it, before focus reached the field (the nightly's race)");
  await closes();
});

test("what the page has open takes an Esc before a desk's AI does, one press at a time", async () => {
  const line = await lineCounted();
  escBeside(inPage(), true);
  assert.equal(line.closed, 0, "the page took it: a peek, the plan panel, the pile, a selection (spec F7)");
  escBeside(inPage({ tagName: "INPUT" }));
  assert.equal(line.closed, 0, "a field in the page keeps its own Esc");
  const found = globalThis.document.querySelector;
  globalThis.document.querySelector = () => ({});
  try {
    escBeside();
    assert.equal(line.closed, 0, "a sheet or a menu open over the page");
  } finally {
    globalThis.document.querySelector = found;
  }
  escBeside();
  assert.equal(line.closed, 1, "with all of that gone, the next Esc is AI's");
  await closes();
});

test("the bar's search line is AI's own door, not a field of the page's: empty, its Esc closes Ask", async () => {
  const line = await lineCounted();
  const barLine = inPage({ tagName: "INPUT", closest: (s) => (s === ".tb-line" ? {} : null) });
  escBeside(barLine, true);
  assert.equal(line.closed, 0, "with words in it, the first Esc empties it (its own, topbar.tsx)");
  escBeside(barLine);
  assert.equal(line.closed, 1, "with none, there is nothing of the line's to do");
  await closes();
});

test("a menu that closes itself on Esc and says nothing keeps that press from AI, gone before the window hears it", async () => {
  const line = await lineCounted();
  const found = globalThis.document.querySelector;
  let menu = {};
  globalThis.document.querySelector = () => menu;
  const shut = () => (menu = null);
  globalThis.window.addEventListener("keydown", shut);
  // Ask's own listener goes back on after every draw, so now it hears the key after the menu has gone.
  line.redraw();
  try {
    escBeside();
    assert.equal(menu, null, "the menu closed itself");
    assert.equal(line.closed, 0, "and that press was the menu's alone");
    escBeside();
    assert.equal(line.closed, 1, "the next one is AI's");
  } finally {
    globalThis.window.removeEventListener("keydown", shut);
    globalThis.document.querySelector = found;
  }
  await closes();
});

test("an Esc from the page walks Ask as one in its field does: out of Earlier first, then closed", async () => {
  const line = await lineCounted();
  cmdJ();
  line.tree = await line.again();
  escBeside();
  await line.again();
  assert.equal(line.closed, 0, "Earlier steps back to the rows");
  escBeside();
  assert.equal(line.closed, 1, "then AI closes");
  await closes();
});

test("a phone's takeover covers the page, so every Esc the window hears is still AI's", async () => {
  const mm = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({
    matches: q === "(max-width: 720px)",
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    const line = await lineCounted();
    escBeside(inPage({ tagName: "INPUT" }));
    assert.equal(line.closed, 1);
    await closes();
  } finally {
    globalThis.window.matchMedia = mm;
  }
});

test("on a touch screen wider than a phone (a tablet at 800px) no field focuses by itself: the Line opens with focus on the dialog, so no keyboard rises until a tap on the field asks for it (Ruben's rule; frame-verbs focusAsDrawn)", async () => {
  const mm = globalThis.window.matchMedia;
  // 800px wide, a finger for a pointer: no phone's width, a touch screen's pointer.
  globalThis.window.matchMedia = (q) => ({
    matches: q === "(pointer: coarse)",
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    ask([]);
    let tree = render(Palette, OPEN);
    let focused = 0;
    let dialogFocused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    byTestId(tree, "ask-real").props.ref.current = {
      focus: () => {
        dialogFocused++;
      },
    };
    tree = await later(Palette, OPEN);
    await until(() => dialogFocused > 0, "the dialog takes focus on a touch screen");
    // A focus of the field would be on the same 30ms timer, set on the first draw: one more 30ms cannot end before it.
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(focused, 0, "the field is not focused as AI opens");
    const panel = byTestId(tree, "ask-real");
    assert.deepEqual(
      [panel.props.role, panel.props["aria-modal"]],
      ["complementary", undefined],
      "no phone's takeover at this width",
    );
    // Seeded as the drawer's More and Campaigns' doors open it: a scope, or a sentence asked.
    sent("ask:seed", { about: { kind: "playbook", id: "pb1", label: "Win-back" } });
    tree = await later(Palette, OPEN);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(focused, 0, "nor as a door opens it on a scope");
  } finally {
    await closes();
    globalThis.window.matchMedia = mm;
  }
});
