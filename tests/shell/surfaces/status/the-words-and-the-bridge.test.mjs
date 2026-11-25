/**
 * The line under the top bar: its words, and the bridge that says what the shell is doing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageTitle, shellStatusLine } from "@chanlytics/contracts";
import {
  ApiError,
  bridgeApi,
  fire,
  realtime,
  runner,
  settle,
  shell,
  sleep,
  status,
  surfaces,
  win,
  workspace,
} from "./_status.mjs";
import { provided } from "../../_bridge-holds.mjs";

/* ---------------------------------- the words ---------------------------------- */

test("the tab is named from where you are, most particular first, with what needs you counted in front", () => {
  assert.equal(pageTitle(["Today"]), "Today · Chanlytics");
  assert.equal(
    pageTitle([{ label: "Inbox", to: "inbox" }, "Rosa"]),
    "Rosa · Inbox · Chanlytics",
    "a narrow tab keeps the first words, so those are the ones that tell tabs apart",
  );
  assert.equal(
    pageTitle([{ label: "Settings", to: "admin" }, "Billing"], 3),
    "(3) Billing · Settings · Chanlytics",
    "a tab in the background still says someone is waiting",
  );
  for (const none of [0, -2, Number.NaN, undefined])
    assert.equal(pageTitle(["Today"], none), "Today · Chanlytics", `${none} counts nothing`);
  assert.equal(pageTitle(["  ", { label: "" }, "Reports"]), "Reports · Chanlytics", "an empty crumb is not a word");
  assert.equal(pageTitle(null), "Chanlytics");
});

test("the shell's one line says the one thing that is wrong, what it means for you, and the one press that helps", () => {
  const fine = { stale: false, degraded: [] };
  assert.equal(shellStatusLine(null), null);
  assert.equal(shellStatusLine(fine), null, "nothing wrong says nothing");
  assert.deepEqual(
    shellStatusLine({ ...fine, offline: true }),
    {
      kind: "offline",
      tone: "warn",
      text: "You're offline",
      detail: "What's on screen may be out of date. It catches up when you're back online.",
      action: null,
      cta: null,
      busy: null,
    },
    "nothing to press: coming back reads everything again by itself",
  );
  assert.deepEqual(shellStatusLine({ ...fine, paused: true }), {
    kind: "paused",
    tone: "danger",
    text: "AI is paused",
    detail: "Calls are answered only to take a message, and new messages wait in the Inbox for you to answer.",
    action: "billing",
    cta: "Billing",
    busy: null,
  });
  assert.deepEqual(shellStatusLine({ ...fine, stale: true }), {
    kind: "stale",
    tone: "info",
    text: "A newer version is ready",
    detail: null,
    action: "reload",
    cta: "Reload",
    busy: null,
  });
  assert.deepEqual(shellStatusLine({ ...fine, degraded: ["Inbox"] }), {
    kind: "degraded",
    tone: "warn",
    text: "Inbox stopped refreshing",
    detail: "You're seeing what was last loaded.",
    action: "retry",
    cta: "Retry",
    busy: "Retrying…",
  });
  assert.equal(
    shellStatusLine({ ...fine, degraded: ["Inbox", "Calendar"] }).text,
    "Inbox and Calendar stopped refreshing",
  );
  assert.equal(
    shellStatusLine({ ...fine, degraded: ["Inbox", "Calendar", "Calls"] }).text,
    "Inbox, Calendar and Calls stopped refreshing",
  );
  assert.deepEqual(shellStatusLine({ ...fine, disconnected: true }), {
    kind: "disconnected",
    tone: "info",
    text: "Live updates aren't coming through",
    detail: "Reconnecting. Until then, refresh to see anything new.",
    action: "retry",
    cta: "Refresh now",
    busy: "Refreshing…",
  });
});

test("one line at a time, in the order that matters: offline, a pause, a newer build, what stopped refreshing, the live feed", () => {
  let s = { stale: true, degraded: ["Inbox"], paused: true, offline: true, disconnected: true };
  const said = [];
  for (const cleared of ["offline", "paused", "stale", "degraded", "disconnected"]) {
    said.push(shellStatusLine(s).kind);
    s = { ...s, [cleared]: cleared === "degraded" ? [] : false };
  }
  assert.deepEqual(said, ["offline", "paused", "stale", "degraded", "disconnected"]);
  assert.equal(shellStatusLine(s), null);
});

/* --------------------------------- the bridge --------------------------------- */

test("the connection is one fact the shell listens to, and each change is said once", () => {
  let told = 0;
  const off = status.onSurfaceStatusChange(() => {
    told += 1;
  });
  status.setConnection({ offline: true });
  status.setConnection({ offline: true });
  assert.deepEqual(status.getConnection(), { offline: true, realtimeDown: false });
  assert.equal(told, 1, "the same fact twice is not news");
  status.setConnection({ offline: false, realtimeDown: true });
  assert.equal(told, 2, "two parts changing at once is one change");
  status.setConnection({ realtimeDown: false });
  off();
  assert.deepEqual(status.getConnection(), { offline: false, realtimeDown: false });
});

test("offline is said the moment the browser says so, and back online every surface is read again at once", async () => {
  const { asked, overrides } = surfaces("inbox", "calendar");
  const stop = runner.startSurfaces(overrides);
  await settle();
  asked.length = 0;
  fire("offline");
  assert.equal(status.getConnection().offline, true);
  fire("online");
  assert.equal(status.getConnection().offline, false);
  await sleep(20);
  assert.deepEqual(
    [...asked].sort(),
    ["calendar", "inbox"],
    "what changed while away is read now, not at the next focus",
  );
  fire("offline");
  stop();
  assert.equal(status.getConnection().offline, false, "a runner that stopped leaves nothing said");
  fire("offline");
  assert.equal(status.getConnection().offline, false, "and listens to nothing");
});

test("the live feed: a blip it rejoins is not news, a drop that outlasts the grace is, and every join reads what it missed", async () => {
  const said = [];
  let reads = 0;
  let joins = 0;
  const feed = realtime.feedWatch({
    graceMs: 15,
    onDown: (down) => said.push(down),
    onReconnect: () => {
      reads += 1;
    },
    onJoin: () => {
      joins += 1;
    },
  });
  feed.onStatus("SUBSCRIBED");
  assert.equal(reads, 0, "the first join is not a reconnect");
  // But it reads what was read before it: the feed replays nothing from before the join (the wiring's second audit, S2-4).
  assert.equal(joins, 1, "the first join is told as one");
  feed.onStatus("CHANNEL_ERROR");
  await sleep(4);
  feed.onStatus("SUBSCRIBED");
  await sleep(30);
  assert.deepEqual(said, [], "rejoined inside the grace: never shown");
  assert.equal(reads, 1, "but the gap is read: postgres changes carry no backfill");
  feed.onStatus("TIMED_OUT");
  feed.onStatus("CHANNEL_ERROR");
  await sleep(30);
  assert.deepEqual(said, [true], "still down after the grace, and said once however many errors");
  feed.onStatus("SUBSCRIBED");
  assert.deepEqual(said, [true, false], "back, and said at once");
  assert.equal(reads, 2);
  assert.equal(joins, 1, "a rejoin is a reconnect, never a first join again");
  feed.onStatus("CLOSED");
  feed.stop();
  await sleep(30);
  assert.deepEqual(
    said,
    [true, false],
    "the runner's own teardown closes the channel, and a stopped watch says nothing",
  );
});

test("Retry reads every surface again, through the runner that is running", async () => {
  shell.installShell(win);
  const { asked, overrides } = surfaces("inbox", "today");
  await provided("shell").retry();
  assert.deepEqual(asked, [], "no runner, nothing to read");
  const stop = runner.startSurfaces(overrides);
  await settle();
  asked.length = 0;
  await provided("shell").retry();
  assert.deepEqual([...asked].sort(), ["inbox", "today"]);
  stop();
});

test("the status is published whenever any part of it changes, and only then", () => {
  const page = {
    dispatched: 0,
    dispatchEvent() {
      page.dispatched += 1;
      return true;
    },
  };
  shell.publishShellStatus({ stale: false, degraded: [] }, page);
  shell.publishShellStatus({ stale: false, degraded: [] }, page);
  assert.equal(page.dispatched, 1);
  shell.publishShellStatus({ stale: false, degraded: [], offline: true }, page);
  assert.equal(
    page.dispatched,
    2,
    "going offline is news: the old comparison looked at the build and the surfaces only",
  );
  shell.publishShellStatus({ stale: false, degraded: [], offline: true, disconnected: true }, page);
  assert.equal(page.dispatched, 3, "so is the live feed dropping");
  const labels = { inbox: "Inbox", today: "Today", calendar: "Calendar", people: "People" };
  const statuses = new Map([
    ["inbox", "degraded"],
    ["today", "live"],
    ["calendar", "degraded"],
    ["people", "seeded"],
  ]);
  assert.deepEqual(
    shell.shellStatusOf(statuses, { offline: false, realtimeDown: true }, true, labels),
    { stale: true, degraded: ["Inbox", "Calendar"], offline: false, disconnected: true },
    "a surface that never loaded is its page's to say, not the line's",
  );
});

test("a session that ends mid-page signs in again to the same page: the route rides to /login and back", async () => {
  assert.equal(workspace.signInHref({ hash: "#/inbox/th-1" }), "/login#/inbox/th-1");
  assert.equal(
    workspace.signInHref({ pathname: "/w/acme/inbox/th-1", hash: "" }),
    "/login?w=acme#/inbox/th-1",
    "from a path, in its workspace",
  );
  for (const none of ["", "#", undefined, null, "#access_token=abc"])
    assert.equal(
      workspace.signInHref({ pathname: "/w/acme", hash: none }),
      "/login?w=acme",
      `${none} is not a page; the workspace still is`,
    );

  // The client's 401, on any read or write.
  const page = {
    location: {
      hash: "#/clients/p-9",
      assigned: [],
      assign(url) {
        page.location.assigned.push(url);
      },
    },
    fetch: async () => new Response(JSON.stringify({ ok: false, error: { code: "unauthorized" } }), { status: 401 }),
  };
  await bridgeApi.apiFor(page)("GET workspaces");
  assert.deepEqual(page.location.assigned, ["/login#/clients/p-9"]);

  // The runner's, when a surface's own read is refused.
  win.location.hash = "#/calendar";
  win.location.assigned = [];
  const stop = runner.startSurfaces([
    {
      key: "inbox",
      apply: async () => {
        throw new ApiError("unauthorized", 401, "signed out");
      },
    },
  ]);
  await settle();
  stop();
  assert.deepEqual(win.location.assigned, ["/login?w=acme#/calendar"], "in the workspace the page is in");
  win.location.hash = "#/inbox/th-1";
});
