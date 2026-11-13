/**
 * Today's first frame is its last (one arrangement, 11 Nov 2026): the page drawn once, from nothing, as a phone opens it,
 * has one coral and its columns where they stay. Ruben's iPhone, 10 Nov 2026: Ask found's Check it stood coral beside
 * Finish setting up's Continue, then went quiet with Safari keeping its glow; Ask found led a page where people waited,
 * then moved under the day. Each part told a store what it drew as it drew, and the parts before it heard a frame later.
 * The page now reads one arrangement (today/arrangement.ts), worked out from what each part will draw, before any part
 * draws: drawn once, nothing is left to hear.
 *
 * Run on the stub React, which draws a part as it is created, in the page's order: a part that waited to hear from one
 * drawn after it draws wrong here, as it did on the phone's first frame.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSteps } from "@chanlytics/contracts";
import { again, all, fresh, textOf, unmount } from "../../_stub-react.mjs";
import { peopleWithSteps } from "../record/_world.mjs";
import { headline } from "../_headline.mjs";
import { NOW, W, dayWith, row } from "./_world.mjs";

const { TodayZones } = await import("../../../apps/dashboard/src/surfaces/today/zones/page.tsx");
const { setupCardReady } = await import("../../../apps/dashboard/src/surfaces/today/zones/setup-card.tsx");
const { arrangementOf } = await import("../../../apps/dashboard/src/surfaces/today/arrangement.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
// The card is a chunk of its own, asked for as Today's page loads: drawn here once it is in, as the page's first draw waits.
await setupCardReady;

/** A workspace answering on its phone line with WhatsApp still to connect: the setup card's rows, each with its act. */
const setupLeft = () => {
  const dto = {
    business: {
      name: "Harbor Moving",
      hours: true,
      services: 2,
      bookingLink: true,
      address: true,
      handoff: null,
      broken: false,
      receptionist: "set",
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-18T14:00:00Z" },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0, offers: 0, offersSaidYes: 0 },
    requests: { line: null },
  };
  return { dto, role: "owner", later: [], rests: {}, vm: setupSteps({ ...dto, later: [], rests: {} }, NOW.getTime()) };
};

/** Ask's morning with one idea to approve: Ask found's one row. */
const morningWithAnIdea = () => ({
  fetchedAt: NOW.getTime(),
  dto: {
    day: "2026-09-18",
    state: "quiet",
    offered: true,
    thread_id: null,
    message_id: "m-1",
    headline: "",
    detail: "",
    cards: [
      {
        id: "p-1",
        kind: "message",
        needs: "operator",
        title: "Write to Rosa",
        summary: "Write to Rosa, as Ask would send it.",
        payload: {},
        undo: null,
      },
    ],
    findings: [],
    rested: {},
    lately: [],
  },
});

/**
 * The page in a moment, everything it opens on read: who waits, the to-dos, what is left to set up, what Ask found. Reports'
 * headline says a week with nothing worth a look, and People holds Ana, with a step due where `steps` says: what Ask found's
 * checks and To do's steps are drawn from is known (arrangement.ts `known`), so nothing found is nothing found.
 */
function moment({ waiting = [], steps = false, setup = false, found = false }) {
  setSurfaceValue("today", dayWith(waiting));
  setSurfaceValue("setup", setup ? setupLeft() : undefined);
  setSurfaceValue("ask_morning", found ? morningWithAnIdea() : undefined);
  setSurfaceValue("reports_headline", headline({ days: 30, in: 9, ai: 9, you: 0, none: 0 }));
  W.__PEOPLE = {
    rows: steps ? peopleWithSteps([["a", "Ana", -1]]) : peopleWithSteps([["a", "Ana", null]]),
    lists: [],
    aggregates: { total: 1 },
    fetchedAt: NOW.getTime(),
  };
}

function cleared() {
  unmount();
  for (const key of ["today", "setup", "ask_morning", "reports_headline"]) setSurfaceValue(key, undefined);
  delete W.__PEOPLE;
}

/** Today's first frame: drawn once, from nothing. */
function firstFrame() {
  fresh();
  return again(() => W.React.createElement(TodayZones, {}));
}

/** The coral presses as the browser gets them: each a button drawn in the kit's primary kind, counted once. */
const corals = (tree) =>
  all(tree, (n) => n.type === "button" && /(^| )(btn-primary|primary)( |$)/.test(String(n.props?.className ?? "")));
const byTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id)[0];
/** Where each coral stands: the zone holding it, by its test id, nearest first. */
const ZONES = ["today-group-next", "today-group-waiting", "today-group-todo", "today-setup", "today-ask-found"];
const zoneOf = (tree, coral) => ZONES.find((z) => all(byTestId(tree, z) ?? null, (n) => n === coral).length > 0);
/** The work's column: the blocks it holds, in its order. */
const workColumn = (tree) => {
  const col = all(tree, (n) =>
    String(n.props?.className ?? "")
      .split(" ")
      .includes("tz-col"),
  )[0];
  return [col.props.children]
    .flat(Infinity)
    .filter(Boolean)
    .map((c) => c.type?.name ?? c.props?.["data-testid"]);
};
const wideFound = (tree) => String(byTestId(tree, "today-ask-found")?.props.className ?? "").includes("tz-found-wide");

test("someone waiting, setup left and an idea found: the first frame's one coral is the person's, Need you leads, Ask found stands under the day", () => {
  moment({ waiting: [row("rosa", "Rosa Díaz")], setup: true, found: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(
      coral.length,
      1,
      `one coral on the first frame, not ${coral.length}: ${coral.map(textOf).join(" | ")}`,
    );
    assert.equal(zoneOf(page, coral[0]), "today-group-next", "the person waiting holds it");
    assert.deepEqual(
      workColumn(page),
      ["NeedYou", "ColdEmailNote", "TodayContentNote", "today-setting-up"],
      "REGRESSION: Ask found led the page's first frame while Rosa waited, then moved",
    );
    assert.equal(wideFound(page), false, "Ask found under the day, its rows not three across");
  } finally {
    cleared();
  }
});

test("only a to-do, with setup left: To do's first act is the one coral, never the setup card's beside it", () => {
  moment({ steps: true, setup: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(
      coral.length,
      1,
      `REGRESSION: Continue setting up drew coral before To do said it held it: ${coral.map(textOf).join(" | ")}`,
    );
    assert.equal(zoneOf(page, coral[0]), "today-group-todo");
  } finally {
    cleared();
  }
});

test("only setup left, with an idea found: the card's act is the coral and Ask found leads, wide and quiet", () => {
  moment({ setup: true, found: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(
      coral.length,
      1,
      `REGRESSION: Check it stood coral beside Continue on the first frame: ${coral.map(textOf).join(" | ")}`,
    );
    assert.equal(zoneOf(page, coral[0]), "today-setup");
    assert.deepEqual(workColumn(page), [
      "today-setting-up",
      "NeedYou",
      "ColdEmailNote",
      "TodayContentNote",
      "AskFound",
    ]);
    assert.equal(wideFound(page), true, "nobody waits: Ask found leads the work's column");
  } finally {
    cleared();
  }
});

test("only an idea found: Ask found leads, its first act the coral", () => {
  moment({ found: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(coral.length, 1);
    assert.equal(zoneOf(page, coral[0]), "today-ask-found");
    assert.equal(wideFound(page), true);
  } finally {
    cleared();
  }
});

test("nothing waits and nothing was found: the day alone in one column, and no coral", () => {
  moment({});
  try {
    const page = firstFrame();
    assert.equal(corals(page).length, 0);
    assert.ok(all(page, (n) => String(n.props?.className ?? "").includes("tz-bento-one")).length === 1, "one column");
    assert.equal(byTestId(page, "today-ask-found"), undefined);
  } finally {
    cleared();
  }
});

test("the walk, as the arrangement works it: the open row, else To do, else setting up while nobody waits, else Ask found where it leads", () => {
  const reads = {
    read: true,
    known: true,
    needYou: false,
    queueCoral: null,
    todoCoral: null,
    waiting: false,
    setupActs: false,
    found: { draws: false, acts: false },
    mayAct: true,
  };
  const at = (over) => arrangementOf({ ...reads, ...over });
  assert.equal(at({ needYou: true, queueCoral: "r1", todoCoral: null, setupActs: true }).coral, "queue");
  assert.equal(at({ needYou: true, todoCoral: "s1", setupActs: true }).coral, "todo");
  assert.equal(at({ setupActs: true, found: { draws: true, acts: true } }).coral, "setup");
  assert.equal(
    at({ waiting: true, needYou: true, setupActs: true }).coral,
    null,
    "someone waits and their row takes none (a reply going on its own): setting up stays quiet beside them",
  );
  assert.equal(at({ found: { draws: true, acts: true } }).coral, "found");
  assert.equal(
    at({ needYou: true, found: { draws: true, acts: true } }).coral,
    null,
    "under the day Ask found takes none",
  );
  assert.equal(at({ found: { draws: true, acts: true }, mayAct: false }).coral, null, "a viewer approves nothing");
  assert.deepEqual(
    [at({}).lead, at({}).alone, at({ read: false }).lead],
    [true, true, false],
    "before Today is read Ask found does not lead",
  );
  assert.deepEqual(
    [at({ known: false }).lead, at({ known: false }).alone],
    [false, false],
    "before what Ask found is drawn from is known, it does not lead and the day does not stand alone: not read is not nothing",
  );
  assert.equal(at({ found: { draws: true, acts: false } }).alone, false, "a read that failed is said in its pane");
});
