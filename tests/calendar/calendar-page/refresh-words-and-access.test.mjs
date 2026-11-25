/**
 * The Calendar's C2 to C5b: refresh, loading and a calendar that cannot be read; one word per thing; the keyboard, a
 * screen reader, a phone and contrast; and a service that needs a consultation first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarHoursLines, shiftKey, stateOf, toCalendarVM, todayDay } from "@chanlytics/contracts";
import { keysDrawn } from "../../_keys.mjs";
import {
  CALENDAR_PAGE,
  CR_WARM_MS,
  NOW,
  S,
  TZ,
  all,
  at,
  barMenu,
  byTestId,
  dto,
  find,
  frames,
  fresh,
  leave,
  legend,
  monthDay,
  openTimes,
  page,
  pickView,
  picker,
  realVerbs,
  runsRead,
  setCells,
  setHonourDeps,
  setSurfaceValue,
  settingsItem,
  settle,
  shownView,
  span,
  surfaceValue,
  textIn,
  textOf,
  toasts,
  useDayVm,
  warmed,
  went,
  withNext,
} from "./_calendar-page.mjs";

/* ------------------- C2: refresh, loading, and a calendar that can't be read ------------------- */

test("(C2) the feed line says when the calendar was last tried where that is the news: a read that failed, and a refresh that couldn't reach it", () => {
  const tried = "2026-09-08T15:57:00.000Z"; // three minutes before NOW
  const down = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: "2026-09-08T12:00:00.000Z",
        checked_at: tried,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
    NOW,
  );
  assert.equal(down.feed.line, "Your calendar couldn't be read · tried 3m ago · updated 4h ago");
  const never = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        checked_at: tried,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
    NOW,
  );
  assert.equal(never.feed.line, "Your calendar couldn't be read · tried 3m ago", "never read: only when it was tried");
  const stale = toCalendarVM(dto({ feed: { ...dto().feed, stale: true, reason: "http", checked_at: tried } }), NOW);
  assert.ok(stale.feed.line.includes("· couldn't be refreshed 3m ago ·"), stale.feed.line);
  assert.equal(
    toCalendarVM(dto({ feed: { ...dto().feed, checked_at: tried } }), NOW).feed.line,
    "From your calendar · read 2m ago · 4 events",
    "a good read says when it read, nothing more",
  );
});

test("REGRESSION (C2): the feed line has a Refresh that reads the calendar afresh and says what came of it -- the board read itself every five minutes and offered no way to ask sooner", async () => {
  fresh();
  const asked = [];
  let release = null;
  globalThis.window.__calendar.refresh = (opts) => {
    asked.push(opts);
    return new Promise((r) => {
      release = r;
    });
  };
  let tree = page();
  const button = () => byTestId(tree, "cal-refresh");
  assert.ok(button(), "REGRESSION: no way to read the calendar again");
  const pressed = button().props.onClick();
  tree = page();
  assert.deepEqual(asked, [{ fresh: true }], "a fresh read, not the cache");
  assert.match(textOf(button()), /^Reading…$/, "on its way, it says so");
  assert.equal(button().props.disabled, true, "and a second press waits for it");
  button().props.onClick();
  assert.equal(asked.length, 1, "a press that reaches it anyway sends nothing more");
  release(true);
  await pressed;
  tree = page();
  assert.equal(textOf(button()), "Refresh");
  assert.match(textOf(toasts.at(-1).msg), /Read your calendar just now/);
  // It landed, and the calendar still couldn't be reached: the last good read stays, and the toast says so.
  globalThis.window.__calendar.refresh = async () => {
    setSurfaceValue("calendar", {
      vm: toCalendarVM(
        dto({ feed: { ...dto().feed, stale: true, reason: "http", problem: "The calendar answered 503." } }),
        NOW,
      ),
      fetchedAt: 2,
    });
    return true;
  };
  await byTestId(page(), "cal-refresh").props.onClick();
  assert.equal(toasts.at(-1).tone, "warn");
  assert.match(textOf(toasts.at(-1).msg), /Couldn't refresh your calendar · showing the last good read/);
  assert.match(textOf(toasts.at(-1).msg), /The calendar answered 503\./, "with why");
  // Nothing landed at all.
  globalThis.window.__calendar.refresh = async () => false;
  await byTestId(page(), "cal-refresh").props.onClick();
  assert.equal(toasts.at(-1).tone, "warn");
  assert.match(textOf(toasts.at(-1).msg), /Couldn't reach Chanlytics/);
});

test("REGRESSION (C2): a calendar that can't be read, or couldn't be refreshed, offers Retry beside the address -- its only way back was Settings", async () => {
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
        problem: "The calendar answered 404.",
      },
    }),
  );
  const asked = [];
  globalThis.window.__calendar.refresh = async (opts) => {
    asked.push(opts);
    return true;
  };
  const retry = byTestId(page(), "cal-feed-retry");
  assert.ok(retry, "REGRESSION: the card's only way back was Settings");
  await retry.props.onClick();
  assert.deepEqual(asked, [{ fresh: true }]);
  assert.equal(toasts.at(-1).tone, "warn");
  assert.match(textOf(toasts.at(-1).msg), /Still couldn't read your calendar/);
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http" } }));
  globalThis.window.__calendar.refresh = async (opts) => {
    asked.push(opts);
    return true;
  };
  await byTestId(page(), "cal-feed-stale-retry").props.onClick();
  assert.deepEqual(asked, [{ fresh: true }, { fresh: true }], "and the card over the last good read");
});

test("REGRESSION (C2): days on their way say so in words -- the board only dimmed them", () => {
  const later = dto({ from: "2026-09-14", to: "2026-09-20" });
  later.days = later.days.map((d, i) => ({ key: shiftKey("2026-09-14", i), items: [], windows: [] }));
  fresh(later);
  globalThis.window.__calendar.ensure = () => new Promise(() => {});
  page();
  let tree = page();
  const reading = byTestId(tree, "cal-reading");
  assert.ok(reading, "REGRESSION: nothing said the board was reading");
  assert.equal(reading.props.role, "status");
  assert.match(textOf(reading), /^Reading…$/, "in the range, where the days on screen are named");
  // The one rule every page dims by (components.css [data-loading] [data-dims]): it dimmed its own way, at once.
  assert.equal(byTestId(tree, "calendar-real").props["data-loading"], "", "the page says its days are on their way");
  assert.equal(byTestId(tree, "cal-body").props["data-dims"], true, "the board is what dims");
  assert.equal(byTestId(tree, "cal-body").props["aria-busy"], "true");
  assert.ok(!String(byTestId(tree, "cal-body").props.className).includes("is-loading"), "not by a page's own class");
  pickView(tree, "agenda");
  tree = page();
  assert.match(textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day")[0]), /Reading this day/);
  pickView(tree, "month");
  tree = page();
  assert.match(textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-month-cell")[0]), /reading/);
});

test("(C2) the bridge's fresh read asks the route for fresh=1 once, then reads as before", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { calendarOverride, setCalendarFresh } = await import(`${S}/calendar/surface.ts`);
  const seen = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com" },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      const runs = runsRead(url);
      if (runs) return runs;
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: { calendar: dto() } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  try {
    setCalendarFresh(true);
    await calendarOverride.apply();
    await calendarOverride.apply();
    assert.equal(seen.length, 2);
    assert.match(seen[0], /[?&]fresh=1(&|$)/, "the first read asks for a fresh one");
    assert.ok(!/fresh=/.test(seen[1]), "and only that one");
  } finally {
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("(C2) the bridge's refresh reads through the runner, fresh when asked, says whether a read landed, and never leaves fresh behind", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");
  const { calendarOverride } = await import(`${S}/calendar/surface.ts`);
  const seen = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    cal: surfaceValue("calendar"),
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", reload() {}, assign() {} },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      const runs = runsRead(url);
      if (runs) return runs;
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: { calendar: dto() } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    for (let i = 0; i < 20 && !seen.length; i += 1) await pause();
    await pause();
    seen.length = 0;
    assert.equal(await realVerbs.refresh({ fresh: true }), true, "a read that landed says so");
    assert.equal(seen.length, 1);
    assert.match(seen[0], /[?&]fresh=1(&|$)/, "REGRESSION: the Refresh read the route's cache");
    await pause();
    assert.equal(await realVerbs.refresh(), true);
    assert.ok(!/fresh=/.test(seen[1]), "the five-minute read reads as before");
  } finally {
    stop();
  }
  try {
    seen.length = 0;
    assert.equal(
      await realVerbs.refresh({ fresh: true }),
      false,
      "with no runner nothing lands, and the board is told so",
    );
    await calendarOverride.apply();
    assert.ok(!/fresh=/.test(seen[0]), "and the next read does not ask for a fresh one it was never given");
  } finally {
    setSurfaceValue("calendar", was.cal);
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("a window the board has read paints at once on the way back, and is read again behind -- each way was a read of its own", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  // Measured on the salon's workspace, 22 Sep: the board held one window, so back to this week, and back to December,
  // were 390-500ms of "Reading those days…" each, and leaving for Reports read today's weeks again besides.
  const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");
  const { calendarOverride, getCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  const { windowFor, zoneDayKey } = await import("@chanlytics/contracts");
  const seen = [];
  const parked = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    cal: surfaceValue("calendar"),
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", reload() {}, assign() {} },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      const runs = runsRead(url);
      if (runs) return runs;
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      // The weeks around today are the route's to work out (`around`), as the board's first read asks for them.
      const w = q.around === "today" ? windowFor(zoneDayKey(Date.now(), TZ)) : { from: q.from, days: Number(q.days) };
      seen.push(w.from);
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(w.from, w.days) } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  const release = async () => {
    for (let i = 0; i < 40; i += 1) {
      while (parked.length) parked.shift()();
      await pause();
    }
  };
  const home = windowFor(zoneDayKey(Date.now(), TZ)).from;
  const shown = () => surfaceValue("calendar")?.vm?.from;
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await release();
    assert.equal(shown(), home, "the weeks around today, read at boot");
    // A window no read ahead reaches: the module keeps what it holds past this test, and a window of the months around
    // today would be one the read-ahead test below skips (in November 2026 it was this one's old 2026-11-23).
    const away = "2031-06-02";
    const toAway = realVerbs.goTo(away, 63);
    await release();
    assert.equal(await toAway, true);
    assert.equal(shown(), away);
    // Back home: held, so painted before any read lands, and read again behind.
    seen.length = 0;
    let back = false;
    realVerbs.goTo(null).then(() => {
      back = true;
    });
    await pause();
    assert.equal(shown(), home, "REGRESSION: the weeks around today waited on a read of their own");
    assert.equal(back, true, "and the move answered at once");
    assert.deepEqual(seen, [home], "read again behind all the same");
    await release();
    assert.equal(getCalendarSpan().from, null);
    // And back there: held too.
    realVerbs.goTo(away, 63);
    await pause();
    assert.equal(shown(), away, "the way back is at once");
    await release();
  } finally {
    stop();
    await release();
    setSurfaceValue("calendar", was.cal);
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("REGRESSION: two moves whose reads overlap land as the second, and neither says it could not read the days -- the first, its answer dropped, put the span back under the second, whose own answer was then dropped too", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");
  const { calendarOverride, getCalendarSpan, setCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  const { windowFor, zoneDayKey } = await import("@chanlytics/contracts");
  setCalendarSpan(null);
  const parked = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    cal: surfaceValue("calendar"),
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", reload() {}, assign() {} },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      const runs = runsRead(url);
      if (runs) return runs;
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      const w = q.around === "today" ? windowFor(zoneDayKey(Date.now(), TZ)) : { from: q.from, days: Number(q.days) };
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(w.from, w.days) } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  const release = async () => {
    for (let i = 0; i < 40; i += 1) {
      while (parked.length) parked.shift()();
      await pause();
    }
  };
  const shown = () => surfaceValue("calendar")?.vm?.from;
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await release();
    // Two windows this tab has never read, so each move waits on its read; the second asked while the first is out.
    const first = "2027-03-01";
    const second = "2027-05-03";
    const toFirst = realVerbs.goTo(first, 63);
    await pause();
    const toSecond = realVerbs.goTo(second, 63);
    await pause();
    assert.equal(parked.length, 2, "both reads are out at once");
    await release();
    assert.equal(await toFirst, true, "REGRESSION: the first move said its days couldn't be read");
    assert.equal(await toSecond, true, "REGRESSION: and so did the second, though every read landed");
    assert.equal(getCalendarSpan().from, second, "REGRESSION: the first move put the span back under the second");
    assert.equal(shown(), second, "the board shows the weeks asked for last");
  } finally {
    stop();
    await release();
    setCalendarSpan(null);
    setSurfaceValue("calendar", was.cal);
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("the weeks a few moves on are the ones to read ahead: none where the loaded weeks cover them, each way's nearest where they do not", async () => {
  const { windowsToWarm } = await import(`${S}/calendar/warm.ts`);
  // Nine weeks from Mon Aug 24 to Sun Oct 25, the window around Sep 8.
  const loaded = toCalendarVM(span("2026-08-24", 63), NOW).days;
  assert.deepEqual(
    windowsToWarm({ view: "week", anchor: "2026-09-08", loaded: [] }),
    [],
    "nothing loaded, nothing to measure from",
  );
  assert.deepEqual(
    windowsToWarm({ view: "week", anchor: "2026-10-06", loaded }),
    [{ from: "2026-09-21", days: 63 }],
    "three weeks from the end: the October window, the one stepping to the week of Oct 26 would read",
  );
  assert.deepEqual(
    windowsToWarm({ view: "week", anchor: "2026-09-08", loaded }),
    [{ from: "2026-07-20", days: 63 }],
    "mid-window, forward is covered for three weeks and back is not: the August window, the one a step before Aug 24 reads",
  );
  assert.deepEqual(
    windowsToWarm({ view: "day", anchor: "2026-09-20", loaded }),
    [],
    "a day looks three days on, which the weeks cover on both sides",
  );
  assert.deepEqual(
    windowsToWarm({ view: "day", anchor: "2026-10-23", loaded }),
    [{ from: "2026-09-21", days: 63 }],
    "and three days from the end it reads ahead",
  );
  assert.deepEqual(
    windowsToWarm({ view: "month", anchor: "2026-09-08", loaded }),
    [
      { from: "2026-09-21", days: 63 },
      { from: "2026-07-20", days: 63 },
    ],
    "a month's neighbours are never in the nine weeks: both are read, the next first",
  );
  assert.deepEqual(
    windowsToWarm({ view: "agenda", anchor: "2026-09-08", loaded }),
    [
      { from: "2026-09-21", days: 63 },
      { from: "2026-07-20", days: 63 },
    ],
    "the agenda steps fortnights, so three steps either way leave the nine weeks",
  );
});

test("a window read ahead is held and paints at once when the board gets there; one for a workspace left is dropped", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { warmCalendar, calendarOverride, setCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  const { startSurfaces } = await import("../../../apps/dashboard/src/bridge/surface-runner.ts");
  // The weeks the board last looked at stay with the module: this one begins on the weeks around today.
  setCalendarSpan(null);
  const { windowFor, zoneDayKey, shiftMonth: monthOf } = await import("@chanlytics/contracts");
  const seen = [];
  const parked = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    cal: surfaceValue("calendar"),
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", reload() {}, assign() {} },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      const runs = runsRead(url);
      if (runs) return runs;
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      // The weeks around today are the route's to work out (`around`), as the board's first read asks for them.
      const w = q.around === "today" ? windowFor(zoneDayKey(Date.now(), TZ)) : { from: q.from, days: Number(q.days) };
      seen.push(w.from);
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(w.from, w.days) } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  const release = async () => {
    for (let i = 0; i < 40; i += 1) {
      while (parked.length) parked.shift()();
      await pause();
    }
  };
  const today = zoneDayKey(Date.now(), TZ);
  const home = windowFor(today).from;
  const next = windowFor(monthOf(today, 1)).from;
  const before = windowFor(monthOf(today, -1)).from;
  const shown = () => surfaceValue("calendar")?.vm?.from;
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await release();
    assert.equal(shown(), home, "the weeks around today, read at boot");
    seen.length = 0;
    realVerbs.warmAround("month", today);
    await release();
    assert.deepEqual([...seen].sort(), [before, next].sort(), "the month either side was read, and nothing else");
    assert.equal(shown(), home, "reading ahead paints nothing");
    // Again: they are held, so no read is made for them.
    seen.length = 0;
    realVerbs.warmAround("month", today);
    await release();
    assert.deepEqual(seen, [], "a window already held is not read twice");
    // And the move to one paints before any read lands; the read behind keeps it current.
    const arrived = realVerbs.goTo(next, 63);
    await pause();
    assert.equal(shown(), next, "REGRESSION: stepping to a month read ahead waited on a read of its own");
    assert.equal(await arrived, true);
    await release();
    // A window that lands after the tab changed workspace is not held under the other one.
    seen.length = 0;
    const far = windowFor(monthOf(today, 7)).from;
    const reading = warmCalendar({ from: far, days: 63 });
    await pause();
    assert.deepEqual(seen, [far], "the read was made");
    // The workspace is the address's (/w/<slug>): the tab moved to another while the read was on its way.
    globalThis.window.location.pathname = "/w/ridge";
    await release();
    await reading;
    // Held under the workspace it landed in, it would paint there at once: it was read for the one the tab left.
    realVerbs.goTo(far, 63);
    await pause();
    assert.notEqual(shown(), far, "REGRESSION: the weeks of a workspace the tab left were held for the one it is on");
    await release();
    globalThis.window.location.pathname = "/w/harbor";
    setCalendarSpan(null);
  } finally {
    stop();
    await release();
    setSurfaceValue("calendar", was.cal);
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("a read ahead that fails costs nothing: the move reads the window when it is made", async () => {
  const { warmCalendar } = await import(`${S}/calendar/surface.ts`);
  const was = globalThis.window.fetch;
  globalThis.window.fetch = async () => new Response("{}", { status: 500 });
  try {
    await warmCalendar({ from: "2031-03-03", days: 63 });
  } finally {
    globalThis.window.fetch = was;
  }
});

test("the board reads the weeks beside it once it has stood still for a second: not as it draws, not after it has gone", () => {
  const timers = [];
  const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms, cleared: false });
    return timers.length - 1;
  };
  globalThis.clearTimeout = (id) => {
    if (timers[id]) timers[id].cleared = true;
  };
  const warmTimers = () => timers.filter((t) => t.ms === CR_WARM_MS);
  try {
    fresh();
    page();
    assert.deepEqual(warmed, [], "nothing is read the moment the board draws");
    assert.equal(warmTimers().length, 1, "it waits a beat first");
    warmTimers()[0].fn();
    assert.deepEqual(warmed, [["week", "2026-09-08"]], "then asks for the weeks round the view on screen");
    leave();
    assert.equal(warmTimers()[0].cleared, true, "a board that goes first reads nothing");
  } finally {
    globalThis.setTimeout = real.set;
    globalThis.clearTimeout = real.clear;
  }
});

test("the view the member chose is the one the board opens on again in this tab; a link's day and the phone's agenda are only defaults", () => {
  const kept = [];
  const store = {};
  globalThis.window.__tabMemory = {
    place: (p, v) => store[`${p}|${v}`] ?? null,
    keepPlace: (p, v, place) => {
      kept.push([p, v, place]);
      store[`${p}|${v}`] = place;
    },
  };
  // The view kept follows the address's word as it changes, as React runs an effect whose dependency moved.
  setHonourDeps(true);
  try {
    fresh();
    let tree = page();
    assert.equal(shownView(tree), "week", "nothing kept: a desk opens on the week");
    pickView(tree, "month");
    page();
    assert.deepEqual(kept, [["calendar", "board", { view: "month" }]], "picking a view keeps it");
    fresh();
    assert.equal(shownView(page()), "month", "a refresh, or a trip away and back, opens on it");
    globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
    try {
      fresh();
      assert.equal(shownView(page()), "month", "and a phone that chose it keeps it over the agenda");
    } finally {
      delete globalThis.window.matchMedia;
    }
    fresh();
    at("calendar/2026-09-10");
    assert.equal(shownView(page()), "day", "a link to a day opens the day");
    assert.equal(kept.length, 1, "which is where the board went, not a choice, and keeps nothing");
    store["calendar|board"] = { view: "year" };
    fresh();
    assert.equal(shownView(page()), "week", "a view the board does not draw is not opened on");
  } finally {
    setHonourDeps(false);
    delete globalThis.window.__tabMemory;
  }
});

test("REGRESSION (C3): the times AI would offer are open times wherever they are named -- the strip said 'Open windows' and 'Next opening', the service picker 'Windows', and Today 'next opening', while Business and AI say open times", () => {
  fresh(withNext({ services: [{ name: "Balayage", duration_min: 90, consult_first: false }] }));
  const tree = page();
  assert.match(legend(tree), /^Open times through /);
  assert.equal(
    byTestId(tree, "cal-service").props.label,
    "Open times that fit a service",
    "REGRESSION: 'Windows that fit a service'",
  );
  const vm = toCalendarVM(withNext(), NOW);
  assert.equal(todayDay(vm, null).nextOpening, "today 3:30 PM", "REGRESSION: Today's day said 'next opening'");
  const was = { cal: surfaceValue("calendar") };
  setSurfaceValue("calendar", { vm });
  try {
    setCells([]);
    frames.begin();
    // The strip draws it as "Next open time {this}" (strip.tsx), from the day the strip and the brief both read.
    assert.equal(useDayVm().nextOpening, "today 3:30 PM", "REGRESSION: Today's day said 'next opening'");
  } finally {
    setSurfaceValue("calendar", was.cal);
  }
});

test("REGRESSION (C3): what could not be read is said one way -- a month's days said 'not read' and the strip 'couldn't be read', beside the Retry line's 'Couldn't read those days'", async () => {
  fresh(dto(), [false]);
  setHonourDeps(true);
  try {
    let tree = page();
    pickView(tree, "month");
    page();
    await settle();
    tree = page();
    const unread = all(
      tree,
      (n) =>
        String(n.props?.className ?? "").split(" ")[0] === "cal-month-cell" &&
        String(n.props.className).includes("unread"),
    );
    assert.ok(unread.length > 0, "the month's days outside the loaded week couldn't be read");
    assert.ok(
      unread.every((n) => textOf(n).includes("couldn't read")),
      `REGRESSION: 'not read': ${textOf(unread[0])}`,
    );
    assert.match(
      textOf(byTestId(tree, "cal-failed")),
      /Couldn't read those days/,
      "beside the Retry line, which says it the same way",
    );
  } finally {
    setHonourDeps(false);
  }
});

test("REGRESSION (C3): the rules bar says what Business calls each thing -- 'Rules' for the booking rules, 'Edit in Settings' for a tab named Business, and a closure run into its note", () => {
  fresh();
  const bar = byTestId(page(), "cal-rules");
  assert.deepEqual(
    all(bar, (n) => n.props?.className === "cal-rules-label").map(textOf),
    ["Hours ", "Closed ", "Booking ", "Booking tool "],
    "REGRESSION: 'Rules'; and what the business books with is 'Booking tool', here as on Business (spec §10)",
  );
  // Each name is the door to the Business row of that name (7 Oct 2026): the sheet had one door, to the top of the tab.
  went.length = 0;
  for (const row of ["hours", "closures", "booking_rules", "calendar"])
    byTestId(bar, `cal-rules-door-${row}`).props.onClick();
  assert.deepEqual(went, [
    "admin/workspace/hours",
    "admin/workspace/closures",
    "admin/workspace/booking_rules",
    "admin/workspace/calendar",
  ]);
  assert.ok(textIn(bar).includes("Sep 12 (Wedding)"), `REGRESSION: 'Sep 12 Wedding': ${textIn(bar)}`);
  // Each door says where it goes, for a tab named Business: 'Edit in Settings' named a tab there is none of.
  assert.deepEqual(
    [...new Set(all(bar, (n) => /^cal-rules-door-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props.title))],
    ["Change it in Settings › Hours & booking"],
    "REGRESSION: 'Edit in Settings', for a tab named Business",
  );
  assert.equal(
    find(bar, (n) => n.type === "button" && textOf(n).startsWith("Edit in")),
    null,
    "and no second door",
  );
});

test("REGRESSION (C3): hours are said in the board's clock -- the bar said 'Mon–Tue 09:00–18:00' over a board drawn in 9 AM, a morning-to-midnight day could read '10 – 12 AM', and a day with half its hours said the prompt's 'ask them to call' to the owner", () => {
  fresh();
  // Each run of days on a line of its own (24 Sep): they ran on in one sentence joined by dots.
  const hours = find(
    byTestId(page(), "cal-rules"),
    (n) => n.props?.className === "cal-rules-group" && textOf(n).startsWith("Hours"),
  );
  assert.deepEqual(
    all(hours, (n) => n.props?.className === "cal-rules-line").map(textOf),
    ["Mon–Tue 9 AM – 6 PM", "Wed 9 AM – 1 PM and 3 – 7 PM", "Thu–Fri 9 AM – 6 PM", "Sat 10 AM – 4 PM", "Sun closed"],
    `REGRESSION: 09:00–18:00: ${textOf(hours)}`,
  );
  assert.deepEqual(
    calendarHoursLines({
      mon: { open: "10:00", close: "24:00" },
      tue: { open: "09:00" },
      fri: { open: "20:00", close: "24:00" },
    }),
    ["Mon 10 AM – 12 AM", "Tue hours incomplete", "Wed–Thu closed", "Fri 8 PM – 12 AM", "Sat–Sun closed"],
    "a span to midnight ends in the next day's AM, whichever half it starts in",
  );
});

test("REGRESSION (C3): the feed's state is the pill Connections and Setup use, in their words, with only the details beside it -- it was a coloured dot here and 'Readable' there", () => {
  assert.deepEqual(
    ["ok", "stale", "unavailable", "none"].map((s) => stateOf("calendar", s)),
    [
      { tone: "ok", label: "Readable" },
      { tone: "warn", label: "Last good read" },
      { tone: "warn", label: "Couldn't be read" },
      { tone: "plain", label: "Not connected" },
    ],
  );
  const tried = "2026-09-08T15:57:00.000Z"; // three minutes before NOW
  const feed = (over) => toCalendarVM(dto({ feed: { ...dto().feed, ...over } }), NOW).feed;
  assert.deepEqual([feed({}).health, feed({}).detail], ["ok", "From your calendar · read 2m ago · 4 events"]);
  assert.equal(feed({ stale: true, reason: "http", checked_at: tried }).health, "stale");
  const down = feed({ state: "unavailable", read_at: "2026-09-08T12:00:00.000Z", checked_at: tried, events: 0 });
  assert.deepEqual([down.health, down.detail], ["unavailable", "tried 3m ago · updated 4h ago"]);
  assert.equal(
    down.line,
    "Your calendar couldn't be read · tried 3m ago · updated 4h ago",
    "the whole sentence stays, for AI",
  );
  const none = feed({ present: false, state: "none", read_at: null, events: 0 });
  assert.deepEqual([none.health, none.detail], ["none", ""]);
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: "2026-09-08T12:00:00.000Z",
        checked_at: tried,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
  );
  const chip = byTestId(page(), "cal-feed");
  const pill = find(chip, (n) => n.type === globalThis.StatePill);
  assert.ok(pill, "REGRESSION: a coloured dot, in no word Connections uses");
  assert.deepEqual([pill.props.kind, pill.props.value], ["calendar", "unavailable"]);
  const said = textOf(chip);
  assert.ok(said.includes("Couldn't be read") && said.includes("tried 3m ago · updated 4h ago"), said);
  assert.ok(!said.includes("Your calendar couldn't be read"), `the state is said once, by the pill: ${said}`);
});

test("REGRESSION (C3): the page's other words match the product's -- Try again beside FailedRead's Retry, Connect where Setup says paste the address, America/New_York for a zone Settings calls New York, and 'your link' for the booking link", () => {
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
  globalThis.window.__calendar.refresh = () => new Promise(() => {});
  let tree = page();
  assert.equal(textOf(byTestId(tree, "cal-feed-retry")), "Retry", "REGRESSION: 'Try again', beside FailedRead's Retry");
  byTestId(tree, "cal-feed-retry").props.onClick();
  assert.equal(textOf(byTestId(page(), "cal-feed-retry")), "Retrying…");
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http" } }));
  assert.equal(textOf(byTestId(page(), "cal-feed-stale-retry")), "Retry");
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    }),
  );
  const card = byTestId(page(), "cal-notice-feed");
  assert.deepEqual(
    all(card, (n) => n.type === "button").map(textOf),
    ["Connect"],
    "REGRESSION: 'Paste the address', to a business that may have no address to paste: the one answer's own press, in its one word beside the sentence (Ruben, 21 Oct 2026)",
  );
  assert.match(textOf(card), /No calendar connected\./);
  // Open times are a calendar link's that reads: with none the board draws no window, so Show offers no switch for them
  // and the service they fit is not asked (Ruben, 21 Oct 2026: Open times flipped and nothing moved).
  const noTimes = page();
  assert.equal(
    barMenu(noTimes, "Show")?.props.groups[0].toggles.items.some((i) => i.value === "open") ?? false,
    false,
    "REGRESSION: an Open times switch with nothing to draw",
  );
  assert.equal(byTestId(noTimes, "cal-service"), null, "no service to fit open times there are none of");
  assert.doesNotMatch(
    textOf(card),
    /Say what you book with/,
    "the card says its first sentence alone; Settings' row says the rest",
  );
  // Bookings arriving by email and no calendar (00345): the card says so in the one answer's words, and asks for a
  // press only where something is the owner's to do -- the emails held for a look.
  const feedNone = {
    present: false,
    state: "none",
    read_at: null,
    events: 0,
    recurring_expanded: 0,
    skipped_recurring: 0,
  };
  const byEmail = (over = {}) => ({
    tool: "booksy",
    address: "salon@mail.example.com",
    last_at: "2026-09-08T14:00:00.000Z",
    count: 3,
    held: 0,
    held_list: [],
    forwarding: null,
    ...over,
  });
  fresh(dto({ feed: { ...feedNone, notices: byEmail() } }));
  tree = page();
  assert.equal(byTestId(tree, "cal-feed-door"), null, "emails that work ask nothing: no press");
  assert.equal(
    byTestId(tree, "cal-notice-feed"),
    null,
    "and nothing over the board: the board says only the exception",
  );
  assert.match(textIn(byTestId(tree, "cal-rules")), /Booksy/, "Hours and rules says where the bookings come from");
  fresh(dto({ feed: { ...feedNone, notices: byEmail({ held: 2 }) } }));
  let door = byTestId(page(), "cal-feed-door");
  assert.equal(textOf(door), "Look at them");
  assert.equal(door.props.variant, "primary", "emails held for a look are the primary act");
  assert.match(textOf(byTestId(page(), "cal-feed-notices")), /2 booking emails need a look\./);
  // A tool named and no email yet: the steps, offered quietly; a business that books by hand is told nothing.
  fresh(dto({ feed: { ...feedNone, notices: byEmail({ last_at: null, count: 0 }) } }));
  door = byTestId(page(), "cal-feed-door");
  assert.equal(textOf(door), "See the steps");
  assert.equal(door.props.variant, "quiet");
  fresh(dto({ feed: { ...feedNone, by_hand: true } }));
  assert.equal(byTestId(page(), "cal-notice-feed"), null, "booked by hand, by the owner's own word: no card");
  fresh();
  tree = page();
  assert.equal(toCalendarVM(dto(), NOW).zoneCity, "New York");
  assert.match(legend(tree), /New York time$/, "REGRESSION: 'times in America/New_York'");
  assert.match(
    textOf(find(tree, (n) => n.props?.className === "cal-about-note")),
    /through your booking link/,
    "REGRESSION: 'your link'",
  );
});

test("REGRESSION (C3): a service that needs a consultation is spoken of as AI handles it -- the agenda said AI 'books a consultation', and it never books; the picker said 'consult first'", () => {
  const services = [{ name: "Color correction", duration_min: 180, consult_first: true }];
  assert.equal(
    toCalendarVM(dto({ services }), NOW).services[0].label,
    "Color correction · 180 min · consultation first",
    "REGRESSION: 'consult first'",
  );
  fresh(dto({ services }));
  let tree = page();
  byTestId(tree, "cal-service").props.onValueChange("Color correction");
  tree = page();
  pickView(tree, "agenda");
  tree = page();
  const day = textOf(
    all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === "2026-09-09"),
  );
  assert.match(
    day,
    /AI offers a consultation for this, not the service/,
    "REGRESSION: 'books a consultation' -- it never books",
  );
  assert.ok(!day.includes("books"), day);
});

test("(C3) the Business card says the hours in the Calendar's words, beside the bar", async () => {
  // With contracts' hoursLines, which the tab's hours row imports (surfaces/settings/business/open.tsx).
  const { calendarHoursLines } = await import("@chanlytics/contracts");
  const week = { mon: { open: "09:00", close: "18:00" }, sat: { open: "10:00", close: "16:00" } };
  assert.deepEqual(
    calendarHoursLines(week),
    ["Mon 9 AM – 6 PM", "Tue–Fri closed", "Sat 10 AM – 4 PM", "Sun closed"],
    "REGRESSION: the card summarised the prompt's runs in the prompt's clock",
  );
  assert.equal(globalThis.window.__hoursRuns, undefined, "and there is no second way to say them");
});

/* ------------------- C4: keyboard, screen reader, phone, contrast ------------------- */

test("REGRESSION (C4): a day's head opens that day from the keyboard -- it was a clickable div no Tab reached, named only in a title", () => {
  fresh();
  let tree = page();
  const opens = () => all(tree, (n) => n.props?.["data-testid"] === "cal-dayhead-open");
  assert.equal(opens().length, 7, "REGRESSION: a div with onClick, out of the tab order");
  assert.ok(opens().every((b) => b.type === "button" && b.props.type === "button"));
  assert.equal(opens()[1].props["aria-label"], "Open Tuesday, September 8 in Day view");
  assert.equal(opens()[1].props["aria-current"], "date", "today's head says it is today");
  assert.equal(opens()[0].props["aria-current"], undefined);
  opens()[3].props.onClick();
  page();
  tree = page();
  assert.equal(shownView(tree), "day");
  assert.equal(textOf(byTestId(tree, "cal-range")), "Thu · Sep 10");
  assert.equal(opens().length, 0, "in Day view the head opens nothing");
});

test("REGRESSION (C4): a month day names its date and what it holds -- a screen reader heard '8', '1 taken', '1 open' with no date, and nothing said which day was today", async () => {
  fresh(dto(), [false]);
  setHonourDeps(true);
  try {
    let tree = page();
    pickView(tree, "month");
    page();
    await settle();
    tree = page();
    const cell = (key) => monthDay(tree, key);
    assert.equal(cell("2026-09-08").props["aria-label"], "Tuesday, September 8: 1 taken, 1 open");
    assert.equal(cell("2026-09-08").props["aria-current"], "date");
    assert.equal(cell("2026-09-09").props["aria-current"], undefined);
    assert.equal(cell("2026-09-10").props["aria-label"], "Thursday, September 10: 1 taken");
    assert.equal(cell("2026-09-12").props["aria-label"], "Saturday, September 12: closed · Wedding");
    assert.equal(cell("2026-09-09").props["aria-label"], "Wednesday, September 9: nothing on the calendar");
    assert.equal(cell("2026-09-20").props["aria-label"], "Sunday, September 20: couldn't read");
  } finally {
    setHonourDeps(false);
  }
});

test("REGRESSION (C4): an appointment and an all-day event name their time and day -- each said only its title, the day being wherever its column was", () => {
  fresh();
  const tree = page();
  assert.equal(byTestId(tree, "cal-block").props["aria-label"], "Ana Ruiz · Color, 2 – 3:30 PM, Tuesday, September 8");
  assert.equal(
    find(tree, (n) => n.props?.className === "cal-allday").props["aria-label"],
    "Team training, all day, Thursday, September 10",
  );
});

test("REGRESSION (C4): a move of the board is announced -- the range changed in silence", () => {
  fresh();
  const tree = page();
  assert.equal(
    byTestId(tree, "cal-range").props["aria-live"],
    "polite",
    "REGRESSION: the new range was never announced",
  );
});

test("REGRESSION: the Calendar draws no key -- its legend said ← → move · T today, and Previous, Today and Next named ←, T and → in their tips, beside the ? sheet that lists them", () => {
  fresh();
  const tree = page();
  assert.equal(
    find(tree, (n) => n.props?.className === "cal-keys"),
    null,
    "the legend's keys",
  );
  assert.match(legend(tree), / · New York time$/, "the zone, the legend's last words");
  assert.doesNotMatch(legend(tree), /Taken is from/, "one short line, never the three sentences (Ruben, 21 Oct 2026)");
  assert.equal(
    find(tree, (n) => n.props?.testid === "cal-rules")?.props.sub,
    "Times are New York time",
    "and Hours and rules says it under its name",
  );
  assert.deepEqual(
    ["cal-prev", "cal-today", "cal-next"].map((id) => byTestId(tree, id).props.title),
    ["Previous", undefined, "Next"],
    "the arrows' tips name them, and Today says Today already",
  );
  assert.deepEqual(keysDrawn(tree), []);
});

test("REGRESSION: the Calendar shows the calendar first -- a title the top bar already says, a paragraph, three stat cards and five rows of controls came before the first day, and on a phone the first day sat below the fold", () => {
  fresh(dto({ services: [{ name: "Balayage", duration_min: 90, consult_first: false }] }));
  let tree = page();
  assert.equal(
    find(tree, (n) => /\bcl-(head|page-title|page-sub|controls)\b/.test(String(n.props?.className ?? ""))),
    null,
    "REGRESSION: the page's own head, title and paragraph",
  );
  assert.equal(
    find(tree, (n) => n.type === globalThis.StatStrip || n.type === globalThis.StatCell),
    null,
    "REGRESSION: the counts as three cards",
  );
  // Every control in one bar, and the kit's date picker opened by the range; the views are the frame's strip over it.
  const bar = byTestId(tree, "cal-bar");
  for (const id of [
    "cal-prev",
    "cal-today",
    "cal-next",
    "cal-range",
    "cal-jump",
    "cal-service",
    "cal-show",
    "cal-options",
  ])
    assert.ok(byTestId(bar, id), `${id} is in the one bar`);
  assert.equal(
    find(bar, (n) => n.type === "select"),
    null,
    "REGRESSION: a native select in the bar",
  );
  const pick = picker(bar);
  assert.ok(pick, "the range opens the kit's date picker, not the browser's date field");
  assert.ok(
    byTestId(pick.props.trigger, "cal-range") && byTestId(pick.props.trigger, "cal-jump") === pick.props.trigger,
    "the range and the control that opens the picker are one",
  );
  assert.equal(
    find(bar, (n) => n.type === "input" && n.props?.type === "date"),
    null,
    "REGRESSION: a native date input",
  );
  // On a desk the bar is the act on the frame's row of views (board-parts.tsx calendarAct), and the page draws no head of its
  // own: a line of counts under the bar said again what the board draws (22 Sep), and the bar's own row stood between the
  // views and the first day (Ruben, 14 Oct 2026: one row, where the tabs are).
  assert.equal(
    find(tree, (n) => n.props?.className === "cal-head"),
    null,
    "no head between the views and the board on a desk",
  );
  assert.equal(bar.props.className, "cal-act", "the bar is the act the frame draws beside the views");
  // The hours, the rules, the calendar's source and Refresh are a sheet Settings opens (D6), never a fold under the board,
  // whose foot took the room an eleven-hour day needed on a phone; the booking link is Settings' own two items.
  const rules = () => find(tree, (n) => n.props?.testid === "cal-rules");
  assert.equal(rules().props.open, false, "shut until asked for");
  for (const id of ["cal-feed", "cal-refresh"]) {
    assert.ok(byTestId(rules(), id), `${id} is in Hours and rules`);
    assert.equal(byTestId(bar, id), null, `${id} is not among the controls`);
  }
  assert.deepEqual(
    barMenu(tree, "Calendar settings").props.groups.map((g) => [g.header, g.items.map((i) => i.label)]),
    [["Calendar settings", ["Copy booking link", "Hours and rules", "Booking tool", "Read it again now"]]],
    "what the calendar offers its owner, in one group at the bar's end, the booking link one row (Ruben, 21 Oct 2026)",
  );
  assert.ok(settingsItem(tree, "Copy booking link").copy, "the link copied in place, the menu held open (CAL-23)");
  assert.equal(
    settingsItem(tree, "Booking tool").hint,
    undefined,
    "a calendar that reads says nothing beside its tool",
  );
  settingsItem(tree, "Hours and rules").onSelect();
  tree = page();
  assert.equal(rules().props.open, true, "one tap shows them");
  rules().props.onClose();
  tree = page();
  assert.equal(rules().props.open, false, "and the sheet's close puts them away");
  assert.equal(
    find(tree, (n) => n.props?.["data-testid"] === "cal-about"),
    null,
    "REGRESSION: the fold under the board",
  );
  // A calendar that can't be read still says so over the board, with its Retry, not in the sheet.
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
  tree = page();
  assert.ok(byTestId(tree, "cal-notice-feed") && byTestId(tree, "cal-feed-retry"), "the notice and its Retry");
  assert.equal(byTestId(rules(), "cal-notice-feed"), null, "over the board, not in the sheet");
});

/* ---------------- C5b: a service that needs a consultation first ---------------- */

test("REGRESSION (C5b): the board sizes a consultation-first service's open times as a consultation, the rule the phone and the assistant follow -- it filtered them by the service's own three hours", () => {
  const services = [
    { name: "Color correction", duration_min: 180, consult_first: true },
    { name: "Consultation", duration_min: 30, consult_first: false },
  ];
  const week = dto({ services, rules: { ...dto().rules, consult_first: ["Color correction"] } });
  assert.deepEqual(
    toCalendarVM(week, NOW).services.map((s) => [s.name, s.offerMinutes]),
    [
      ["Color correction", 30],
      ["Consultation", 30],
    ],
  );
  fresh(week);
  let tree = page();
  byTestId(tree, "cal-service").props.onValueChange("Color correction");
  tree = page();
  assert.equal(openTimes(tree).length, 2, "REGRESSION: no open time fit Color correction");
  assert.match(legend(tree), /Open times for a consultation through Sep 21/);
  assert.match(
    textOf(byTestId(tree, "cal-notice-consult")),
    /The open times here are for a consultation, about 30 minutes\./,
  );
  pickView(tree, "agenda");
  tree = page();
  const day = (key) =>
    textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === key));
  assert.match(
    day("2026-09-08"),
    /Open for a consultation:3:30 – 6 PM/,
    "REGRESSION: the three-hour filter hid a two-and-a-half-hour open time",
  );
  // A service booked as itself is still sized by its own length.
  fresh(dto({ services: [{ name: "Balayage", duration_min: 140, consult_first: false }] }));
  tree = page();
  byTestId(tree, "cal-service").props.onValueChange("Balayage");
  tree = page();
  assert.equal(openTimes(tree).length, 1);
  assert.match(legend(tree), /Open times for Balayage through /);
});

test("the page publishes how long it keeps a read and its words for a read that gives no reason, and says those words itself", () => {
  // Settings › Business states the same calendar's last read in a row of its own (surfaces/settings/business/open.tsx), for as long
  // as this board keeps one, and in these words: one number and one spelling, this page's.
  const keeps = CALENDAR_PAGE;
  assert.equal(keeps.refreshMs, 5 * 60 * 1000, "the five minutes after which the board reads itself again");
  assert.deepEqual(Object.keys(keeps.words).sort(), ["stale", "unavailable"]);
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "unreachable", problem: null } }));
  assert.ok(
    textOf(byTestId(page(), "cal-notice-stale")).includes(keeps.words.stale),
    "the card over a last good read says them",
  );
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
        problem: null,
      },
    }),
  );
  assert.ok(
    textOf(byTestId(page(), "cal-notice-feed")).includes(keeps.words.unavailable),
    "and the card over a calendar that couldn't be read",
  );
  // A reason of the read's own wins over both.
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http", problem: "The calendar answered 503." } }));
  const said = textOf(byTestId(page(), "cal-notice-stale"));
  assert.ok(said.includes("The calendar answered 503.") && !said.includes(keeps.words.stale), said);
});

test("the Calendar tells Ask what it draws (the Phase 2 plan, D3): the span on screen, and the people its appointments there name, in the board's order", () => {
  // Nine weeks loaded, one drawn.
  fresh(span("2026-08-31", 63));
  const vm = surfaceValue("calendar").vm;
  // Two appointments in the week on screen name people; one a month out does not count.
  const day = vm.days.find((d) => d.key === vm.today);
  const ahead = vm.days[vm.days.length - 1];
  const block = (id, name) => ({
    ...(day.blocks[0] ?? {}),
    id: `b-${id}`,
    person: {
      id,
      name,
      via: null,
      threadId: null,
      bookingLinkAction: {
        label: "Send the booking link",
        short: "Send the link",
        title: "",
        ready: false,
        offered: true,
      },
    },
  });
  day.blocks = [block("p-rosa", "Rosa Díaz"), block("p-ana", "Ana Ruiz"), block("p-rosa", "Rosa Díaz")];
  ahead.blocks = [block("p-far", "Far Away")];
  delete globalThis.window.__askOnScreen;
  page();
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.key, "calendar");
  assert.match(s.view, /^\d{4}-\d{2}-\d{2}\/\d+$/, "the span drawn: its first day and how many");
  assert.deepEqual(s.ids, ["p-rosa", "p-ana"], "each person once, in the board's order, and only the days on screen");
  assert.deepEqual(s.labels, ["Rosa Díaz", "Ana Ruiz"]);
  leave();
  assert.equal(globalThis.window.__askOnScreen, null, "the board gone, its people are no longer on screen");
});

test("every testid the page is known by is drawn in its view, the date picker follows the anchor, and nothing on the page moves, cancels, syncs two ways or prices", () => {
  const services = [{ name: "Balayage", duration_min: 90, consult_first: true }];
  const week = dto({
    services,
    rules: { ...dto().rules, consult_first: ["Balayage"] },
    feed: { ...dto().feed, skipped_recurring: 1, dropped: 1 },
  });
  fresh(week);
  let tree = page();
  const drawn = [];
  const has = (id) => !!byTestId(tree, id);
  const expectIds = (view, ids) => {
    for (const id of ids) assert.ok(has(id), `${view}: ${id}`);
    drawn.push(textOf(tree));
  };
  expectIds("week", [
    "calendar-real",
    "cal-pane",
    "cal-bar",
    "cal-prev",
    "cal-today",
    "cal-next",
    "cal-range",
    "cal-jump",
    "cal-service",
    "cal-body",
    "cal-dayhead",
    "cal-dayhead-open",
    "cal-col",
    "cal-block",
    "cal-window",
    "cal-show",
    "cal-options",
    "cal-rules",
    "cal-feed",
    "cal-feed-state",
    "cal-refresh",
    "cal-notice-note-repeats",
  ]);
  assert.equal(picker(tree).props.value, "2026-09-08", "the date picker follows the anchor");
  assert.equal(picker(tree).props.today, "2026-09-08", "and is told which day is today, the business's");
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  assert.equal(picker(tree).props.value, "2026-09-15", "and the anchor is what a step moves");
  picker(tree).props.onValueChange("2026-09-22");
  tree = page();
  assert.equal(picker(tree).props.value, "2026-09-22", "a day chosen in the picker is where the board goes");
  byTestId(tree, "cal-today").props.onClick();
  byTestId(tree, "cal-service").props.onValueChange("Balayage");
  tree = page();
  expectIds("a service that needs a consultation", ["cal-notice-consult"]);
  pickView(tree, "month");
  tree = page();
  expectIds("month", ["cal-month", "cal-month-cell"]);
  pickView(tree, "agenda");
  tree = page();
  expectIds("agenda", ["cal-agenda", "cal-agenda-day", "cal-agenda-item"]);
  pickView(tree, "day");
  tree = page();
  expectIds("day", ["cal-col", "cal-block"]);
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  expectIds("the appointment", ["cal-panel", "cal-panel-when", "cal-visit", "cal-visit-person", "cal-visit-foot"]);
  for (const feed of [
    { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    { ...dto().feed, stale: true, reason: "http" },
  ]) {
    fresh(dto({ feed }));
    tree = page();
    expectIds(feed.state, [has("cal-notice-feed") ? "cal-notice-feed" : "cal-notice-stale"]);
  }
  // A viewer: the owner's booking link books, so nothing here moves, cancels, syncs two ways, or prices an appointment.
  assert.doesNotMatch(
    drawn.join("\n"),
    /drag|Move |cancel\(|Waitlist|two-way|Two-way|Apple iCal|Utilization|\$\d/,
    "a viewer: nothing moved, cancelled, synced two ways, or priced",
  );
});

test("what became of a visit (0002 step 8): an ended one not marked yet says so quietly, never Done, and asks Kept or Missed; a word said shows on the block and in the visit, corrected from More", () => {
  const withVisit = (status) => {
    const week = dto();
    week.days[1].items[0].visit = { id: "a1", status };
    return week;
  };
  /** What the visit's More offers, by its words. */
  const more = (tree) =>
    (
      find(byTestId(tree, "cal-visit-foot"), (n) => n.props?.label === "More" && Array.isArray(n.props?.groups))?.props
        .groups ?? []
    ).flatMap((g) => g.items.map((i) => i.label));
  // Booked and over (the fixture's Tuesday is behind any clock this runs on): whether they came is the member's to say.
  fresh(withVisit("booked"));
  let tree = page();
  // The board says which visits still wait for that word: a ring on a block the record keeps a row for, said to a reader.
  const waiting = byTestId(tree, "cal-block");
  assert.equal(waiting.props["data-visit"], "unmarked");
  assert.match(waiting.props["aria-label"], /, not marked yet$/);
  waiting.props.onClick();
  tree = page();
  assert.equal(
    byTestId(tree, "cal-visit-state"),
    null,
    "REGRESSION: an ended visit said Done, as if they came; the question says it is not marked, and no pill says it again",
  );
  const ask = byTestId(tree, "cal-visit-ask");
  assert.ok(ask, "the one question an ended visit asks");
  assert.match(textOf(ask), /^Did Ana come/);
  assert.ok(byTestId(ask, "cal-visit-ask-kept") && byTestId(ask, "cal-visit-ask-missed"));
  assert.equal(byTestId(ask, "cal-visit-ask-cancelled"), null, "an ended visit is not cancelled now");
  assert.ok(!more(tree).some((l) => /cancel/i.test(l)), "nor from More");
  leave();

  // Said missed: the block says it, the visit says it, and More offers the one correction.
  fresh(withVisit("missed"));
  tree = page();
  const block = byTestId(tree, "cal-block");
  assert.equal(block.props["data-visit"], "missed");
  assert.match(block.props["aria-label"], /, missed$/);
  block.props.onClick();
  tree = page();
  assert.equal(textOf(byTestId(tree, "cal-visit-state")), "Missed");
  assert.equal(byTestId(tree, "cal-visit-ask"), null, "said: nothing asked");
  assert.ok(more(tree).includes("Change to Kept"));
  assert.ok(!more(tree).includes("Change to Missed"));
  leave();

  // An event the record has not kept yet: nothing to say it on, and nothing offered or said.
  fresh();
  tree = page();
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  assert.equal(byTestId(tree, "cal-visit-ask"), null);
  assert.equal(byTestId(tree, "cal-visit-state"), null);
  leave();
});

test("the word is said on every view: the agenda (a phone's own) says it under the name, and the month counts a cancelled visit as no time taken", () => {
  const week = dto();
  week.days[1].items[0].visit = { id: "a1", status: "missed" };
  week.days[3].items[0].visit = { id: "a2", status: "cancelled" };
  fresh(week);
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  let tree;
  try {
    tree = page();
  } finally {
    delete globalThis.window.matchMedia;
  }
  const cls = (n) => String((n && (n.rendered || n).props?.className) || "");
  const rows = all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-item");
  const ana = rows.find((n) => textOf(n).includes("Ana Ruiz"));
  assert.equal(
    textOf(find(ana, (n) => cls(n).split(" ").includes("ag-item-sub"))),
    "Color · Missed · 1h 30m",
    "REGRESSION: the agenda, a phone's default, never said what became of a visit",
  );
  assert.ok(textOf(rows.find((n) => textOf(n).includes("Team training"))).includes("Cancelled"));

  fresh(week);
  tree = page();
  pickView(tree, "month");
  tree = page();
  const thursday = all(tree, (n) => n.props?.["data-testid"] === "cal-month-cell").find((n) =>
    String(n.props["aria-label"]).includes("September 10"),
  );
  assert.ok(thursday, "the month draws the day");
  assert.doesNotMatch(String(thursday.props["aria-label"]), /taken/, "a cancelled visit is no time taken");
});
