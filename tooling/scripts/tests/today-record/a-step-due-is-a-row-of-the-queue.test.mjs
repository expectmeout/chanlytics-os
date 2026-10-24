/**
 * A person's due next step is a row of Today's queue (decision 0007, 0047; D1-step-today and O2a of the wiring plan, task 1.3).
 *
 * Decision 0007 promised "Today: the steps due at the head of the day panel, three at most". #1357 dropped the day pane (Ruben's
 * call, canvas E3) without re-homing the steps, and #1367 retired the Classic look that still drew them: an overdue follow-up was
 * found by opening People, never by opening Today. The pane stays dropped. The steps come back as a row type in the queue's own
 * grammar: the person and the step's words, the step's day, the person opened by the row, and Done, the verb the Inbox's thread
 * header already has. Three at most, the oldest first, then one row opening People's Steps due for the rest.
 *
 * Run on the contracts (withSteps over the queue toTodayVM built), on the queue drawn on the stub React with the verb it presses,
 * and on the real People surface for what makes the rows follow a step done anywhere.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NOTE_WORDS, isPersonRow, todaySteps, withSteps, zoneDayKey, clockTime } from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  quiet,
  redrawWanted,
} from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";
import { NOW, ZONE, handoffDay, peopleWithSteps } from "./_world.mjs";

const went = [];
const flashes = [];
const opened = [];
installLegacyReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate: (to) => went.push(to),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
const W = globalThis.window;
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
// The seam's own signal, from the module the TSX reads it through: a surface's rows landed.
const { surfaceMoved: surfaceLanded } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");

const nowMs = NOW.getTime();
/** Six steps are due (Di, Hal, Ana, Gus, Cy, Ben); Eli's is ahead and Flo has none. */
const SIX = () =>
  peopleWithSteps([
    ["a", "Ana", -3],
    ["b", "Ben", 0],
    ["c", "Cy", -1],
    ["d", "Di", -5, "Maria"],
    ["e", "Eli", 2],
    ["f", "Flo", null],
    ["g", "Gus", -2],
    ["h", "Hal", -4],
  ]);

/* ------------------------------------------ the rows, in contracts ------------------------------------------ */

test("the steps due are rows of the queue's own shape: the person, the step's words and day, Done; oldest first, three at most, then one row for the rest", () => {
  const vm = handoffDay();
  const steps = todaySteps(SIX(), nowMs, ZONE);
  assert.equal(steps.count, 6, "how many are due in all, for the row that opens them");
  const rows = withSteps(vm.queue.rows, steps);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["handoff", "step", "step", "step", "steps"],
    "the person waiting first, then the steps, then the one row for the rest",
  );
  const stepRows = rows.filter((r) => r.kind === "step");
  assert.deepEqual(
    stepRows.map((r) => r.who),
    ["Di", "Hal", "Ana"],
    "the oldest day first, three at most",
  );
  const [di] = stepRows;
  const want = steps.items[0];
  assert.deepEqual(
    {
      sentence: di.sentence,
      quoted: di.quoted,
      channel: di.channel,
      when: di.when,
      status: di.status,
      initials: di.initials,
      cta: di.cta,
      step: di.step,
      conversationId: di.conversationId,
      callId: di.callId,
      also: di.also,
    },
    {
      sentence: "Call Di",
      quoted: false,
      channel: "Next step",
      when: "",
      status: [want.when, "For Maria"],
      initials: "DI",
      cta: { label: NOTE_WORDS.done, to: "clients/d" },
      // Whom it is for rides with it: Need you's Not now moves its day and leaves it Maria's (decision 0071).
      step: { person_id: "d", note_id: "s-d", deal_id: null, for_user_id: "u-Maria" },
      conversationId: null,
      callId: null,
      also: null,
    },
    "the step's own words and day, whose it is, Done as the verb, the person as the door",
  );
  assert.match(want.when, /^Overdue since /, "the day is steps.ts's own sentence, read back");
  const rest = rows.at(-1);
  assert.equal(rest.who, "3 more steps due");
  assert.equal(rest.initials, "+3");
  assert.deepEqual(rest.cta, { label: "Open", to: "clients/seg:steps_due" }, "People's Steps due list");
  assert.ok(rest.sentence.length > 0 && rest.status.length > 0, "a sentence and a state line, like every row");
  // A step is the team's to-do, not a person waiting: the brief's names, the head's count and the Inbox's foot do not take it.
  assert.deepEqual(
    rows.map(isPersonRow),
    [true, false, false, false, false],
    "only the handoff is a person waiting on one",
  );
  // The queue the brief built is as it was: the widget, Ask and the away card read it, and none of them takes a step for a person.
  assert.deepEqual(
    vm.queue.rows.map((r) => r.kind),
    ["handoff"],
  );
});

test("one more step is 'one more step due', no step ahead is a row, and nothing due is no row at all", () => {
  const vm = handoffDay();
  const four = withSteps(
    vm.queue.rows,
    todaySteps(
      peopleWithSteps([
        ["a", "Ana", -3],
        ["b", "Ben", 0],
        ["c", "Cy", -1],
        ["d", "Di", -5],
        ["e", "Eli", 2],
      ]),
      nowMs,
      ZONE,
    ),
  );
  assert.equal(four.at(-1).who, "1 more step due");
  assert.equal(four.at(-1).initials, "+1");
  const three = withSteps(
    vm.queue.rows,
    todaySteps(
      peopleWithSteps([
        ["a", "Ana", -3],
        ["b", "Ben", 0],
        ["c", "Cy", -1],
      ]),
      nowMs,
      ZONE,
    ),
  );
  assert.deepEqual(
    three.map((r) => r.kind),
    ["handoff", "step", "step", "step"],
    "three due is three rows and no line for the rest",
  );
  const none = peopleWithSteps([
    ["e", "Eli", 2],
    ["f", "Flo", null],
  ]);
  assert.equal(todaySteps(none, nowMs, ZONE), null, "nothing due: no block");
  assert.deepEqual(withSteps(vm.queue.rows, null), vm.queue.rows, "no steps, the queue as it was");
  assert.deepEqual(withSteps(vm.queue.rows, todaySteps(none, nowMs, ZONE)), vm.queue.rows);
});

test("the steps sit after everyone waiting on a person and before a call worth a listen", () => {
  const [handoff] = handoffDay().queue.rows;
  const call = { ...handoff, id: "q-c-1", kind: "call", conversationId: null, callId: "k1", waitedMs: -Infinity };
  const rows = withSteps(
    [handoff, call],
    todaySteps(
      peopleWithSteps([
        ["a", "Ana", -3],
        ["d", "Di", -5],
      ]),
      nowMs,
      ZONE,
    ),
  );
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["handoff", "step", "step", "call"],
  );
  // A queue of calls alone: the steps come first, nothing waits on a person.
  assert.deepEqual(
    withSteps([call], todaySteps(peopleWithSteps([["a", "Ana", -3]]), nowMs, ZONE)).map((r) => r.kind),
    ["step", "call"],
  );
});

/* ----------------------------------------------- the queue, drawn ----------------------------------------------- */

const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const draw = () => {
  fresh();
  return W.React.createElement(AgentCommand, {});
};
const queueOf = (tree) => byTestId(tree, "today-queue");
const stepRowsOf = (tree) => all(queueOf(tree), (n) => n.props?.["data-testid"] === "queue-step");
const whoOf = (row) => textOf(find(row, (n) => classes(n).includes("cl-attn-who")));
const doneCalls = [];
let doneAnswer;
const clear = () => {
  went.length = 0;
  flashes.length = 0;
  opened.length = 0;
  doneCalls.length = 0;
  doneAnswer = async () => ({ ok: true });
  W.__PEOPLE = { rows: SIX(), fetchedAt: nowMs };
  W.__personNotes = {
    done: (...args) => (doneCalls.push(args), doneAnswer()),
    words: NOTE_WORDS,
  };
  W.openStepSheet = (ask) => opened.push(ask);
  setSurfaceValue("today", handoffDay());
};
after(() => {
  delete W.__PEOPLE;
  delete W.__personNotes;
  delete W.openStepSheet;
  setSurfaceValue("today", undefined);
});

test("Today's queue draws the steps due in the row every person wears: the row opens the person, Done is its one verb", async () => {
  clear();
  const tree = draw();
  const rows = stepRowsOf(tree);
  assert.deepEqual(rows.map(whoOf), ["Di", "Hal", "Ana"], "three, the oldest first, under the person waiting");
  assert.equal(
    all(queueOf(tree), (n) => n.props?.["data-testid"] === "queue-handoff").length,
    1,
    "the person waiting is still the first row",
  );
  const di = rows[0];
  const steps = todaySteps(SIX(), nowMs, ZONE);
  const said = textOf(di);
  assert.ok(said.includes("Call Di"), said);
  assert.ok(said.includes(steps.items[0].when) && said.includes("For Maria"), said);
  assert.equal(
    textOf(find(di, (n) => classes(n).includes("cl-attn-meta"))),
    "Next step",
    "the kind, with no comma left hanging",
  );
  assert.equal(buttons(di, "Done").length, 1, "Done is the row's verb");
  assert.equal(
    buttons(di, "Done")[0].props["aria-label"],
    NOTE_WORDS.markDone("Call Di"),
    "several rows say Done: a reader hears whose, as the thread header's does",
  );
  assert.equal(
    all(di, (n) => classes(n).includes("cl-attn-cta")).length,
    0,
    "its verb is the row's work's (decision 0071), beside Not now, which moves the step's day",
  );
  // The row opens the person: its words do, since the row holds presses of its own.
  find(di, (n) => classes(n).includes("cl-attn-body")).props.onClick();
  assert.equal(went.at(-1), "clients/d");
  // The head says them in its sub-line; its number is who is waiting on a person, as Ask, the Inbox's badge and the phone say it:
  // a step is the team's own to-do and nobody waiting.
  assert.match(textOf(find(queueOf(tree), (n) => classes(n).includes("tq-sub"))), /1 person · 6 steps due/);
  assert.equal(textOf(byTestId(queueOf(tree), "today-queue-count")), "1", "the one person waiting, and no step");
  // The card is four rows: the row for the rest is cut with the three steps it stands for, and the foot counts them.
  assert.equal(byTestId(queueOf(tree), "queue-steps"), null);
  assert.ok(textOf(find(queueOf(tree), (n) => classes(n).includes("tq-foot"))).includes("3 steps due in People"));
});

test("with room on the card, the rest is one row: how many more, and a door to People's Steps due", () => {
  clear();
  const vm = handoffDay();
  vm.queue.rows = [];
  setSurfaceValue("today", vm);
  const tree = draw();
  assert.deepEqual(stepRowsOf(tree).map(whoOf), ["Di", "Hal", "Ana"]);
  const more = byTestId(queueOf(tree), "queue-steps");
  assert.ok(textOf(more).includes("3 more steps due"), textOf(more));
  more.props.onClick();
  assert.equal(went.at(-1), "clients/seg:steps_due");
  went.length = 0;
  press(buttons(more, "Open")[0]);
  assert.deepEqual(went, ["clients/seg:steps_due"], "and its button goes there too");
  assert.ok(
    textOf(find(queueOf(tree), (n) => classes(n).includes("tq-foot"))).includes("Nothing more in the Inbox"),
    "the card holds every step: the foot cuts nothing",
  );
});

test("Done is the Inbox header's verb, press for press: the step's note, said done, answered in the one step toast with its Undo; a second press while the first is on its way waits", async () => {
  clear();
  let release;
  doneAnswer = () =>
    new Promise((r) => {
      release = () => r({ ok: true });
    });
  const tree = draw();
  const done = buttons(stepRowsOf(tree)[0], "Done")[0];
  const first = press(done);
  press(done);
  assert.deepEqual(doneCalls, [["d", "s-d", true]], "the person, the step's note, done; once");
  release();
  await first;
  assert.equal(doneCalls.length, 1);
  // One toast for a step done, wherever it is done (#1574, surfaces/step-done.tsx): "Step done · {the step's words}".
  assert.equal(textOf(flashes.at(-1).msg), `${NOTE_WORDS.stepDone} · Call Di`);
  assert.equal(typeof flashes.at(-1).undo, "function", "with its Undo, and nothing else (canvas A, M5)");
  // The row goes at once, as the thread header's line does; People is read again behind the verb.
  const after = again(() => W.React.createElement(AgentCommand, {}));
  assert.deepEqual(stepRowsOf(after).map(whoOf), ["Hal", "Ana"], "the step done is gone from the queue");
});

test("a Done the door refuses says so in the door's words, keeps the row, and reads People again (S9-10)", async () => {
  clear();
  const readAgain = [];
  W.__refreshSurface = async (key) => {
    readAgain.push(key);
  };
  try {
    doneAnswer = async () => ({ ok: false, message: "Only an owner or an operator can mark a step done." });
    const tree = draw();
    await press(buttons(stepRowsOf(tree)[0], "Done")[0]);
    assert.equal(flashes.at(-1).tone, "danger");
    assert.equal(textOf(flashes.at(-1).msg), "Only an owner or an operator can mark a step done.");
    const after = again(() => W.React.createElement(AgentCommand, {}));
    assert.deepEqual(stepRowsOf(after).map(whoOf), ["Di", "Hal", "Ana"], "nothing was done, nothing goes");
    // A refusal may be a step done a moment before in another tab: the rows are read again, as the Inbox's header reads them,
    // so the row stands or goes as the server has it rather than as this tab last read it.
    assert.deepEqual(readAgain, ["people"], "REGRESSION: a refused Done left the row as this tab last read it");
  } finally {
    delete W.__refreshSurface;
  }
});

test("a day with only steps due is not an empty queue; no step due draws nothing of them", () => {
  clear();
  const vm = handoffDay();
  vm.queue.rows = [];
  vm.queue.windows = 0;
  // And the one count of what needs you (0048), which the head says: nobody is held for a person.
  if (vm.needsYou) vm.needsYou = { ...vm.needsYou, count: 0, holds: 0, sends: 0, rows: [] };
  vm.queue.parts = [];
  setSurfaceValue("today", vm);
  const tree = draw();
  assert.equal(stepRowsOf(tree).length, 3);
  assert.equal(
    all(queueOf(tree), (n) => String(n.props?.["data-testid"] ?? "").startsWith("today-queue-empty-")).length,
    0,
    "the rows are the queue; the empty state says nothing waits",
  );
  assert.match(textOf(find(queueOf(tree), (n) => classes(n).includes("tq-sub"))), /6 steps due/);
  assert.equal(textOf(byTestId(queueOf(tree), "today-queue-count")), "0", "and nobody is waiting on a person");
  // Nothing due, or People unread: the queue is the queue.
  W.__PEOPLE = { rows: peopleWithSteps([["e", "Eli", 2]]), fetchedAt: nowMs };
  assert.equal(stepRowsOf(draw()).length, 0);
  delete W.__PEOPLE;
  assert.equal(stepRowsOf(draw()).length, 0, "People not read yet: no step is claimed");
});

test("what the card cannot hold is counted, never dropped: the steps cut are a door to People's Steps due, whatever else is cut", () => {
  clear();
  const vm = handoffDay();
  const [first] = vm.queue.rows;
  vm.queue.rows = ["one", "two", "three", "four"].map((w) => ({ ...first, id: `q-${w}`, who: `Person ${w}` }));
  setSurfaceValue("today", vm);
  const tree = draw();
  const queue = queueOf(tree);
  assert.deepEqual(
    all(queue, (n) => classes(n).includes("cl-attn-who")).map(textOf),
    ["Person one", "Person two", "Person three", "Person four"],
    "four people take the card",
  );
  const foot = find(queue, (n) => classes(n).includes("tq-foot"));
  assert.ok(textOf(foot).includes("6 steps due in People"), textOf(foot));
  assert.ok(!textOf(foot).includes("Nothing more"), "something was cut, and the foot says what");
  // The steps cut are a door of their own, the list the row for the rest opens.
  press(byTestId(foot, "today-queue-steps-cut"));
  assert.equal(went.at(-1), "clients/seg:steps_due");
  // See all stays the Inbox's: a step is not waiting there.
  press(buttons(foot, "See all")[0]);
  assert.equal(went.at(-1), "inbox");
});

test("and when people are cut as well, the foot says both and each has its own door", () => {
  clear();
  const vm = handoffDay();
  const [first] = vm.queue.rows;
  vm.queue.rows = ["one", "two", "three", "four", "five", "six"].map((w) => ({
    ...first,
    id: `q-${w}`,
    who: `Person ${w}`,
  }));
  setSurfaceValue("today", vm);
  const foot = find(queueOf(draw()), (n) => classes(n).includes("tq-foot"));
  assert.equal(textOf(foot).replace("See all", "").trim(), "2 more in the Inbox · 6 steps due in People");
  press(byTestId(foot, "today-queue-steps-cut"));
  assert.equal(
    went.at(-1),
    "clients/seg:steps_due",
    "the steps cut are reachable from the card, not only through See all",
  );
  press(buttons(foot, "See all")[0]);
  assert.equal(went.at(-1), "inbox");
});

/* ------------------------------------------ a step done anywhere moves Today ------------------------------------------ */

test("Today's steps are People's rows, so a step done anywhere moves Today when People does: the page redraws on People, and People hears the notes", async () => {
  clear();
  draw();
  quiet();
  surfaceLanded("people");
  assert.ok(redrawWanted(), "the queue is drawn again when People lands");
  quiet();
  surfaceLanded("billing");
  assert.ok(!redrawWanted(), "and not for a surface it does not draw");
  // The verbs and the live feed both read People again, from whichever page they are made on.
  globalThis.window ??= globalThis;
  globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  const keysOf = (route) => AFTER[route]().map((o) => o.key);
  for (const route of [
    "POST contacts/[id]/notes",
    "POST contacts/[id]/notes/done",
    "POST contacts/[id]/notes/remove",
    "POST contacts/[id]/notes/decide",
    "PUT contacts/notes",
  ])
    assert.ok(keysOf(route).includes("people"), `${route} reads People again`);
  const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
  assert.ok(peopleOverride.refreshOnTables.includes("person_notes"), "a teammate's note or step is on the live feed");
  assert.equal(
    peopleOverride.refreshWhen({ table: "person_notes" }),
    true,
    "heard on whatever page is open, Today among them: it is one of People's own tables",
  );
});
