/**
 * A reach-out on Campaigns and on Templates (Reach out, Part 4 PR 8), run on the stub React over the surface's own words
 * (surfaces/campaigns/reach-out/surface.ts, contracts reach-out-sheet.ts) and its verbs stubbed on the surface's one
 * `reachOuts` object, which the TSX parts import (a test sets what a verb answers there, as it once set
 * `window.__reachOuts`):
 *
 * - Campaigns' sheets over Sequences (home/sheets.tsx; the home and its drawer went in decision 0060's S6, a chain being a
 *   sequence to leads there): Write to leads opens Leads, where a sequence to leads is made (the lead-to-sequence canvas,
 *   18 Oct 2026); a chain's change (`campaigns/new:edit:<root>`, an older link) lands on its sequence's record, by its root
 *   or any of its steps, once the reach-outs are read, and an id that is no chain's on its own record (the composer's
 *   Every time went: the closed-loop audit of 17 Oct 2026, G).
 * - Templates: a chain's emails are messages in the Templates list (reach-out-email-message.test.mjs: their rows, their
 *   pane and its editor, counted by contracts' emailTemplateRowsOf over the chains, which this file holds to the surface's
 *   reads).
 * - The bridge: the verbs press the doors they name, and the surface reads the chains and nothing more.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId, press } from "../_legacy-react.mjs";

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
// The pages and their panes are TSX (decision 0015): Campaigns' sheets and New message's Write to leads.
const S = "../../../../apps/dashboard/src/surfaces";
const { CampaignsSheets } = await import(`${S}/campaigns/home/sheets.tsx`);
const { WriteToLeads } = await import(`${S}/campaigns/reach-out/sources.tsx`);
const { setSurfaceValue, surfaceValue } = await import(`${S}/surface-values.ts`);
const bridge = await import(`${S}/campaigns/reach-out/surface.ts`);
const WORDS = bridge.reachOuts.words;
// The verbs as the surface has them: a test stubs some on the surface's one object, and `realVerbs()` puts every one back.
const REAL_VERBS = { ...bridge.reachOuts };
const realVerbs = (stubs = {}) => Object.assign(bridge.reachOuts, REAL_VERBS, stubs);

const ROOT = "r1";
const chainOf = (over = {}, next = {}) => ({
  root_id: ROOT,
  name: "Reach out · Personal trainers",
  search: { id: "s1", name: "Personal trainers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  mailboxes: [{ address: "sam@harbor-mail.example", sent_days: 0, daily_cap: 40, customer_domain: false }],
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
    remove: async (id) => (pressed.push(["remove", id]), { ok: true, data: {} }),
    reach: async (id) => (pressed.push(["reach", id]), { ...REACH, ready: 44, with_unconfirmed: 44 }),
    sources: async () => (pressed.push(["sources"]), []),
  });
  return pressed;
};

/* ------------------------------ Campaigns' sheets ------------------------------ */

/** The reach-outs not read yet: the surface holds nothing (a read that failed is null, and one that came back is its chains). */
const UNREAD = "unread";
/** Campaigns' sheets at an address (`campaigns/<param>`), over the reach-outs' own surface (the seam's "reach_outs"). */
const homeAt = (param = null, chains = [chainOf()]) => {
  setSurfaceValue("reach_outs", chains === UNREAD ? undefined : chains);
  fresh();
  return again(() => CampaignsSheets({ param }));
};

test("Write to leads, New message's third choice, opens Leads: a sequence to leads is made where its leads are chosen (the lead-to-sequence canvas, 18 Oct 2026)", () => {
  verbs();
  went.length = 0;
  const tree = homeAt("new:leads");
  assert.ok(
    find(tree, (n) => n.type === WriteToLeads),
    "Write to leads, in New message",
  );
  fresh();
  const rows = again(() => WriteToLeads());
  press(byTestId(rows, "ro-source-add"));
  assert.deepEqual(
    went,
    [contracts.leadsRoute({ list: "all" })],
    "Leads you add opens Leads, where Add is the one road",
  );
});

test("a reach-out's change (`campaigns/new:edit:<root>`, an older link) lands on its sequence's record, by its root or any of its steps", () => {
  verbs();
  went.length = 0;
  const at = homeAt(`new:edit:${ROOT}`);
  assert.equal(byTestId(at, "cmh-composer"), null, "no composer is drawn for a reach-out's id");
  assert.deepEqual(went, [contracts.sequenceRoute(ROOT)], "its record, in the address's place");
  went.length = 0;
  homeAt("new:edit:n1");
  assert.deepEqual(went, [contracts.sequenceRoute(ROOT)], "a later step's id lands on its chain's record");
});

test("a change waits on the reach-outs while they are out; where they could not be read, or the id is no chain's, it lands on its own record", () => {
  verbs();
  went.length = 0;
  homeAt(`new:edit:${ROOT}`, UNREAD);
  assert.deepEqual(went, [], "not known yet: it waits");
  homeAt("new:edit:pb-7", null);
  assert.deepEqual(went, ["campaigns/sequences/pb-7"], "unread for good: the id as named, never a page left blank");
  went.length = 0;
  homeAt("new:edit:pb-7", []);
  assert.deepEqual(
    went,
    ["campaigns/sequences/pb-7"],
    "a moment's sequence, on its own record, in the address's place",
  );
});

/* ------------------------------ the bridge ------------------------------ */

test("the bridge's verbs press the doors they name: the report, the chain's removal, the record's chain, an add's check", async () => {
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
    await bridge.reachOuts.remove(ROOT);
    await bridge.reachOuts.saveChain(ROOT, { signed_by: "Sam" });
    await bridge.reachOuts.checkAdd(ROOT, ["l1", "l2"]);
  } finally {
    W.fetch = was;
  }
  assert.deepEqual(
    calls.map(([m, p, b]) => [m, p.replace(/^.*\/api\/v1\//, ""), b]),
    [
      ["GET", `reach-outs/${ROOT}`, null],
      ["DELETE", `reach-outs/${ROOT}`, null],
      // A sequence to leads is written on its record (00459): its chain by the sequence's id, its adds checked dry first.
      ["PUT", `sequences/${ROOT}/chain`, { signed_by: "Sam" }],
      ["POST", `sequences/${ROOT}/leads/check`, { lead_ids: ["l1", "l2"] }],
    ],
  );
});

test("a search's reach is read each time it is asked, and its last answer is the next paint (How it runs' who joins)", async () => {
  realVerbs();
  const calls = [];
  const was = W.fetch;
  W.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.example");
    calls.push([init.method || "GET", u.pathname.replace(/^.*\/api\/v1\//, ""), u.searchParams.get("search")]);
    return new Response(JSON.stringify({ ok: true, data: REACH }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const V = bridge.reachOuts;
  try {
    assert.equal(V.reachHeld("search-never-read"), null, "a search this tab never read paints nothing");
    await V.reach("s-reach");
    assert.deepEqual(V.reachHeld("s-reach"), REACH, "what it read paints the next sheet at once");
    await V.reach("s-reach");
  } finally {
    W.fetch = was;
  }
  assert.deepEqual(
    calls,
    [
      ["GET", "reach-outs/reach", "s-reach"],
      ["GET", "reach-outs/reach", "s-reach"],
    ],
    "each ask is a read (the wiring's second audit, X2-1: it was kept as first read until a write)",
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

test("a reach-out opens by its root or by any of its steps: a later email's run no longer says the campaign is gone (W-campaign-run-template-reachout-3)", () => {
  const chains = [
    { root_id: "r1", steps: [{ id: "r1" }, { id: "s2" }, { id: "s3" }] },
    { root_id: "r9", steps: [{ id: "r9" }] },
  ];
  assert.equal(contracts.chainOfMoment(chains, "r1")?.root_id, "r1", "its root");
  assert.equal(
    contracts.chainOfMoment(chains, "s3")?.root_id,
    "r1",
    "REGRESSION: the third email's run linked its step, and the drawer opened on it said 'This campaign is gone'",
  );
  assert.equal(contracts.chainOfMoment(chains, "pb-7"), null, "a playbook's id is no reach-out's");
  assert.equal(contracts.chainOfMoment([], "s3"), null);
});
