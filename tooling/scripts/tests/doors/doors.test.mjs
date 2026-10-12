/**
 * The doors every page uses to move and to ask (surfaces/frame-doors.ts), EXECUTED: the frame fills the registry as it renders,
 * a page imports the door, the names the pages that have not moved read go through the same registry, and a door nobody
 * filled says so once and does nothing. The frame's side (it fills them, once, as it renders) is shell/surfaces/
 * shell-status.test.mjs; the route table's address for a door the shell did not give is routeDoor's, below.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
const heard = [];
globalThis.dispatchEvent = (e) => (heard.push(e), true);
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const doors = await import("../../../../apps/dashboard/src/surfaces/frame-doors.ts");
const { routeDoor } = await import("../../../../apps/dashboard/src/surfaces/legacy-verbs.ts");

const warned = [];
const realWarn = console.warn;
const STAND_INS = ["CHANLY", "askAbout", "appAsk", "appNavigate", "appBackToPeople", "routeDoor", "location"];

beforeEach(() => {
  doors.emptyDoors();
  heard.length = 0;
  warned.length = 0;
  console.warn = (...args) => void warned.push(args);
  for (const name of STAND_INS) delete globalThis[name];
});
afterEach(() => {
  console.warn = realWarn;
});

/** The frame's three doors, each recording how it was called. */
const frame = () => {
  const calls = [];
  const doors3 = {
    navigate: (...args) => void calls.push(["navigate", ...args]),
    openAsk: (...args) => void calls.push(["openAsk", ...args]),
    backToPeople: (...args) => void calls.push(["backToPeople", ...args]),
  };
  return { calls, doors3 };
};

test("the frame's doors answer a page's call: a move keeps the options it was given, Ask opens, a person's Back goes back", () => {
  const { calls, doors3 } = frame();
  doors.fillDoors(doors3);
  doors.navigate("inbox");
  doors.navigate("inbox/th-1", { replace: true, quiet: true });
  doors.openAsk();
  doors.backToPeople();
  assert.deepEqual(calls, [
    ["navigate", "inbox"],
    ["navigate", "inbox/th-1", { replace: true, quiet: true }],
    ["openAsk"],
    ["backToPeople"],
  ]);
  assert.deepEqual([...doors.filledDoors()].sort(), ["backToPeople", "navigate", "openAsk"], "a filler for every door");
  assert.deepEqual(warned, [], "nothing is missing");
});

test("askAbout opens Ask through the frame and then hands the Line what it was asked, as ask:seed", () => {
  const { calls, doors3 } = frame();
  doors.fillDoors(doors3);
  doors.askAbout({
    prompt: "Who is waiting?",
    mode: "compose",
    about: { kind: "playbook", id: "p1", label: "Win-back" },
  });
  doors.askAbout();
  assert.deepEqual(calls, [["openAsk"], ["openAsk"]]);
  assert.deepEqual(
    heard.map((e) => [e.type, e.detail]),
    [
      [
        "ask:seed",
        { prompt: "Who is waiting?", mode: "compose", about: { kind: "playbook", id: "p1", label: "Win-back" } },
      ],
      ["ask:seed", {}],
    ],
  );
});

test("the names the pages that have not moved read go through the registry, and the person's Back is no window name", () => {
  assert.deepEqual(Object.keys(doors.DOOR_NAMES).sort(), ["appAsk", "appNavigate", "askAbout"]);
  assert.equal(doors.DOOR_NAMES.appAsk, doors.openAsk);
  assert.equal(doors.DOOR_NAMES.askAbout, doors.askAbout);
  const { calls, doors3 } = frame();
  doors.fillDoors(doors3);
  doors.DOOR_NAMES.appNavigate("calendar", { replace: true });
  doors.DOOR_NAMES.appNavigate("today");
  doors.DOOR_NAMES.appAsk();
  assert.deepEqual(calls, [["navigate", "calendar", { replace: true }], ["navigate", "today"], ["openAsk"]]);
});

test("a door nobody filled does nothing and says so once, not once a press", () => {
  doors.navigate("today");
  doors.navigate("today", { replace: true });
  doors.DOOR_NAMES.appNavigate("inbox");
  doors.openAsk();
  doors.openAsk();
  doors.backToPeople(); // its fallback is a move to People: the move is the door that is missing
  assert.deepEqual(
    warned.map((w) => w.join(" ")),
    ["door_missing navigate", "door_missing openAsk"],
    "each door once",
  );
  assert.deepEqual(heard, [], "and nothing was sent anywhere");
  // Ask about something with no frame still hands the Line its event (the Line, if it is mounted, opens on it).
  doors.askAbout({ prompt: "x" });
  assert.deepEqual(
    heard.map((e) => e.type),
    ["ask:seed"],
  );
});

test("where the frame has filled nothing, a stand-in window's doors answer, as a test's or the mockup's do; the module's own published names are never taken for one", () => {
  const seen = [];
  globalThis.CHANLY = { nav: (...args) => void seen.push(["CHANLY.nav", ...args]) };
  globalThis.appAsk = () => void seen.push(["appAsk"]);
  globalThis.appBackToPeople = () => void seen.push(["appBackToPeople"]);
  doors.navigate("clients");
  doors.navigate("clients/c-1", { replace: true });
  doors.openAsk();
  doors.backToPeople();
  assert.deepEqual(seen, [
    ["CHANLY.nav", "clients"],
    ["CHANLY.nav", "clients/c-1", { replace: true }],
    ["appAsk"],
    ["appBackToPeople"],
  ]);
  globalThis.askAbout = (about) => void seen.push(["askAbout", about]);
  doors.askAbout({ prompt: "p" });
  assert.deepEqual(seen.at(-1), ["askAbout", { prompt: "p" }], "its own door, not the event");
  assert.deepEqual(heard, [], "which the stand-in did not send");
  // Published as the pages read them, the module's own functions are not a stand-in for themselves.
  Object.assign(globalThis, doors.DOOR_NAMES);
  doors.emptyDoors();
  assert.doesNotThrow(() => doors.askAbout({ prompt: "q" }), "no door calling itself");
  assert.equal(heard.at(-1).type, "ask:seed");
  assert.doesNotThrow(() => doors.openAsk());
});

test("a link to a route the shell's routeDoor did not make is the address a workspace's route has, never the retired #/ one", () => {
  globalThis.location = { pathname: "/w/studio/today" };
  assert.equal(routeDoor("inbox/th-1").href, "/w/studio/inbox/th-1");
  assert.equal(routeDoor("calendar").href, "/w/studio/calendar");
  // Off a workspace page (the standalone mockup has no workspace path) the hash is the address.
  globalThis.location = { pathname: "/" };
  assert.equal(routeDoor("calendar").href, "#/calendar");
  const { calls, doors3 } = frame();
  doors.fillDoors(doors3);
  routeDoor("people").onClick();
  assert.deepEqual(calls, [["navigate", "people"]], "and the press is the frame's move");
});
