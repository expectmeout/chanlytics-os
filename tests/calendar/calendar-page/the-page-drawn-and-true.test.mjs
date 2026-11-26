/**
 * The Calendar page drawn, its peek knowing the deal (0008), and C1: what the page says is true wherever it looks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_ACT_WORDS,
  calendarPeekDeal,
  noProposalSince,
  shiftKey,
  toBookingReportVM,
  toCalendarVM,
} from "@chanlytics/contracts";
import { until } from "../../shared/_until.mjs";
import {
  ANA,
  CR_HOUR_MIN_PX,
  END,
  HOUR,
  NOW,
  S,
  all,
  at,
  byTestId,
  calendarRunsOverride,
  classes,
  columns,
  consultWeek,
  dto,
  find,
  fitDeskHourPx,
  fitHourPx,
  forgetPeek,
  fresh,
  homes,
  hostOf,
  leave,
  legend,
  listeners,
  openName,
  opening,
  page,
  peek,
  peopleWith,
  pickView,
  press,
  reads,
  realVerbs,
  ruleLines,
  setFollowed,
  setHonourDeps,
  setStatus,
  setSurfaceValue,
  settle,
  sheets,
  shownView,
  span,
  startAct,
  surfaceValue,
  textIn,
  textOf,
  went,
  withVisits,
} from "./_calendar-page.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

test("REGRESSION (D14): on a desk an appointment opens in the peek at the board's edge, named by its title; Escape closes it, and the board holds still behind it", () => {
  // The visit opened as Ask's old modal (lane E): it is the peek People's, the Pipeline's and Leads' pages draw, beside
  // a board that stays live, never a modal that holds the page.
  fresh();
  let tree = page();
  const range = () => textOf(byTestId(tree, "cal-range"));
  assert.equal(range(), "Sep 7 – 13");
  const block = byTestId(tree, "cal-block");
  assert.ok(block, "Tuesday's appointment is on the board");
  block.props.onClick();
  tree = page();
  const panel = byTestId(tree, "cal-panel");
  assert.ok(panel, "the peek opened");
  assert.equal(panel.type, "aside");
  assert.ok(classes(panel).includes("cal-side"));
  assert.equal(panel.props.role, "dialog");
  assert.equal(panel.props["aria-modal"], undefined, "not modal: the board beside it stays live");
  assert.equal(panel.props["aria-label"], "Color", "named by what it is for");
  assert.equal(textOf(byTestId(panel, "cal-visit-door")), "Ana Ruiz", "who it is with, a door to their page");
  assert.equal(byTestId(tree, "calendar-real").props["data-peek"], "", "the board makes room for it (calendar.css)");

  press("ArrowRight");
  tree = page();
  assert.equal(range(), "Sep 7 – 13", "REGRESSION: the arrows moved the week behind an open appointment");
  assert.ok(byTestId(tree, "cal-panel"), "and the appointment stays open");

  assert.equal(press("Escape"), true, "Escape is the peek's");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "Escape closes it");

  press("ArrowRight");
  tree = page();
  assert.equal(range(), "Sep 14 – 20", "with nothing open the arrows move the board again");
});

test("(lane E) the desk's peek walks the day's visits: its ‹ › and J and K open the next in its place, round the day, and say where it is", () => {
  const week = dto();
  week.days[1].items.push({
    id: "e4",
    start: "2026-09-08T20:00:00.000Z",
    end: "2026-09-08T21:00:00.000Z",
    title: "Bo Chen · Cut",
    all_day: false,
    person: null,
  });
  fresh(week);
  let tree = page();
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  const label = () => byTestId(tree, "cal-panel")?.props["aria-label"];
  const where = () => textOf(byTestId(tree, "cal-side-walk"));
  assert.equal(label(), "Color");
  assert.match(where(), /1 of 2/);
  assert.equal(press("j"), true, "J walks the day");
  tree = page();
  assert.equal(label(), "Bo Chen · Cut");
  assert.match(where(), /2 of 2/);
  press("j");
  tree = page();
  assert.equal(label(), "Color", "round the day");
  press("k");
  tree = page();
  assert.equal(label(), "Bo Chen · Cut", "and back");
  assert.equal(textOf(byTestId(tree, "cal-range")), "Sep 7 – 13", "the board holds still under the walk");
});

test("on a phone the visit is the kit's sheet from the bottom edge, its pull, handle and Escape the kit's; on a desk the peek", () => {
  // On a phone the card stood at the screen's foot with its own touch handlers (8 October 2026); it is the kit's Sheet now,
  // which every sheet a phone raises is, so a pull down lets it go as theirs does (kit/sheet/sheet.tsx touchSwipe).
  fresh();
  let tree = page();
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  assert.equal(byTestId(tree, "cal-panel").type, "aside", "a desk: the peek");
  globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    tree = page();
    const sheet = find(tree, (n) => n.props?.testid === "cal-panel" && typeof n.props.onClose === "function");
    assert.ok(sheet, "a phone: the kit's sheet");
    assert.equal(sheet.props.open, true);
    assert.equal(sheet.props.title, "Color");
    assert.ok(byTestId(tree, "cal-visit"), "the same parts, the same view model");
    assert.equal(
      find(tree, (n) => n.type === "aside"),
      null,
      "and no peek beside it",
    );
    sheet.props.onClose();
    tree = page();
    assert.equal(
      find(tree, (n) => n.props?.testid === "cal-panel" && n.props.open === true),
      null,
      "the kit's close lets it go",
    );
  } finally {
    delete globalThis.window.matchMedia;
  }
});

test("(0008) the peek's rule: the deal's stage where People holds them, and the sheet's own act once a consultation is over with nothing since", () => {
  const block = toCalendarVM(consultWeek(), new Date(END - 4 * HOUR)).days[1].blocks[0];
  assert.deepEqual(
    [block.consultation, block.consultService],
    [true, "Kitchen remodel"],
    "the route's marks, on the block",
  );
  const after = END + HOUR;
  // The sheet's own act: its words (DEAL_ACT_WORDS) and the mode it opens the sheet in, a new proposal always.
  const act = { id: "propose", label: DEAL_ACT_WORDS.propose, mode: "propose" };
  assert.equal(act.label, "Start a proposal");
  const start = { act, personId: "p1", service: "Kitchen remodel" };
  assert.deepEqual(calendarPeekDeal(block, peopleWith(null), after), { stage: null, start });
  // A pass or an end before the consultation ended: it began something new, and a new proposal follows it.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost"), after), { stage: "lost", start });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("ended"), after), { stage: "ended", start });
  // A pass or an end as it ended or after: the proposal that followed it was answered. Nothing to start.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost", END), after), { stage: "lost", start: null });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost", END + HOUR), after), {
    stage: "lost",
    start: null,
  });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("ended", END + HOUR), after), {
    stage: "ended",
    start: null,
  });
  // An open deal already has its proposal.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("proposed"), after), { stage: "proposed", start: null });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("won"), after), { stage: "won", start: null });
  // One rule with the week's count (noProposalSince), asked of this consultation's end.
  for (const [stage, sinceMs] of [
    [null, 0],
    ["lost", END - HOUR],
    ["lost", END + HOUR],
    ["ended", END],
    ["won", END - HOUR],
  ])
    assert.equal(
      !!calendarPeekDeal(block, peopleWith(stage, sinceMs), after).start,
      noProposalSince(stage ? { stage, sinceMs } : null, END),
      `${stage} at ${sinceMs - END}`,
    );
  // Not over yet: the stage, and nothing to start.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost"), END - HOUR), { stage: "lost", start: null });
  // A consultation that named no service starts a proposal for no service in particular.
  assert.equal(calendarPeekDeal({ ...block, consultService: null }, peopleWith(null), after).start.service, null);
  // Not a consultation: the stage only.
  assert.deepEqual(calendarPeekDeal({ ...block, consultation: false }, peopleWith(null), after), {
    stage: null,
    start: null,
  });
  // Nothing to start where they were booked again since (0008, amended 18 Oct 2026); nothing at all where People does
  // not hold them, where nobody was matched, or before People lands.
  const nothing = { stage: null, start: null };
  assert.deepEqual(calendarPeekDeal(block, peopleWith(null, undefined, after + 86_400_000), after), nothing);
  assert.deepEqual(calendarPeekDeal(block, { rows: [{ id: "p2", deal: null }] }, after), nothing);
  assert.deepEqual(calendarPeekDeal({ ...block, person: null }, peopleWith("lost"), after), nothing);
  assert.deepEqual(calendarPeekDeal(block, null, after), nothing);
});

test("REGRESSION (0008): the proposal act closes the visit first and opens the one deal sheet on the next task, in its own mode, so the sheet takes over from it", async () => {
  // Opened in the same press, the sheet took focus first and the visit's way back took it out of the sheet again.
  try {
    const tree = peek();
    const act = startAct(tree);
    assert.ok(act, "a consultation over, nothing since: the foot leads with it");
    assert.equal(textOf(act), "Start a proposal");
    assert.ok(classes(hostOf(act)).includes("btn-primary"), "the visit's one primary act");
    act.props.onClick();
    assert.deepEqual(sheets, [], "not in the same press: the visit goes first");
    assert.equal(byTestId(page(), "cal-panel"), null, "the visit closed");
    await settle(2);
    assert.deepEqual(sheets, [{ personId: "p1", mode: "propose", service: "Kitchen remodel" }], "the act's own mode");
  } finally {
    forgetPeek();
  }
});

test("REGRESSION: More's Set a step closes the visit first and opens the step sheet on the next task, as the proposal act does -- opened over the visit, the record sheet stood hidden behind it, and nothing seemed to happen (census, 13 Oct 2026)", async () => {
  const steps = [];
  globalThis.window.openStepSheet = (ask) => steps.push(ask);
  try {
    const tree = peek();
    const more = find(
      byTestId(tree, "cal-visit-foot"),
      (n) => n.props?.label === "More" && Array.isArray(n.props?.groups),
    );
    const item = (more?.props.groups ?? []).flatMap((g) => g.items).find((i) => /step/i.test(String(i.label)));
    assert.ok(item, "More offers it");
    item.onSelect();
    assert.deepEqual(steps, [], "not in the same press: the visit goes first");
    assert.equal(byTestId(page(), "cal-panel"), null, "the visit closed");
    await settle(2);
    assert.deepEqual(steps, [{ personId: "p1" }], "the step sheet, for them");
  } finally {
    delete globalThis.window.openStepSheet;
    forgetPeek();
  }
});

test("(0008) the proposal act is gated as the sheet's Save is: a role that may not record a deal is told why at the button, and nothing opens", async () => {
  const hadStore = globalThis.window.ST_STORE;
  globalThis.window.ST_STORE = { can: () => false, myRole: () => "viewer" };
  try {
    const tree = peek();
    const act = startAct(tree);
    assert.ok(act, "the visit's primary act is shown, gated, to a role that may not press it");
    assert.equal(act.props["aria-disabled"], true);
    assert.equal(typeof act.props["aria-description"], "string", "the reason, at the control");
    assert.equal(act.props["aria-description"], act.props["data-tip"]);
    act.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: act });
    await settle(2);
    assert.deepEqual(sheets, [], "nothing opens");
    assert.ok(byTestId(page(), "cal-panel"), "and the visit stays");
  } finally {
    if (hadStore === undefined) delete globalThis.window.ST_STORE;
    else globalThis.window.ST_STORE = hadStore;
    forgetPeek();
  }
  // A role that may: no gate on it.
  try {
    assert.equal(startAct(peek()).props["aria-disabled"], undefined);
  } finally {
    forgetPeek();
  }
});

test("(lane D) the visit says the person's standing, business and deal from the board's own read, and the page reads no People for it -- it read People's whole book a second time, for one pill and a deal", () => {
  // Which deal, standing and words a visit says is contracts' (calendar-panel.test.mjs, visitSheetOf); here, that the page
  // draws them from the read it already has, and never reaches for People's.
  const readsOfPeople = [];
  Object.defineProperty(globalThis.window, "__PEOPLE", {
    configurable: true,
    get() {
      readsOfPeople.push("read");
      return undefined;
    },
  });
  try {
    const deal = {
      deal_id: "d1",
      deal_stage: "proposed",
      deal_service: "Kitchen remodel",
      deal_proposed_at: "2026-09-07T15:00:00.000Z",
    };
    const tree = peek({ week: consultWeek({ person: { ...ANA, facts: { ...ANA.facts, deal } } }) });
    const person = byTestId(tree, "cal-visit-person");
    assert.ok(person, "who it is with");
    assert.match(textOf(person), /Active/, "their standing, in People's word");
    assert.match(
      textOf(byTestId(tree, "cal-visit-deal")),
      /^Proposal out · Kitchen remodel/,
      "their deal, a door to it",
    );
    assert.equal(startAct(tree), null, "a proposal out already is the next step");
    assert.deepEqual(readsOfPeople, [], "REGRESSION: the visit read People's book");
    assert.equal((listeners["surface:clients"] ?? []).length, 0, "and listens for none");
  } finally {
    bridgeHolds({ values: { people: undefined } });
    forgetPeek();
  }
});

test("REGRESSION (0008): the board's keys hold still under anything open over the page, the deal sheet among them, and leave a key something else took", () => {
  fresh();
  let tree = page();
  const range = () => textOf(byTestId(tree, "cal-range"));
  assert.equal(range(), "Sep 7 – 13");
  // A key as the window hears it, after anything under it had its turn.
  const key = (k, defaultPrevented = false) => {
    let taken = false;
    for (const fn of listeners.keydown ?? [])
      fn({
        key: k,
        defaultPrevented,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault() {
          taken = true;
        },
      });
    return taken;
  };
  // What is open in the app's root, as the page asks the document (People's PL_OVERLAY rule).
  let open = null;
  const hadQuery = globalThis.document.querySelector;
  globalThis.document.querySelector = (sel) => (open && sel.split(",").some((s) => s.trim() === open) ? {} : null);
  try {
    // The board's own peek is no overlay over it: the board asks it first, and its Escape closes it.
    byTestId(tree, "cal-block").props.onClick();
    tree = page();
    assert.ok(byTestId(tree, "cal-panel"));
    assert.equal(key("Escape"), true, "Escape is the peek's");
    tree = page();
    assert.equal(byTestId(tree, "cal-panel"), null, "and closes it");
    // Something open over the peek (its More, the deal sheet) has the keys, Escape too.
    byTestId(tree, "cal-block").props.onClick();
    tree = page();
    open = '.app-root [role="menu"]';
    assert.equal(key("Escape"), false, "Escape is the menu's over the peek");
    assert.equal(key("j"), false, "and the walk waits for it");
    tree = page();
    assert.ok(byTestId(tree, "cal-panel"), "the peek stays under it");
    open = null;
    key("Escape");
    tree = page();
    // The deal sheet, the kit's sheets, or anything else open over the page, has the keys.
    open = '.app-root [role="dialog"]:not(.cal-side)';
    for (const k of ["ArrowRight", "ArrowLeft", "t"]) assert.equal(key(k), false, `${k} is the sheet's`);
    tree = page();
    assert.equal(range(), "Sep 7 – 13", "REGRESSION: the arrows in the deal sheet moved the board behind it");
    open = '.sheet[role="dialog"]';
    assert.equal(
      key("ArrowRight"),
      false,
      "REGRESSION: a kit sheet (Hours and rules) let the arrows move the days behind it",
    );
    open = '.app-root [role="menu"]';
    assert.equal(key("ArrowRight"), false, "a menu has the keys too");
    open = null;
    assert.equal(key("ArrowRight", true), false, "a key something took before the window heard it is not the board's");
    tree = page();
    assert.equal(range(), "Sep 7 – 13");
    assert.equal(key("ArrowRight"), true, "with nothing open the arrows move the board");
    tree = page();
    assert.equal(range(), "Sep 14 – 20");
  } finally {
    if (hadQuery === undefined) delete globalThis.document.querySelector;
    else globalThis.document.querySelector = hadQuery;
  }
});

test("REGRESSION (B11): days that could not be read say so with a Retry, and are not left dimmed as if still loading -- a toast said it once and faded", async () => {
  // A window that starts a week after today's: today's week has to be read.
  const later = dto({ from: "2026-09-14", to: "2026-09-20" });
  later.days = later.days.map((d, i) => ({ key: shiftKey("2026-09-14", i), items: [], windows: [] }));
  fresh(later, [false, false, true]);
  page();
  await settle();
  let tree = page();
  assert.equal(reads.length, 1, "one read for the days the window lacks");
  const failed = byTestId(tree, "cal-failed");
  assert.ok(failed, "the page says the days couldn't be read");
  assert.match(textOf(failed), /Couldn't read those days/);
  const cols = all(tree, (n) => n.props?.["data-testid"] === "cal-col");
  assert.equal(cols.length, 7);
  assert.ok(
    cols.every((c) => !/\bloading\b/.test(c.props.className)),
    `REGRESSION: unread days stayed dimmed as loading: ${cols.map((c) => c.props.className).join(" | ")}`,
  );
  assert.ok(
    cols.every((c) => classes(c).includes("unread")),
    "the board marks the days it couldn't read",
  );

  byTestId(tree, "cal-failed-retry").props.onClick();
  await settle();
  tree = page();
  assert.equal(reads.length, 2, "Retry reads again");
  assert.ok(byTestId(tree, "cal-failed"), "a second failure still says so");

  byTestId(tree, "cal-failed-retry").props.onClick();
  await settle();
  tree = page();
  assert.equal(reads.length, 3);
  assert.equal(byTestId(tree, "cal-failed"), null, "a read that lands takes the line away");
});

test("the views are the frame's strip, where every page's row of views stands, and not the page's: the bar is the range with its steps, then the page's options", () => {
  // They were a segmented control of the page's own, dressed as the strip, inside the page's view: it wore the strip's glass
  // a beat late on every arrival (Ruben, 11 Oct 2026). The frame draws them now (chrome.ts, calendar-surface.test.mjs).
  fresh();
  const tree = page();
  const bar = byTestId(tree, "cal-bar");
  const parts = (bar.props.children ?? []).flat().filter((n) => n && typeof n === "object");
  assert.deepEqual(
    parts.map((n) => n.props.className),
    ["cal-when", "cal-tools"],
    "the range with its steps, then the page's options",
  );
  assert.equal(
    find(
      tree,
      (n) => Array.isArray(n.props?.options) && n.props.options.some((o) => o.testid?.startsWith("cal-view-")),
    ),
    null,
    "REGRESSION: a strip of views of the page's own",
  );
});

test("REGRESSION (B12): the range names the days on screen in every view -- a line over the board said 'This week' of next week and 'This month' of any month", () => {
  fresh();
  let tree = page();
  const label = () => textOf(byTestId(tree, "cal-range"));
  const go = (id) => {
    if (id.startsWith("cal-view-")) pickView(tree, id.slice("cal-view-".length));
    else byTestId(tree, id).props.onClick();
    tree = page();
  };
  assert.equal(label(), "Sep 7 – 13");
  go("cal-next");
  assert.equal(label(), "Sep 14 – 20");
  go("cal-today");
  assert.equal(label(), "Sep 7 – 13");
  go("cal-view-month");
  assert.equal(label(), "September 2026");
  go("cal-next");
  assert.equal(label(), "October 2026");
  go("cal-today");
  go("cal-view-agenda");
  assert.equal(label(), "Sep 8 – 21");
  go("cal-next");
  assert.equal(label(), "Sep 22 – Oct 5");
  go("cal-today");
  go("cal-view-day");
  assert.equal(label(), "Tue · Sep 8");
  go("cal-next");
  assert.equal(label(), "Wed · Sep 9");
});

test("the booking rules come as parts, and a read's unfollowable repeats and undrawn events are explained, with their numbers (B24, B25)", () => {
  const counted = (skipped, dropped) => dto({ feed: { ...dto().feed, skipped_recurring: skipped, dropped } });
  const vm = toCalendarVM(counted(2, 3), NOW);
  assert.deepEqual(vm.ruleParts, [
    "at least 2h notice",
    "15 min between bookings",
    "up to 14 days ahead",
    "30-min slots",
  ]);
  assert.equal(
    vm.rules,
    "Offers times with at least 2h notice · 15 min between bookings · up to 14 days ahead · 30-min slots",
    "the sentence stays for whoever reads it whole",
  );
  assert.deepEqual([vm.feed.skippedRecurring, vm.feed.dropped], [2, 3]);
  assert.deepEqual(
    vm.feed.notes.map((n) => [n.id, n.title]),
    [
      ["repeats", "2 repeating events count only once."],
      ["undrawn", "3 more events aren't shown."],
    ],
  );
  assert.match(vm.feed.notes[0].body, /a later date could be offered/);
  assert.match(vm.feed.notes[1].body, /still treats their times as taken/);
  assert.deepEqual(
    toCalendarVM(counted(1, 1), NOW).feed.notes.map((n) => n.title),
    ["1 repeating event counts only once.", "1 more event isn't shown."],
  );
  const clean = toCalendarVM(dto(), NOW);
  assert.deepEqual(
    [clean.feed.skippedRecurring, clean.feed.dropped, clean.feed.notes],
    [0, 0, []],
    "a read that left nothing out says nothing",
  );
  const unread = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 4,
        dropped: 2,
      },
    }),
    NOW,
  );
  assert.deepEqual(unread.feed.notes, [], "nothing to explain about a read that did not happen");

  fresh(counted(2, 3));
  const tree = page();
  assert.deepEqual(
    ruleLines(tree, "Booking"),
    vm.ruleParts,
    "each rule a line of its own in Hours and rules, so a narrow screen wraps between rules, never inside one",
  );
  // The board says one thing at a time over its days (CAL-12): the first the read left out, explained; the next when it is gone.
  assert.match(textOf(byTestId(tree, "cal-notice-note-repeats")), /2 repeating events count only once\./);
  assert.equal(byTestId(tree, "cal-notice-note-undrawn"), null, "one notice, never a stack of them over the first day");
  fresh(counted(0, 3));
  assert.match(textOf(byTestId(page(), "cal-notice-note-undrawn")), /3 more events aren't shown\./);
});

test("the board is drawn in hours of the stylesheet's hour (--cal-hour): one value moves every block, band, tick and the now line, so a phone fits the day by setting it", () => {
  // The blocks stood at 64px an hour in pixels of their own; a phone's board that fits the room the page leaves needs
  // the hour to be one value (blocks.tsx CrBoard sets it, calendar.css reads it), and every length a share of it.
  fresh();
  const tree = page();
  const vm = toCalendarVM(dto(), NOW);
  const grid = find(tree, (n) => /\bcal-grid\b/.test(String(n.props?.className ?? "")));
  assert.ok(grid, "the week grid");
  assert.equal(
    grid.props.style["--cal-hours"],
    vm.hours.end - vm.hours.start,
    "how many hours tall, for the stylesheet",
  );
  const cols = all(tree, (n) => n.props?.["data-testid"] === "cal-col");
  assert.equal(cols.length, 7);
  assert.ok(
    cols.every((c) => c.props.style === undefined),
    "a column's height is the stylesheet's (--cal-hours of --cal-hour), not pixels of its own",
  );
  const hours = /^calc\([\d.]+ \* var\(--cal-hour\)\)$/;
  const block = byTestId(tree, "cal-block");
  assert.ok(block, "the week's appointment");
  assert.match(block.props.style.top, hours, "a block starts so many hours down");
  assert.match(
    block.props.style.height,
    /^max\(22px, calc\([\d.]+ \* var\(--cal-hour\)\) - 2px\)$/,
    "and runs so many hours, never under the two lines it holds",
  );
  const tick = find(tree, (n) => /\bcal-hour\b/.test(String(n.props?.className ?? "")));
  assert.match(tick.props.style.top, hours, "an hour's label stands at its hour");
  const band = find(tree, (n) => /\bcal-unavail\b/.test(String(n.props?.className ?? "")));
  assert.ok(band, "a band outside the hours");
  assert.match(band.props.style.top, hours);
  assert.match(band.props.style.height, hours);
});

test("what fits a phone's board: the room shared by the day's hours, in whole pixels, never under the floor a half-hour block needs", () => {
  assert.equal(fitHourPx(540, 9), 60, "a salon's nine hours in 540px: sixty to the hour, and the day holds still");
  assert.equal(fitHourPx(545, 9), 60, "whole pixels, so the hour lines stay crisp");
  assert.equal(
    fitHourPx(373, 9),
    41,
    "nine hours in the room a 375px phone leaves: just over the floor, and the day fits",
  );
  assert.equal(
    fitHourPx(373, 11),
    CR_HOUR_MIN_PX,
    "eleven hours there would be 33: the floor holds, and the day scrolls inside its pane",
  );
  assert.equal(
    fitHourPx(450, 14),
    CR_HOUR_MIN_PX,
    "seven in the morning to eight at night in 450px would be 32: the floor too",
  );
  assert.equal(fitHourPx(0, 9), CR_HOUR_MIN_PX, "no room yet (nothing laid out) is the floor, never nothing");
  assert.equal(fitHourPx(-10, 9), CR_HOUR_MIN_PX, "a room the heads outgrow is the floor too");
  assert.equal(fitHourPx(500, 0), 500, "a day of no hours divides by one, never by nothing");
});

test("REGRESSION: a desk's day fits its board between 48 and 64px an hour -- at a flat 64 it always scrolled, its morning off the top", () => {
  assert.equal(
    fitDeskHourPx(620, 11),
    56,
    "eight in the morning to seven at night in a 620px board: 56 to the hour, the whole day, no scroll (Ruben's screenshots, 18 Oct 2026)",
  );
  assert.equal(fitDeskHourPx(1000, 9), 64, "room to spare: the stylesheet's 64, never taller");
  assert.equal(fitDeskHourPx(450, 14), 48, "a long day in a short window: the floor, and that day scrolls");
});

test("REGRESSION (B28): a phone opens on the agenda -- it opened on a week grid four times the screen's width", () => {
  fresh();
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  try {
    const tree = page();
    assert.equal(shownView(tree), "agenda");
    assert.ok(byTestId(tree, "cal-agenda"), "the days as a list");
    assert.equal(byTestId(tree, "cal-col"), null, "no week grid");
  } finally {
    delete globalThis.window.matchMedia;
  }
  fresh();
  assert.equal(shownView(page()), "week", "a desk keeps the week");
});

test("the agenda's rows ARE Today's rows, and a customer is named once: it drew its own grid, the event's whole title, and the name again under it", () => {
  fresh();
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  let tree;
  try {
    tree = page();
  } finally {
    delete globalThis.window.matchMedia;
  }
  const row = all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-item")[0];
  assert.ok(row, "the agenda draws rows");
  // The shared row (the kit's agenda), not a second one of the Calendar's own.
  const cls = (n) => String((n && (n.rendered || n).props?.className) || "");
  assert.match(cls(row), /\bag-item\b/, "the one row every list of appointments wears");
  assert.equal(
    all(tree, (n) => /\bcal-agenda-item\b/.test(cls(n))).length,
    0,
    "REGRESSION: the Calendar drew its own row beside Today's",
  );
  const part = (c) => textOf(find(row, (n) => cls(n).split(" ").includes(c)));
  assert.equal(part("ag-item-name"), "Ana Ruiz", "who it is for, first");
  assert.equal(
    part("ag-item-sub"),
    "Color · 1h 30m",
    "REGRESSION: what it is FOR and how long -- the event is titled 'Ana Ruiz · Color', and the row printed that whole title and then her name again",
  );
  assert.equal(textOf(row).split("Ana Ruiz").length - 1, 1, "REGRESSION: her name was on the row twice");
  // An appointment nobody is matched to has the service as its headline and nothing under it but the length.
  const allDay = all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-item").find((n) =>
    textOf(n).includes("Team training"),
  );
  assert.ok(allDay, "the all-day entry is on the list");
  assert.equal(textOf(find(allDay, (n) => cls(n).split(" ").includes("ag-item-name"))), "Team training");
  assert.ok(!find(allDay, (n) => cls(n).split(" ").includes("ag-item-sub")), "no service line of its own");
  assert.equal(textOf(allDay).trim(), "All dayTeam training", "the time column, then the entry: nothing else");
});

test("a link can name a day: the page opens it in Day view, on a phone too", () => {
  fresh();
  globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    at("calendar/2026-09-10");
    const tree = page();
    assert.equal(shownView(tree), "day");
    assert.equal(textOf(byTestId(tree, "cal-range")), "Thu · Sep 10");
  } finally {
    delete globalThis.window.matchMedia;
  }
});

test("(A1, D1) a link to a visit opens its panel once its block is drawn, on the day it names; closed, the address is the day's again", () => {
  fresh(withVisits());
  at("calendar/2026-09-08:a-v-ana");
  let tree = page();
  assert.equal(shownView(tree), "day", "the day it names is opened");
  tree = page();
  assert.equal(openName(tree), "Color", "the visit the id names, found by its row and not by its block's id");
  assert.equal(textOf(byTestId(tree, "cal-visit-door")), "Ana Ruiz");
  went.length = setFollowed(0);
  assert.equal(press("Escape"), true, "closed as any panel is");
  assert.deepEqual(went, ["calendar/2026-09-08"], "a panel a link opened closes to the place the board stands");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null);
  press("ArrowRight");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "and it opens once: a move of the board does not open it again");
});

test("(lane A) a visit opened on the board names the view and the day behind it in the address, so a refresh or a copied link opens the same; a walk replaces it", () => {
  fresh(withVisits());
  at("calendar/week");
  let tree = page();
  went.length = setFollowed(0);
  byTestId(tree, "cal-block").props.onClick();
  assert.deepEqual(went, ["calendar/week:2026-09-08:a-v-ana"], "the week stays the week behind it");
  tree = page();
  assert.equal(shownView(tree), "week");
  assert.equal(openName(tree), "Color");
  // Opened again from that address alone (a refresh): the same visit, over the same week.
  fresh(withVisits());
  at("calendar/week:2026-09-08:a-v-ana");
  page();
  tree = page();
  assert.equal(shownView(tree), "week", "REGRESSION: a visit's link opened Day view, whatever it was opened over");
  assert.equal(openName(tree), "Color");
});

test("(A1) calendar/a-<id>, which names no day, opens the panel of a visit among the days the board holds, and a cancelled visit is still a visit to read", () => {
  fresh(withVisits());
  at("calendar/a-v-gone");
  page();
  const tree = page();
  assert.ok(byTestId(tree, "cal-panel"), "the Calendar's week holds it, struck as it is on the board");
  assert.match(openName(tree), /Cut/);
  assert.equal(textOf(byTestId(tree, "cal-visit-state")), "Cancelled");
});

test("(A1) a visit the days drawn do not hold opens nothing, and says nothing wrong", () => {
  fresh(withVisits());
  at("calendar/2026-09-08:a-v-nobody");
  page();
  const tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "no panel for a row the board does not draw");
  assert.ok(byTestId(tree, "calendar-real"), "the board is as it is for the day alone");
});

test("(A1) a window the tab held does not decide for a visit it lacks: the fresh read behind it, landing later, opens the panel", () => {
  setHonourDeps(true);
  try {
    // The surface value fresh() sets is a held window: read before this page mounted (fetchedAt 1).
    fresh(withVisits());
    at("calendar/2026-09-08:a-v-late");
    let tree = page();
    assert.equal(byTestId(tree, "cal-panel"), null, "the held window does not hold the visit");
    // The read behind it lands, a visit richer.
    const week = withVisits();
    week.days[2].items.push({
      id: "e9",
      start: "2026-09-09T15:00:00.000Z",
      end: "2026-09-09T16:00:00.000Z",
      title: "Noor Ali · Gloss",
      all_day: false,
      person: null,
      visit: { id: "v-late", status: "booked" },
    });
    setSurfaceValue("calendar", { vm: toCalendarVM(week, NOW), fetchedAt: Date.now() + 1000 });
    page();
    tree = page();
    assert.ok(
      byTestId(tree, "cal-panel"),
      "REGRESSION: the held window had marked the visit as not there, and the fresh one never opened it",
    );
    assert.match(openName(tree), /Gloss/);
  } finally {
    setHonourDeps(false);
  }
});

test("REGRESSION (21 Oct 2026): a cold board waits for its campaigns, never past the route's wait from its weeks' landing, so their rows never come in between the meetings after them; a board in hand never waits", async () => {
  // The campaigns' read, here answering no runs: what the board draws its marks from (runs-surface.ts).
  const runs = {
    dto: { timezone: "America/New_York", from: "2026-09-07", days: 63, paused: false, runs: [], moments: [] },
    fetchedAt: 1,
  };
  /** A page that comes on screen before its weeks, as a load does; Show draws campaigns (its default). */
  const cold = () => {
    fresh();
    setSurfaceValue("calendar", undefined);
    setSurfaceValue("calendar_runs", undefined);
    assert.ok(byTestId(page(), "calendar-cold"), "its frame while the weeks are read");
    setSurfaceValue("calendar", { vm: toCalendarVM(dto(), NOW), fetchedAt: 1 });
  };
  setHonourDeps(true);
  bridgeHolds({ parts: { routeWaitMs: 900 } });
  try {
    cold();
    assert.ok(byTestId(page(), "calendar-cold"), "the weeks in and the campaigns still out: still the frame");
    setSurfaceValue("calendar_runs", runs);
    assert.ok(byTestId(page(), "calendar-real"), "both in: the board, drawn once, with its campaigns");
    // The campaigns slow to come: the board waits for them as long as the route's wait, then draws without them.
    cold();
    assert.ok(byTestId(page(), "calendar-cold"));
    await new Promise((r) => setTimeout(r, 650));
    assert.ok(byTestId(page(), "calendar-cold"), "REGRESSION (16 Nov 2026): it gave up on them at 600 ms");
    await until(() => byTestId(page(), "calendar-real"), "REGRESSION: a board that waited for its campaigns for ever");
    // Their read failed: there is nothing to wait for, and the board draws at once.
    cold();
    setStatus("calendar_runs", "seeded");
    assert.ok(byTestId(page(), "calendar-real"), "a failed read is not waited for");
    setStatus("calendar_runs", "live");
    // In hand as the page came on screen (the tab's cache, a held window): the board at once, whatever the campaigns.
    fresh();
    setSurfaceValue("calendar_runs", undefined);
    assert.ok(byTestId(page(), "calendar-real"), "a board in hand never waits");
  } finally {
    setHonourDeps(false);
    bridgeHolds({ parts: { routeWaitMs: undefined } });
    setSurfaceValue("calendar_runs", undefined);
    setStatus("calendar_runs", "live");
  }
});

test("REGRESSION (10 Nov 2026): a load whose weeks landed a moment before the page came on screen still waits for its campaigns, never past the route's wait; weeks held from an earlier read wait only while the campaigns are being read (15 Nov 2026)", async () => {
  const runs = {
    dto: { timezone: "America/New_York", from: "2026-09-07", days: 63, paused: false, runs: [], moments: [] },
    fetchedAt: 1,
  };
  /**
   * A load on a slower machine: the document's head started both reads, both answered before the page's code ran, and
   * the weeks' answer was handed over first. The page comes on screen with its weeks in hand and its campaigns a turn behind.
   */
  const justLanded = () => {
    fresh();
    setSurfaceValue("calendar", { vm: toCalendarVM(dto(), NOW), fetchedAt: Date.now() });
    setSurfaceValue("calendar_runs", undefined);
  };
  setHonourDeps(true);
  bridgeHolds({ parts: { routeWaitMs: 900 } });
  try {
    justLanded();
    assert.ok(
      byTestId(page(), "calendar-cold"),
      "REGRESSION: the meetings drew first, and the campaigns pushed them down as they came (5 of 5 loads at a quarter of the speed)",
    );
    setSurfaceValue("calendar_runs", runs);
    assert.ok(byTestId(page(), "calendar-real"), "both in: the board, drawn once, with its campaigns");
    // The campaigns slow to come: the board draws without them once the route's wait has passed.
    justLanded();
    assert.ok(byTestId(page(), "calendar-cold"));
    await until(() => byTestId(page(), "calendar-real"), "the board, once its wait for the campaigns has passed");
    // Weeks this tab held from a read well before the page came on screen (a move between pages, a return visit's kept
    // copy): the board at once, as it always drew.
    fresh();
    setSurfaceValue("calendar", { vm: toCalendarVM(dto(), NOW), fetchedAt: Date.now() - 5_000 });
    setSurfaceValue("calendar_runs", undefined);
    assert.ok(byTestId(page(), "calendar-real"), "weeks held from before, and nothing reading the campaigns: no wait");
    // The same weeks, and the campaigns being read as the page comes on screen: a press from Today, which reads the weeks
    // for its day. It waits for them as a load does.
    fresh();
    setSurfaceValue("calendar", { vm: toCalendarVM(dto(), NOW), fetchedAt: Date.now() - 5_000 });
    setSurfaceValue("calendar_runs", undefined);
    const was = globalThis.window.fetch;
    let answer = () => {};
    globalThis.window.fetch = () =>
      new Promise((r) => {
        const body = JSON.stringify({ ok: true, data: { runs: runs.dto } });
        answer = () => r(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));
      });
    try {
      const reading = calendarRunsOverride.apply();
      assert.ok(
        byTestId(page(), "calendar-cold"),
        "REGRESSION (15 Nov 2026): a press from Today drew the meetings, then the campaigns 0.2 to 0.3 s after, 48 px a row",
      );
      await until(() => (answer(), surfaceValue("calendar_runs")), "the campaigns' read, answered");
      await reading;
      assert.ok(byTestId(page(), "calendar-real"), "both in: the board, drawn once, with its campaigns");
    } finally {
      globalThis.window.fetch = was;
    }
  } finally {
    setHonourDeps(false);
    bridgeHolds({ parts: { routeWaitMs: undefined } });
    setSurfaceValue("calendar_runs", undefined);
  }
});

test("REGRESSION (B19): a sentence that sends the owner to the calendar's address names the page it is on -- Settings › Hours & booking, not Settings › Workspace", () => {
  assert.equal(toBookingReportVM(null).sub, "Add a calendar link under Settings › Hours & booking to see who booked.");
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    }),
  );
  // With no calendar the card names no tab now: its press opens the Business row itself (the one answer's door,
  // contracts CALENDAR_SETTING_ROUTE), where the sentence sent the owner to the top of a tab to find it.
  const none = textOf(byTestId(page(), "cal-notice-feed"));
  assert.ok(!none.includes("Settings › Workspace"), none);
  went.length = 0;
  byTestId(page(), "cal-feed-door").props.onClick();
  assert.deepEqual(went, ["admin/workspace/calendar"], "the row, not the top of the tab");
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
  );
  const unread = textOf(byTestId(page(), "cal-notice-feed"));
  assert.ok(unread.includes("Settings › Hours & booking") && !unread.includes("Settings › Workspace"), unread);
});

test("REGRESSION (C1): Next opening is AI's first open time from now, wherever the board is looking, and names its day past this week -- it came from the loaded weeks and said only a weekday", () => {
  const next = (start, over = {}) => toCalendarVM(dto({ ...opening(start), ...over }), NOW).stats.next;
  assert.equal(next("2026-09-08T19:30:00.000Z"), "today 3:30 PM");
  assert.equal(next("2026-09-09T14:00:00.000Z"), "tomorrow 10 AM");
  assert.equal(next("2026-09-11T14:00:00.000Z"), "Fri 10 AM", "this week, the weekday is enough");
  assert.equal(next("2026-09-14T14:00:00.000Z"), "Mon 10 AM");
  assert.equal(
    next("2026-09-17T14:00:00.000Z"),
    "Sep 17, 10 AM",
    "REGRESSION: past this week a weekday alone named a day a week too soon",
  );
  assert.equal(next(null), "—", "nothing it would offer is a dash, whatever the loaded days hold");
  assert.equal(
    next("2026-09-09T14:00:00.000Z", { feed: { ...dto().feed, state: "unavailable" } }),
    "—",
    "a calendar that can't be read offers nothing",
  );
  const december = span("2026-11-23", 63, opening("2026-09-09T14:00:00.000Z"));
  assert.equal(
    toCalendarVM(december, NOW).stats.next,
    "tomorrow 10 AM",
    "REGRESSION: a board looking at December worked the next opening out from December",
  );
});

test("(C1) the last day AI offers is named, and every day past it knows it is", () => {
  const vm = toCalendarVM(span("2026-09-07", 28), NOW);
  assert.deepEqual(vm.offer, { days: 14, until: "2026-09-21", label: "Sep 21", slot: 30 }, "14 days out, from today");
  const beyond = (key) => vm.days.find((d) => d.key === key).beyondOffer;
  assert.deepEqual(["2026-09-07", "2026-09-08", "2026-09-21", "2026-09-22", "2026-10-04"].map(beyond), [
    false,
    false,
    false,
    true,
    true,
  ]);
  assert.deepEqual(
    toCalendarVM(span("2026-09-07", 7, { rules: null }), NOW).offer,
    { days: 14, until: "2026-09-21", label: "Sep 21", slot: 30 },
    "no rules on file: the default",
  );
  assert.equal(toCalendarVM(span("2026-09-07", 7, { rules: { max_days_ahead: 3 } }), NOW).offer.until, "2026-09-10");
});

test("REGRESSION (C1): the booking rules AI follows are all on the page -- the party size and the services that need a consultation first were never said, and closures past the sixth vanished", () => {
  const rules = {
    lead_hours: 2,
    buffer_min: 15,
    max_days_ahead: 14,
    party_max: 6,
    consult_first: ["Balayage", "Color correction"],
  };
  const closures = Array.from({ length: 8 }, (_, i) => ({
    date: shiftKey("2026-09-19", i * 7),
    note: i === 0 ? "Wedding" : null,
  }));
  const vm = toCalendarVM(dto({ rules, closures }), NOW);
  assert.deepEqual(vm.ruleParts, [
    "at least 2h notice",
    "15 min between bookings",
    "up to 14 days ahead",
    "30-min slots",
    "up to 6 people per booking",
  ]);
  assert.deepEqual(vm.consultFirst, ["Balayage", "Color correction"]);
  assert.deepEqual(toCalendarVM(dto(), NOW).consultFirst, [], "none on file, none said");
  assert.deepEqual([vm.closuresAhead.length, vm.closuresMore], [6, 2]);
  assert.equal(toCalendarVM(dto(), NOW).closuresMore, 0);
  fresh(dto({ rules, closures }));
  const tree = page();
  assert.deepEqual(ruleLines(tree, "Booking"), vm.ruleParts, "REGRESSION: the party size was never said");
  const consult = textOf(byTestId(tree, "cal-rules-consult"));
  assert.ok(
    consult.includes("Consultation first") && consult.includes("Balayage · Color correction"),
    `REGRESSION: which services need a consultation was said only inside the service picker: ${consult}`,
  );
  assert.match(
    textIn(byTestId(tree, "cal-rules")),
    /\+2 more/,
    "REGRESSION: the closures past the sixth vanished without a word",
  );
});

test("REGRESSION (C1): the feed line says what was read and leaves what was left out to the notes -- it also said '2 repeating rules read once · 3 more not shown', unexplained, beside the notes that explain them", () => {
  const vm = toCalendarVM(dto({ feed: { ...dto().feed, skipped_recurring: 2, dropped: 3 } }), NOW);
  assert.equal(vm.feed.line, "From your calendar · read 2m ago · 4 events");
  assert.deepEqual(
    vm.feed.notes.map((n) => n.id),
    ["repeats", "undrawn"],
    "said once, in words the owner can act on",
  );
});

test("REGRESSION (C1): the page says only what it read -- an unreadable calendar showed '0 · on your calendar', and days still on their way counted as empty", () => {
  const empty = dto().days.map((d) => ({ ...d, items: [], windows: [] }));
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      days: empty,
    }),
  );
  let tree = page();
  assert.match(textOf(byTestId(tree, "cal-notice-feed")), /Couldn't load the calendar\./);
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
      days: empty,
    }),
  );
  tree = page();
  assert.match(textOf(byTestId(tree, "cal-notice-feed")), /No calendar connected\./);
  fresh();
  tree = page();
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  assert.ok(
    columns(tree).every((c) => classes(c).includes("loading")),
    "REGRESSION: next week, still on its way, read as a week with nothing on the calendar",
  );
});

test("REGRESSION (C1): a day past what AI offers says so, and the legend names the last day it offers -- the agenda said 'nothing AI would offer', as if the day were booked solid", () => {
  fresh(span("2026-09-07", 42, { rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 7 } }));
  let tree = page();
  pickView(tree, "agenda");
  tree = page();
  const day = (key) =>
    textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === key));
  assert.match(
    day("2026-09-15"),
    /not offered yet · it offers times up to 7 days ahead/,
    "REGRESSION: a day past the offer read as a day with nothing to offer",
  );
  assert.doesNotMatch(day("2026-09-15"), /Open[^:]*:\s*none\b/);
  assert.match(day("2026-09-10"), /Open[^:]*:\s*none\b/, "a day inside the offer with no times still says that");
  assert.match(legend(tree), /through Sep 14/, "the legend names the last day it offers");
});

test("REGRESSION (C1): leaving the Calendar takes the loaded weeks back to today's -- a board left on another month took Today's day and its next opening with it", async () => {
  fresh();
  page();
  assert.equal(homes, 0, "nothing goes home while the page is open");
  leave();
  assert.equal(homes, 1, "REGRESSION: the page left the window wherever it had moved it");
  // The bridge's half: a moved window goes home; one already home is not read again.
  const { getCalendarSpan, setCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  setSurfaceValue("calendar", { vm: toCalendarVM(span("2026-08-31", 63), NOW), fetchedAt: 1 });
  setCalendarSpan("2026-11-23", 63);
  assert.equal(await realVerbs.home(), true, "a window moved to November goes home");
  assert.equal(getCalendarSpan().from, null, "to the weeks around today");
  assert.equal(await realVerbs.home(), false, "and a window already home stays as it is");
});
