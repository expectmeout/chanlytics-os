/**
 * Campaigns, honest: every moment is on the home and a Turn on opens the composer on it, a playbook link opens its detail
 * and a deleted one says so (the wiring audit's C13), and the reply window is one rule said one way (C25). The Reports
 * page's own regressions (C13, C25 to C28) moved to reports-page.test.mjs with the page's redesign. Run against the pages
 * (TSX, apps/dashboard/src/surfaces/campaigns) on a stub React, over the view models the seam holds (surface-values.ts).
 * Campaigns' home took the Playbooks list's place (3 Oct 2026): what the list's slots and cards said, the home's moments,
 * lines and drawer say now (the numbers and words of those are contracts' campaignsHomeOf: lifecycle.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again as drawAgain,
  all,
  find,
  byTestId,
  textOf,
  press,
} from "../_legacy-react.mjs";

const { toCampaignLensVM, stateOf } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";

/* ------------------------ the campaigns, as campaign-report pins them ------------------------ */

const cday = (d, over = {}) => ({
  day: d,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  opt_ins: 0,
  opt_outs: 0,
  ...over,
});
const campaignDto = () => ({
  timezone: ZONE,
  days: 7,
  span_days: 14,
  today: "2026-09-04",
  series: [
    ...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((d, i) =>
      cday(d, i === 2 ? { sent: 4, delivered: 4, read: 2, replied: 2, opt_ins: 1 } : {}),
    ),
    cday("2026-08-29", { sent: 10, delivered: 9, read: 6, replied: 2, opt_ins: 2 }),
    cday("2026-08-30"),
    cday("2026-08-31", { opt_ins: 1, opt_outs: 1 }),
    cday("2026-09-01", { sent: 6, delivered: 3, read: 1, replied: 1 }),
    cday("2026-09-02"),
    cday("2026-09-03", { sent: 4, delivered: 4, read: 4, replied: 1, opt_outs: 1 }),
    cday("2026-09-04"),
  ],
  sources: [
    {
      id: "p1",
      kind: "playbook",
      name: "Win-back",
      template_name: "winback_offer",
      runs: 2,
      sent: 14,
      delivered: 12,
      read: 7,
      replied: 3,
      last_at: "2026-09-03T14:05:00Z",
    },
    {
      id: "b1",
      kind: "broadcast",
      name: "A quick note · Sep 1",
      template_name: "quick_note",
      runs: 1,
      sent: 6,
      delivered: 4,
      read: 4,
      replied: 1,
      last_at: "2026-09-01T15:00:00Z",
    },
  ],
});
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-08-01T00:00:00Z",
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00",
  next: "tomorrow 10:00",
  candidates: 4,
  held: 0,
  totals: { runs: 2, sent: 6, delivered: 4, replied: 1, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
/** Friday 2 Oct 2026, 9:44 PM in New York: the moment the home is read at. */
const NOW = Date.parse("2026-10-03T01:44:00Z");
/** The Playbooks surface in its real shape (the demo's sample is one: its pools, channels, moments and lists), with this file's rows. */
const playbooksSurface = (over = {}) => ({
  ...playbooksSample(new Date(NOW)),
  rows: [playbook(), playbook({ id: "pb-2", name: "Welcome", trigger: "new_week", policy_class: "campaign" })],
  templates: [],
  timezone: ZONE,
  businessName: "Northside Studio",
  bookingLink: false,
  replyWindow: contracts.REPLY_WINDOW_WORDS,
  fetchedAt: 1,
  ...over,
});

/* ---------------------------------- the window ---------------------------------- */

// The page's window is the stub React's (installLegacyReact: window IS globalThis), with the shell's doors the TSX pages
// reach through the bridge's verbs (surfaces/legacy-verbs.ts, legacy-parts.ts) and the workspace its clock reads.
const went = [];
installLegacyReact({
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,

  usePPToast: () => [null, () => {}],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to) => went.push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
const S = "../../../../apps/dashboard/src";
const { installClock } = await import(`${S}/legacy-bridge/zone.ts`);
installClock();
// What the shell still owns and the pages draw by name: Confirm, StatePill, PolicyChip (data-bits), the unsaved-work rule
// (record-fold) and the record kit's sheet the composer opens in (record-sheet).
await import(`${S}/legacy/components/data-bits.jsx`);
// The moved surfaces: TSX, drawn over the values the seam holds.
const { CampaignsHome } = await import(`${S}/surfaces/campaigns/home/home-page.tsx`);
const { PaneSheet } = await import(`${S}/surfaces/campaigns/home/pane-sheet.tsx`);
const { PlaybookPane } = await import(`${S}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { playbooksSample } = await import(`${S}/surfaces/campaigns/playbooks/sample.ts`);
const { broadcastsSample } = await import(`${S}/surfaces/campaigns/broadcasts/sample.ts`);
const { Picker } = await import(`${S}/surfaces/kit/picker/picker.tsx`);
const { BcHistoryStats } = await import(`${S}/surfaces/campaigns/broadcasts/ledger.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

const fresh = () => {
  freshTree();
  went.length = 0;
};
/** Campaigns' home at an address (`campaigns/<param>`, null for the home), read at the clock `NOW` says. */
const homeAt = (param = null) => {
  fresh();
  return drawAgain(() => CampaignsHome({ param, nowMs: NOW }));
};

/* ------------------------------ doors ------------------------------ */

const stagesOf = (tree) => all(tree, (n) => n.props?.["data-testid"] === "cmh-stage");
/** The moments that offer a Turn on, by name. */
const turnOnsOf = (tree) =>
  stagesOf(tree)
    .filter((s) => byTestId(s, "cmh-turn-on"))
    .map((s) => s.props["data-stage"]);

test("The home shows every moment, not only the ones somebody made: one nothing is doing offers Turn on, and the composer it opens is on that moment", () => {
  // The win-back is made; a visit reminder and the check after a visit are not. The receptionist's moment is always on.
  setSurfaceValue("playbooks", playbooksSurface({ rows: [playbook()] }));
  let tree = homeAt();
  assert.deepEqual(
    stagesOf(tree).map((s) => [s.props["data-stage"], s.props["data-state"]]),
    [
      ["first_contact", "always"],
      ["before", "off"],
      ["after", "off"],
      ["quiet", "on"],
    ],
    "a moment a playbook already covers is not offered again",
  );
  assert.deepEqual(turnOnsOf(tree), ["before", "after"], "each moment nothing is doing says how to start it");

  // On a first day every moment is offered, and that is the empty state: the rail itself, a Turn on on each.
  setSurfaceValue("playbooks", playbooksSurface({ rows: [] }));
  tree = homeAt();
  assert.deepEqual(
    stagesOf(tree).map((s) => s.props["data-state"]),
    ["always", "off", "off", "off"],
  );
  assert.deepEqual(turnOnsOf(tree), ["before", "after", "quiet"]);

  // Pressing the third opens the composer ON that moment, not on whichever trigger is first.
  const after = stagesOf(tree).find((s) => s.props["data-stage"] === "after");
  press(find(after, (n) => n.props?.["data-testid"] === "cmh-turn-on"));
  assert.deepEqual(went, ["campaigns/new:moment:visited"]);
  tree = homeAt("new:moment:visited");
  assert.ok(byTestId(tree, "pb-composer"), "the composer opens");
  // The moment is a token in the To row (the kit's Picker): its name, and what starts it on its option's line.
  const picker = find(tree, (n) => n.type === Picker && n.props["data-testid"] === "pb-moment");
  const chosen = picker.props.groups.flatMap((g) => g.options).find((o) => o.value === picker.props.value);
  const visited = contracts.PLAYBOOK_TRIGGERS.find((t) => t.id === "visited");
  assert.ok(
    chosen.label.includes(visited.label) && String(chosen.sub).includes(visited.hint),
    `on the moment that was pressed: ${chosen.label} · ${chosen.sub}`,
  );
  // It opens beside the page: nothing on the page stands down or moves under it.
  assert.deepEqual(
    stagesOf(tree).map((s) => s.props["data-stage"]),
    ["first_contact", "before", "after", "quiet"],
    "REGRESSION: the moments stood down while it was open",
  );
});

test("A playbook is somewhere on the home -- the win-back is a moment, every campaign a row -- one with a run waiting on you says so and decides it, and pressing its name opens it where Approve is", (t) => {
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [
        playbook({
          id: "pb-1",
          name: "Win-back",
          trigger: "quiet_30",
          candidates: 24,
          held: 12,
          totals: {
            runs: 18,
            sent: 198,
            delivered: 180,
            replied: 36,
            held: 0,
            lastRun: null,
            waiting: null,
            history: [
              { id: "r1", run_for: "2026-09-19", state: "sent", sent: 12 },
              { id: "r2", run_for: "2026-09-18", state: "sent", sent: 9 },
            ],
          },
        }),
        playbook({
          id: "pb-2",
          name: "Save our number",
          trigger: "phoned_only",
          state: "paused",
          candidates: 0,
          held: 0,
          template_name: "save_our_number",
        }),
        playbook({
          id: "pb-3",
          name: "The month's offer",
          trigger: "everyone_monthly",
          candidates: 186,
          held: 32,
          totals: {
            runs: 9,
            sent: 99,
            delivered: 90,
            replied: 18,
            held: 0,
            lastRun: null,
            waiting: { id: "b-w", recipient_count: 186 },
            history: [],
          },
        }),
      ],
    }),
  );
  // The run as Sent reads it: a row decides the run its campaign's waiting names, read where every run is (the
  // broadcasts' runs), made for the business's own today (Friday the 2nd in New York).
  const sent = broadcastsSample(new Date(NOW));
  const pending = sent.rows.find((r) => r.state === "pending_approval");
  const waits = {
    ...pending,
    id: "b-w",
    name: "The month's offer · 2026-10-02",
    audience: { kind: "playbook", id: "pb-3", label: "The month's offer" },
    playbook_id: "pb-3",
    recipient_count: 186,
    run_for: "2026-10-02",
  };
  setSurfaceValue("broadcasts", { ...sent, rows: [...sent.rows.filter((r) => r !== pending), waits] });
  t.after(() => setSurfaceValue("broadcasts", undefined));
  let tree = homeAt();
  // The win-back is the moment it does; every campaign is a row of the ledger, the moment's own among them, said once.
  const quiet = stagesOf(tree).find((s) => s.props["data-stage"] === "quiet");
  assert.equal(quiet.props["data-state"], "on");
  const rows = all(tree, (n) => n.props?.["data-testid"] === "cmh-row");
  const row = (id) => rows.find((r) => r.props["data-row"] === id);
  assert.ok(row("pb-1") && row("pb-2") && row("pb-3"), "every campaign is a row, the moment's lead among them");
  assert.equal(rows.filter((r) => r.props["data-row"] === "pb-1").length, 1, "and once");
  // A run waiting on the owner: its row says so and decides it; the drawer's own verbs are not drawn.
  assert.ok(textOf(row("pb-3")).includes("Waiting on you"), textOf(row("pb-3")));
  assert.ok(byTestId(row("pb-3"), "cmh-approve"), "decided where it waits");
  assert.equal(byTestId(tree, "pb-approve"), null, "the page carries no verbs of a drawer that is not open");
  press(find(row("pb-3"), (n) => n.props?.["data-testid"] === "cmh-row-open"));
  assert.deepEqual(went, ["campaigns/moment:pb-3"]);
  // It opens in the sheet from the side, the run waiting on you in the pane's foot.
  tree = homeAt("moment:pb-3");
  const pane = byTestId(tree, "pb-pane");
  assert.ok(byTestId(pane, "pb-approve") && byTestId(pane, "pb-skip"), "with Approve and Skip in it");
  assert.ok(textOf(byTestId(pane, "pb-waiting")).includes("waits on you"));
});

test("REGRESSION (C13): a link to a playbook opens it over the home, and a playbook since deleted says so, the home staying", () => {
  setSurfaceValue("playbooks", playbooksSurface());
  const open = homeAt("moment:pb-2");
  const sheet = find(open, (n) => n.type === PaneSheet);
  assert.equal(sheet.props.open, true);
  assert.equal(find(sheet, (n) => n.type === PlaybookPane).props.p.id, "pb-2");
  assert.ok(byTestId(open, "campaigns-home"), "the home stays under it");
  // Gone is said once the reach-outs were read too, and none is it (a link may name a chain: Part 4 PR 8).
  try {
    setSurfaceValue("reach_outs", []);
    const gone = homeAt("moment:pb-deleted");
    assert.ok(
      textOf(byTestId(gone, "pb-gone")).includes("isn't here any more"),
      "a link to a deleted playbook says so, and the home stays",
    );
    assert.ok(stagesOf(gone).length > 0);
  } finally {
    setSurfaceValue("reach_outs", undefined);
  }
});

/* ------------------------------ words ------------------------------ */

test("REGRESSION (C25): the reply window is one rule said one way -- three places said it three ways", () => {
  assert.equal(contracts.REPLY_WINDOW_MS, contracts.REPLY_WINDOW_HOURS * 3_600_000);
  assert.equal(contracts.REPLY_WINDOW_WORDS, "within 3 days", "72 hours, as the SQL series keeps it");
  // The Campaigns lens's funnel sentence says the published window (it was the old Replied tile's line until 11 Oct 2026).
  const lens = toCampaignLensVM({ campaigns: campaignDto(), ledger: null, reachOuts: undefined }, Date.now());
  assert.ok(lens.funnel.line.includes(`answered ${contracts.REPLY_WINDOW_WORDS}, of 20 messages`), lens.funnel.line);
  fresh();
  const stats = BcHistoryStats({
    rows: [
      { id: "b1", open: false, state: "sent", counts: { sent: 2, delivered: 2, replied: 1, skipped: 0, failed: 0 } },
    ],
    more: false,
    replyWindow: "within 2 days",
  });
  assert.ok(
    find(stats, (n) => String(n.props?.["data-tip"]).includes("within 2 days of a broadcast")),
    "Broadcasts reads the published words",
  );
  // A playbook's detail says what a reply is (a run of two or more draws its sentence of what they earned), in the same words.
  setSurfaceValue("playbooks", playbooksSurface({ replyWindow: "within 2 days" }));
  fresh();
  const detail = PlaybookPane({ p: playbook(), canAct: true, onEdit() {}, flash() {}, onClose() {} });
  assert.ok(
    find(detail, (n) => String(n.props?.["data-tip"]).includes("within 2 days of a run")),
    "REGRESSION: a playbook said 'after a run'",
  );
});
