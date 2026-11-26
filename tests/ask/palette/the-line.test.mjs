/**
 * The Line, Ask's one palette: at rest and asked, its turn drawn as it streams, its cards pressed and what became of
 * them read back, and the fixes N3 named.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { PROPOSAL_GATE, ROLE_PERMS } from "@chanlytics/contracts";
import {
  AskHooks,
  CLOSED,
  DUE,
  FOLLOW_UPS_EVENT,
  OPEN,
  Palette,
  TH,
  all,
  ask,
  askApi,
  askCalls,
  askColumn,
  askFollowUps,
  askPalette,
  askQueue,
  askText,
  byClass,
  byTestId,
  closes,
  cmdJ,
  draw,
  find,
  flush,
  holdAsk,
  inputOf,
  keyed,
  lastTree,
  later,
  nowOf,
  opens,
  press,
  pressOf,
  render,
  said,
  sent,
  settle,
  textOf,
  typed,
  until,
} from "./_palette.mjs";
import { bridgeHolds, heldDoors } from "../../shell/_bridge-holds.mjs";

/* ------------------------------ N3 ------------------------------ */

test("REGRESSION: a door pressed before the Line's code landed still asks: the event had nobody to hear it, and the question was gone", async () => {
  const calls = ask([TH(1)]);
  const doors = await import("../../../apps/dashboard/src/surfaces/frame-doors.ts");
  doors.askAbout({ prompt: "Make a post from this photo", about: { kind: "file", id: "f1", label: "Storefront" } });
  render(Palette, CLOSED);
  await opens();
  assert.deepEqual(calls.sent, ["Make a post from this photo"]);
  assert.deepEqual(calls.inputs[0].scope, { kind: "file", id: "f1", label: "Storefront" }, "and goes with its chip");
  await closes();
  calls.sent.length = 0;
  await opens();
  assert.deepEqual(calls.sent, [], "once");
  await closes();
});

test("REGRESSION (N3): what the shell sends as the Line opens is taken -- a seeded question fired before the palette listened", async () => {
  const calls = ask([TH(1)]);
  render(Palette, CLOSED);
  // The shell keeps the Line mounted and closed, then opens it and sends in the same moment.
  sent("ask:seed", { prompt: "Draft a reply to Rosa", mode: "compose" });
  let tree = await opens();
  assert.equal(
    inputOf(tree).props.value,
    "Draft a reply to Rosa",
    "REGRESSION: the palette opened with the words gone",
  );

  await closes();
  sent("ask:seed", { prompt: "Summarise last week for me" });
  tree = await opens();
  assert.deepEqual(calls.sent, ["Summarise last week for me"], "a question to ask is asked as the Line opens");
  assert.ok(byTestId(tree, "ask-turn"), "and its conversation is open");

  await closes();
  tree = await opens();
  assert.ok(byTestId(tree, "ask-turn"), "⌘K alone brings the conversation back: it lasts until Clear (D14)");
  await closes();
});

test("words on the Line that are a question on its way warm the model's cache (the bridge sends one in four minutes): two words or more, eight characters, reaching no page or person; a word alone, a jump and a closed Line warm nothing", async () => {
  ask([]);
  let warms = 0;
  Object.assign(askCalls(), {
    warmModel: () => {
      warms += 1;
    },
    // The jumps a few words reach, as contracts' askJump answers them: a list, empty when they reach nothing.
    jump: (q) => (q.startsWith("maria") ? [{ kind: "person", to: "clients/c-1", label: "Maria Lopez" }] : []),
  });
  render(Palette, CLOSED);
  await later(Palette, CLOSED);
  assert.equal(warms, 0, "closed: nothing is on its way");
  let tree = await opens();
  for (const words of ["inbox", "maria lopez", "how was"]) {
    typed(tree, words);
    tree = await later(Palette, OPEN);
  }
  assert.equal(warms, 0, "a word alone, two words that reach a person, and words too few to be a question");
  typed(tree, "how was the week");
  await later(Palette, OPEN);
  assert.ok(warms >= 1, "a question on its way: the bridge is asked, and sends one warm however often it is");
  await closes();
});

test("a question carries how long the Line was open before it was asked (AskTurnShape.opened_ms)", async () => {
  const calls = ask([]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how was the week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  await later(Palette, OPEN);
  assert.equal(calls.inputs.length, 1, "asked once");
  assert.ok(
    Number.isInteger(calls.inputs[0].openedMs) && calls.inputs[0].openedMs >= 0,
    `a whole number of milliseconds since the Line opened, got ${calls.inputs[0].openedMs}`,
  );
  await closes();
});

test("the page is warmed as the Line opens, once, and again when the page under it changes while it is open (D6); closed, nothing is warmed; a bridge without the warm draws as before", async () => {
  const hash = globalThis.window.location.hash;
  const warmed = [];
  // The warm goes a tick after the page is drawn, so a page just under the Line has said what it drew.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const calls = ask([]);
  // The bridge's two calls the warm needs (bridge/ask.ts): the page's context and the warm itself.
  askCalls().context = (route) => ({
    v: 1,
    surface: "today",
    route: route.param ? `${route.page}/${route.param}` : route.page,
    rows: [],
    askedAt: 1,
  });
  askCalls().warm = async (context) => {
    warmed.push(context.route);
  };
  try {
    globalThis.window.location.hash = "#/today";
    render(Palette, CLOSED);
    await later(Palette, CLOSED);
    await tick();
    assert.deepEqual(warmed, [], "closed, nothing is warmed");
    await opens();
    await tick();
    assert.deepEqual(warmed, ["today"], "opening warms the page once");
    await later(Palette, OPEN);
    await tick();
    assert.deepEqual(warmed, ["today"], "and a draw that changes nothing warms nothing more");
    globalThis.window.location.hash = "#/inbox/th-aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    await opens();
    await tick();
    assert.deepEqual(
      warmed,
      ["today", "inbox/th-aaaaaaaa-aaaa-4aaa-8aaa-000000000001"],
      "the page under the Line changed: warmed again",
    );
    await closes();
    await tick();
    assert.equal(warmed.length, 2, "closing warms nothing");
    // A warm that fails costs nothing: the Line still opens and asks.
    askCalls().warm = async () => {
      throw new Error("offline");
    };
    globalThis.window.location.hash = "#/today";
    const tree = await opens();
    assert.ok(inputOf(tree), "the Line is drawn");
    await closes();
    // The palette suite's own bridge has neither call: the Line draws, and asks, as it did.
    delete askCalls().warm;
    delete askCalls().context;
    let t = await opens();
    typed(t, "how was the week?");
    t = await later(Palette, OPEN);
    keyed(t, "Enter");
    await later(Palette, OPEN);
    assert.equal(calls.inputs.length, 1, "asked once, with no warm to call");
    await closes();
  } finally {
    globalThis.window.location.hash = hash;
  }
});

test("a seed that names a thread opens that thread, its last answer under the line", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, CLOSED);
  // Any caller may hand a conversation over as Ask opens: askAbout({ thread }) stays on the shell.
  sent("ask:seed", { thread: TH(2).id });
  const tree = await opens();
  assert.deepEqual(calls.opened, [TH(2).id], "the conversation was read");
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 2.", "and its conversation is open");
  assert.deepEqual(calls.sent, [], "nothing was asked");
  await closes();
});

test("a question asked in an open thread hands the page's context the thread it joins, as the Line holds it, so a place in the words is the last answer's item (the Phase 5 plan, D7); a new conversation hands none", async () => {
  const calls = ask([TH(1), TH(2)]);
  const seen = [];
  askCalls().context = (route, words, thread) => {
    seen.push({ words, thread });
    return { v: 1, surface: "today", route: route.page, rows: [], askedAt: 1 };
  };
  askCalls().send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "thread", id: input.threadId ?? TH(3).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.inputs.length}`, `Answer ${calls.inputs.length}.`) });
  };
  const asked = async (tree, words) => {
    typed(tree, words);
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    return later(Palette, OPEN);
  };
  try {
    render(Palette, CLOSED);
    sent("ask:seed", { thread: TH(2).id });
    let tree = await asked(await opens(), "and the second one?");
    const joined = seen.find((s) => s.words === "and the second one?");
    assert.deepEqual(
      joined.thread.map((m) => [m.role, m.text]),
      [
        ["user", "Question 2"],
        ["assistant", "The answer to Question 2."],
      ],
      "the conversation it joins: its messages before this question",
    );
    assert.equal(calls.inputs.at(-1).threadId, TH(2).id);
    press(byTestId(tree, "ask-clear-head"));
    tree = await asked(await later(Palette, OPEN), "who is new this week?");
    assert.equal(seen.find((s) => s.words === "who is new this week?").thread, null, "a new conversation: none");
  } finally {
    delete askCalls().context;
    await closes();
  }
});

test("the Line at rest: Right now is Today's queue, said once, and no preset question under it; earlier conversations are the head's Earlier -- and no key is drawn", async () => {
  bridgeHolds({ values: { today: askQueue() } });
  try {
    const calls = ask([TH(1), TH(2), TH(3), TH(4)]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    assert.equal(
      textOf(byClass(byTestId(tree, "ask-row-now"), "ask-row-label")[0]),
      "Nora needs you. Your search for personal trainers is waiting for your answer.",
    );
    // At rest the sentence says the counts, so no pill says them again (Ruben, 17 Nov 2026; the pills stand while a
    // phone's field is in use, below).
    assert.equal(byTestId(tree, "ask-pill"), null, "a thing is said once");
    assert.equal(askText("en").searchWaiting(2), "2 searches waiting", "the pill counts several the same way");
    const brief = byTestId(tree, "ask-row-brief");
    assert.equal(textOf(brief), "Brief me");
    assert.ok(
      brief.props.className.split(" ").includes("line-chip"),
      "Brief me wears the chip's look, as every press here",
    );
    assert.ok(!textOf(tree).includes("Ask about"), "no preset questions about the page (Ruben, 12 and 17 Nov 2026)");
    assert.equal(byTestId(tree, "ask-row-sug"), null, "a question from a table is no chip");
    assert.equal(byTestId(tree, "ask-row-thread"), null, "no earlier conversation stands among the rows (spec 5.2)");
    assert.ok(byTestId(tree, "ask-earlier"), "they are the head's Earlier, on a desk as on a phone");
    assert.ok(!/[↵⌘↑↓]|\bEsc\b|\bdel\b/.test(textOf(tree)), `no key is drawn (D17): ${textOf(tree)}`);
    // ↵ on the empty line runs the row it stands on: Right now's own question, answered without a model.
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, [], "a quick answer asks no model");
    assert.equal(
      textOf(byTestId(tree, "ask-say")),
      "Nora needs you. Your search for personal trainers is waiting for your answer.",
    );
    assert.deepEqual(
      all(tree, (n) => n.props?.["data-testid"] === "ask-item").map((n) => textOf(n)),
      [
        "NoraWhatsApp · waited 2h“Can I come at 3?”",
        "personal trainersLeadsMost of the first 25 are gyms, not trainers. Keep them?",
      ],
      "the person and the search are their own doors; there is no second one to the Inbox",
    );
    assert.equal(byTestId(tree, "ask-open"), null);
    await closes();
  } finally {
    bridgeHolds({ values: { today: undefined } });
  }
});

test("a follow-up AI kept that came due is the home's row after Right now, in its own words under Ready now; pressed, it asks what AI said it would ask itself, with its id, as a turn for the model and never as a quick answer", async () => {
  const calls = ask([]);
  // What Ask will ask itself is, word for word, a question the Line answers itself: pressed from the row, it still goes
  // to the model, since only the route can clear the follow-up.
  const due = [DUE("plumbers", "Who needs me right now?")];
  askCalls().followUpsDue = () => due;
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.deepEqual(
    all(tree, (n) => n.props?.role === "option").map((n) => n.props["data-testid"]),
    ["ask-row-now", "ask-row-follow"],
    "Right now, then the follow-up, and no preset question under them",
  );
  const row = byTestId(tree, "ask-row-follow");
  assert.equal(textOf(row), due[0].said, "its own line, as the member approved it");
  assert.ok(textOf(tree).includes("Ready now"), "under its label");
  assert.equal(byClass(row, "subtab-dot").length, 1, "the kit's dot, as on AI's door");
  press(row);
  await later(Palette, OPEN);
  assert.deepEqual(
    calls.inputs.map((i) => [i.text, i.following]),
    [["Who needs me right now?", { id: "plumbers" }]],
  );
  await closes();
  // None due: no row and no label.
  askCalls().followUpsDue = () => [];
  render(Palette, OPEN);
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-row-follow"), null);
  assert.ok(!textOf(tree).includes("Ready now"));
  await closes();
});

test("REGRESSION: a row is one option and holds no control of its own -- Not now on what AI noticed and a conversation's x are a pointer's, hidden from a reader, and Delete says each from the row the keys stand on (the nightly's axe, 10 Nov 2026: interactive controls must not be nested)", async () => {
  ask([TH(1), TH(2)]);
  const A = askCalls();
  const was = { noticed: A.noticed, restNotice: A.restNotice };
  const rested = [];
  A.noticed = () => ({
    key: "room_and_yes",
    says: "Thursday has room, and four people said yes to an offer.",
    ask: "Who said yes to an offer?",
  });
  A.restNotice = async (key) => void rested.push(key);
  /** Anything inside an option that a key could stand on, or that a reader would be told is a control of its own. */
  const controlsIn = (option) =>
    all(
      option,
      (n) =>
        n !== option &&
        (["button", "a", "input", "select", "textarea"].includes(n.type) ||
          n.props?.tabIndex !== undefined ||
          n.props?.role !== undefined),
    ).map((n) => n.props?.["data-testid"] ?? n.type);
  /** The line a row says its key's act in: named by id, in the list, and drawn nowhere. */
  const saidOf = (tree, option) => find(tree, (n) => n.props?.id === option.props["aria-describedby"]);
  try {
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    const options = all(tree, (n) => n.props?.role === "option");
    assert.deepEqual(
      options.slice(0, 2).map((n) => n.props["data-testid"]),
      ["ask-row-now", "ask-row-follow"],
      "Right now, then what AI noticed",
    );
    for (const o of options) assert.deepEqual(controlsIn(o), [], `${o.props["data-testid"]} holds no control`);

    const row = byTestId(tree, "ask-row-follow");
    const notNow = byTestId(row, "ask-row-rest");
    assert.deepEqual([notNow.type, notNow.props["aria-hidden"], notNow.props["data-tip"]], ["span", true, "Not now"]);
    assert.ok(notNow.props.className.split(" ").includes("line-remove"), "it is the kit's x, as a conversation's is");
    assert.equal(row.props["aria-keyshortcuts"], "Delete", "the option names its key");
    const said = saidOf(tree, row);
    assert.deepEqual(
      [said?.props.hidden, textOf(said)],
      [true, askText("en").notNowByKey],
      "and what it does, drawn nowhere",
    );

    // A pointer on the words rests it, and the row under them is not taken with it.
    const e = press(notNow);
    assert.deepEqual([rested, e.stopped], [["room_and_yes"], true]);
    // The keys: down from Right now to the row, then Delete.
    keyed(lastTree, "ArrowDown");
    settle(Palette, OPEN);
    keyed(lastTree, "Delete");
    await later(Palette, OPEN);
    assert.deepEqual(rested, ["room_and_yes", "room_and_yes"], "Delete says Not now from the row the keys stand on");

    // Earlier: every conversation wears its x the same way, and says Delete's other act.
    cmdJ();
    tree = await later(Palette, OPEN);
    const threads = all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread");
    assert.equal(threads.length, 2);
    for (const o of threads) {
      assert.deepEqual(controlsIn(o), [], "a conversation's row holds no control");
      assert.equal(o.props["aria-keyshortcuts"], "Delete");
      assert.equal(textOf(saidOf(tree, o)), askText("en").deleteByKey);
    }
    const x = byClass(threads[0], "ask-row-del")[0];
    assert.deepEqual([x.type, x.props["aria-hidden"]], ["span", true]);
    assert.ok(x.props.className.split(" ").includes("line-remove"), "the kit's x");
    await closes();
  } finally {
    Object.assign(A, was);
  }
});

test("REGRESSION (16 Nov 2026): opened while what AI noticed is read with nothing held, the home is laid out but not shown until it is in -- drawn first, its line came 0.8 s later and moved the three and every row 17 px", async () => {
  ask([]);
  const A = askCalls();
  const was = { readNotices: A.readNotices, holdsNotice: A.holdsNotice, noticed: A.noticed };
  const NOTICE = { key: "room_and_yes", says: "Thursday has room.", ask: "Who has room?" };
  let land = () => {};
  let held = false;
  A.readNotices = () => new Promise((r) => (land = () => r((held = true))));
  A.holdsNotice = () => held;
  A.noticed = () => (held ? NOTICE : null);
  const waiting = (tree) => byClass(tree, "ask-now")[0].props.className.split(" ").includes("waiting");
  try {
    render(Palette, OPEN);
    assert.ok(waiting(await later(Palette, OPEN)), "laid out, not shown, while it is read");
    land();
    const tree = await later(Palette, OPEN);
    assert.ok(!waiting(tree) && byTestId(tree, "ask-row-follow"), "shown whole once it is in, its line in its place");
    await closes();
  } finally {
    Object.assign(A, was);
  }
});

test("the tab holds the follow-ups that came due: read once the boot is in, said on the window each read; the newest read wins; one a question comes back to leaves at once; Leads or Sequences landing reads again only while one still waits; a tab coming back reads again past a minute", async () => {
  const win = new EventTarget();
  win.document = new EventTarget();
  win.document.visibilityState = "visible";
  const asked = [];
  const api = {
    followUps: () =>
      new Promise((resolve) => {
        asked.push(resolve);
      }),
  };
  let said = 0;
  win.addEventListener(FOLLOW_UPS_EVENT, () => said++);
  const held = askFollowUps(win, api);
  await until(() => asked.length === 1, "read once the boot is in");
  asked[0]({ due: [DUE("plumbers")], waiting: 1 });
  await flush();
  assert.deepEqual(
    held.followUpsDue().map((f) => f.id),
    ["plumbers"],
  );
  assert.equal(said, 1, "said once it landed");
  // One still waits: a search's round landing on Leads may have woken it.
  win.dispatchEvent(new CustomEvent("surface:leads"));
  assert.equal(asked.length, 2, "read again as Leads lands");
  asked[1]({ due: [DUE("plumbers"), DUE("dentists")], waiting: 0 });
  await flush();
  win.dispatchEvent(new CustomEvent("surface:sequences"));
  assert.equal(asked.length, 2, "none waits: nothing to wake");
  // A question comes back to one: off at once, said; one not held says nothing.
  held.cameBackTo("plumbers");
  assert.deepEqual(
    held.followUpsDue().map((f) => f.id),
    ["dentists"],
  );
  assert.equal(said, 3);
  held.cameBackTo("nobody");
  assert.equal(said, 3, "nothing left, nothing said");
  // The newest read wins: an older one that lands last says nothing.
  const older = held.readFollowUps();
  const newer = held.readFollowUps();
  asked[3]({ due: [], waiting: 0 });
  asked[2]({ due: [DUE("stale")], waiting: 0 });
  await Promise.all([older, newer]);
  assert.deepEqual(held.followUpsDue(), [], "the newer read's answer stands");
  // A read that fails keeps what was held.
  const failing = held.readFollowUps();
  asked[4](null);
  await failing;
  assert.deepEqual(held.followUpsDue(), []);
  // Back to the tab within the minute: nothing; past it, a read.
  win.document.dispatchEvent(new CustomEvent("visibilitychange"));
  assert.equal(asked.length, 5, "switching tabs is not news");
  const clock = Date.now;
  Date.now = () => clock() + 61_000;
  try {
    win.document.dispatchEvent(new CustomEvent("visibilitychange"));
  } finally {
    Date.now = clock;
  }
  assert.equal(asked.length, 6, "a tab back after a minute reads again");
  asked[5]({ due: [], waiting: 0 });
  await flush();
});

test("a follow-up of AI's come due lights AI's door: the top bar's capsule draws the kit's dot after its words while one is due, heard as each read lands", async () => {
  // The top bar, its bell and its two lines (surfaces/frame), as the frame imports them.
  const topbarParts = {
    ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/topbar.tsx")),
    ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/status-bars.tsx")),
    ...(await importSrc("apps/dashboard/src/surfaces/frame/topbar/notif-popover.tsx")),
  };
  const Topbar = (props) => topbarParts.Topbar(props);
  const was = askCalls();
  let due = [DUE("plumbers")];
  holdAsk({ ...was, followUpsDue: () => due });
  try {
    render(Topbar, { crumbs: [] });
    let tree = await later(Topbar, { crumbs: [] });
    const dot = byTestId(tree, "tb-ask-due");
    assert.ok(dot, "the dot, while one is due");
    assert.ok(dot.props.className.split(" ").includes("subtab-dot"), "the kit's mark for something new to the reader");
    assert.equal(dot.props["aria-label"], "AI has something ready for you");
    assert.ok(all(byTestId(tree, "tb-ask"), (n) => n === dot).length, "inside AI's capsule");
    due = [];
    globalThis.window.dispatchEvent(new CustomEvent(FOLLOW_UPS_EVENT));
    tree = await later(Topbar, { crumbs: [] });
    assert.equal(byTestId(tree, "tb-ask-due"), null, "gone once none is due");
  } finally {
    holdAsk(was);
  }
});

test("a question carries the column the Line draws its answer in (18 Oct 2026): an answer already drawn is measured, else the panel less the Line's 16px gutters; a phone is the takeover's own width; nothing drawn is no column; the turn's body sends it", async () => {
  const box = (width) => ({ getBoundingClientRect: () => ({ width }) });
  const winOf = (els, phone) => ({
    document: { querySelector: (sel) => els[sel] ?? null },
    matchMedia: (q) => ({ matches: phone && q === "(max-width: 720px)" }),
  });
  assert.deepEqual(
    askColumn(winOf({ ".ask-real": box(440) }, false)),
    { px: 408, phone: false },
    "a desk's docked panel",
  );
  assert.deepEqual(askColumn(winOf({ ".ask-real": box(390) }, true)), { px: 358, phone: true }, "a phone's screen");
  assert.deepEqual(
    askColumn(winOf({ '[data-testid="ask-answer"]': box(401.6), ".ask-real": box(440) }, false)),
    { px: 402, phone: false },
    "an answer drawn is the column itself",
  );
  assert.equal(askColumn(winOf({}, false)), null, "nothing drawn: no column");
  assert.equal(askColumn({}), null, "no document: no column");

  const bodies = [];
  const client = {
    raw: async (_key, opts) => {
      bodies.push(opts.body);
      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    },
  };
  const calls = askApi(client);
  await calls.send(
    { text: "Compare my channels", threadId: null, surface: "reports", column: { px: 358, phone: true } },
    () => {},
  );
  await calls.send({ text: "Compare my channels", threadId: null, surface: "reports" }, () => {});
  assert.deepEqual(
    bodies.map((b) => b.column ?? null),
    [{ px: 358, phone: true }, null],
    "sent where measured, and only then",
  );
});

test("a follow-up keeps the answer above it, in full, in the thread; New ends the conversation, which stays in Earlier", async () => {
  const calls = ask([]);
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.sent.length}`, `Answer ${calls.sent.length}.`) });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how was the week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-say")), "Answer 1.");
  assert.ok(byTestId(tree, "ask-clear-head") && byTestId(tree, "ask-copy"), "the answer offers Copy, and the head New");
  typed(tree, "and the week before?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["how was the week?", "and the week before?"]);
  const earlier = byTestId(tree, "ask-thread");
  assert.equal(all(earlier, (n) => n.props?.["data-testid"] === "ask-turn").length, 1, "the first turn stands above");
  assert.ok(textOf(earlier).includes("how was the week?") && textOf(earlier).includes("Answer 1."), "in full");
  assert.equal(textOf(byTestId(nowOf(tree), "ask-say")), "Answer 2.");
  press(byTestId(tree, "ask-clear-head"));
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-turn"), null, "home again");
  assert.ok(byTestId(tree, "ask-row-now"));
  // Nobody waits here (no queue): Right now is the sentence alone, no pill and no Brief me (spec 4.3).
  assert.equal(byTestId(tree, "ask-pill"), null);
  assert.equal(byTestId(tree, "ask-row-brief"), null, "a quiet queue is the sentence alone");
  await closes();
});

test("Esc while AI reads stops waiting: the turn says so, and what the stream sends after changes nothing; Esc again closes", async () => {
  const calls = ask([]);
  let finish = () => {};
  askCalls().send = (input, on) =>
    new Promise((res) => {
      calls.sent.push(input.text);
      on({ t: "trace", text: "Reading the inbox…" });
      finish = () => {
        on({ t: "final", message: said("late", "Too late.") });
        res();
      };
    });
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  render(Palette, props);
  let tree = await later(Palette, props);
  typed(tree, "who wrote today?");
  tree = await later(Palette, props);
  keyed(tree, "Enter");
  tree = await later(Palette, props);
  assert.ok(textOf(byTestId(tree, "ask-reading")).includes("Reading the inbox…"), "reading, in the tools' words");
  assert.ok(byTestId(tree, "ask-stop"), "the line offers Stop while AI reads");
  keyed(tree, "Escape");
  await later(Palette, props);
  assert.equal(closed, 0, "the first Esc stops the answer, and the Line stays");
  finish();
  tree = await later(Palette, props);
  assert.ok(textOf(byTestId(tree, "ask-say")).startsWith("Stopped before the answer was finished."), textOf(tree));
  assert.ok(!textOf(tree).includes("Too late."), "the late answer changed nothing");
  keyed(tree, "Escape");
  assert.equal(closed, 1, "then Esc closes");
  await closes();
});

test("REGRESSION: a turn left behind writes nothing -- the palette ignored only the last one stopped, so a first stopped question's late answer landed as the latest", async () => {
  const calls = ask([]);
  const finish = {};
  askCalls().send = (input, on) =>
    new Promise((res) => {
      calls.sent.push(input.text);
      on({ t: "trace", text: `Reading for ${input.text}…` });
      finish[input.text] = () => {
        on({ t: "thread", id: TH(7).id, title: input.text });
        on({ t: "final", message: said(`late-${input.text}`, `Late answer to ${input.text}.`) });
        res();
      };
    });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  for (const q of ["first question", "second question"]) {
    typed(tree, q);
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    keyed(tree, "Escape");
    tree = await later(Palette, OPEN);
  }
  assert.deepEqual(calls.sent, ["first question", "second question"]);
  finish["first question"]();
  finish["second question"]();
  tree = await later(Palette, OPEN);
  assert.ok(!textOf(tree).includes("Late answer"), `a stopped turn's answer changed the line: ${textOf(tree)}`);
  assert.ok(
    textOf(byTestId(tree, "ask-say")).startsWith("Stopped before the answer was finished."),
    "the line still says it stopped",
  );
  await closes();
});

test("Stop keeps what the Say had written under the words that say it stopped, as the thread will keep it, and lets go of the turn's request; the reads give way to the Say once it begins", async () => {
  ask([]);
  let input = null;
  let say = () => {};
  askCalls().send = (sent, on) =>
    new Promise((res) => {
      input = sent;
      on({ t: "thread", id: TH(7).id, title: sent.text });
      on({ t: "trace", text: "Reading the inbox…" });
      say = () => on({ t: "say", headline: "Three people wrote this week.", detail: "Rosa asked about" });
      sent.signal.addEventListener("abort", () => res(), { once: true });
    });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "who wrote this week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-reading")), "Reading the inbox…", "what it reads, until the answer begins");
  say();
  tree = await later(Palette, OPEN);
  assert.equal(
    byTestId(tree, "ask-reading"),
    null,
    "once the answer writes itself, its words stand in the reads' place",
  );
  assert.ok(textOf(byTestId(tree, "ask-say")).startsWith("Three people wrote this week."));
  assert.equal(input.signal.aborted, false);
  keyed(tree, "Escape");
  tree = await later(Palette, OPEN);
  assert.equal(input.signal.aborted, true, "the turn's request is let go of: the server stops it");
  assert.equal(
    textOf(byTestId(tree, "ask-say")),
    "Stopped before the answer was finished.Three people wrote this week. Rosa asked about",
    "what was written stays, under the words that say it stopped",
  );
  assert.equal(byTestId(tree, "ask-reading"), null, "nothing reads on");
  await closes();
});

test("REGRESSION: a Stop before the turn's thread is named keeps the conversation on that thread once the name comes -- the next question opened a second thread for the same conversation", async () => {
  const calls = ask([]);
  const turns = [];
  askCalls().send = (sent, on) =>
    new Promise((res) => {
      calls.sent.push(sent.text);
      turns.push({ sent, on, res });
    });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "summarize every conversation");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  keyed(tree, "Escape");
  await later(Palette, OPEN);
  // The bridge hands the name on after the Stop (ask/api.ts send), and lets go of the request then.
  turns[0].on({ t: "thread", id: TH(7).id, title: "summarize every conversation" });
  turns[0].res();
  tree = await later(Palette, OPEN);
  typed(tree, "never mind, how many calls this week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["summarize every conversation", "never mind, how many calls this week?"]);
  assert.equal(turns[1].sent.threadId, TH(7).id, "the next question carries on in the stopped turn's conversation");
  turns[1].res();
  await closes();
});

test("REGRESSION: a thread stored question, question, answer, answer pairs each answer with its own question -- a stopped turn saved after the next question showed the second question answered by the stopped one", () => {
  const { turns } = askPalette(globalThis.window, globalThis.localStorage);
  const m = (id, role) => ({ id, role });
  const pairs = (rows) => turns(rows).map((tn) => [tn.q?.id ?? null, tn.a?.id ?? null]);
  assert.deepEqual(pairs([m("q1", "user"), m("q2", "user"), m("a1", "assistant"), m("a2", "assistant")]), [
    ["q1", "a1"],
    ["q2", "a2"],
  ]);
  assert.deepEqual(
    pairs([m("q1", "user"), m("a1", "assistant"), m("q2", "user"), m("a2", "assistant")]),
    [
      ["q1", "a1"],
      ["q2", "a2"],
    ],
    "an ordinary conversation as it always paired",
  );
  assert.deepEqual(
    pairs([m("q1", "user"), m("q2", "user"), m("a2", "assistant")]),
    [
      ["q1", null],
      ["q2", "a2"],
    ],
    "a question whose turn never landed stands unanswered; the answer is the newer question's",
  );
  assert.deepEqual(pairs([m("q1", "user")]), [["q1", null]], "a question on its way");
  assert.deepEqual(pairs([m("a0", "assistant"), m("q1", "user"), m("a1", "assistant"), m("a1b", "assistant")]), [
    [null, "a0"],
    ["q1", "a1"],
    [null, "a1b"],
  ]);
});

test("the desk field takes lines: Shift and Enter breaks one, Enter asks the words with their lines, and while it holds several lines the arrows move in it, not over the rows; the dialog is named in the Line's language", async () => {
  const calls = ask([]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.equal(inputOf(tree).type, "textarea", "a field that grows, not one line");
  typed(tree, "Draft a reply to Ana:\nthanks for waiting");
  tree = await later(Palette, OPEN);
  const shifted = { ...pressOf("Enter"), shiftKey: true };
  inputOf(tree).props.onKeyDown(shifted);
  assert.equal(shifted.prevented, false, "Shift and Enter is the field's: a new line");
  for (const k of ["ArrowDown", "ArrowUp"]) {
    const arrow = pressOf(k);
    inputOf(tree).props.onKeyDown(arrow);
    assert.equal(arrow.prevented, false, `${k} moves the caret between the lines`);
  }
  await later(Palette, OPEN);
  assert.deepEqual(calls.sent, [], "nothing asked yet");
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["Draft a reply to Ana:\nthanks for waiting"], "asked with its lines");
  assert.equal(byTestId(tree, "ask-real").props["aria-label"], "Ask Chanlytics");
  await closes();

  ask([]);
  render(Palette, OPEN);
  tree = await later(Palette, OPEN);
  typed(tree, "¿Quién me escribió hoy?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-real").props["aria-label"], "Pregunta a Chanlytics", "the dialog's name in Spanish");
  assert.equal(inputOf(tree).props["aria-label"], "Pregunta a Chanlytics");
  await closes();
});

test("REGRESSION: a card sent once says Sent wherever it is drawn again -- an earlier turn drew it fresh and offered Send a second time", async () => {
  const calls = ask([]);
  const committed = [];
  const MSG = "cccccccc-cccc-4ccc-8ccc-000000000001";
  Object.assign(askCalls(), {
    commit: async (p) => {
      committed.push(p.id);
      return { ok: true, receipt: "Sent to Nora", undo: null };
    },
    outcome: async () => true,
    undoOpen: () => false,
    editReply() {},
    send: async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(8).id, title: input.text });
      const card = {
        id: "p1",
        kind: "reply",
        needs: "operator",
        title: "Reply to Nora",
        summary: "We're running 15 minutes late.",
        payload: { conversation_id: "c1" },
        undo: null,
      };
      on({
        t: "final",
        message:
          calls.sent.length === 1
            ? { ...said(MSG, "Here is a reply to send."), proposals: [card] }
            : said("m-2", "Tomorrow is quiet."),
      });
    },
  });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "tell nora we're late");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-card-approve"));
  tree = await later(Palette, OPEN);
  assert.deepEqual(committed, ["p1"]);
  assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("Sent to Nora"));
  typed(tree, "and tomorrow?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  const earlier = byTestId(tree, "ask-thread");
  assert.equal(byTestId(earlier, "ask-card-approve"), null, "REGRESSION: the earlier turn offered Send again");
  assert.ok(textOf(earlier).includes("Sent to Nora"), "the earlier turn's card says what happened");
  await closes();
});

test("a card approved records what its commit made with its outcome, so a plan's made is read back after a reload; one that made nothing records null", async () => {
  const calls = ask([]);
  const recorded = [];
  const MSG = "cccccccc-cccc-4ccc-8ccc-000000000009";
  const made = { kind: "message", id: "77777777-7777-4777-8777-000000000001" };
  Object.assign(askCalls(), {
    commit: async (p) => ({ ok: true, receipt: "Filed", undo: null, made: p.id === "p1" ? made : null }),
    outcome: async (messageId, proposalId, o) => {
      recorded.push([messageId, proposalId, o.state, o.made]);
      return true;
    },
    undoOpen: () => false,
    editReply() {},
    send: async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(9).id, title: input.text });
      const card = (id) => ({
        id,
        kind: "message",
        needs: "operator",
        title: `Message ${id}`,
        summary: "A message for the Library.",
        payload: { name: "offer" },
        undo: null,
      });
      on({ t: "final", message: { ...said(MSG, "Two cards."), proposals: [card("p1"), card("p2")] } });
    },
  });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "write the offer");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-card-approve"));
  tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-card-approve"));
  await later(Palette, OPEN);
  assert.deepEqual(recorded, [
    [MSG, "p1", "done", made],
    [MSG, "p2", "done", null],
  ]);
  await closes();
});

test("a card's press is gated by the shell's rule: a role its gate refuses reads why in its place, and nothing commits; a role it lets commits (D8)", async () => {
  const calls = ask([]);
  const committed = [];
  const MSG = "cccccccc-cccc-4ccc-8ccc-000000000002";
  const was = { store: globalThis.window.ST_STORE, gate: globalThis.window.PROPOSAL_GATE };
  let role = "operator";
  // As the shell's are: the gate each kind checks (the bridge publishes contracts' PROPOSAL_GATE) and the member's role.
  globalThis.window.PROPOSAL_GATE = PROPOSAL_GATE;
  bridgeHolds({ parts: { roles: { can: (a) => !!(ROLE_PERMS[role] || {})[a], myRole: () => role } } });
  // An invitation made before an operator was refused one (a thread read back): its gate is `team`, an owner's.
  const card = {
    id: "p1",
    kind: "invite",
    needs: "owner",
    title: "Invite ada@example.com",
    summary: "As viewer",
    payload: { email: "ada@example.com", role: "viewer" },
    undo: null,
  };
  Object.assign(askCalls(), {
    commit: async (p) => {
      committed.push(p.id);
      return { ok: true, receipt: "Invited ada@example.com as viewer", undo: null };
    },
    outcome: async () => true,
    undoOpen: () => false,
    editReply() {},
    send: async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(9).id, title: input.text });
      on({ t: "final", message: { ...said(MSG, "Here is the invitation."), proposals: [card] } });
    },
  });
  try {
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "invite ada as a viewer");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.equal(
      byTestId(tree, "ask-card-approve"),
      null,
      "nothing to press: a disabled button no finger reaches is gone",
    );
    assert.equal(
      textOf(byTestId(tree, "ask-card-cant")),
      "Only an owner can approve this card.",
      "says why, in its place",
    );
    assert.deepEqual(committed, []);
    role = "owner";
    tree = draw(Palette, OPEN);
    let approve = byTestId(tree, "ask-card-approve");
    assert.equal(approve.props["aria-disabled"], undefined, "an owner's Approve is a plain button");
    press(approve);
    tree = await later(Palette, OPEN);
    assert.deepEqual(committed, ["p1"]);
    assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("Invited ada@example.com as viewer"));
  } finally {
    bridgeHolds({ parts: { roles: was.store } });
    globalThis.window.PROPOSAL_GATE = was.gate;
  }
  await closes();
});

test("open, show or see: the Line goes there as the answer lands, and the place is offered once", async () => {
  const calls = ask([]);
  const went = [];
  const chanly = heldDoors();
  bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
  const CV = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(6).id, title: input.text });
    on({
      t: "final",
      message: {
        ...said("m-open", "Opening the 3:34 AM call."),
        citations: [{ kind: "call", id: CV, label: "3:34 AM call", to: `conversations/cv-${CV}` }],
        navigate: { to: `conversations/cv-${CV}`, label: "Open", now: true },
      },
    });
  };
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  try {
    render(Palette, props);
    let tree = await later(Palette, props);
    typed(tree, "open the transcript of the most recent call");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["open the transcript of the most recent call"]);
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-item").length, 1, "the call is its own door");
    assert.equal(byTestId(tree, "ask-open"), null, "and an Open to the same call is not drawn beside it");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(went, [`conversations/cv-${CV}`], "the page went there as the answer landed");
    assert.equal(closed, 0, "and on a desk Ask stays open beside it (Ruben, 16 Oct 2026)");
  } finally {
    bridgeHolds({ doors: chanly });
  }
  await closes();
});

test("a turn since the Line: Say is drawn as it is written, the headline then the detail, Show and Do wait for the final message, and its answer's Open is followed though one door draws the call as its item", async () => {
  const calls = ask([]);
  const went = [];
  const chanly = heldDoors();
  bridgeHolds({ doors: { navigate: (to) => went.push(to) } });
  const CV = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
  const call = { kind: "call", id: CV, label: "Nora", to: `conversations/cv-${CV}`, door: true };
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Nora has waited longest.", detail: "She called at 3:34 AM." },
    show: {
      figures: [],
      items: [{ title: "Nora", meta: "Phone", line: "Asked for a call back.", source: call }],
      breakdown: null,
    },
    do: { open: { to: call.to, label: "Open the call", now: true }, next: [] },
    language: "en",
  };
  let land = () => {};
  const landed = new Promise((r) => (land = r));
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(7).id, title: input.text });
    on({ t: "say", headline: "Nora has waited", detail: "" });
    on({ t: "say", headline: "Nora has waited longest.", detail: "She called" });
    await landed;
    on({ t: "final", message: { ...said("m-v2", "Nora has waited longest. She called at 3:34 AM."), answer } });
  };
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  try {
    render(Palette, props);
    let tree = await later(Palette, props);
    typed(tree, "who has waited longest?");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    const say = byTestId(tree, "ask-say");
    assert.deepEqual(
      [textOf(byClass(say, "ask-headline")[0]), textOf(byClass(say, "ask-detail")[0])],
      ["Nora has waited longest.", "She called"],
      "the Say written so far replaces what was drawn",
    );
    assert.equal(byClass(say, "ask-cursor").length, 1, "one cursor, after the last word written");
    assert.equal(byTestId(tree, "ask-item"), null, "Show waits for the final message");
    land();
    tree = await later(Palette, props);
    assert.deepEqual(
      [textOf(byClass(tree, "ask-headline")[0]), textOf(byClass(tree, "ask-detail")[0])],
      ["Nora has waited longest.", "She called at 3:34 AM."],
    );
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-item").length, 1, "the call is its own door");
    assert.equal(byTestId(tree, "ask-open"), null, "so its Open is not drawn beside it");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(went, [`conversations/cv-${CV}`], "yet the Open they asked for is followed as the answer lands");
    assert.equal(closed, 0, "beside Ask, which stays open on a desk");
  } finally {
    bridgeHolds({ doors: chanly });
  }
  await closes();
});

test("the answer on the rail: figures as chips, items with a kind mark, one Open button and chips", async () => {
  const calls = ask([]);
  const final = {
    id: "m-r",
    role: "assistant",
    atMs: Date.now(),
    failed: false,
    citations: [],
    followups: [],
    proposals: [],
    text: "6 of 16 went unanswered.",
    answer: {
      v: 2,
      form: "structured",
      language: "en",
      say: { headline: "6 of 16 went unanswered.", detail: "Mostly after hours." },
      show: {
        figures: [
          {
            value: "5",
            label: "needed you",
            note: "up from 1",
            source: { kind: "page", id: "reports", label: "Reports, past 7 days", to: "reports", door: true },
          },
          { value: "20s", label: "median reply", note: "stayed fast", source: null },
        ],
        items: [
          {
            title: "Nora",
            meta: "WhatsApp · 2h",
            line: "Can I come at 3?",
            source: { kind: "thread", id: "c1", label: "Nora", to: "inbox/th-c1", door: true },
          },
        ],
        breakdown: null,
      },
      do: {
        open: { to: "reports", label: "Open the week in Reports", now: false },
        next: ["What caused it?", "Who still needs me?"],
      },
    },
  };
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(1).id, title: input.text });
    on({ t: "final", message: final });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how did the week go?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["how did the week go?"]);
  // Figures are chips (D1 of the answers canvas): Open already offers Reports, so each is plain words with where it came from.
  const tiles = all(tree, (n) => n.props?.["data-testid"] === "ask-tile");
  assert.equal(tiles.length, 2);
  assert.match(tiles[0].props["data-tip"], /From Reports, past 7 days/);
  assert.equal(tiles[1].props["data-tip"], undefined, "a figure with no source is words");
  assert.ok(byTestId(tree, "ask-item-mark"), "a row carries its kind");
  const open = byTestId(tree, "ask-open");
  assert.ok(open.props.className.split(" ").includes("btn"), "Open is the kit's button");
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-next").map((n) =>
      n.props.className.split(" ").includes("line-chip"),
    ),
    [true, true],
  );
  // The reports door is offered once: the figure's chip is no door beside Open (oneDoor), and the keys walk item, Open, next, next.
  keyed(tree, "ArrowDown");
  keyed(tree, "ArrowDown");
  keyed(tree, "ArrowDown");
  tree = await later(Palette, OPEN);
  assert.ok(
    all(tree, (n) => n.props?.["data-testid"] === "ask-next")[0]
      .props.className.split(" ")
      .includes("sel"),
  );
  await closes();
});

test("a list they asked for is a real list, first in Show: bullets and lines a ul, steps an ol, an entry a li; with no entries, numbers number the rows in their marks", async () => {
  const nora = {
    title: "Nora",
    meta: "WhatsApp · 2h",
    line: "Can I come at 3?",
    source: { kind: "thread", id: "c1", label: "Nora", to: "inbox/th-c1", door: true },
  };
  const sam = { ...nora, title: "Sam", source: { ...nora.source, id: "c2", label: "Sam", to: "inbox/th-c2" } };
  /** The Line after one turn whose final message carries this answer's show, and the words Copy and Read take. */
  const drawn = async (show) => {
    const calls = ask([]);
    const answer = {
      v: 2,
      form: "structured",
      language: "en",
      say: { headline: "Three rules.", detail: "" },
      show: { figures: [], items: [], breakdown: null, ...show },
      do: { open: null, next: [] },
    };
    const final = {
      id: "m-l",
      role: "assistant",
      atMs: Date.now(),
      failed: false,
      citations: [],
      followups: [],
      proposals: [],
      text: "Three rules.",
      answer,
    };
    askCalls().send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(1).id, title: input.text });
      on({ t: "final", message: final });
    };
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "what will AI never do, in bullets?");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    return tree;
  };
  const listOf = (tree) => byTestId(tree, "ask-list");
  const entries = (list) => all(list, (n) => n.type === "li").map(textOf);

  let tree = await drawn({
    items: [nora],
    list: { style: "bullets", entries: ["Quote a price", "Confirm a booking"] },
  });
  let list = listOf(tree);
  assert.equal(list.type, "ul");
  assert.equal(list.props.className, "ask-list bullets");
  assert.deepEqual(entries(list), ["Quote a price", "Confirm a booking"]);
  const show = find(tree, (n) => n.props?.className === "ask-show");
  assert.deepEqual(
    all(show, (n) => ["ask-list", "ask-item"].includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]),
    ["ask-list", "ask-item"],
    "the list comes first in Show: it is what they asked for",
  );

  tree = await drawn({ list: { style: "numbers", entries: ["Open Settings.", "Paste the link."] } });
  list = listOf(tree);
  assert.equal(list.type, "ol", "steps are numbered by the list itself");
  assert.deepEqual(entries(list), ["Open Settings.", "Paste the link."]);

  tree = await drawn({ list: { style: "lines", entries: ["thanks", "for", "coming"] } });
  assert.equal(listOf(tree).props.className, "ask-list lines");

  // A numbered list of rows: the items, each numbered in its mark where its kind's glyph stood.
  tree = await drawn({ items: [nora, sam], list: { style: "numbers", entries: [] } });
  assert.equal(listOf(tree), null, "no entries draw no list");
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "ask-item-mark").map(textOf), ["1", "2"]);
  // Bullets with no entries leave the rows as they are, marked by their kind.
  tree = await drawn({ items: [nora, sam], list: { style: "bullets", entries: [] } });
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-item-mark").map(textOf),
    ["", ""],
    "a kind's glyph, no number",
  );
  // An answer stored before the list part has none, and draws as it always did.
  tree = await drawn({ items: [nora] });
  assert.equal(listOf(tree), null);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-item").length, 1);
});

test("the Line takes back a Say the server set aside and shows the reads again; a later row to a place an earlier one opens is drawn as a row, never a second door", async () => {
  const calls = ask([]);
  let land = () => {};
  const landed = new Promise((r) => (land = r));
  const day = (title) => ({
    title,
    meta: "",
    line: "",
    source: { kind: "page", id: "calendar", label: "Calendar", to: "calendar", door: true },
  });
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Two visits tomorrow.", detail: "" },
    show: { figures: [], items: [day("10:00 visit"), day("2:00 visit")], breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  };
  askCalls().send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(8).id, title: input.text });
    on({ t: "say", headline: "Nothing is booked tomorrow.", detail: "" });
    on({ t: "say", headline: "", detail: "" });
    on({ t: "trace", text: "Reading the calendar…" });
    await landed;
    on({ t: "final", message: { ...said("m-day", "Two visits tomorrow."), answer } });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "what does tomorrow look like?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(byClass(tree, "ask-headline").length, 0, "the Say taken back is not drawn");
  assert.ok(textOf(byTestId(tree, "ask-reading")).includes("Reading the calendar…"), "the read is shown again");
  assert.ok(byTestId(tree, "ask-trace"), "the body is the question again");
  land();
  tree = await later(Palette, OPEN);
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-item").map((n) => [n.type, textOf(n)]),
    [
      ["button", "10:00 visit"],
      ["div", "2:00 visit"],
    ],
  );
  await closes();
});

test("Space held on an empty line talks; a tap does nothing; after words, Space is a space", async () => {
  const started = [];
  const talk = { start: () => started.push("start"), stop: () => started.push("stop") };
  let hold = null;
  let empty = true;
  const Probe = () => {
    hold = AskHooks.useHoldSpace({ empty: () => empty, talk });
    return null;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  render(Probe, {});
  const down = pressOf(" ");
  assert.equal(hold.onKeyDown(down), true);
  assert.equal(down.prevented, true, "an empty line takes no leading space");
  await wait(340);
  assert.deepEqual(started, ["start"], "held: listening");
  assert.equal(hold.onKeyDown(pressOf(" ")), true, "the key's repeats while held are swallowed");
  assert.equal(hold.onKeyUp(pressOf(" ")), true);
  assert.deepEqual(started, ["start", "stop"], "let go: it asks");

  render(Probe, {});
  hold.onKeyDown(pressOf(" "));
  hold.onKeyUp(pressOf(" "));
  await wait(340);
  assert.deepEqual(started, ["start", "stop"], "a tap started nothing");

  empty = false;
  render(Probe, {});
  const typing = pressOf(" ");
  assert.equal(hold.onKeyDown(typing), false);
  assert.equal(typing.prevented, false, "a space between words is typed");
});
