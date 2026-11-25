/**
 * Yesterday's visits nobody has marked are rows of Today's queue (decision 0047; D1-visit-mark of the wiring plan, task 4.4; the
 * product call of 11 Oct 2026).
 *
 * A visit could be marked Kept or Missed in one place, the Calendar's panel, and nothing asked the owner to: a no-show nobody
 * marked counted as a visit that happened, and the after-the-visit message thanked them. Yesterday's unmarked visits now ask
 * "Did they come?" in the queue's own grammar, with Kept and Missed as the two verbs and the visit on the Calendar as the door,
 * three at most and the rest said, after the steps due. They are the team's to-do and nobody waiting: since Today in three
 * zones (2 Nov 2026) To do's rows, a group of Need you under the people waiting (how many by its name, the rest at Need
 * you's foot, whose See all opens the Calendar on yesterday where only they were left out), never in the number that says
 * who needs you.
 *
 * Since decision 0071 the two verbs are the row's own work (need-you/visit-work.tsx), and Missed goes on to the rebook Ask
 * writes, sent from the row.
 *
 * Run on the queue drawn on the stub React over a Calendar surface holding yesterday, and on the row's work drawn alone with
 * the Calendar's door answered by the tab's own fetch.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { NOW, ZONE, handoffDay } from "./_world.mjs";
import { until } from "../../shared/_until.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

const went = [];
const flashes = [];
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
const { VisitWork } = await import("../../../apps/dashboard/src/surfaces/today/need-you/visit-work.tsx");
const { clearRowStates } = await import("../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const H = 3_600_000;
/** A visit of yesterday's (Thursday 17 September): [id, hour, the record's word on it, the person]. One hour long. */
const block = (id, t, status = "booked", person = `Ana ${id}`) => {
  const start = Date.parse("2026-09-17T18:00:00Z") + (t - 14) * H;
  return {
    id: `e-${id}`,
    t,
    dur: 60,
    time: `${t - 12}:00 PM`,
    title: `Colour · ${person}`,
    service: "Colour",
    person: person ? { id: `p-${id}`, name: person, via: "phone" } : null,
    start: new Date(start).toISOString(),
    end: new Date(start + H).toISOString(),
    visit: status ? { id: `r-${id}`, status } : null,
  };
};
const frame = (key, over = {}) => ({
  key,
  dow: "Fri",
  date: key,
  long: key,
  dayNum: "17",
  today: false,
  past: false,
  closed: { yes: false, note: null },
  bands: [],
  blocks: [],
  allDay: [],
  windows: [],
  ...over,
});
/** The calendar surface's view model: yesterday with its blocks, today with none, the clock at four. */
const calendar = (blocks, over = {}) => ({
  timezone: ZONE,
  from: "2026-09-17",
  to: "2026-09-18",
  hours: { start: 8, end: 20 },
  days: [frame("2026-09-17", { past: true, blocks }), frame("2026-09-18", { today: true })],
  today: "2026-09-18",
  now: 16,
  feed: { present: true, state: "ok", line: "", events: blocks.length, source: "Google Calendar" },
  stats: { events: blocks.length, windows: 0, next: "—" },
  ...over,
});
/** Four unmarked visits and the three the queue does not ask about: a kept one, one the record has no row for, one nobody is matched to. */
const FOUR = () => [
  block("a", 14),
  block("c", 16),
  block("f", 19),
  block("g", 20),
  block("b", 15, "kept"),
  block("d", 17, null),
  block("e", 18, "booked", null),
];

const draw = () => {
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
const linesOf = (tree) =>
  all(queueOf(tree), (n) => n.props?.["data-testid"] === "queue-visit" && classes(n).includes("calm-line"));
/** The lines a reader and a thumb reach: not the one folded under the card, nor those past the three named. */
const rowsOf = (tree) => linesOf(tree).filter((l) => !l.props["data-folded"]);
const whoOf = (line) => textOf(find(line, (n) => classes(n).includes("calm-name")));
const pressLine = (line) => find(line, (n) => typeof n.props?.onClick === "function").props.onClick({ button: 0 });
const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const alsoOf = (tree) => byTestId(tree, "today-also");
const openAlso = (tree) => {
  pressLine(byTestId(alsoOf(tree), "today-also-line"));
  return redraw();
};
const doorIn = (tree, testid) => find(byTestId(tree, testid), (n) => typeof n.props?.href === "string")?.props.href;
const clear = (blocks = FOUR()) => {
  went.length = 0;
  flashes.length = 0;
  setSurfaceValue("calendar", { vm: calendar(blocks), fetchedAt: NOW.getTime() });
  setSurfaceValue("today", handoffDay());
};
after(() => {
  setSurfaceValue("calendar", undefined);
  setSurfaceValue("today", undefined);
});

test("yesterday's unmarked visits are To do's lines: the person, when and what; three named, in the day's order; one pressed takes the card with Kept and Missed, its words the visit's door; the rest counted, its door the first left out", () => {
  clear();
  const tree = draw();
  assert.match(textOf(cardOf(tree)), /Ana Reyes/, "the person waiting holds the card");
  const rows = rowsOf(tree);
  assert.deepEqual(
    rows.map(whoOf),
    ["Ana a", "Ana c", "Ana f"],
    "three, in the day's order: not a kept one, a row-less one, or an event nobody is matched to",
  );
  const said = textOf(rows[0]);
  // When it was is the line's first fact, never the slot a wait stands in, so the name keeps its room; then what it was.
  assert.ok(said.includes("Yesterday, 2:00 PM") && said.includes("Colour"), said);
  // A press on the line raises it into the card, where its two verbs are, and its words open the visit, on its day.
  pressLine(rows[0]);
  const card = cardOf(redraw());
  assert.match(textOf(card), /Ana a/);
  assert.equal(buttons(card, "Kept").length, 1);
  assert.equal(buttons(card, "Missed").length, 1);
  assert.equal(buttons(card, "Kept")[0].props["aria-label"], "Kept: Ana a", "several say Kept: a reader hears whose");
  assert.match(byTestId(card, "today-card-door").props.href, /calendar\/2026-09-17:a-r-a$/);
  // The rest, under the lines: how many more, and, nothing else being left out, the first visit it does not name as its
  // door (15 Nov 2026: it was the Calendar on yesterday), whose sheet's Next walks on through the rest.
  assert.match(textOf(alsoOf(tree)), /1 to mark/);
  assert.match(doorIn(openAlso(tree), "today-also-visits"), /calendar\/2026-09-17:a-r-g$/, "the Inbox holds no visit");
});

test("with nobody waiting, To do's first holds the card and the next are lines, nobody waiting over them", () => {
  clear();
  const vm = handoffDay();
  vm.queue.rows = [];
  setSurfaceValue("today", vm);
  const tree = draw();
  assert.match(textOf(cardOf(tree)), /Ana a/, "the first visit holds the card");
  assert.deepEqual(rowsOf(tree).map(whoOf), ["Ana c", "Ana f"], "the next two are lines");
  assert.equal(
    all(queueOf(tree), (n) => n.props?.["data-testid"] === "queue-handoff").length,
    0,
    "nobody waits on you",
  );
});

test("a day with only visits to mark is not an empty queue; none to mark, an unread Calendar, or one that does not hold yesterday draws nothing of them", () => {
  clear([block("a", 14)]);
  const vm = handoffDay();
  vm.queue.rows = [];
  vm.queue.windows = 0;
  // And the one count of what needs you (0048), which the head says: nobody is held for a person.
  if (vm.needsYou) vm.needsYou = { ...vm.needsYou, count: 0, holds: 0, sends: 0, rows: [] };
  vm.queue.parts = [];
  setSurfaceValue("today", vm);
  const tree = draw();
  assert.match(textOf(cardOf(tree)), /Ana a/, "the one visit to mark is the work");
  assert.equal(buttons(cardOf(tree), "Kept").length, 1);
  assert.equal(all(tree, (n) => String(n.props?.["data-testid"] ?? "").startsWith("today-queue-empty-")).length, 0);
  clear([block("a", 14, "kept")]);
  assert.equal(linesOf(draw()).length, 0, "marked: nothing to ask");
  clear();
  setSurfaceValue("calendar", {
    vm: calendar(FOUR(), { feed: { present: true, state: "unavailable" } }),
    fetchedAt: 1,
  });
  assert.equal(linesOf(draw()).length, 0, "a calendar that could not be read: no visit is claimed on a guess");
  clear();
  setSurfaceValue("calendar", { vm: calendar(FOUR(), { days: [frame("2026-09-18", { today: true })] }), fetchedAt: 1 });
  assert.equal(linesOf(draw()).length, 0, "and one that does not hold yesterday asks about nothing");
  setSurfaceValue("calendar", undefined);
  assert.equal(linesOf(draw()).length, 0, "the Calendar not read yet");
});

/* ------------------------------------------ the row's work, pressed ------------------------------------------ */

/** What the Calendar's door was asked, and what it answers next. Reads behind a write fail here: not this file's. */
const doors = [];
let doorSays;
W.fetch = async (url, init = {}) => {
  if ((init.method ?? "GET") === "GET") return new Response("{}", { status: 503 });
  doors.push([init.method, String(url).replace(/\?.*$/, ""), JSON.parse(init.body)]);
  const { status, body } = await doorSays();
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
after(() => delete W.fetch);
const said = () => ({ status: 200, body: { ok: true, data: { ok: true } } });
const kept = [];
const letGo = [];
const visitRow = (over = {}) => ({
  ...handoffDay().queue.rows[0],
  id: "q-visit-r-a",
  kind: "visit",
  who: "Ana a",
  person_id: "p-a",
  when: "Yesterday, 2:00 PM",
  visit: { id: "r-a", asks: ["kept", "missed"] },
  ...over,
});
const work = (row = visitRow(), may = true) =>
  W.React.createElement(VisitWork, {
    row,
    main: "primary",
    may,
    tz: ZONE,
    flash: (f) => flashes.push(f),
    keep: (r) => kept.push(r.id),
    unkeep: (r) => letGo.push(r.id),
    word: "appointment",
  });
const reset = () => {
  doors.length = 0;
  kept.length = 0;
  letGo.length = 0;
  flashes.length = 0;
  doorSays = said;
  // What a row came to is kept by the row for the visit (row-state.ts), as the walk sheet and the page both say it: each
  // test is a visit of its own.
  clearRowStates();
  fresh();
};

test("the verbs are Kept, then Missed, as the visit line asks them, each gated as the panel's are; a row asked for nothing has none", () => {
  reset();
  const tree = work();
  const [kept_, missed] = [buttons(tree, "Kept")[0], buttons(tree, "Missed")[0]];
  assert.deepEqual(
    [kept_.props["data-testid"], missed.props["data-testid"]],
    ["queue-visit-kept", "queue-visit-missed"],
  );
  assert.equal(kept_.props["aria-label"], "Kept: Ana a", "several rows say Kept: a reader hears whose");
  fresh();
  assert.equal(buttons(work(visitRow({ visit: { id: "r-a", asks: [] } })), "Kept").length, 0);
});

test("a press says the word on the record's row through the Calendar's door and the row says it, with Change; a second press waits", async () => {
  reset();
  let release;
  doorSays = () => new Promise((resolve) => (release = () => resolve(said())));
  press(buttons(work(), "Kept")[0]);
  await until(() => doors.length === 1, "the door was asked");
  assert.deepEqual(doors, [["POST", "/api/v1/calendar/visits/r-a", { status: "kept" }]]);
  assert.deepEqual(kept, ["q-visit-r-a"], "kept in its place on the card before the door answers");
  const asking = again(() => work());
  assert.equal(buttons(asking, "Kept")[0].props.disabled, true, "a second press waits for the first");
  assert.equal(buttons(asking, "Missed")[0].props.disabled, true);
  release();
  await until(
    () =>
      buttons(
        again(() => work()),
        "Change",
      ).length === 1,
    "the row says it, with Change",
  );
  assert.ok(textOf(again(() => work())).includes("Kept"));
  assert.deepEqual(doors.length, 1, "said once");
});

test("the door's refusal is its own sentence and the row still asks; Missed goes on to the rebook, said in the row where nothing can carry it", async () => {
  reset();
  doorSays = () => ({
    status: 409,
    body: {
      ok: false,
      error: { code: "conflict", message: "It hasn't begun yet: whether they came is said once it has." },
    },
  });
  press(buttons(work(), "Missed")[0]);
  await until(() => flashes.length > 0, "the refusal is said");
  assert.equal(flashes.at(-1).tone, "danger");
  assert.equal(textOf(flashes.at(-1).msg), "It hasn't begun yet: whether they came is said once it has.");
  const still = again(() => work());
  assert.equal(buttons(still, "Missed")[0].props.disabled, false, "refused: the row still asks");
  assert.deepEqual(letGo, ["q-visit-r-a"], "and is let go of: it is To do's again");

  // Missed: the rebook asks how they can be written to, which this file's reads refuse, so Missed stands, with why and
  // Change, and nothing is offered to send.
  reset();
  press(buttons(work(), "Missed")[0]);
  await until(
    () =>
      buttons(
        again(() => work()),
        "Change",
      ).length === 1,
    "Missed is said in the row, with Change",
  );
  const missed = again(() => work());
  assert.ok(textOf(missed).includes("Missed"), textOf(missed));
  assert.equal(buttons(missed, "Send").length, 0);
  assert.deepEqual(doors, [["POST", "/api/v1/calendar/visits/r-a", { status: "missed" }]]);
});

test("a Missed that a sequence answers (decision 0119) says who writes to them and when, and offers no rebook of its own: two messages offering another time would reach one person", async () => {
  reset();
  const gets = [];
  const fetchWas = W.fetch;
  W.fetch = (url, init = {}) => {
    if ((init.method ?? "GET") === "GET") gets.push(String(url));
    return fetchWas(url, init);
  };
  try {
    const answers = (follows) => () => ({ status: 200, body: { ok: true, data: { ok: true, follows } } });
    doorSays = answers({ name: "Missed appointment", when: "today 2:10 PM", asks: false });
    press(buttons(work(), "Missed")[0]);
    await until(
      () =>
        buttons(
          again(() => work()),
          "Change",
        ).length === 1,
      "Missed is said in the row, with Change",
    );
    const row = again(() => work());
    assert.ok(textOf(row).includes("Missed"), textOf(row));
    assert.ok(textOf(row).includes("“Missed appointment” offers them another time today 2:10 PM."), textOf(row));
    assert.equal(buttons(row, "Send").length, 0, "no second message is offered from the row");
    assert.deepEqual(gets, [], "and none is drafted: nothing asks how they can be written to");

    // One that waits for an OK says so: the owner is asked before it goes.
    reset();
    doorSays = answers({ name: "Missed appointment", when: "tomorrow 9:00 AM", asks: true });
    press(buttons(work(), "Missed")[0]);
    await until(
      () =>
        buttons(
          again(() => work()),
          "Change",
        ).length === 1,
      "Missed is said in the row",
    );
    assert.ok(
      textOf(again(() => work())).includes(
        "“Missed appointment” has a message for them tomorrow 9:00 AM, and asks you before it goes.",
      ),
    );

    // A Kept that a thank-you waits for (decision 0123) says when it goes: the word is what sends it.
    reset();
    doorSays = answers({ name: "After the appointment", when: "tomorrow 10:00 AM", asks: false });
    press(buttons(work(), "Kept")[0]);
    await until(
      () =>
        buttons(
          again(() => work()),
          "Change",
        ).length === 1,
      "Kept is said in the row",
    );
    assert.ok(
      textOf(again(() => work())).includes("“After the appointment” thanks them tomorrow 10:00 AM."),
      textOf(again(() => work())),
    );
    reset();
    doorSays = answers({ name: "Missed appointment", when: "tomorrow 9:00 AM", asks: true });
    press(buttons(work(), "Missed")[0]);
    await until(
      () =>
        buttons(
          again(() => work()),
          "Change",
        ).length === 1,
      "Missed is said in the row again",
    );

    // Kept after a Change says nothing of a message: the word is the row's alone.
    press(
      buttons(
        again(() => work()),
        "Change",
      )[0],
    );
    doorSays = answers(null);
    press(
      buttons(
        again(() => work()),
        "Kept",
      )[0],
    );
    await until(() => doors.length === 2, "Kept was said");
    await until(
      () =>
        buttons(
          again(() => work()),
          "Change",
        ).length === 1,
      "Kept is said in the row",
    );
    assert.ok(!textOf(again(() => work())).includes("has a message for them"));
  } finally {
    W.fetch = fetchWas;
  }
});

test("REGRESSION: a visit marked keeps its place with its word and Change once the read leaves it; what is left is said, with its door", async () => {
  reset();
  clear();
  const tree = draw();
  const first = rowsOf(tree)[0];
  assert.equal(whoOf(first), "Ana a");
  pressLine(first);
  press(buttons(cardOf(redraw()), "Kept")[0]);
  await until(() => doors.length === 1, "the Calendar's door was asked");
  // The read after it: Ana a's visit is kept now, so the Calendar asks nothing of it, and Ana g comes into the three.
  setSurfaceValue("calendar", {
    vm: calendar([block("a", 14, "kept"), ...FOUR().filter((b) => b.id !== "e-a")]),
    fetchedAt: NOW.getTime(),
  });
  await until(
    () => textOf(queueOf(redraw()) ?? null).includes("Change") || textOf(redraw()).includes("Change"),
    "the word said",
  );
  const after = redraw();
  assert.ok(textOf(after).includes("Kept"), "it says what it was marked");
  assert.ok(textOf(after).includes("Change"), "REGRESSION: its word and its Change went with the read");
  assert.ok(
    alsoOf(after) && textOf(alsoOf(after)).includes("to mark"),
    "REGRESSION: the visit left out was said nowhere",
  );
  assert.match(
    doorIn(openAlso(after), "today-also-visits"),
    /calendar\/2026-09-17:a-r-g$/,
    "its door is the one left out",
  );
});

test("Mark all kept, under the visits' line of what else is left: every one of yesterday's left to mark, the ones past the three drawn among them, asked first, then said through the one door; nothing for one, or for whoever may not say it", async () => {
  clear();
  doors.length = 0;
  doorSays = () => ({
    status: 200,
    body: {
      ok: true,
      data: {
        marked: 4,
        already_kept: 0,
        refused: 0,
        why: null,
        follows: { name: "After the appointment", when: "today 10:00 AM", asks: false },
      },
    },
  });
  // Under the visits' own line of what else is left (calm/also.tsx), opened.
  const todo = () => redraw();
  const opened = () => openAlso(draw());
  const press = byTestId(opened(), "today-kept-all-press");
  assert.ok(press, "where two or more wait to be marked");
  assert.equal(textOf(press).trim(), "Mark all 4 kept", "all four, though To do draws three");
  // Asked first: how many, and what follows; nothing is sent until the yes.
  press.props.onClick();
  const ask = byTestId(todo(), "today-kept-all-ask-confirm");
  assert.ok(textOf(ask).includes("Did all 4 of yesterday's appointments come?"), textOf(ask));
  assert.ok(textOf(ask).includes("changed to Missed afterwards"), "and that each can be corrected");
  assert.deepEqual(doors, []);
  byTestId(todo(), "today-kept-all-ask-yes").props.onClick();
  await until(() => flashes.length > 0, "what it came to is said");
  assert.deepEqual(doors, [["POST", "/api/v1/calendar/visits/kept", { ids: ["r-a", "r-c", "r-f", "r-g"] }]]);
  assert.equal(flashes.at(-1).tone, "ok");
  assert.equal(
    textOf(flashes.at(-1).msg),
    "4 marked kept · \u201cAfter the appointment\u201d thanks them today 10:00 AM.",
  );

  // Refused in part: what went, and the first refusal's words, in the warning's tone.
  flashes.length = 0;
  doorSays = () => ({
    status: 200,
    body: {
      ok: true,
      data: { marked: 3, already_kept: 0, refused: 1, why: "It was cancelled already.", follows: null },
    },
  });
  clear();
  byTestId(opened(), "today-kept-all-press").props.onClick();
  byTestId(todo(), "today-kept-all-ask-yes").props.onClick();
  await until(() => flashes.length > 0, "said");
  assert.equal(flashes.at(-1).tone, "warn");
  assert.equal(textOf(flashes.at(-1).msg), "3 marked kept · 1 couldn't be marked: It was cancelled already.");

  // Not yet: the question goes, and nothing is said.
  clear();
  doors.length = 0;
  byTestId(opened(), "today-kept-all-press").props.onClick();
  byTestId(todo(), "today-kept-all-ask-no").props.onClick();
  assert.ok(byTestId(todo(), "today-kept-all-press"), "the press stands again");
  assert.deepEqual(doors, []);

  // One to mark is its own Kept: no press for all.
  clear([block("a", 14)]);
  assert.equal(byTestId(draw(), "today-kept-all-press"), null);
});
