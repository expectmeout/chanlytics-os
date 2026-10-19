/**
 * What comes back, drawn (Reach out Part 6: H3, H8–H10), on the stub React over the bridge's own words
 * (surfaces/campaigns/reach-out/surface.ts over contracts). The reads and the writes are the only things stubbed, so what
 * is proved is what each page draws and what it asks of the bridge: Reports' Reach-outs section in each state it can
 * be in, and "Never write to them again" pressed once with its words. Leads' strip, the Stage column's reach-out line and
 * the peek's reach-out block went with the search-fed road (the lead-to-sequence canvas, 18 Oct 2026): where a lead
 * stands is the sequence's own reading (00459 sequence_place, campaigns/sequences/place), its stop is asked in the lead
 * sheet's ⋯ (sheet/sheet.tsx), and a no is undone in the thread it came in (inbox/thread/reply-strip.tsx).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { toCampaignLensVM } from "@chanlytics/contracts/report-lens";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press } from "../_legacy-react.mjs";
import { CAMPAIGNS, dtoWith } from "../reports/campaigns/_campaign-world.mjs";

// The fixtures are dated around 28 Sep 2026 and the lines say "Tue" within a week and a date after it, so the clock
// the bridge reads (Date.now) is the fixtures' own: a wall clock a week on turned "Written Tue" into "Written Sep 22".
const NOW = Date.parse("2026-09-28T18:00:00.000Z");
Date.now = () => NOW;
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const W = globalThis;
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
// Reports' Reach-outs section is TSX (decision 0015): the Campaigns lens's part of it, on the same stub.
const { reachOutsSection } =
  await import("../../../../apps/dashboard/src/surfaces/reports/lenses/campaigns-reach-outs.tsx");
// Leads is TSX too (surfaces/leads, decision 0015 step 9): the one act on every sequence at once that is still its own.
const S = "../../../../apps/dashboard/src/surfaces";
const { stopWritingTo } = await import(`${S}/leads/reach-out/lines.tsx`);
const bridge = await import(`${S}/campaigns/reach-out/surface.ts`);

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
  totals: counts({ written: 12, delivered: 11, businesses: 8, wrote_back: 2, interested: 1, booked: 1, said_no: 1 }),
  before: { written: 9, delivered: 8, bounced: 0 },
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
          ...counts({ written: 12, delivered: 11, businesses: 8, wrote_back: 2, interested: 1, booked: 1, said_no: 1 }),
        },
        { id: "p2", n: 1, hand: null, ...counts({ businesses: 0 }) },
      ],
    },
  ],
  angles: [{ angle: "their rating", written: 12, businesses: 8, wrote_back: 2 }],
  other_angles: { written: 0, businesses: 0, wrote_back: 0 },
  no_angle: 0,
  mailboxes: [
    {
      address: "sam@mail.example.com",
      state: "connected",
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
/**
 * The Campaigns lens's Reach-outs section, drawn over the lens's fold: the sends and the ledger of the campaign world beside the
 * reach-outs this file gives (`null`: that read failed; `undefined`: nothing reads it, as in the demo).
 */
const section = (reachOuts) => {
  fresh();
  const fold = toCampaignLensVM({ campaigns: CAMPAIGNS, ledger: dtoWith(), reachOuts }, NOW);
  return again(() => reachOutsSection(fold));
};

test("Reports draws the reach-outs' section: the strip, the emails, the businesses, the angles, the mailboxes, the days and each step on its line", () => {
  const tree = section(reportDto());
  assert.ok(byTestId(tree, "rpt-reach-outs"));
  for (const id of ["ro-strip", "ro-emails", "ro-funnel", "ro-angles", "ro-mailboxes", "ro-written", "ro-sources"])
    assert.ok(byTestId(tree, id), id);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-source-row").length, 1);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-step-row").length, 2);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-mailbox-row").length, 1);
  assert.match(textOf(byTestId(tree, "ro-mailboxes")), /sam@mail\.example\.com.*Connected/);
  // The businesses are counted apart from the emails: 8 businesses wrote to by 12 emails.
  assert.match(textOf(byTestId(tree, "ro-sources")), /Businesses/);
  assert.match(textOf(byTestId(tree, "ro-funnel")), /Written to.*8/);
  assert.match(textOf(byTestId(tree, "ro-emails")), /Written.*12/);
  went.length = 0;
  assert.match(byTestId(tree, "ro-source-open").props.href, /^#\//, "the chain's name is a link with its address");
  press(byTestId(tree, "ro-source-open"));
  assert.deepEqual(went, ["campaigns/sequences/r1"]);
});

test("Reports says a failed read, an empty period, and draws nothing where there is no reach-out", () => {
  const failed = section(null);
  assert.ok(byTestId(failed, "rpt-reach-outs"), "under its own heading");
  assert.ok(byTestId(failed, "ro-failed"));
  assert.match(textOf(byTestId(failed, "ro-failed")), /The rest of this page is current\./, "the fold's words");
  assert.equal(byTestId(failed, "ro-strip"), null);
  assert.equal(section(undefined), null);
  assert.equal(section(reportDto({ has_reach_out: false })), null);
  const empty = section(
    reportDto({ totals: counts({ businesses: 0 }), chains: [], angles: [], mailboxes: [], series: [] }),
  );
  assert.ok(byTestId(empty, "ro-report-empty"));
  assert.equal(byTestId(empty, "ro-funnel"), null);
  assert.equal(byTestId(empty, "ro-strip"), null);
});

/* -------------------------------------------------------------------------- Leads -- */

test("Never write to them again presses the stop door once, says what it did in its words, and tells Leads it moved", async () => {
  const asked = [];
  const heard = [];
  const hear = () => heard.push(1);
  W.addEventListener("reach_out:leads", hear);
  const answer = (r) => Object.assign(bridge.reachOuts, { stopLead: async (id) => (asked.push(id), r) });
  try {
    answer({ ok: true, data: { stopped: true, already: false, skipped: 1, leaving: 0 } });
    await stopWritingTo("l1", "Zilker Kettlebell Club", (m) => flashed.push(m));
    assert.deepEqual(asked, ["l1"], "once");
    assert.equal(flashed.at(-1).msg, "Stopped: nothing more will be written to Zilker Kettlebell Club");
    assert.equal(heard.length, 1, "Leads and the sequences read it again");
    answer({ ok: true, data: { stopped: false, already: true, skipped: 0, leaving: 0 } });
    await stopWritingTo("l1", "Zilker Kettlebell Club", (m) => flashed.push(m));
    assert.equal(flashed.at(-1).msg, bridge.reachOuts.words.REACH_OUT_STOP_WORDS.already("Zilker Kettlebell Club"));
    // A refusal is said in its own words.
    answer({ ok: false, message: "Nothing has been written to them yet." });
    await stopWritingTo("l1", "Zilker Kettlebell Club", (m) => flashed.push(m));
    assert.match(String(flashed.at(-1).msg), /Nothing has been written to them yet\./);
  } finally {
    W.removeEventListener("reach_out:leads", hear);
  }
});
