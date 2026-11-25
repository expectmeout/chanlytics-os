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
import { headline, weekSeen } from "../_headline.mjs";
import { NOW, W, dayWith, row } from "./_world.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

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
    rested: weekSeen(),
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
  bridgeHolds({
    values: {
      people: {
        rows: steps ? peopleWithSteps([["a", "Ana", -1]]) : peopleWithSteps([["a", "Ana", null]]),
        lists: [],
        aggregates: { total: 1 },
        fetchedAt: NOW.getTime(),
      },
    },
  });
}

function cleared() {
  unmount();
  for (const key of ["today", "setup", "ask_morning", "reports_headline"]) setSurfaceValue(key, undefined);
  bridgeHolds({ values: { people: undefined } });
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
/**
 * Since Today, calm (19 Nov 2026) the page's one coral is its card's: the first thing worth doing, drawn first and whole,
 * by whichever part holds it (data-holder: who waits, To do, setting up, what AI found); every other thing is a line.
 */
const cardOf = (tree) =>
  byTestId(tree, "today-card") ??
  // Setting up is its own card, the setup card itself, drawn first where it holds the page's (zones/page.tsx).
  all(tree, (n) => String(n.props?.className ?? "").includes("tz-setup-lead"))[0];
const holderOf = (tree) => {
  const card = cardOf(tree);
  if (!card) return null;
  return card.props["data-holder"] ?? (String(card.props.className ?? "").includes("tz-setup-lead") ? "setup" : null);
};
const inCard = (tree, coral) => all(cardOf(tree) ?? null, (n) => n === coral).length > 0;

test("someone waiting, setup left and an idea found: the first frame's one coral is the person's, in the card; setting up and what AI found are lines", () => {
  moment({ waiting: [row("rosa", "Rosa Díaz")], setup: true, found: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(
      coral.length,
      1,
      `one coral on the first frame, not ${coral.length}: ${coral.map(textOf).join(" | ")}`,
    );
    assert.equal(holderOf(page), "queue", "REGRESSION: the person waiting holds the card on the first frame");
    assert.ok(inCard(page, coral[0]), "and the coral is the card's");
    assert.ok(byTestId(page, "today-setup-line"), "setting up is one line, never the card over someone waiting");
    assert.match(textOf(cardOf(page)), /Rosa/);
  } finally {
    cleared();
  }
});

test("only a to-do, with setup left: To do's first holds the card and its act is the one coral, never the setup's beside it", () => {
  moment({ steps: true, setup: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(
      coral.length,
      1,
      `REGRESSION: Continue setting up drew coral before To do said it held it: ${coral.map(textOf).join(" | ")}`,
    );
    assert.equal(holderOf(page), "todo");
    assert.ok(inCard(page, coral[0]));
  } finally {
    cleared();
  }
});

test("only setup left, with an idea found: setting up holds the card and its act is the coral; what AI found is a line", () => {
  moment({ setup: true, found: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(
      coral.length,
      1,
      `REGRESSION: Check it stood coral beside Continue on the first frame: ${coral.map(textOf).join(" | ")}`,
    );
    assert.equal(holderOf(page), "setup");
    assert.ok(inCard(page, coral[0]));
  } finally {
    cleared();
  }
});

test("only an idea found: what AI found holds the card, its first act the coral", () => {
  moment({ found: true });
  try {
    const page = firstFrame();
    const coral = corals(page);
    assert.equal(coral.length, 1);
    assert.equal(holderOf(page), "found");
    assert.ok(inCard(page, coral[0]));
  } finally {
    cleared();
  }
});

test("nothing waits and nothing was found: no card, and no coral", () => {
  moment({});
  try {
    const page = firstFrame();
    assert.equal(corals(page).length, 0);
    assert.equal(cardOf(page), undefined, "nothing is the card");
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
