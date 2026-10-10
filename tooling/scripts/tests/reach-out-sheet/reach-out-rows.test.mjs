/**
 * A reach-out on Campaigns and on Templates (Reach out, Part 4 PR 8), run on the stub React over the surface's own words
 * (surfaces/campaigns/reach-out/surface.ts, contracts reach-out-sheet.ts) and its verbs stubbed on the surface's one
 * `reachOuts` object, which the TSX pane imports (a test sets what a verb answers there, as it once set
 * `window.__reachOuts`):
 *
 * - Campaigns' home (it took the Playbooks list's place, 3 Oct 2026): a chain is a quiet line under the moments, with its
 *   steps, its search and its state, and Open or Resume; its report is read when it opens, never before (R23); a link to
 *   it (`campaigns/moment:<root id>`) opens its pane in the sheet, and is "gone" only once the chains were read; Resume on
 *   a line is the playbooks' own verb, the door the chain's own Resume presses.
 * - The pane: its report is read when it opens, and its table is the report's counts and nothing else; Pause or Resume
 *   presses the chain's first step; Remove is offered only while the report says it may go (R16), asks first, and presses
 *   the chain's own door; the held open their run (R20); stopping one business is said (R24); a report that could not be
 *   read says so and reads again on Retry; a refusal is said as every refusal is; a viewer's acts are inert (the real
 *   gate); Edit opens the reach-out sheet over the chain, for a role that may change it.
 * - Templates: a chain's emails are messages in the Templates list (reach-out-email-message.test.mjs: their rows, their
 *   pane and its editor, counted by contracts' emailTemplateRowsOf over the chains, which this file holds to the surface's
 *   reads).
 * - The bridge: the verbs press the doors they name, and the surface reads the chains and nothing more.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const went = [];
const toasts = [];
Object.assign(W, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  // The role store's gate is data-bits.jsx's own (window.gate, canDo, gateTitle), over this role and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  __surfaceState: () => "live",
  useHotkey: () => {},
});
// The shell's own parts (Confirm, StatePill, the role gate, the record kit) are still JSX the frame loads.
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
// The shell's toast is data-bits.jsx's own; the home raises its notices through it, and a test reads them here.
W.usePPToast = () => [null, (t) => toasts.push(t)];
// The pages and their panes are TSX (decision 0015): Campaigns' home, Templates, and the reach-out's pane and sheet.
const S = "../../../../apps/dashboard/src/surfaces";
const { ReachOutPane } = await import(`${S}/campaigns/reach-out/row.tsx`);
const { CampaignsHome } = await import(`${S}/campaigns/home/home-page.tsx`);
const { ReachOutSheet } = await import(`${S}/campaigns/reach-out/sheet.tsx`);
const { PaneSheet } = await import(`${S}/campaigns/home/pane-sheet.tsx`);
const { playbooksSample } = await import(`${S}/campaigns/playbooks/sample.ts`);
const { playbooks: playbookVerbs } = await import(`${S}/campaigns/playbooks/verbs.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${S}/surface-values.ts`);
const bridge = await import(`${S}/campaigns/reach-out/surface.ts`);
const WORDS = bridge.reachOuts.words;
// The verbs as the surface has them: a test stubs some on the surface's one object, and `realVerbs()` puts every one back.
const REAL_VERBS = { ...bridge.reachOuts };
const realVerbs = (stubs = {}) => Object.assign(bridge.reachOuts, REAL_VERBS, stubs);

const ZONE = "America/Chicago";
const ROOT = "r1";
const chainOf = (over = {}, next = {}) => ({
  root_id: ROOT,
  name: "Reach out · Personal trainers",
  search: { id: "s1", name: "Personal trainers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  domains: [{ host: "harbor-mail.example", sent_days: 0 }],
  steps: [
    {
      id: ROOT,
      n: 0,
      after_days: null,
      subject: "Quick one for {{business}}",
      body: "{{opening}}\n\n{{your name}}",
      template_id: "t1",
      state: "running",
    },
    { id: "n1", n: 1, after_days: 4, subject: null, body: "Just checking in.", template_id: "t2", state: "running" },
  ],
  next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null, ...next },
  ...over,
});
const REPORT = (over = {}) => ({
  steps: [
    {
      id: ROOT,
      n: 0,
      written: 44,
      delivered: 42,
      wrote_back: 5,
      interested: 2,
      booked: 1,
      said_no: 3,
      bounced: 2,
      waiting: 0,
      held: 0,
    },
    // A report read before 00241 says nothing of interested or booked: the row says it does not know, never a zero.
    { id: "n1", n: 1, written: 28, delivered: 28, wrote_back: 3, said_no: 1, bounced: 0, waiting: 5, held: 2 },
  ],
  runs: [
    { id: "b2", step_id: "n1", run_for: "2026-09-25", state: "sending", planned: 7, written: 5, held: 2 },
    { id: "b1", step_id: ROOT, run_for: "2026-09-24", state: "sent", planned: 30, written: 30, held: 0 },
  ],
  can_remove: false,
  ...over,
});
const REACH = { ready: 0, with_unconfirmed: 0, phone_only: 72, of: 160, chain: ROOT };

/** The verbs, stubbed: each press recorded, each report answered as the test says. */
const verbs = (report = REPORT(), ok = true) => {
  const pressed = [];
  realVerbs({
    report: async (id) => (
      pressed.push(["report", id]),
      ok ? { ok: true, data: { report, reach: REACH } } : { ok: false, message: "down" }
    ),
    pause: async (id) => (pressed.push(["pause", id]), { ok: true, data: {} }),
    resume: async (id) => (pressed.push(["resume", id]), { ok: true, data: {} }),
    remove: async (id) => (pressed.push(["remove", id]), { ok: true, data: {} }),
    reach: async (id) => (pressed.push(["reach", id]), { ...REACH, ready: 44, with_unconfirmed: 44 }),
    update: async (id, body) => (
      pressed.push(["update", id, body]),
      { ok: true, data: { root_id: id, step_ids: [], rechecked: 0, start: null } }
    ),
  });
  return pressed;
};

/**
 * One reach-out's pane, as the home's drawer draws it (home/drawer.tsx), open or not: its steps, report and acts are in it;
 * `state` holds the open flag between draws.
 */
const openPane = (chain, state) => {
  const draw = () =>
    W.React.createElement(
      "div",
      null,
      state.open
        ? W.React.createElement(ReachOutPane, {
            chain,
            canAct: true,
            flash: (t) => toasts.push(t),
            onClose: () => (state.open = false),
          })
        : null,
    );
  return { draw, redraw: () => again(draw) };
};

test("the open pane is the report's: its steps counted, its sentence, its runs, the held opening their run (R20), and how to stop one business (R24)", async () => {
  const pressed = verbs();
  fresh();
  const state = { open: true };
  const r = openPane(chainOf(), state);
  let tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-reading")), "Reading how it is doing…");
  await settle();
  tree = r.redraw();
  assert.deepEqual(pressed, [["report", ROOT]]);
  assert.match(
    textOf(byTestId(tree, "ro-chain")),
    /Your email → after 4 days, nothing back → A short nudge · Stops for anyone who writes back, books or says no\./,
  );
  const cells = all(byTestId(tree, "ro-steps"), (n) => n.type === "td" || n.type === "th").map(textOf);
  assert.deepEqual(cells.slice(0, 9), [
    "Step",
    "When",
    "Written",
    "Delivered",
    "Wrote back",
    "Interested",
    "Booked",
    "Said no",
    "Bounced",
  ]);
  assert.deepEqual(cells.slice(9, 18), [
    "Your email",
    "Day one, in their hours",
    "44",
    "42 (95%)",
    "5 (11%)",
    "2",
    "1",
    "3",
    "2",
  ]);
  assert.deepEqual(cells.slice(18, 27).slice(5, 7), ["—", "—"]);
  assert.match(
    textOf(byTestId(tree, "ro-sentence")),
    /^30 a day from harbor-mail\.example, one every 12 minutes in each business's hours\. 72 written; 8 wrote back; 4 said no; 2 bounced and their addresses were dropped\. 2 wait for your say\.$/,
  );
  went.length = 0;
  press(byTestId(tree, "ro-waiting"));
  assert.deepEqual(went, ["broadcasts/run:b2"], "the held open the run that holds them");
  assert.deepEqual(all(byTestId(tree, "ro-history"), (n) => n.type === "button").map(textOf), [
    "Sep 25 · 5 written · 2 held",
    "Sep 24 · 30 written",
  ]);
  assert.equal(
    textOf(byTestId(tree, "ro-stop-one")),
    "To stop writing to one business, open its lead and press Stop writing to them.",
  );
  assert.equal(byTestId(tree, "ro-remove"), null, "one that wrote is paused, never removed (R16)");
});

test("Pause and Resume press the chain's first step; Remove is offered only while it may go, asks first, and presses the chain's door (R16)", async () => {
  let pressed = verbs();
  fresh();
  let r = openPane(chainOf(), { open: true });
  r.redraw();
  await settle();
  let tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-toggle")), "Pause");
  press(byTestId(tree, "ro-toggle"));
  await settle();
  assert.deepEqual(pressed.slice(1), [["pause", ROOT]]);
  assert.match(toasts.at(-1).msg, /is paused/);

  pressed = verbs();
  fresh();
  r = openPane(chainOf({ state: "paused" }), { open: true });
  r.redraw();
  await settle();
  tree = r.redraw();
  assert.equal(textOf(byTestId(tree, "ro-toggle")), "Resume");
  press(byTestId(tree, "ro-toggle"));
  await settle();
  assert.deepEqual(pressed.slice(1), [["resume", ROOT]]);

  pressed = verbs(
    REPORT({
      can_remove: true,
      steps: REPORT().steps.map((s) => ({
        ...s,
        written: 0,
        delivered: 0,
        wrote_back: 0,
        said_no: 0,
        bounced: 0,
        held: 0,
      })),
      runs: [],
    }),
  );
  fresh();
  const removing = { open: true };
  r = openPane(chainOf(), removing);
  r.redraw();
  await settle();
  tree = r.redraw();
  press(byTestId(tree, "ro-remove"));
  tree = r.redraw();
  assert.ok(byTestId(tree, "ro-remove-yes") || textOf(tree).includes("Yes, remove"), "it asks first");
  assert.deepEqual(pressed.slice(1), [], "nothing is removed before the yes");
  const yes = all(tree, (n) => n.type === "button" && textOf(n) === "Yes, remove")[0];
  press(yes);
  await settle();
  assert.deepEqual(pressed.slice(1), [["remove", ROOT]]);
  assert.equal(removing.open, false, "Remove closes the drawer");
  assert.equal(toasts.at(-1).tone, "ok", "then says so");
});

test("a report that could not be read says so, and draws no count", async () => {
  verbs(REPORT(), false);
  fresh();
  const r = openPane(chainOf(), { open: true });
  r.redraw();
  await settle();
  const tree = r.redraw();
  assert.ok(byTestId(tree, "ro-failed"));
  assert.equal(byTestId(tree, "ro-steps"), null);
  assert.equal(byTestId(tree, "ro-remove"), null, "nothing read, nothing removed");
});

test("Retry on a report that could not be read reads it again, and draws it once it reads", async () => {
  let ok = false;
  const pressed = [];
  realVerbs({
    report: async (id) => (
      pressed.push(id),
      ok ? { ok: true, data: { report: REPORT(), reach: REACH } } : { ok: false }
    ),
  });
  fresh();
  const r = openPane(chainOf(), { open: true });
  r.redraw();
  await settle();
  let tree = r.redraw();
  assert.ok(byTestId(tree, "ro-failed"));
  ok = true;
  press(byTestId(tree, "ro-failed-retry"));
  r.redraw();
  await settle();
  tree = r.redraw();
  assert.deepEqual(pressed, [ROOT, ROOT], "the report is read again, not the moments' surface");
  assert.equal(byTestId(tree, "ro-failed"), null);
  assert.ok(byTestId(tree, "ro-steps"));
});

test("a refused Pause is said as every refusal is (window.refusalToast), never a blank toast", async () => {
  verbs();
  bridge.reachOuts.pause = async () => ({
    ok: false,
    title: "Not allowed",
    message: "Only an owner or operator can pause a reach-out.",
  });
  fresh();
  const r = openPane(chainOf(), { open: true });
  r.redraw();
  await settle();
  press(byTestId(r.redraw(), "ro-toggle"));
  await settle();
  const said = toasts.at(-1);
  assert.equal(said.tone, "danger");
  assert.equal(textOf(said.msg), "Not allowed — Only an owner or operator can pause a reach-out.");
});

test("a viewer's Pause, Resume and Remove are inert: the real gate refuses them and nothing is pressed", async () => {
  const was = W.ST_STORE;
  W.ST_STORE = { can: (a) => !!contracts.ROLE_PERMS.viewer[a], myRole: () => "viewer" };
  try {
    for (const c of [chainOf(), chainOf({ state: "paused" })]) {
      const pressed = verbs(REPORT({ can_remove: true }));
      fresh();
      const r = openPane(c, { open: true });
      r.redraw();
      await settle();
      let tree = r.redraw();
      const toggle = byTestId(tree, "ro-toggle");
      assert.equal(toggle.props["aria-disabled"], true);
      assert.equal(
        toggle.props["data-tip"],
        "Only an owner or operator can " + (c.state === "running" ? "pause" : "resume") + " a reach-out.",
      );
      press(toggle);
      press(byTestId(tree, "ro-remove"));
      await settle();
      tree = r.redraw();
      assert.deepEqual(pressed, [["report", ROOT]], "nothing but the report is read");
      assert.equal(byTestId(tree, "ro-remove-yes"), null, "Remove does not even ask");
      assert.equal(all(tree, (n) => n.type === "button" && textOf(n) === "Yes, remove").length, 0);
    }
  } finally {
    W.ST_STORE = was;
  }
});

/* ------------------------------ Campaigns' home ------------------------------ */

const NOW = Date.parse("2026-09-28T13:00:00Z");
/** The reach-outs not read yet: the surface holds nothing (a read that failed is null, and one that came back is its chains). */
const UNREAD = "unread";
/** Campaigns' home at an address (`campaigns/<param>`, null for the home), over the playbooks' surface and the reach-outs' own (the seam's "reach_outs"). */
const homeAt = (param = null, chains = [chainOf()]) => {
  setSurfaceValue("playbooks", { ...playbooksSample(new Date(NOW)), timezone: ZONE });
  setSurfaceValue("reach_outs", chains === UNREAD ? undefined : chains);
  fresh();
  return again(() => CampaignsHome({ param, nowMs: NOW }));
};
const homeAgain = (param = null) => again(() => CampaignsHome({ param, nowMs: NOW }));
const reachLines = (tree) =>
  all(tree, (n) => n.props?.["data-testid"] === "cmh-row" && n.props["data-kind"] === "chain");

test("a chain is a row of the ledger -- its name, its steps and search, its state, Resume where paused -- and its report is read when it opens, never before (R23)", async () => {
  const pressed = verbs();
  went.length = 0;
  const tree = homeAt(null, [chainOf(), chainOf({ root_id: "r2", name: "Reach out · Florists", state: "paused" })]);
  const lines = reachLines(tree);
  assert.deepEqual(
    lines.map((l) => l.props["data-row"]),
    [ROOT, "r2"],
  );
  const said = textOf(lines[0]);
  for (const part of ["Reach out · Personal trainers", "Personal trainers · Austin", "2 steps"])
    assert.ok(said.includes(part), `${part}: ${said}`);
  assert.deepEqual(
    lines.map((l) => !!byTestId(l, "cmh-resume")),
    [false, true],
    "a paused one resumes, asked; a running one is opened by its row",
  );
  assert.deepEqual(pressed, [], "a row reads no report: it is read when the reach-out opens (R23)");
  // Its name opens it by its address, pushed so Back closes it; there, its pane reads the report once.
  press(byTestId(lines[0], "cmh-row-open"));
  assert.deepEqual(went, [`campaigns/moment:${ROOT}`]);
  homeAt(`moment:${ROOT}`);
  await settle();
  const open = homeAgain(`moment:${ROOT}`);
  assert.deepEqual(pressed, [["report", ROOT]], "read when it opens, once");
  assert.ok(
    find(open, (n) => n.type === ReachOutPane),
    "its own pane, in the sheet",
  );
  assert.ok(byTestId(open, "ro-steps"), "with the report's counts in it");
  // A read of the chains that failed draws no row, and the moments are still there: null, never an empty list.
  const failed = homeAt(null, null);
  assert.equal(reachLines(failed).length, 0);
  assert.ok(byTestId(failed, "campaigns-home"));
});

test("a paused chain's row resumes it, asked in place, through the playbooks' own verb, and says so", async () => {
  const kept = playbookVerbs.resume;
  const resumed = [];
  playbookVerbs.resume = async (id, opts) => {
    resumed.push(id);
    opts.onAccepted({});
    return { ok: true, data: {} };
  };
  try {
    const tree = homeAt(null, [chainOf({ state: "paused" })]);
    toasts.length = 0;
    press(byTestId(reachLines(tree)[0], "cmh-resume"));
    assert.deepEqual(resumed, [], "asked first");
    press(byTestId(reachLines(homeAgain())[0], "cmh-resume-yes"));
    await settle();
    assert.deepEqual(resumed, [ROOT], "the chain's root, the door its own Resume presses (the bridge's verbs, below)");
    assert.match(textOf(toasts.at(-1).msg), /Reach out · Personal trainers resumed/);
  } finally {
    playbookVerbs.resume = kept;
  }
});

test("a link to a chain is 'gone' only once the chains were read, and opens its pane when the chain arrives", () => {
  verbs();
  // Unread (undefined) or failed (null): a chain's id is not known to be missing.
  for (const unread of [UNREAD, null]) {
    const tree = homeAt(`moment:${ROOT}`, unread);
    assert.equal(byTestId(tree, "pb-gone"), null, `no "isn't here any more" while the chains are ${unread}`);
    assert.equal(
      find(tree, (n) => n.type === ReachOutPane),
      null,
      "and no pane to draw",
    );
  }
  assert.ok(byTestId(homeAt("moment:gone", []), "pb-gone"), "read, and not there: gone");
  // The link followed before the chains were read lands on its pane when the chain arrives.
  homeAt(`moment:${ROOT}`, UNREAD);
  setSurfaceValue("reach_outs", [chainOf()]);
  const arrived = homeAgain(`moment:${ROOT}`);
  assert.ok(
    find(arrived, (n) => n.type === ReachOutPane),
    "its pane, as the chain arrives",
  );
  assert.equal(byTestId(arrived, "pb-gone"), null);
});

/** The surfaces a Retry was pressed for: the frame's runner (`window.__refreshSurface`), which a failed read's Retry reads through. */
const refreshed = [];
const withRetry = (run) => {
  W.__refreshSurface = async (key) => {
    refreshed.push(key);
  };
  try {
    run();
  } finally {
    delete W.__refreshSurface;
  }
};

test("a chain's drawer says it is reading, or that it could not read, in the sheet itself: never a sheet with nothing in it", () => {
  verbs();
  const reading = homeAt(`moment:${ROOT}`, UNREAD);
  assert.ok(byTestId(reading, "cmh-drawer-reading"), "the chains are not read yet: reading, quietly");
  assert.equal(textOf(byTestId(reading, "cmh-drawer-reading")), "Reading…");
  assert.equal(byTestId(reading, "cmh-drawer-failed"), null);
  withRetry(() => {
    refreshed.length = 0;
    const failed = homeAt(`moment:${ROOT}`, null);
    assert.ok(byTestId(failed, "cmh-drawer-failed"), "the read failed: said, with its Retry");
    assert.match(textOf(byTestId(failed, "cmh-drawer-failed")), /Couldn't read your reach-outs/);
    press(byTestId(failed, "cmh-drawer-failed-retry"));
    assert.deepEqual(refreshed, ["reach_outs"], "a Retry that reads the reach-outs again");
    assert.equal(byTestId(failed, "cmh-drawer-reading"), null);
  });
  assert.equal(byTestId(homeAt(`moment:${ROOT}`, [chainOf()]), "cmh-drawer-reading"), null, "read: its pane");
});

test("Edit on a reach-out in the home's drawer opens its sheet at an address of its own, in the drawer's place: the record sheet stands on the page, so it could not stand under the drawer's modal", async () => {
  verbs();
  went.length = 0;
  // In the drawer, Edit is the home's press: the sheet is not the pane's own (it would be hidden under the drawer), the address is.
  homeAt(`moment:${ROOT}`);
  await settle();
  let tree = homeAgain(`moment:${ROOT}`);
  press(byTestId(tree, "ro-edit"));
  assert.deepEqual(went, [`campaigns/new:edit:${ROOT}`], "pushed, so Back returns to the detail");
  tree = homeAgain(`moment:${ROOT}`);
  assert.equal(byTestId(tree, "ro-sheet"), null, "and no sheet of the pane's own, under the drawer's modal");
  // The address: the drawer is closed (no moment is asked for), the composer is not drawn, and the reach-out's sheet is the page's.
  const at = homeAt(`new:edit:${ROOT}`);
  const sheet = find(at, (n) => n.type === ReachOutSheet);
  assert.ok(sheet, "the reach-out's sheet");
  assert.equal(sheet.props.chain.root_id, ROOT);
  assert.deepEqual(sheet.props.search, { id: "s1", name: "Personal trainers · Austin" });
  const hosts = all(at, (n) => n.type === PaneSheet);
  assert.equal(
    hosts.find((n) => n.props.testid === "cmh-drawer"),
    undefined,
    "no drawer: its address has gone",
  );
  assert.equal(
    hosts.find((n) => n.props.testid === "cmh-composer"),
    undefined,
    "and the playbook composer is not drawn for a reach-out's id",
  );
  // Closing it leaves the address (a link that arrived here replaces it with the home); the door it says on a save replaces it
  // with where it goes, so a close that is a step Back does not undo the door.
  went.length = 0;
  sheet.props.onClose();
  assert.deepEqual(went, ["campaigns"]);
  went.length = 0;
  sheet.props.onGo("broadcasts/run:b2");
  assert.deepEqual(went, ["broadcasts/run:b2"]);
});

test("a change to something that is no playbook waits on the reach-outs: reading while they are out, failed where they could not be, gone once they are read and it is not one", () => {
  verbs();
  const reading = homeAt(`new:edit:${ROOT}`, UNREAD);
  assert.ok(byTestId(reading, "cmh-composer-reading"), "not known to be missing yet");
  assert.equal(
    find(reading, (n) => n.type === ReachOutSheet),
    null,
  );
  withRetry(() => {
    refreshed.length = 0;
    const failed = homeAt(`new:edit:${ROOT}`, null);
    assert.ok(byTestId(failed, "cmh-composer-failed"));
    press(byTestId(failed, "cmh-composer-failed-retry"));
    assert.deepEqual(refreshed, ["reach_outs"]);
  });
  const gone = homeAt("new:edit:nothing", []);
  assert.ok(byTestId(gone, "pb-gone"), "read, and neither a playbook nor a chain");
  assert.equal(byTestId(gone, "cmh-composer-reading"), null);
});

/* ------------------------------ the bridge ------------------------------ */

test("the bridge's verbs press the doors they name: the report, the first step's state, the chain's removal", async () => {
  realVerbs();
  const calls = [];
  W.__apiForTest = null;
  const api = await import("../../../../apps/dashboard/src/legacy-bridge/api.ts");
  const was = W.fetch;
  W.fetch = async (url, init = {}) => {
    calls.push([
      init.method || "GET",
      new URL(String(url), "https://app.example").pathname,
      init.body ? JSON.parse(init.body) : null,
    ]);
    return new Response(JSON.stringify({ ok: true, data: { report: REPORT(), reach: REACH } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.ok(api.api, "the typed client");
    await bridge.reachOuts.report(ROOT);
    await bridge.reachOuts.pause(ROOT);
    await bridge.reachOuts.resume(ROOT);
    await bridge.reachOuts.remove(ROOT);
  } finally {
    W.fetch = was;
  }
  assert.deepEqual(
    calls.map(([m, p, b]) => [m, p.replace(/^.*\/api\/v1\//, ""), b]),
    [
      ["GET", `reach-outs/${ROOT}`, null],
      ["PUT", `playbooks/${ROOT}`, { state: "paused" }],
      ["PUT", `playbooks/${ROOT}`, { state: "running" }],
      ["DELETE", `reach-outs/${ROOT}`, null],
    ],
  );
});

test("the reach-outs surface reads the chains and nothing more: no report, set as soon as they are read, null when unread", async () => {
  const was = W.fetch;
  const read = [];
  W.fetch = async (url) => {
    const path = new URL(String(url), "https://app.example").pathname;
    read.push(path.replace(/^.*\/api\/v1\//, ""));
    return new Response(JSON.stringify({ ok: true, data: { chains: [chainOf()] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await bridge.reachOutsOverride.apply();
    assert.deepEqual(read, ["reach-outs"], "one read, no report: every page pays it, so it scans no audience (R23)");
    // Set on the seam the pages read (`useSurface("reach_outs")`), and mirrored under the name Leads still reads.
    const chains = surfaceValue("reach_outs");
    assert.equal(chains.length, 1);
    assert.equal(W.__REACH_OUTS, chains, "the mirror is the one object");
    // Templates' rows are contracts' over the chains: each step with words, and no count of what it wrote.
    assert.deepEqual(
      WORDS.emailTemplateRowsOf(chains).map((r) => [r.template_id, r.step_id, r.step_n, "written" in r]),
      [
        ["t1", ROOT, 0, false],
        ["t2", "n1", 1, false],
      ],
    );
    W.fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "down" } }), { status: 500 });
    await assert.rejects(bridge.reachOutsOverride.apply());
    assert.equal(surfaceValue("reach_outs"), null, "unread is null, never an empty list");
    assert.equal(W.__REACH_OUTS, null, "and the mirror says the same");
  } finally {
    W.fetch = was;
  }
  assert.equal(bridge.reachOutsOverride.value, "reach_outs", "the tab's cache keeps the value under its seam key");
});

test("who may press is the role store's one answer: a viewer is told by it, and a partner acts as an operator does (00201)", async () => {
  verbs();
  fresh();
  const draw = (canAct) =>
    again(() => W.React.createElement(ReachOutPane, { chain: chainOf(), canAct, flash: () => {}, onClose: () => {} }));
  draw(false);
  await settle();
  assert.equal(
    textOf(byTestId(draw(false), "ro-role")),
    W.gateTitle("approve", "change, pause, resume or remove a reach-out"),
    "the gate's own words, never the row's",
  );
  assert.equal(byTestId(draw(true), "ro-role"), null);
  assert.equal(contracts.ROLE_PERMS.partner.approve, true, "a partner may approve, and so press a chain's acts");
});

test("Edit opens the reach-out sheet over the chain as read, saves through its own door, and is out of a viewer's sight", async () => {
  const pressed = verbs();
  // The sheet reads the business's words through the settings seam, and its sending domains from Setup (still the shell's).
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Harbor" } } },
    facts: null,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
  });
  setSurfaceValue("setup", {
    dto: {
      email: {
        mailbox: null,
        sending: {
          domains: [
            {
              id: "d1",
              host: "harbor-mail.example",
              from_name: "Sam",
              address: "sam@harbor-mail.example",
              state: "verified",
              sent_days: 0,
            },
          ],
        },
      },
    },
  });
  fresh();
  const state = { open: true };
  const r = openPane(chainOf(), state);
  r.redraw();
  await settle();
  let tree = r.redraw();
  assert.equal(byTestId(tree, "ro-edit-note"), null, "no note that it can't be changed");
  press(byTestId(tree, "ro-edit"));
  r.redraw();
  await settle();
  tree = r.redraw();
  assert.equal(byTestId(tree, "ro-name").props.value, "Reach out · Personal trainers");
  assert.equal(byTestId(tree, "ro-signed").props.value, "Sam");
  press(byTestId(tree, "ro-start"));
  await settle();
  const [, id, body] = pressed.find((p) => p[0] === "update");
  assert.equal(id, ROOT);
  assert.deepEqual(
    body.steps.map((x) => x.id),
    [ROOT, "n1"],
  );
  assert.equal(textOf(byTestId(r.redraw(), "ro-saved")), "Saved. Its next run writes these words.");
  press(byTestId(r.redraw(), "ro-close"));
  assert.equal(byTestId(r.redraw(), "ro-sheet"), null);
  // A chain whose search is gone has nothing to write to: no Edit.
  fresh();
  const gone = openPane(chainOf({ search: null }), { open: true });
  gone.redraw();
  await settle();
  assert.equal(byTestId(gone.redraw(), "ro-edit"), null);
  // A viewer: out of sight (a secondary act), and the row says why once.
  const keep = W.ST_STORE;
  W.ST_STORE = { can: (a) => !!contracts.ROLE_PERMS.viewer[a], myRole: () => "viewer" };
  try {
    fresh();
    const v = openPane(chainOf(), { open: true });
    v.redraw();
    await settle();
    assert.equal(byTestId(v.redraw(), "ro-edit"), null);
  } finally {
    W.ST_STORE = keep;
  }
});
