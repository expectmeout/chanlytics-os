/**
 * Campaigns, honest: a moment's Turn on opens the composer on that moment, and the reply window is one rule said one way
 * (the wiring audit's C25). The Reports page's own regressions (C13, C25 to C28) moved to reports-page.test.mjs with the
 * page's redesign. Run against the pages (TSX, apps/dashboard/src/surfaces/campaigns) on a stub React, over the view
 * models the seam holds (surface-values.ts). The home and its drawer went with decision 0060's S6: Campaigns is Sequences,
 * with its sheets over it (home/sheets.tsx).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh as freshTree, again as drawAgain, find, byTestId } from "../_legacy-react.mjs";

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
const { CampaignsSheets } = await import(`${S}/surfaces/campaigns/home/sheets.tsx`);
const { playbooksSample } = await import(`${S}/surfaces/campaigns/playbooks/sample.ts`);
const { Picker } = await import(`${S}/surfaces/kit/picker/picker.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

const fresh = () => {
  freshTree();
  went.length = 0;
};
/** Campaigns' home at an address (`campaigns/<param>`, null for the home), read at the clock `NOW` says. */
const homeAt = (param = null) => {
  fresh();
  return drawAgain(() => CampaignsSheets({ param, nowMs: NOW }));
};

test("a moment's Turn on opens the composer ON that moment, not on whichever trigger is first", () => {
  setSurfaceValue("playbooks", playbooksSurface({ rows: [] }));
  const tree = homeAt("new:moment:visited");
  assert.ok(byTestId(tree, "pb-composer"), "the composer opens");
  // The moment is a token in the To row (the kit's Picker): its name, and what starts it on its option's line.
  const picker = find(tree, (n) => n.type === Picker && n.props["data-testid"] === "pb-moment");
  const chosen = picker.props.groups.flatMap((g) => g.options).find((o) => o.value === picker.props.value);
  const visited = contracts.PLAYBOOK_TRIGGERS.find((t) => t.id === "visited");
  assert.ok(
    chosen.label.includes(visited.label) && String(chosen.sub).includes(visited.hint),
    `on the moment that was pressed: ${chosen.label} · ${chosen.sub}`,
  );
});

/* ------------------------------ words ------------------------------ */

test("REGRESSION (C25): the reply window is one rule said one way -- three places said it three ways", () => {
  assert.equal(contracts.REPLY_WINDOW_MS, contracts.REPLY_WINDOW_HOURS * 3_600_000);
  assert.equal(contracts.REPLY_WINDOW_WORDS, "within 3 days", "72 hours, as the SQL series keeps it");
  // The Campaigns lens's funnel sentence says the published window (it was the old Replied tile's line until 11 Oct 2026).
  const lens = toCampaignLensVM({ campaigns: campaignDto(), ledger: null, reachOuts: undefined }, Date.now());
  assert.ok(lens.funnel.line.includes(`answered ${contracts.REPLY_WINDOW_WORDS}, of 20 messages`), lens.funnel.line);
});
