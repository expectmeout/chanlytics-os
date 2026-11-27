/**
 * The doors every page uses to move and to ask (surfaces/frame-doors.ts), EXECUTED: the frame fills the registry as it renders,
 * a page imports the door, no door is a window name, and a door nobody filled says so once and does nothing. The frame's side (it fills them, once, as it renders) is shell/surfaces/
 * shell/surfaces/status/; the route table's address for a door the shell did not give is routeDoor's, below.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

globalThis.window = globalThis;
const heard = [];
globalThis.dispatchEvent = (e) => (heard.push(e), true);
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const doors = await import("../../apps/dashboard/src/surfaces/frame-doors.ts");
const { routeDoor } = await import("../../apps/dashboard/src/surfaces/frame-verbs.ts");

const warned = [];
const realWarn = console.warn;
beforeEach(() => {
  doors.emptyDoors();
  heard.length = 0;
  warned.length = 0;
  console.warn = (...args) => void warned.push(args);
  delete globalThis.location;
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

test("what a door asks is kept until the Line hears it: a press can come before the Line's code, and an event nobody hears is gone", () => {
  const { doors3 } = frame();
  doors.fillDoors(doors3);
  const asked = { prompt: "Make a post from this photo", about: { kind: "file", id: "f1", label: "Storefront" } };
  doors.askAbout(asked);
  assert.deepEqual(doors.takeAskedOfTheLine(), asked, "the Line, as it starts to listen");
  assert.equal(doors.takeAskedOfTheLine(), null, "once: a Line that mounts again asks nothing twice");
  doors.askAbout({ prompt: "first" });
  doors.askAbout({ prompt: "second" });
  assert.deepEqual(doors.takeAskedOfTheLine(), { prompt: "second" }, "the last press is what was asked");
});

test("a question a page words itself is asked in the language the Line last spoke; one handed whole is asked as it came", () => {
  const prompts = { en: "Make a post from this photo", es: "Haz una publicación con esta foto" };
  assert.equal(doors.askedWords({ prompts }, "es"), prompts.es);
  assert.equal(doors.askedWords({ prompts }, "en"), prompts.en);
  assert.equal(doors.askedWords({ prompts }, "other"), prompts.en, "a language it has no words in reads English");
  assert.equal(doors.askedWords({ prompts, prompt: "x" }, "es"), prompts.es, "the page's own words win");
  assert.equal(doors.askedWords({ prompt: "x" }, "es"), "x");
  assert.equal(doors.askedWords({}, "es"), undefined, "a door with no question opens the field");
});

test("no door is a window name: the module publishes none for a page to read, and a door is the registry's alone", () => {
  for (const name of ["DOOR_NAMES", "standIn", "moveByName"]) assert.equal(name in doors, false, `${name} is gone`);
  const { calls, doors3 } = frame();
  doors.fillDoors({ navigate: doors3.navigate });
  doors.navigate("calendar", { replace: true });
  doors.openAsk();
  assert.deepEqual(calls, [["navigate", "calendar", { replace: true }]], "the door handed in answers");
  assert.deepEqual(
    warned.map((w) => w.join(" ")),
    ["door_missing openAsk"],
    "and one nobody handed in says it is missing",
  );
});

test("a door nobody filled does nothing and says so once, not once a press", () => {
  doors.navigate("today");
  doors.navigate("today", { replace: true });
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

test("a link to a route is the frame's address: the workspace's own path, as the bridge's shell gives it, never the retired #/ one", () => {
  // The bridge's shell (bridge/shell.ts, provided as `shell`), which every workspace page holds from the boot.
  bridgeHolds({ parts: { shell: { route: () => "today", href: (to) => `/w/studio/${to}`, warm() {} } } });
  try {
    assert.equal(routeDoor("inbox/th-1").href, "/w/studio/inbox/th-1");
    assert.equal(routeDoor("calendar").href, "/w/studio/calendar");
  } finally {
    bridgeHolds({ parts: { shell: undefined } });
  }
  // With no shell held (the standalone mockup had no workspace path) the hash is the address.
  globalThis.location = { pathname: "/" };
  assert.equal(routeDoor("calendar").href, "#/calendar");
  const { calls, doors3 } = frame();
  doors.fillDoors(doors3);
  routeDoor("people").onClick();
  assert.deepEqual(calls, [["navigate", "people"]], "and the press is the frame's move");
});
