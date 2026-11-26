/**
 * A person's due next step is a row of Today's queue (decision 0007, 0047; D1-step-today and O2a of the wiring plan, task 1.3).
 *
 * Decision 0007 promised "Today: the steps due at the head of the day panel, three at most". #1357 dropped the day pane (Ruben's
 * call, canvas E3) without re-homing the steps, and #1367 retired the Classic look that still drew them: an overdue follow-up was
 * found by opening People, never by opening Today. The steps came back as a row type in the queue's own grammar: the person and
 * the step's words, the step's day, the person opened by the row, and Done, the verb the Inbox's thread header already has.
 * Three at most, the oldest first, then one row opening People's Steps due for the rest. Since Today in three zones (2 Nov
 * 2026) they are To do's, a group of Need you under the people waiting, on a desk as on a phone: three drawn across the
 * steps, the visits and the reviews, how many by its name, the rest said at Need you's foot, whose See all opens People's
 * Steps due where only to-dos were left out; never in the count of who needs you.
 *
 * Run on the contracts (withSteps over the queue toTodayVM built), on the queue drawn on the stub React with the verb it presses,
 * and on the real People surface for what makes the rows follow a step done anywhere.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NOTE_WORDS, isPersonRow, todaySteps, withSteps, zoneDayKey, clockTime } from "@chanlytics/contracts";
import {
  installStubReact,
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
  unmount,
} from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, ZONE, handoffDay, peopleWithSteps } from "./_world.mjs";
import { bridgeHolds, provided } from "../../shell/_bridge-holds.mjs";

const went = [];
const flashes = [];
const opened = [];
bridgeHolds({
  parts: {
    surfaceState: () => "live",
    clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
  },
});
installStubReact({
  appNavigate: (to) => went.push(to),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
});
const W = globalThis.window;
// Need you as the page draws it, with the card its arrangement names (Today, calm).
const { NeedYouOnToday: NeedYou } = await import("../zones/_on-today.mjs");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
// The seam's own signal, from the module the TSX reads it through: a surface's rows landed.
const { surfaceMoved: surfaceLanded } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");

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
      // And the day it was due, where an Undo of Not now puts it back (Today, calm, D25), and how late, said as its line
      // ends (the second look, L2).
      step: {
        person_id: "d",
        note_id: "s-d",
        deal_id: null,
        for_user_id: "u-Maria",
        due_on: want.dueOn,
        late: want.due === "past" ? want.near : null,
      },
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
// Drawn as a visit to Today: the last one's tree goes first, and what its presses came to with it (row-state.ts).
const draw = () => {
  unmount();
  fresh();
  return again(() => W.React.createElement(NeedYou, {}));
};
const redraw = () => again(() => W.React.createElement(NeedYou, {}));
/**
 * Since Today, calm (19 Nov 2026) the first thing worth doing is the page's card and every other thing a line: who waits
 * first, then To do's, three named, the rest counted by kind in the one line under them (Also on your list).
 */
const queueOf = (tree) => byTestId(tree, "today-queue");
const cardOf = (tree) => byTestId(tree, "today-card");
const linesOf = (tree, testid) =>
  all(queueOf(tree), (n) => n.props?.["data-testid"] === testid && classes(n).includes("calm-line"));
/** The lines a reader and a thumb reach: not the one folded under the card, nor those past the three named. */
const named = (lines) => lines.filter((l) => !l.props["data-folded"]);
const jobOf = (line) => textOf(find(line, (n) => classes(n).includes("calm-name")));
const pressLine = (line) => find(line, (n) => typeof n.props?.onClick === "function").props.onClick({ button: 0 });
const alsoOf = (tree) => byTestId(tree, "today-also");
const openAlso = (tree) => {
  pressLine(byTestId(alsoOf(tree), "today-also-line"));
  return redraw();
};
const doorIn = (tree, testid) => find(byTestId(tree, testid), (n) => typeof n.props?.href === "string")?.props.href;
const doneCalls = [];
let doneAnswer;
const clear = () => {
  went.length = 0;
  flashes.length = 0;
  opened.length = 0;
  doneCalls.length = 0;
  doneAnswer = async () => ({ ok: true });
  bridgeHolds({ values: { people: { rows: SIX(), fetchedAt: nowMs } } });
  bridgeHolds({
    parts: {
      personNotes: {
        done: (...args) => (doneCalls.push(args), doneAnswer()),
        words: NOTE_WORDS,
      },
    },
  });
  bridgeHolds({ parts: { sheets: { ...provided("sheets"), openStep: (ask) => opened.push(ask) } } });
  setSurfaceValue("today", handoffDay());
};
/** Today with nobody waiting on a person: To do's first holds the card. */
const nobodyWaits = () => {
  const vm = handoffDay();
  vm.queue.rows = [];
  setSurfaceValue("today", vm);
};
after(() => {
  bridgeHolds({ values: { people: undefined } });
  bridgeHolds({ parts: { personNotes: undefined } });
  delete W.openStepSheet;
  setSurfaceValue("today", undefined);
});

test("the steps due are To do's lines under whoever waits: the job, the person, the day and whose; three named, oldest first; the rest counted by kind, its door People's Steps due", () => {
  clear();
  const tree = draw();
  assert.match(textOf(cardOf(tree)), /Ana Reyes/, "the person waiting holds the card");
  const steps = named(linesOf(tree, "queue-step"));
  assert.deepEqual(steps.map(jobOf), ["Call Di", "Call Hal", "Call Ana"], "the job leads, three, the oldest first");
  const said = textOf(steps[0]);
  const when = todaySteps(SIX(), nowMs, ZONE).items[0].when;
  assert.ok(said.includes("Di"), said);
  // How late it is stands at the line's end, as a wait does, the day alone (the second look, L2): said once.
  assert.ok(said.includes(when.replace(/^Overdue since /, "")) && said.includes("For Maria"), said);
  assert.ok(!/overdue since/i.test(said), `said once, at the line's end: ${said}`);
  // Six are due: three named, the three past them counted under the lines, never dropped.
  assert.match(textOf(alsoOf(tree)), /3 to do/, "the steps are counted, never dropped");
  const open = openAlso(tree);
  assert.match(doorIn(open, "today-also-todo"), /people\/seg:steps_due$/, "the rest's door goes to People's Steps due");
});

test("a step's line pressed takes the card: its words open the person, Done is its verb, and it says whose it is to a reader", () => {
  clear();
  const tree = draw();
  pressLine(named(linesOf(tree, "queue-step"))[1]);
  const card = cardOf(redraw());
  assert.match(textOf(card), /Call Hal/, "the line pressed rises into the card");
  const done = buttons(card, "Done");
  assert.equal(done.length, 1, "Done is its verb");
  assert.equal(done[0].props["aria-label"], NOTE_WORDS.markDone("Call Hal"), "a reader hears whose");
  // Its words are the door to what it is about, as its row's were: the person, whose number a call needs.
  assert.match(byTestId(card, "today-card-door").props.href, /\/h$/, "the person's page");
});

test("with nobody waiting, To do's first holds the card, the next two are lines, and the rest is counted with its door", () => {
  clear();
  nobodyWaits();
  const tree = draw();
  const card = cardOf(tree);
  assert.match(textOf(card), /To do/, "the card says what it holds");
  assert.match(textOf(card), /Call Di/, "the oldest step holds it");
  assert.deepEqual(named(linesOf(tree, "queue-step")).map(jobOf), ["Call Hal", "Call Ana"]);
  assert.equal(linesOf(tree, "queue-handoff").length, 0, "nobody waits on you");
  assert.match(doorIn(openAlso(tree), "today-also-todo"), /people\/seg:steps_due$/);
});

test("Done is the Inbox header's verb, press for press: the step's note, said done once; a second press while the first is on its way waits; done, it says so where it stood, with its Undo, for the visit", async () => {
  clear();
  nobodyWaits();
  let release;
  doneAnswer = () =>
    new Promise((r) => {
      release = () => r({ ok: true });
    });
  const tree = draw();
  const done = buttons(cardOf(tree), "Done")[0];
  const first = press(done);
  press(done);
  assert.deepEqual(doneCalls, [["d", "s-d", true]], "the person, the step's note, done; once");
  release();
  await first;
  await until(() => buttons(cardOf(redraw()), "Undo").length === 1, "the card says it is done");
  assert.equal(doneCalls.length, 1);
  // Today, calm, D24 and D6: the card says it is done, with its Undo, for a beat; then the next thing takes the card and the
  // finished step keeps its line, with its Undo, for as long as the page is open, where a toast held the only Undo for
  // four seconds. Nothing else is said of it.
  assert.equal(flashes.length, 0, "no toast: the row says it");
  const beat = cardOf(redraw());
  assert.match(textOf(beat), /Call Di/, "the card holds what was done for a beat");
  assert.equal(buttons(beat, "Undo").length, 1, "saying so, with its Undo");
  // The beat is the card's own (need-you.tsx DONE_SHOWN_MS): once it has passed, the next takes the card.
  await until(() => /Call Hal/.test(textOf(cardOf(redraw()))), "then the next takes the card");
  const after = redraw();
  const acted = byTestId(after, "today-acted");
  assert.ok(
    acted && textOf(acted).includes("Call Di"),
    "the step done says so, as a line of what was done on this visit",
  );
  assert.equal(buttons(acted, "Undo").length, 1, "with its Undo");
});

test("a Done the door refuses says so in the door's words, keeps the step, and reads People again (S9-10)", async () => {
  clear();
  nobodyWaits();
  const readAgain = [];
  bridgeHolds({
    parts: {
      refreshSurface: async (key) => {
        readAgain.push(key);
      },
    },
  });
  try {
    doneAnswer = async () => ({ ok: false, message: "Only an owner or an operator can mark a step done." });
    const tree = draw();
    await press(buttons(cardOf(tree), "Done")[0]);
    assert.equal(flashes.at(-1).tone, "danger");
    assert.equal(textOf(flashes.at(-1).msg), "Only an owner or an operator can mark a step done.");
    const after = redraw();
    assert.match(textOf(cardOf(after)), /Call Di/, "nothing was done, nothing goes");
    assert.equal(byTestId(after, "today-acted"), null);
    // A refusal may be a step done a moment before in another tab: the rows are read again, as the Inbox's header reads them,
    // so the step stands or goes as the server has it rather than as this tab last read it.
    assert.deepEqual(readAgain, ["people"], "REGRESSION: a refused Done left the row as this tab last read it");
  } finally {
    bridgeHolds({ parts: { refreshSurface: undefined } });
  }
});

test("a day with only steps due is not an empty queue; no step due, or People unread, draws nothing of them", () => {
  clear();
  const vm = handoffDay();
  vm.queue.rows = [];
  vm.queue.windows = 0;
  // And the one count of what needs you (0048), which the head says: nobody is held for a person.
  if (vm.needsYou) vm.needsYou = { ...vm.needsYou, count: 0, holds: 0, sends: 0, rows: [] };
  vm.queue.parts = [];
  setSurfaceValue("today", vm);
  const tree = draw();
  assert.match(textOf(cardOf(tree)), /Call Di/, "a step is the work");
  assert.equal(
    all(tree, (n) => String(n.props?.["data-testid"] ?? "").startsWith("today-queue-empty-")).length,
    0,
    "the empty state says nothing waits",
  );
  // Nothing due, or People unread: there is no To do.
  bridgeHolds({ values: { people: { rows: peopleWithSteps([["e", "Eli", 2]]), fetchedAt: nowMs } } });
  assert.equal(linesOf(draw(), "queue-step").length, 0);
  bridgeHolds({ values: { people: undefined } });
  assert.equal(linesOf(draw(), "queue-step").length, 0, "People not read yet: no step is claimed");
});

test("what To do holds is counted whatever else waits, and the rest of each kind has its own door", () => {
  clear();
  const vm = handoffDay();
  const [first] = vm.queue.rows;
  vm.queue.rows = ["one", "two", "three", "four", "five", "six", "seven", "eight"].map((w) => ({
    ...first,
    id: `q-${w}`,
    who: `Person ${w}`,
    conversationId: `cv-${w}`,
  }));
  setSurfaceValue("today", vm);
  const tree = draw();
  assert.match(textOf(cardOf(tree)), /Person one/, "who waits first holds the card");
  assert.deepEqual(
    named(linesOf(tree, "queue-handoff")).map(jobOf),
    ["Person two", "Person three", "Person four"],
    "three named under it",
  );
  assert.equal(named(linesOf(tree, "queue-step")).length, 0, "a step names no line while people wait past the three");
  assert.match(textOf(alsoOf(tree)), /4 more waiting · 6 to do/, "the steps are counted, never dropped");
  const open = openAlso(tree);
  assert.match(doorIn(open, "today-also-waiting"), /inbox$/, "people left out: the Inbox holds them");
  assert.match(
    doorIn(open, "today-also-todo"),
    /people\/seg:steps_due$/,
    "each kind's own door goes where its own rest is",
  );
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
  const { AFTER } = await importSrc("apps/dashboard/src/bridge/refresh-map.ts");
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
