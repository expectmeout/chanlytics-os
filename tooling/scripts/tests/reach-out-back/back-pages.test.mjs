/**
 * What comes back, drawn (Reach out Part 6: H3, H8–H10), on the stub React over the bridge's own words
 * (legacy-bridge/reach-out/reach-outs.ts over contracts). The reads and the writes are the only things stubbed, so what
 * is proved is what each page draws and what it asks of the bridge: Reports' Reach-outs section in each state it can
 * be in; Leads' strip over a search a reach-out writes to, and its doors; the Stage column beside the name with its
 * line; and the peek's block, its story, "Stop writing to them" asked first and pressed once, and the undo of a no.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const W = globalThis;
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
for (const f of ["core", "bar"]) await import(`${L}/components/chart-${f}.jsx`);
await import(`${L}/pages/reports-sections.jsx`);
await import(`${L}/pages/reach-out/reach-out-report.jsx`);
await import(`${L}/pages/leads-finder.jsx`);
await import(`${L}/pages/people-table.jsx`);
await import(`${L}/pages/leads-cells.jsx`);
await import(`${L}/pages/reach-out/reach-out-leads.jsx`);
const bridge = await import("../../../../apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts");

const went = [];
const flashed = [];
const role = { may: true };
Object.assign(W, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  usePPToast: () => [null, (m) => flashed.push(m)],
  canDo: () => role.may,
  gate: () => ({}),
  refusalToast: (r) => ({ tone: "danger", msg: r && r.message }),
  __clock: { zone: () => "America/Chicago" },
});

/* ------------------------------------------------------------------------ Reports -- */

const counts = (over = {}) => ({
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
  ...over,
});
const reportDto = (over = {}) => ({
  timezone: "America/Chicago",
  days: 30,
  today: "2026-09-28",
  since: "2026-08-30",
  has_reach_out: true,
  totals: counts({ written: 12, delivered: 11, wrote_back: 2, interested: 1, booked: 1, said_no: 1 }),
  series: [{ day: "2026-09-28", written: 12 }],
  chains: [
    {
      root_id: "r1",
      name: "Trainers in Austin",
      state: "running",
      search: { id: "s1", name: "Trainers · Austin" },
      last_at: "2026-09-28T15:00:00.000Z",
      runs: 1,
      steps: [
        {
          id: "p1",
          n: 0,
          hand: null,
          ...counts({ written: 12, delivered: 11, wrote_back: 2, interested: 1, booked: 1, said_no: 1 }),
        },
        { id: "p2", n: 1, hand: null, ...counts() },
      ],
    },
  ],
  angles: [{ angle: "their rating", written: 12, wrote_back: 2 }],
  other_angles: { written: 0, wrote_back: 0 },
  no_angle: 0,
  domains: [
    {
      host: "mail.example.com",
      state: "verified",
      held_why: null,
      held_at: null,
      sent: 12,
      delivered: 11,
      bounced: 0,
      complained: 0,
    },
  ],
  ...over,
});
const section = (reachOuts) => {
  fresh();
  return again(() => W.React.createElement(W.RptReachOuts, { R: { reachOuts } }));
};

test("Reports draws the reach-outs' section: the funnel, the angles, the domains, the days, and each step on its line", () => {
  const tree = section(contracts.toReachOutReportVM(reportDto()));
  assert.ok(byTestId(tree, "rpt-reach-outs"));
  for (const id of ["ro-funnel", "ro-angles", "ro-domains", "ro-written", "ro-sources"])
    assert.ok(byTestId(tree, id), id);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-source-row").length, 1);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-step-row").length, 2);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-domain-row").length, 1);
  assert.match(textOf(byTestId(tree, "ro-domains")), /mail\.example\.com.*Verified/);
  went.length = 0;
  press(byTestId(tree, "ro-source-open"));
  assert.deepEqual(went, ["outbound/r1"]);
});

test("Reports says a failed read, an empty period, and draws nothing where there is no reach-out", () => {
  assert.ok(byTestId(section(null), "ro-report-failed"));
  assert.equal(section(undefined).rendered, null);
  assert.equal(section(contracts.toReachOutReportVM(reportDto({ has_reach_out: false }))).rendered, null);
  const empty = section(
    contracts.toReachOutReportVM(reportDto({ totals: counts(), chains: [], angles: [], domains: [], series: [] })),
  );
  assert.ok(byTestId(empty, "ro-report-empty"));
  assert.equal(byTestId(empty, "ro-funnel"), null);
});

/* -------------------------------------------------------------------------- Leads -- */

const leadLine = (over = {}) => ({
  lead_id: "l1",
  stage: "nurture",
  closed_reason: null,
  sent: 1,
  first_sent_at: "2026-09-22T15:00:00.000Z",
  last_sent_at: "2026-09-22T15:00:00.000Z",
  next_at: null,
  held: false,
  handed: false,
  bounced: false,
  bounced_at: null,
  reply: null,
  away_until: null,
  resume_at: null,
  booked_at: null,
  stopped_at: null,
  ...over,
});
const leadsDto = (over = {}) => ({
  lines: {
    chain: { root_id: "r1", name: "Trainers in Austin", state: "running" },
    written_to: 44,
    today: 3,
    next: null,
    held: 0,
    waiting_run_id: null,
    leads: [
      leadLine(),
      leadLine({ lead_id: "l2", bounced: true, bounced_at: "2026-09-23T15:00:00.000Z", email_state: "invalid" }),
    ],
    ...over,
  },
  chain: { domains: [{ host: "mail.example.com", sent_days: 0 }] },
  timeline: null,
});
/** The bridge, its reads and writes stubbed: each asked recorded. */
const world = ({
  lines = leadsDto(),
  story = null,
  stop = { ok: true, data: { stopped: true, already: false, skipped: 1, leaving: 0 } },
} = {}) => {
  const asked = [];
  W.__reachOuts = {
    ...bridge.reachOuts,
    leadLines: async (id) => (asked.push(["lines", id]), lines),
    leadTimeline: async (id) => (asked.push(["story", id]), story),
    stopLead: async (id) => (asked.push(["stop", id]), stop),
    pause: async (id) => (asked.push(["pause", id]), { ok: true, data: {} }),
    resume: async (id) => (asked.push(["resume", id]), { ok: true, data: {} }),
  };
  return asked;
};
/** The hook, drawn in a component of its own, read once its read lands. */
const hooked = async (searchId) => {
  let got;
  const draw = () =>
    W.React.createElement(() => {
      got = W.useReachOutLeads(searchId);
      return null;
    });
  fresh();
  again(draw);
  await settle();
  again(draw);
  return got;
};

test("the open search's lines are read once, and say where each lead stands", async () => {
  const asked = world();
  const ro = await hooked("s1");
  assert.deepEqual(asked, [["lines", "s1"]]);
  assert.equal(ro.lineOf("l1"), "Written Tue");
  assert.equal(ro.lineOf("l2"), "Bounced Wed · address dropped");
  assert.equal(ro.lineOf("elsewhere"), null);
  // No search open, or a search with no reach-out: nothing.
  world();
  assert.equal(await hooked(null), null);
  world({ lines: { lines: null, chain: null, timeline: null } });
  assert.equal(await hooked("s2"), null);
});

test("the Stage column sits beside the name and says the lead's line under its stage", async () => {
  const stage = W.LEAD_COLUMNS[1];
  assert.equal(stage.key, "stage");
  world();
  const ro = await hooked("s1");
  const row = { id: "l1", cls: "qualified", stage: "nurture", stageLabel: "Contacted" };
  const cell = stage.cell(row, { reachOut: ro });
  assert.equal(textOf(byTestId(cell, "lead-reach-out-line")), "Written Tue");
  assert.equal(byTestId(stage.cell(row, {}), "lead-reach-out-line"), null, "no reach-out, no line");
  assert.equal(byTestId(stage.cell({ ...row, cls: "excluded" }, { reachOut: ro }), "lead-reach-out-line"), null);
});

const drawStrip = (leads) => {
  fresh();
  return again(() => W.React.createElement(W.ReachOutLeadsStrip, { leads }));
};

test("the strip says how many, today's of the day's share, and its doors go where they say", async () => {
  const asked = world();
  const ro = await hooked("s1");
  const tree = drawStrip(ro);
  assert.equal(textOf(byTestId(tree, "strip-title")), "Writing to 44 businesses");
  assert.equal(textOf(byTestId(tree, "strip-parts")), " · 3 of 30 today · nothing more planned yet");
  went.length = 0;
  press(byTestId(tree, "strip-going"));
  assert.deepEqual(went, ["outbound/r1"]);
  press(byTestId(tree, "strip-toggle"));
  await settle();
  assert.deepEqual(asked.at(-1), ["pause", "r1"]);
  assert.match(flashed.at(-1).msg, /Trainers in Austin is paused/);
  // A role that may not approve sees no Pause.
  role.may = false;
  assert.equal(byTestId(drawStrip(ro), "strip-toggle"), null);
  role.may = true;
});

const storyDto = (over = {}) => ({
  lead_id: "l1",
  business_name: "Zilker Kettlebell Club",
  stage: "nurture",
  closed_reason: null,
  found_at: "2026-09-20T15:00:00.000Z",
  email_state: "ok",
  resume_at: null,
  booked_at: null,
  stopped_at: null,
  chain: { root_id: "r1", name: "Trainers in Austin", state: "running" },
  search: null,
  conversation_id: "c1",
  sends: [
    {
      id: "s1",
      n: 0,
      hand: null,
      state: "sent",
      reason: null,
      send_at: "2026-09-22T15:00:00.000Z",
      sent_at: "2026-09-22T15:00:00.000Z",
      angle: "their rating",
      host: "mail.example.com",
      message_id: "m1",
      email_status: "delivered",
      bounced: false,
      left: true,
    },
  ],
  readings: [],
  can_stop: true,
  ...over,
});
const drawPeek = async () => {
  const draw = () => W.React.createElement(W.LeadReachOut, { lead: { id: "l1" }, flash: (m) => flashed.push(m) });
  fresh();
  again(draw);
  await settle();
  return { tree: again(draw), draw: () => again(draw) };
};

test("the peek's block tells the lead's story, and Read what went out opens its thread", async () => {
  world({ story: storyDto() });
  const { tree } = await drawPeek();
  assert.equal(textOf(byTestId(tree, "peek-reach-out-label")), "Reach out · Trainers in Austin");
  assert.match(
    textOf(byTestId(tree, "peek-reach-out-lines")),
    /Your email · from mail\.example\.com · angle: their rating · delivered/,
  );
  went.length = 0;
  press(byTestId(tree, "peek-reach-out-read"));
  assert.deepEqual(went, ["inbox/th-c1"]);
  assert.equal(byTestId(tree, "peek-reach-out-undo"), null);
  // A lead no reach-out planned draws nothing.
  world({ story: storyDto({ chain: null }) });
  assert.equal((await drawPeek()).tree.rendered, null);
});

test("Stop writing to them asks first, and stops once when asked", async () => {
  const asked = world({ story: storyDto() });
  const peek = await drawPeek();
  press(byTestId(peek.tree, "peek-reach-out-stop-ask"));
  const asking = peek.draw();
  assert.match(textOf(asking), /Stop writing to Zilker Kettlebell Club\?/);
  assert.ok(!asked.some(([k]) => k === "stop"), "nothing stops before the yes");
  press(byTestId(asking, "peek-reach-out-stop-yes"));
  await settle();
  assert.deepEqual(
    asked.filter(([k]) => k === "stop"),
    [["stop", "l1"]],
  );
  assert.equal(flashed.at(-1).msg, "Stopped: nothing more will be written to Zilker Kettlebell Club");
  // A refusal is said in its own words.
  world({ story: storyDto(), stop: { ok: false, message: "Nothing has been written to them yet." } });
  const refused = await drawPeek();
  press(byTestId(refused.tree, "peek-reach-out-stop-ask"));
  press(byTestId(refused.draw(), "peek-reach-out-stop-yes"));
  await settle();
  assert.equal(flashed.at(-1).msg, "Nothing has been written to them yet.");
});

test("a no that may be undone is undone from the lead", async () => {
  world({
    story: storyDto({
      readings: [
        {
          message_id: "m9",
          read_at: "2026-09-27T15:00:00.000Z",
          intent: "no",
          claim: "person",
          summary: null,
          undone: false,
          until_at: null,
          stops: true,
          convert: false,
          said_no: true,
          can_undo: true,
        },
      ],
    }),
  });
  const undone = [];
  W.__replies = { undo: async (id) => (undone.push(id), { ok: true, data: { undone: true } }) };
  const { tree } = await drawPeek();
  assert.equal(textOf(byTestId(tree, "peek-reach-out-undo")), "Read as no · undo");
  press(byTestId(tree, "peek-reach-out-undo"));
  await settle();
  assert.deepEqual(undone, ["m9"]);
  assert.equal(flashed.at(-1).msg, "Undone: it no longer reads as a no.");
});
