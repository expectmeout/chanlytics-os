/**
 * Campaigns, honest: the reply window is one rule said one way (the wiring audit's C25). The Reports page's own
 * regressions (C13, C25 to C28) moved to reports-page.test.mjs with the page's redesign. A moment's Turn on opened the
 * composer on that moment until the composer's Every time went (the closed-loop audit of 17 Oct 2026, G): New sequence
 * opens on it now (sequence-words.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const { toCampaignLensVM } = contracts;
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
/* ------------------------------ words ------------------------------ */

test("REGRESSION (C25): the reply window is one rule said one way -- three places said it three ways", () => {
  assert.equal(contracts.REPLY_WINDOW_MS, contracts.REPLY_WINDOW_HOURS * 3_600_000);
  assert.equal(contracts.REPLY_WINDOW_WORDS, "within 3 days", "72 hours, as the SQL series keeps it");
  // The Campaigns lens's funnel sentence says the published window (it was the old Replied tile's line until 11 Oct 2026).
  const lens = toCampaignLensVM({ campaigns: campaignDto(), ledger: null, reachOuts: undefined }, Date.now());
  assert.ok(lens.funnel.line.includes(`answered ${contracts.REPLY_WINDOW_WORDS}, of 20 messages`), lens.funnel.line);
});
