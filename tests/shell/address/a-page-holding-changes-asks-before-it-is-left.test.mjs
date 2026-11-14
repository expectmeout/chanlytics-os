/**
 * A page holding a change not saved asks before it is left, whatever leaves it: the sidebar, the account menu, a ⌘ key or a
 * link inside the app (bridge/workspace.ts goToRoute), and the browser's Back and Forward (guardLeaving). The question is
 * Settings' rail's own, in its words (kit/record/leave-ask.tsx), and "Yes, leave" goes where the person was going.
 *
 * On 13 Nov 2026 a Website typed in Settings › Details and not saved was lost without a word when the person went to People
 * by the sidebar and came back, and the same by Back then Forward: the field said "Not set" and opened empty. Settings'
 * own pane switch asked "Leave without saving?" all along (the interaction review's Part 6).
 *
 * What is asked about is the open fold's changes (kit/record/registry.ts): a composer's words are kept in the tab and come
 * back with it (kit/record/work.tsx), so they are never asked about here; a save that is out is never asked about either,
 * the move waits for its answer. A sheet that takes Back itself (kit/sheet/back.ts) is asked nothing by this: its Back
 * stays on the page's route, and the sheet asks its own question.
 *
 * EXECUTED: the address module over a made-up window whose history moves as Chrome 156's did in the running app (the
 * Navigation API asked before a traversal moves anything, popstate said after, to the window's listeners in the order they
 * were added), and the frame's question drawn on the stub React. "The router" here is a listener on popstate, added before
 * any guard, as the App Router's is in the running app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { again, byTestId, installStubReact, press, textOf, unmount } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";
import { until } from "../../shared/_until.mjs";

installStubReact({ __DEMO_MODE: false });
const { goToRoute, guardLeaving } = await importSrc("apps/dashboard/src/bridge/workspace.ts");
const { recFolds } = await importSrc("apps/dashboard/src/surfaces/kit/record/registry.ts");
const { holdMove } = await importSrc("apps/dashboard/src/surfaces/kit/record/held-move.ts");
const { LeaveHost } = await importSrc("apps/dashboard/src/surfaces/kit/record/leave-ask.tsx");

const ORIGIN = "https://app.test";

/**
 * A tab at `paths[at]` with those entries behind and ahead of it. A push or a replace writes the address and fires nothing.
 * Back, Forward and a traversal are asked of the Navigation API's `navigate` listeners a moment later, before anything
 * moves: one that cancels it, where the browser lets it be cancelled (`cancelable`: Chrome lets a page cancel a Back once
 * per press on the page), keeps the tab where it stands and nothing more happens; else the tab moves and says so to the
 * window's popstate listeners, in the order they were added.
 */
function aTab(paths, at = paths.length - 1) {
  const on = { popstate: [], navigate: [] };
  let seq = 0;
  const entries = paths.map((p) => ({ key: `e${seq++}`, url: ORIGIN + p }));
  let index = at;
  let moving = 0;
  const listen = (type, fn) => (on[type] ??= []).push(fn);
  const unlisten = (type, fn) => {
    on[type] = (on[type] ?? []).filter((f) => f !== fn);
  };
  const win = {
    location: { pathname: "/", search: "", hash: "" },
    history: {
      pushState: (_data, _unused, url) => {
        tab.pushed.push(url);
        entries.splice(index + 1, entries.length, { key: `e${seq++}`, url: ORIGIN + url });
        index += 1;
        show();
      },
      replaceState: (_data, _unused, url) => {
        tab.replaced.push(url);
        entries[index] = { ...entries[index], url: ORIGIN + url };
        show();
      },
    },
    addEventListener: listen,
    removeEventListener: unlisten,
    navigation: {
      get currentEntry() {
        return entries[index];
      },
      traverseTo(key) {
        const to = entries.findIndex((e) => e.key === key);
        moving += 1;
        setImmediate(() => {
          moving -= 1;
          if (to < 0 || to === index || cancelled(entries[to])) return;
          index = to;
          show();
          for (const fn of [...on.popstate]) fn({ type: "popstate" });
        });
        return {};
      },
      addEventListener: listen,
      removeEventListener: unlisten,
    },
  };
  function show() {
    const u = new URL(entries[index].url);
    win.location.pathname = u.pathname;
    win.location.search = u.search;
    win.location.hash = u.hash;
  }
  /** Asked before the tab moves: whether a `navigate` listener cancelled it. */
  function cancelled(destination) {
    let no = false;
    const event = {
      navigationType: "traverse",
      cancelable: tab.cancelable,
      destination: { key: destination.key, url: destination.url, sameDocument: true },
      preventDefault: () => {
        if (tab.cancelable) no = true;
      },
    };
    for (const fn of [...on.navigate]) fn(event);
    return no;
  }
  const tab = {
    win,
    pushed: [],
    replaced: [],
    /** What the App Router heard, and so drew. */
    nextHeard: [],
    cancelable: true,
    back: () => win.navigation.traverseTo(entries[index - 1]?.key),
    forward: () => win.navigation.traverseTo(entries[index + 1]?.key),
    /** Every traversal asked for has been answered: the tab stands still. */
    still: () => moving === 0,
    path: () => win.location.pathname,
    listening: (type) => (on[type] ?? []).length,
  };
  show();
  // The App Router's own listener, added before anything of the frame's, as it is in the running app.
  win.addEventListener("popstate", () => tab.nextHeard.push(win.location.pathname));
  return tab;
}

/** The Website row of Settings › Details: opened, with `unsaved` and `saving` as the page would say them. */
function aFoldOpen(id = "website") {
  const said = { unsaved: false, saving: false };
  const unbind = recFolds.bind(
    id,
    () => said.unsaved,
    () => said.saving,
  );
  recFolds.request(id);
  return {
    said,
    done() {
      unbind();
      recFolds.reset();
    },
  };
}

/** The frame's question, as it is drawn now. */
const drawn = () => again(() => globalThis.window.React.createElement(LeaveHost));
const question = () => byTestId(drawn(), "leave-confirm");
/** A frame of its own: the last one gone, and its question drawn, which hands the address the ask as it mounts. */
const frameUp = () => {
  unmount();
  drawn();
};

test("the frame's question hands the address the ask as it mounts, and takes it back as it goes", () => {
  const tab = aTab(["/w/acme/settings/workspace"]);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    unmount();
    goToRoute("today", {}, tab.win);
    assert.deepEqual(tab.pushed, ["/w/acme/today"], "no frame drawn: nobody asks");
    frameUp();
    goToRoute("inbox", {}, tab.win);
    assert.deepEqual(tab.pushed, ["/w/acme/today"], "drawn: the move is held");
    press(byTestId(drawn(), "leave-no"));
    unmount();
    goToRoute("inbox", {}, tab.win);
    assert.deepEqual(tab.pushed, ["/w/acme/today", "/w/acme/inbox"], "gone: nothing asks");
  } finally {
    fold.done();
  }
});

test("a move by the sidebar with a change not saved asks, in the rail's words, and Stay keeps the page and the change", () => {
  frameUp();
  const tab = aTab(["/w/acme/settings/workspace"]);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    goToRoute("clients", {}, tab.win);
    assert.deepEqual(tab.pushed, [], "REGRESSION: the sidebar moved, and the Website typed was lost without a word");
    const ask = question();
    assert.ok(ask, "the question is drawn");
    assert.match(textOf(ask), /Leave without saving\?/);
    assert.match(textOf(ask), /Nothing you changed on this tab has been saved\./);
    assert.equal(textOf(byTestId(drawn(), "leave-yes")), "Yes, leave");
    assert.equal(textOf(byTestId(drawn(), "leave-no")), "Stay");
    press(byTestId(drawn(), "leave-no"));
    assert.equal(question(), null, "answered: the question goes");
    assert.deepEqual(tab.pushed, [], "Stay: the page stays");
    assert.equal(recFolds.open(), "website", "and the fold with the change in it stays open");
  } finally {
    fold.done();
  }
});

test("Yes, leave goes where the person was going, and throws the change away", () => {
  frameUp();
  const tab = aTab(["/w/acme/settings/workspace"]);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    goToRoute("clients", {}, tab.win);
    press(byTestId(drawn(), "leave-yes"));
    assert.deepEqual(tab.pushed, ["/w/acme/people"], "the move asked for, once");
    assert.equal(recFolds.open(), null, "the change is let go");
    assert.equal(question(), null);
  } finally {
    fold.done();
  }
});

test("nothing is asked where nothing would be lost: no fold open, a fold with no change, a composer's words the tab keeps", () => {
  frameUp();
  const tab = aTab(["/w/acme/settings/workspace"]);
  goToRoute("clients", {}, tab.win);
  assert.deepEqual(tab.pushed, ["/w/acme/people"], "no fold open");
  const fold = aFoldOpen();
  try {
    goToRoute("today", {}, tab.win);
    assert.deepEqual(tab.pushed, ["/w/acme/people", "/w/acme/today"], "a fold open with nothing changed");
    // A note half-written on a person's page is kept in the tab as it is typed, and comes back with the page.
    fold.done();
    const letGo = recFolds.hold("note:c-1", () => true);
    goToRoute("inbox", {}, tab.win);
    letGo();
    assert.deepEqual(tab.pushed.at(-1), "/w/acme/inbox", "a composer's words are not lost by a move");
    assert.equal(question(), null, "and nothing was asked");
  } finally {
    fold.done();
  }
});

test("a page saying where it stands, or a redirect, is never asked about: no one is leaving", () => {
  frameUp();
  const tab = aTab(["/w/acme/settings/workspace/hours"]);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    goToRoute("admin/hours", { replace: true }, tab.win);
    assert.deepEqual(tab.replaced, ["/w/acme/settings/hours"]);
    assert.equal(question(), null);
  } finally {
    fold.done();
  }
});

test("a save that is out is never asked about: the move waits for its answer, and goes by itself once it is taken", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  frameUp();
  const tab = aTab(["/w/acme/settings/workspace"]);
  const fold = aFoldOpen();
  try {
    // The fold is judged against what is being saved: it reads clean the moment its save goes out.
    fold.said.saving = true;
    goToRoute("clients", {}, tab.win);
    assert.deepEqual(tab.pushed, [], "the change is on its way: the move waits for it");
    assert.equal(question(), null, "and asks nothing");
    // Taken: the fold closes, and the move goes.
    fold.said.saving = false;
    recFolds.close("website");
    assert.deepEqual(tab.pushed, ["/w/acme/people"], "the save was taken: the move went by itself");

    // Refused: the change is not saved after all, and now the question is true.
    recFolds.request("website");
    fold.said.saving = true;
    goToRoute("today", {}, tab.win);
    fold.said.saving = false;
    fold.said.unsaved = true;
    t.mock.timers.tick(100);
    assert.match(textOf(question()), /Leave without saving\?/, "refused: asked, as any change not saved is");
    assert.deepEqual(tab.pushed, ["/w/acme/people"], "and nothing moved");
    press(byTestId(drawn(), "leave-no"));
  } finally {
    fold.done();
  }
});

test("Back with a change not saved asks before anything moves; on Stay the address stays, and the next Back asks again", async () => {
  frameUp();
  const tab = aTab(["/w/acme/people", "/w/acme/settings/workspace"]);
  const stop = guardLeaving(holdMove, tab.win);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    tab.back();
    await until(() => tab.still() && question(), "Back asked about");
    assert.equal(tab.path(), "/w/acme/settings/workspace", "REGRESSION: Back left the page and lost the change");
    assert.deepEqual(tab.nextHeard, [], "the router heard nothing: the page it draws never moved");
    assert.match(textOf(question()), /Leave without saving\?/);
    press(byTestId(drawn(), "leave-no"));
    assert.equal(tab.path(), "/w/acme/settings/workspace", "Stay: the address stays");
    assert.equal(recFolds.open(), "website");
    tab.back();
    await until(() => tab.still() && question(), "the next Back asked again");
    assert.deepEqual(tab.nextHeard, []);
    press(byTestId(drawn(), "leave-no"));
  } finally {
    fold.done();
    stop();
  }
  assert.equal(tab.listening("navigate"), 0, "stopped: nothing of the guard's is left listening");
});

test("Back, then Yes, leave: the tab goes where Back was going, and Forward the same", async () => {
  frameUp();
  const tab = aTab(["/w/acme/people", "/w/acme/settings/workspace", "/w/acme/inbox"], 1);
  const stop = guardLeaving(holdMove, tab.win);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    tab.forward();
    await until(() => tab.still() && question(), "Forward asked about");
    assert.equal(tab.path(), "/w/acme/settings/workspace", "Forward is asked about too");
    assert.deepEqual(tab.nextHeard, []);
    press(byTestId(drawn(), "leave-no"));
    tab.back();
    await until(() => tab.still() && question(), "Back asked about");
    press(byTestId(drawn(), "leave-yes"));
    await until(() => tab.nextHeard.length > 0, "the router told of the move");
    assert.equal(tab.path(), "/w/acme/people", "where Back was going");
    assert.deepEqual(tab.nextHeard, ["/w/acme/people"], "and the router follows, once");
    assert.equal(recFolds.open(), null, "the change is let go");
  } finally {
    fold.done();
    stop();
  }
});

test("a sheet's own Back is not asked about: it stays on the page's route, and the sheet takes it", async () => {
  frameUp();
  // A sheet that takes Back stands an entry of its own on the page's address (kit/sheet/back.ts), named or not.
  const tab = aTab(["/w/acme/people", "/w/acme/settings/workspace", "/w/acme/settings/workspace?do=tool:cal"]);
  const stop = guardLeaving(holdMove, tab.win);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    tab.back();
    await until(() => tab.nextHeard.length > 0, "the sheet's Back heard");
    assert.equal(question(), null, "nothing asked of the sheet's Back");
    assert.deepEqual(tab.nextHeard, ["/w/acme/settings/workspace"], "the sheet (and the router) heard it");
  } finally {
    fold.done();
    stop();
  }
});

test("Back with nothing that would be lost goes at once, and is heard as it always was", async () => {
  frameUp();
  const tab = aTab(["/w/acme/people", "/w/acme/settings/workspace"]);
  const stop = guardLeaving(holdMove, tab.win);
  try {
    tab.back();
    await until(() => tab.nextHeard.length > 0, "Back heard");
    assert.equal(tab.path(), "/w/acme/people");
    assert.deepEqual(tab.nextHeard, ["/w/acme/people"]);
    assert.equal(question(), null);
  } finally {
    stop();
  }
});

test("a Back the browser lets nobody cancel goes, as it always did: nothing is asked that could not be kept", async () => {
  // Chrome lets a page cancel a Back once per press on the page: a second Back with nothing pressed between goes.
  frameUp();
  const tab = aTab(["/w/acme/people", "/w/acme/settings/workspace"]);
  tab.cancelable = false;
  const stop = guardLeaving(holdMove, tab.win);
  const fold = aFoldOpen();
  try {
    fold.said.unsaved = true;
    tab.back();
    await until(() => tab.nextHeard.length > 0, "Back heard");
    assert.equal(tab.path(), "/w/acme/people");
    assert.equal(question(), null, "no question left standing over a page that has gone");
  } finally {
    fold.done();
    stop();
  }
});

test("a browser with no Navigation API leaves Back as it was, and nothing listens", () => {
  const tab = aTab(["/w/acme/people", "/w/acme/settings/workspace"]);
  delete tab.win.navigation;
  const stop = guardLeaving(holdMove, tab.win);
  assert.equal(tab.listening("popstate"), 1, "only the router's own");
  assert.equal(tab.listening("navigate"), 0);
  stop();
});
