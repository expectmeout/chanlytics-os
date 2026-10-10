/**
 * Campaigns' ledger, the page (spec 2026-10-09 §4.2-§4.6): drawn on the stub React over the view model the real surfaces
 * make (the Playbooks and Broadcasts samples, through contracts' campaignsHomeOf), with more campaigns added where a test
 * needs the tool line. What is proved here is what the page does with the ledger (its decisions are
 * ledger-view.test.mjs's, its words and numbers lane 2's ledger.test.mjs's): a row's acts, the rows and their doors, the
 * tool line, the rail's toggle, the phone's spine, the keys and where focus and the address go.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  classes,
  textOf,
  press,
} from "../../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York: tomorrow is Saturday the 3rd. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

const went = [];
const replaced = [];
const toasts = [];
const said = [];
installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {}, back: () => said.push(["back"]) },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
});
// Literal paths, so knip sees the exports these tests read.
const { installClock } = await import("../../../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(globalThis, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { WaitingActs, ResumeAct } =
  await import("../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-acts.tsx");
const { ComingBlock } = await import("../../../../../apps/dashboard/src/surfaces/campaigns/home/tiles.tsx");
const { setSurfaceValue } = await import("../../../../../apps/dashboard/src/surfaces/surface-values.ts");

afterEach(() => {
  for (const k of ["playbooks", "broadcasts", "reach_outs", "settings", "campaign_results"])
    setSurfaceValue(k, undefined);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.document.querySelector = () => null;
});
globalThis.document.querySelector = () => null;

const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  toasts.length = 0;
  said.length = 0;
};

/** A row in the view model's shape (contracts LifecycleRow), for the acts drawn alone. */
const ROW = {
  id: "pb-1",
  kind: "playbook",
  name: "Win-back",
  hint: "",
  status: "waiting",
  stateWords: "Waiting on you",
  phoneWords: "",
  tone: "warn",
  needs: "offers",
  needsWords: "",
  channels: [],
  people: { n: 7, unit: "people" },
  results: "none",
  next: { words: "Waiting on you", atMs: NOW },
  open: { kind: "open", label: "Open", playbookId: "pb-1" },
  waiting: { runId: "b-1", people: 7, refusal: null },
  act: null,
  search: "win-back",
};
/** An approval as the page holds one (home-page.tsx useApproval), every press written down. */
const approvalOf = (over = {}) => {
  const did = [];
  return {
    did,
    busy: null,
    asking: null,
    onAsk: (id) => did.push(["ask", id]),
    onApprove: async (r) => did.push(["approve", r.id]),
    onSkip: async (r) => did.push(["skip", r.id]),
    canAct: true,
    gated: {},
    ...over,
  };
};

test("a waiting run's row says Approve with its count and Skip, each naming the run; Skip asks before it skips", async () => {
  fresh();
  const a = approvalOf();
  const w = { runId: "b-1", people: 7, refusal: null };
  let acts = again(() => WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: a }));
  const approve = byTestId(acts, "cmh-approve");
  assert.match(textOf(approve), /Approve · 7 people/);
  assert.equal(approve.props["aria-label"], "Approve this run of Win-back");
  assert.equal(textOf(byTestId(acts, "cmh-skip")).trim(), "Skip");
  await approve.props.onClick();
  press(byTestId(acts, "cmh-skip"));
  assert.deepEqual(a.did, [
    ["approve", "pb-1"],
    ["ask", "b-1"],
  ]);
  acts = again(() => WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: { ...a, asking: "b-1" } }));
  assert.match(textOf(byTestId(acts, "cmh-skip-confirm")), /Skip this run of Win-back\?/);
  assert.equal(byTestId(acts, "cmh-approve"), null, "the question stands where the acts stood");
});

test("a run the verb would refuse says why and offers Skip alone; a role that may not skip has nothing to press", () => {
  fresh();
  const w = { runId: "b-1", people: 7, refusal: "This run was made for Sep 30 and that day has passed." };
  const acts = again(() => WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: approvalOf() }));
  assert.equal(byTestId(acts, "cmh-approve"), null);
  assert.match(textOf(byTestId(acts, "cmh-row-refusal")), /that day has passed/);
  assert.ok(byTestId(acts, "cmh-skip"));
  const viewer = again(() =>
    WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: approvalOf({ canAct: false }) }),
  );
  assert.equal(byTestId(viewer, "cmh-waiting-acts"), null);
  assert.match(textOf(viewer), /that day has passed/, "its words still say why it waits");
});

test("Resume asks in place, saying when and to how many; No puts the press back, Yes resumes", () => {
  fresh();
  const pressed = [];
  const act = {
    kind: "resume",
    label: "Resume",
    playbookId: "pb-1",
    ask: { question: "Resume Win-back?", detail: "Next run today 9:00 AM, about 25 people" },
  };
  const draw = () => again(() => ResumeAct({ act, onAct: (x) => pressed.push(x.playbookId), gated: {} }));
  press(byTestId(draw(), "cmh-resume"));
  let tree = draw();
  const ask = byTestId(tree, "cmh-resume-confirm");
  assert.match(textOf(ask), /Resume Win-back\?/);
  assert.match(textOf(ask), /Next run today 9:00 AM, about 25 people/);
  assert.deepEqual(pressed, [], "nothing resumes on the first press");
  press(byTestId(tree, "cmh-resume-no"));
  tree = draw();
  assert.ok(byTestId(tree, "cmh-resume"), "No puts Resume back");
  press(byTestId(tree, "cmh-resume"));
  press(byTestId(draw(), "cmh-resume-yes"));
  assert.deepEqual(pressed, ["pb-1"]);
});

/** A waiting run's line in Coming up, in the view model's shape (contracts LifecycleComing). */
const comingLine = (id, over = {}) => ({
  id: `run:${id}`,
  kind: "run",
  when: { day: "Sat", at: "9:00 AM" },
  what: "Win-back",
  why: "7 people. Nothing sends until you say so.",
  pill: { tone: "warn", label: contracts.LIFECYCLE_WORDS.coming.waiting },
  act: { kind: "route", label: "Open", route: `broadcasts/run:${id}` },
  waiting: { runId: id, people: 7, refusal: null },
  atMs: NOW,
  ...over,
});

test("Coming up keeps a waiting run's time and Waiting on you, decides nothing, and its door says Sent and goes there", () => {
  fresh();
  const refusal = "This run was made for Sep 30 and that day has passed.";
  const tile = {
    read: "read",
    rows: [comingLine("b-1"), comingLine("b-2", { why: refusal, waiting: { runId: "b-2", people: 7, refusal } })],
    empty: null,
    rules: "Sends wait for 9 AM to 8 PM",
  };
  const tree = again(() => ComingBlock({ tile, failed: null, acts: { onAct() {}, gated: {} } }));
  const lines = all(tree, (n) => n.props?.["data-testid"] === "cmh-coming-line");
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(textOf(line), /Sat9:00 AM/, "its time");
    assert.match(textOf(line), /Waiting on you/, "and that it waits");
    for (const id of ["cmh-waiting-acts", "cmh-approve", "cmh-skip"])
      assert.equal(byTestId(line, id), null, `${id}: a run is decided on its row of the ledger, never here`);
  }
  assert.match(textOf(byTestId(lines[1], "cmh-coming-refusal")), /that day has passed/, "why it cannot be approved");
  // The door's label and where it goes, together: the head says Sent, and Sent's week is where it goes.
  const door = find(tree, (n) => classes(n).includes("cmh-more"));
  assert.equal(contracts.LIFECYCLE_WORDS.coming.link, contracts.CAMPAIGN_ROOMS.sent);
  assert.match(textOf(door), new RegExp(`^${contracts.CAMPAIGN_ROOMS.sent}\\s*$`));
  assert.equal(door.props.href, "#/broadcasts");
  press(door);
  assert.deepEqual(went, ["broadcasts"]);
});

/* ---------------------------------------------- the desk ledger, drawn alone ---------------------------------------------- */

const { Ledger } = await import("../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/ledger.tsx");
const { useLedgerView } =
  await import("../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts");
const { Menu } = await import("../../../../../apps/dashboard/src/surfaces/kit/menu/menu.tsx");
const h = globalThis.React.createElement;
const allBy = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);

/** The ledger's words: contracts' own (their test is lane 2's ledger.test.mjs), so a ledger drawn alone says what the page says. */
const WORDS = contracts.LIFECYCLE_WORDS.ledger;
const rowOf = (id, over = {}) => ({
  ...ROW,
  id,
  name: id,
  status: "on",
  tone: "ok",
  waiting: null,
  search: id,
  open: { kind: "open", label: "Open", playbookId: id },
  next: { words: "tomorrow 9:00 AM", atMs: NOW + 3_600_000 },
  ...over,
});
const groupOf = (id, rows, add = null) => ({
  id,
  caps: id.replace("_", " ").toUpperCase(),
  glyph: "bell",
  meta: "",
  rows,
  add,
});
const ledgerOf = (groups, over = {}) => ({
  groups,
  // NINE's own: seven campaigns (the receptionist and the call's text are no campaign), one waiting, one paused.
  counts: { all: 7, running: 6, needs: 1, paused: 1 },
  tools: true,
  sentOnce: null,
  period: "Last 30 days",
  results: "read",
  words: WORDS,
  ...over,
});
const NO_FAILED = { templates: null, chains: null, report: null };
/** What the page hands the rows: doors as links (routeDoor, pushed for a drawer), presses written down. */
const ledgerActs = () => {
  const did = [];
  return {
    did,
    door: (act) =>
      act.kind === "open"
        ? {
            href: `/w/studio/campaigns/moment:${act.playbookId}`,
            onClick: () => went.push(`campaigns/moment:${act.playbookId}`),
          }
        : act.kind === "route"
          ? { href: `/w/studio/${act.route}`, onClick: () => went.push(act.route) }
          : null,
    onAct: (act) => did.push(act.kind),
    gated: {},
    approval: approvalOf(),
  };
};
/** The ledger as the page draws it: its view held over the stub React, then the component. */
const drawLedger = (ledger, { group = null, mark = null, failed = NO_FAILED } = {}) => {
  const acts = ledgerActs();
  const draw = () =>
    again(() => {
      const view = useLedgerView(ledger, { group, onGroup: (g) => went.push(["group", g]), phone: false });
      return h(Ledger, { ledger, failed, view, acts, cursor: null, mark, searchRef: { current: null } });
    });
  return { draw, acts };
};
const NINE = () =>
  ledgerOf([
    groupOf("first_contact", [
      rowOf("receptionist", { kind: "receptionist", status: "always", open: null }),
      rowOf("call_text", { kind: "call_text", open: { kind: "route", label: "Library", route: "messages" } }),
    ]),
    groupOf("before", [
      rowOf("pb-a", { results: { kind: "sent", sent: 212, replied: 48 }, people: { n: 7, unit: "people" } }),
      rowOf("pb-b", { status: "waiting", tone: "warn", waiting: { runId: "b-1", people: 7, refusal: null } }),
    ]),
    groupOf("after", [], { kind: "turn_on", label: "Turn on", moment: "visited" }),
    groupOf("quiet", [
      rowOf("pb-c", {
        status: "paused",
        tone: "plain",
        results: "uncounted",
        people: { n: null, unit: "people" },
        act: {
          kind: "resume",
          label: "Resume",
          playbookId: "pb-c",
          ask: { question: "Resume pb-c?", detail: "Next run today 10:00 AM, about 25 people" },
        },
      }),
      rowOf("pb-d"),
    ]),
    groupOf("lists", [rowOf("pb-e"), rowOf("pb-f")]),
    groupOf("reach_out", [rowOf("ch-1", { kind: "chain", results: { kind: "written", written: 40, wroteBack: 6 } })], {
      kind: "route",
      label: "Find businesses to write to",
      route: "clients/leads",
    }),
  ]);

test("past seven rows the tool line stands: the search, a tab per status above zero, how many are shown, Sort and Group", () => {
  fresh();
  const tree = drawLedger(NINE()).draw();
  const tools = byTestId(tree, "cmh-ledger-tools");
  assert.ok(byTestId(tools, "cmh-ledger-search"), "the search");
  assert.deepEqual(
    all(tools, (n) => /^cmh-status-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props["data-testid"]),
    ["cmh-status-all", "cmh-status-needs", "cmh-status-paused"],
  );
  assert.equal(textOf(byTestId(tools, "cmh-ledger-say")), "Showing 7 of 7", "campaigns, as the All tab counts them");
  assert.equal(byTestId(tools, "cmh-ledger-search").props.placeholder, "Search 7 campaigns", "one number on one line");
  assert.equal(
    find(tools, (n) => n.props?.["data-testid"] === "cmh-status-needs" && "title" in n.props)?.props.title,
    WORDS.needsOf(1),
    "Needs you names its unit (decision 19)",
  );
  const menus = all(tools, (n) => n.type === Menu);
  assert.deepEqual(
    menus.map((m) => m.props.groups[0].choose.value),
    ["next", "moment"],
    "Sort, then Group, each a set to choose one of",
  );
  const sortedHead = (t) => find(byTestId(t, "cmh-ledger-heads"), (n) => n.props?.["data-sorted"] === "true");
  assert.equal(sortedHead(tree).props["data-col"], "next", "the heads once, the sorted one in the chosen ink");
  menus[0].props.groups[0].choose.onChoose("name");
  assert.equal(
    sortedHead(drawLedger(NINE()).draw()).props["data-col"],
    "campaign",
    "sorted by name: the campaign's head",
  );
});

test("a status at zero has no tab, but All", () => {
  fresh();
  const tree = drawLedger(ledgerOf(NINE().groups, { counts: { all: 7, running: 5, needs: 0, paused: 2 } })).draw();
  assert.deepEqual(
    all(tree, (n) => /^cmh-status-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props["data-testid"]),
    ["cmh-status-all", "cmh-status-paused"],
  );
});

test("under seven rows: no tool line, no heads, the rows in their groups, an empty moment with its Turn on, one-off sends a footer", () => {
  fresh();
  const few = ledgerOf(
    [
      groupOf("before", [rowOf("pb-a")]),
      groupOf("after", [], { kind: "turn_on", label: "Turn on", moment: "visited" }),
    ],
    { tools: false, sentOnce: { n: 3, open: { kind: "route", label: "Sent", route: "broadcasts" } } },
  );
  const tree = drawLedger(few).draw();
  assert.equal(byTestId(tree, "cmh-ledger-tools"), null);
  assert.equal(byTestId(tree, "cmh-ledger-heads"), null);
  assert.deepEqual(
    allBy(tree, "cmh-group-head").map((g) => textOf(g).includes("Turn on")),
    [false, true],
  );
  const once = byTestId(tree, "cmh-sent-once");
  assert.match(textOf(once), /Sent once · last 30 days · 3/);
  press(byTestId(once, "cmh-sent-once-open"));
  assert.deepEqual(went, ["broadcasts"], "a door to Sent");
});

test("a row: its name a link to its drawer, the whole row its press, what came back in words, the next run, and its one act", () => {
  fresh();
  const { draw, acts } = drawLedger(NINE());
  const tree = draw();
  const rows = allBy(tree, "cmh-row");
  const a = rows.find((r) => r.props["data-row"] === "pb-a");
  assert.equal(a.props["data-kind"], "playbook");
  assert.equal(a.props["data-state"], "on");
  const name = byTestId(a, "cmh-row-open");
  assert.equal(name.props.href, "/w/studio/campaigns/moment:pb-a", "a link, so a middle-click opens a tab");
  assert.ok("data-row-open" in name.props, "the row's press presses it (cmRowPress)");
  assert.match(textOf(a), /212 sent · 48 replied/);
  assert.match(textOf(a), /tomorrow 9:00 AM/);
  assert.equal(textOf(byTestId(a, "cmh-row-people")), "7");
  const c = rows.find((r) => r.props["data-row"] === "pb-c");
  assert.equal(textOf(byTestId(c, "cmh-row-results")), "—", "what was not counted is a dash, never a zero");
  assert.equal(textOf(byTestId(c, "cmh-row-people")), "—", "and so is who was not counted");
  assert.ok(byTestId(c, "cmh-resume"), "a paused row resumes, asked");
  const b = rows.find((r) => r.props["data-row"] === "pb-b");
  assert.equal(b.props["data-state"], "waiting");
  assert.match(textOf(byTestId(b, "cmh-approve")), /Approve · 7 people/);
  const chain = rows.find((r) => r.props["data-row"] === "ch-1");
  assert.match(textOf(chain), /40 written · 6 wrote back/, "a chain in Reports' words");
  const call = rows.find((r) => r.props["data-row"] === "call_text");
  assert.equal(
    byTestId(call, "cmh-row-open").props.href,
    "/w/studio/messages",
    "the call's text is a door to the Library",
  );
  const receptionist = rows.find((r) => r.props["data-row"] === "receptionist");
  assert.equal(byTestId(receptionist, "cmh-row-open"), null, "the receptionist has no page to open");
  // Turn on on an empty moment's head is a press; Reach-outs' add is a door to Leads.
  const heads = allBy(tree, "cmh-group-add");
  press(heads.find((n) => textOf(n).includes("Turn on")));
  assert.deepEqual(acts.did, ["turn_on"]);
  assert.equal(heads.find((n) => textOf(n).includes("Find businesses")).props.href, "/w/studio/clients/leads");
});

test("a chain whose run waits opens that run from its row: its act is a door, as lane 2's view model says", () => {
  fresh();
  const waits = rowOf("ch-w", {
    kind: "chain",
    status: "waiting",
    tone: "warn",
    act: { kind: "route", label: "Open the run", route: "broadcasts/run:r-9" },
  });
  const tree = drawLedger(ledgerOf([groupOf("reach_out", [waits])], { tools: false })).draw();
  const door = byTestId(allBy(tree, "cmh-row")[0], "cmh-row-run");
  assert.equal(door.props.href, "/w/studio/broadcasts/run:r-9");
  assert.match(textOf(door), /Open the run/);
});

test("a chosen group says which, how many of how many, and Clear; nothing matching says so, with Clear", () => {
  fresh();
  let tree = drawLedger(NINE(), { group: "quiet" }).draw();
  assert.equal(textOf(byTestId(tree, "cmh-ledger-say")), "QUIET · showing 2 of 7");
  press(byTestId(tree, "cmh-ledger-clear"));
  assert.deepEqual(went, [["group", null]]);
  // Under seven rows the line still says the group and its Clear, and nothing else.
  fresh();
  tree = drawLedger(
    ledgerOf([groupOf("before", [rowOf("pb-a")]), groupOf("quiet", [rowOf("pb-c")])], { tools: false }),
    {
      group: "quiet",
    },
  ).draw();
  assert.equal(byTestId(tree, "cmh-ledger-search"), null);
  assert.equal(textOf(byTestId(tree, "cmh-ledger-say")), "QUIET · showing 1 of 2");
  // A filter nothing answers says so, with its Clear: here the address names a moment that holds no campaign.
  fresh();
  tree = drawLedger(NINE(), { group: "after" }).draw();
  const none = byTestId(tree, "cmh-ledger-none") ?? find(tree, (n) => n.props?.testid === "cmh-ledger-none");
  assert.ok(none, "the empty state, in its line kind");
  assert.match(textOf(none), /No campaigns match/);
  assert.equal(allBy(tree, "cmh-group").length, 0, "and no group drawn empty under a filter");
});

test("a row decided in place settles once; a row that arrived is drawn anew and washed", () => {
  fresh();
  let tree = drawLedger(NINE(), { mark: { id: "pb-a", kind: "settled" } }).draw();
  let a = allBy(tree, "cmh-row").find((r) => r.props["data-row"] === "pb-a");
  assert.equal(a.props["data-settled"], "true");
  assert.equal(a.props["data-arrived"], undefined);
  fresh();
  tree = drawLedger(NINE(), { mark: { id: "pb-a", kind: "arrived" } }).draw();
  a = allBy(tree, "cmh-row").find((r) => r.props["data-row"] === "pb-a");
  assert.equal(a.props["data-arrived"], "true");
});

test("a read that failed keeps its place: the templates in First contact, the chains in Reach-outs, the numbers in the tool line", () => {
  fresh();
  const F = (what, surface) => ({ what, body: "The rest is current.", surface });
  const tree = drawLedger(NINE(), {
    failed: {
      templates: F("your templates", "settings"),
      chains: F("your reach-outs", "reach_outs"),
      report: F("this period's numbers", "campaign_results"),
    },
  }).draw();
  const groups = allBy(tree, "cmh-group");
  const inGroup = (id, testid) =>
    byTestId(
      groups.find((g) => g.props["data-group"] === id),
      testid,
    );
  assert.ok(inGroup("first_contact", "cmh-templates-failed"));
  assert.ok(inGroup("reach_out", "pb-chains-failed"));
  assert.ok(byTestId(byTestId(tree, "cmh-ledger-tools"), "cmh-ledger-failed"));
});
