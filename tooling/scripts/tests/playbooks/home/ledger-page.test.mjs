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
