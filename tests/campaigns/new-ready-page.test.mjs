/**
 * New's first screen, drawn (sequences/new/new-start.tsx with new-line.tsx, new-ready.tsx, new-journey.tsx and
 * new-since.tsx; decision 0129, the canvas "New: start from what's ready"), on the stub React over what the page reads:
 *
 * - It opens on what is ready: the start reaching most people stands open, the rest are rows, and a press drafts it from
 *   its own line with its choices made.
 * - The open start shows the workspace's own message where it holds the moment's, and says Ask writes it where not.
 * - One step away stands under what is ready, and the journey in place of "Runs already".
 * - A viewer reads what is happening, where someone waits, with nothing to press.
 * - The line is one row of the kit's Field, and its arrow waits for eight letters.
 * - Back from the one step, what changed is said and the kept line is offered; kept as a place, never as a draft.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installStubReact, fresh, again, find, byTestId, textOf, press } from "../_stub-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const W = contracts.NEW_WORDS;
const R = contracts.NEW_READY_WORDS;

installStubReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const SRC = "../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/bridge/zone.ts`);
installClock();
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
Object.assign(globalThis, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { installTabMemory } = await import(`${SRC}/bridge/tab-memory.ts`);
installTabMemory(globalThis);
const TM = globalThis.__tabMemory;
const { StartView } = await import(`${SRC}/surfaces/campaigns/sequences/new/new-start.tsx`);
const { cmOfferedMessages } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);
const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);

/** A starter as WhatsApp holds it once approved: the library's words and slots (new-sheets.test.mjs's). */
const starterRow = (key, id) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, "en_US");
  return {
    id,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    source: "starter",
    title: null,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  };
};
const OFFERED = cmOfferedMessages({ templates: [starterRow("winback_offer", "tpl-winback")] });
const LIBRARY = { messages: OFFERED.flatMap((t) => (t.message ? [t.message] : [])), rows: OFFERED };

const REGULARS = "list:11111111-1111-4111-8111-111111111111";
const moment = (id, kind, candidates, label) => ({ id, label, hint: `${label} hint`, kind, offered: true, candidates });
const READS = {
  moments: [
    moment("lapsed", "list", 41, "Win-back"),
    moment("visited", "visit", 6, "After the appointment"),
    moment("visit_tomorrow", "visit", 6, "Appointment reminder"),
    moment("visit_soon", "occasion", null, "Reminder, 2 hours before"),
    moment("asked_no_booking", "occasion", 0, "Booking follow-up"),
  ],
  lists: [{ id: REGULARS, name: "Regulars", candidates: 18, said: null, builtin: false }],
  everyone: 0,
  everyoneHeld: null,
  sources: [],
  running: [
    {
      id: "seq-1",
      name: "Visit reminder",
      state: "on",
      starts: "moment",
      first: { trigger: "visit_tomorrow", list_id: null, list_key: null },
    },
  ],
  calendarOn: true,
  word: "appointment",
  messages: 3,
  library: { messages: [], rows: [] },
  business: "Northside Studio",
  hasDeals: false,
};
const asked = [];
/** New's first screen, drawn afresh over these reads. */
const draw = (over = {}, props = {}) => {
  fresh();
  asked.length = 0;
  return again(() =>
    globalThis.React.createElement(StartView, {
      line: "",
      onLine() {},
      onDraft: (words, fixed) => asked.push({ words, fixed }),
      drafting: false,
      onStop() {},
      failed: false,
      refused: null,
      onByHand() {},
      notice: null,
      reads: { ...READS, ...over },
      may: true,
      onClose() {},
      ...props,
    }),
  );
};
const has = (tree, id) => !!byTestId(tree, id);
/** The element a kit part draws, by its id: what a press lands on. */
const host = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
/** What the tab keeps as work half-done, whole. */
const drafts = () => JSON.parse(globalThis.sessionStorage.getItem("chanlytics.drafts.v1") || "{}");

test("it opens on what is ready: the one reaching most people stands open, the rest are rows", () => {
  const tree = draw();
  assert.ok(has(tree, "sq-nw-open-lapsed"), "the win-back stands open");
  for (const id of ["visited", REGULARS, "asked_no_booking"]) assert.ok(has(tree, `sq-nw-start-${id}`), id);
  // A moment a sequence already starts on is not offered, and the fifth start waits on the map.
  assert.ok(!has(tree, "sq-nw-start-visit_tomorrow"));
  assert.ok(!has(tree, "sq-nw-start-visit_soon"));
  assert.ok(textOf(byTestId(tree, "sq-nw-open-lapsed")).includes(R.askWrites), "no message of its own: Ask writes it");
});

test("the open start shows the workspace's own message where it holds the moment's", () => {
  const tree = draw({ library: LIBRARY });
  const open = textOf(byTestId(tree, "sq-nw-open-lapsed"));
  assert.ok(open.includes(R.yours(LIBRARY.messages[0].title)), "named as theirs");
  assert.ok(!open.includes(R.askWrites));
  // Its words, filled as a person reads them: the business's name is in a win-back's.
  assert.ok(open.includes("Northside Studio"), open);
});

test("a press drafts it from its own line, with its choices made", () => {
  const tree = draw();
  press(host(tree, "sq-nw-start-lapsed"));
  assert.equal(asked.length, 1);
  assert.equal(asked[0].words, "Invite back anyone who hasn’t been in for a while");
  assert.deepEqual(asked[0].fixed, {
    kind: "sequence",
    audience: "people",
    who: { kind: "moment", trigger: "lapsed", label: "Win-back" },
  });
  // A row drafts the same way.
  press(host(tree, `sq-nw-start-${REGULARS}`));
  assert.deepEqual(asked[1].fixed.who, { kind: "list", token: REGULARS, label: "Regulars" });
});

test("One step away stands under what is ready, and the journey in place of Runs already", () => {
  const tree = draw();
  assert.ok(has(tree, "sq-nw-starts") && has(tree, "sq-nw-setup"), "both at once");
  assert.ok(has(tree, "sq-nw-setup-everyone") && has(tree, "sq-nw-setup-leads"));
  assert.ok(!has(tree, "sq-nw-setup-calendar"), "the calendar is connected");
  assert.ok(textOf(byTestId(tree, "sq-nw-journey")).includes(R.covered(1, 5)));
  assert.ok(!has(tree, "sq-nw-running"));
  // Without a calendar, what is read off it leaves the starts for One step away.
  const bare = draw({ calendarOn: false });
  assert.ok(has(bare, "sq-nw-setup-calendar"));
  assert.ok(!has(bare, "sq-nw-start-visited"));
});

test("a viewer reads what is happening, where someone waits, with nothing to press", () => {
  const tree = draw({}, { may: false });
  assert.ok(!has(tree, "sq-nw-open-lapsed"), "nothing stands open");
  const row = host(tree, "sq-nw-start-lapsed");
  assert.ok(row && !row.props.onClick, "said, not pressed");
  assert.ok(textOf(row).includes(W.viewer.winBack(41)), "as a fact");
  assert.ok(!has(tree, "sq-nw-start-asked_no_booking"), "nobody waits in it: nothing is happening there");
  assert.ok(!has(tree, "sq-nw-line"), "no line to draft from");
});

test("the line is one row of the kit's Field, and its arrow waits for eight letters", () => {
  const short = draw({}, { line: "Thank" });
  assert.equal(find(short, (n) => n.type === Field && n.props["data-testid"] === "sq-nw-line").props.rows, 1);
  assert.equal(host(short, "sq-nw-draft").props.disabled, true);
  const long = draw({}, { line: "Thank them the next day" });
  assert.equal(host(long, "sq-nw-draft").props.disabled, false);
  press(host(long, "sq-nw-draft"));
  assert.equal(asked[0].words, "Thank them the next day");
});

test("back from the one step: what changed is said, and the kept line is offered", () => {
  const LINE = "Tell everyone we’re open Sundays now";
  // New as it was left: nobody had said yes, and a line stood in its field.
  TM.keepPlace("new", "left", { seen: true, line: LINE, everyone: 0, leads: 0, calendar: true });
  const tree = draw({ everyone: 38 });
  const card = textOf(byTestId(tree, "sq-nw-since"));
  assert.ok(card.includes(R.since.yes(38)), card);
  assert.ok(card.includes(R.since.kept(LINE)), "the line, offered");
  press(host(tree, "sq-nw-since-go"));
  assert.equal(asked[0].words, LINE);
  assert.equal(TM.place("new", "left").line, null, "a line drafted is let go");
  // What New keeps of itself is a place, never work half-done: the tab closes over it without asking.
  assert.deepEqual(drafts(), {});
  // Nothing changed since: nothing is said.
  TM.keepPlace("new", "left", { seen: true, line: LINE, everyone: 38, leads: 0, calendar: true });
  assert.ok(!has(draw({ everyone: 38 }), "sq-nw-since"));
  // Never open in this tab: nothing to compare with, nothing said.
  TM.keepPlace("new", "left", {});
  assert.ok(!has(draw({ everyone: 38 }), "sq-nw-since"));
});
