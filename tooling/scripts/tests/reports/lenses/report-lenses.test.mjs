/**
 * Reports' lenses as contracts hold them (reports/lenses.ts): six, in the strip's order, each at an address, shown by one
 * predicate, with its words; and every other list of them (the palette's jumps, Ask's page routes) read from the table, never
 * spelled again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  LENS_ROUTES,
  REPORT_LENSES,
  askJump,
  askPages,
  isLensParam,
  lensAnswerOf,
  lensEmpty,
  lensIsShown,
  lensOfRoute,
  lensRoute,
  lensesFor,
  toCampaignReportVM,
  toDealReportVM,
  toReportVM,
  toReviewsReportVM,
} from "@chanlytics/contracts";
import { REVIEWS_NOW, reviewsDto } from "../_report-world.mjs";

const OWNER = { sellsBy: "booking", role: "owner" };

test("six lenses in the strip's order, each with its words, and none for a lens that is not drawn", () => {
  assert.deepEqual(
    REPORT_LENSES.map((l) => l.id),
    ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"],
  );
  for (const l of REPORT_LENSES) {
    assert.ok(l.label && l.sub, `${l.id}: the strip's word and the palette's sub-line`);
    assert.equal(l.role, "viewer", `${l.id}: any member reads it`);
    const empty = l.empty({ since: "Aug 29", until: "Sep 4" });
    assert.ok(empty.title && empty.body, `${l.id}: its empty state's words`);
  }
  assert.equal(
    lensEmpty("overview", { since: "Aug 29", until: "Sep 4" }).body,
    "Nobody wrote or called between Aug 29 and Sep 4.",
    "the words the page said, unchanged",
  );
  assert.equal(
    lensEmpty("campaigns", { since: "Aug 29", until: "Sep 4" }).body,
    "No broadcast or campaign run reached anyone between Aug 29 and Sep 4, and nobody said yes or asked to stop.",
    "a campaign to its reader, never a playbook (decision 19)",
  );
});

test("a lens is an address: the Overview is /reports, every other /reports/<lens>, and nothing else is one", () => {
  assert.deepEqual(
    REPORT_LENSES.map((l) => lensRoute(l.id)),
    ["reports", "reports/receptionist", "reports/people", "reports/pipeline", "reports/campaigns", "reports/reviews"],
  );
  assert.deepEqual(
    LENS_ROUTES,
    REPORT_LENSES.map((l) => lensRoute(l.id)),
  );
  assert.equal(lensOfRoute("reports"), "overview");
  assert.equal(lensOfRoute("reports/campaigns"), "campaigns");
  for (const no of [
    "reports/overview",
    "reports/usage",
    "reports/leads",
    "reports/anything",
    "reports/",
    "clients/people",
    "today",
  ])
    assert.equal(lensOfRoute(no), null, no);
  assert.ok(isLensParam("pipeline") && !isLensParam("overview") && !isLensParam("usage"));
});

test("Pipeline is shown where deals are on and nowhere else; the other five are shown to every member", () => {
  const ids = (who) => lensesFor(who).map((l) => l.id);
  assert.deepEqual(ids(OWNER), ["overview", "receptionist", "people", "campaigns", "reviews"]);
  assert.deepEqual(
    ids({ sellsBy: "proposal", role: "operator" }),
    REPORT_LENSES.map((l) => l.id),
  );
  assert.deepEqual(ids({ sellsBy: null, role: "viewer" }), [
    "overview",
    "receptionist",
    "people",
    "campaigns",
    "reviews",
  ]);
  assert.ok(lensIsShown("pipeline", { sellsBy: "proposal", role: "viewer" }));
  assert.ok(!lensIsShown("pipeline", OWNER));
  assert.deepEqual(
    ids({ sellsBy: "proposal", role: undefined }),
    REPORT_LENSES.map((l) => l.id),
    "a role not yet known reads as a viewer",
  );
  assert.deepEqual(
    ids({ sellsBy: "proposal", role: "stranger" }),
    [],
    "a role the ladder does not know stands on no rung",
  );
});

test("the palette and Ask's page routes are the registry's: no lens spelled twice", () => {
  for (const route of LENS_ROUTES) assert.ok(ASK_PAGE_ROUTES.includes(route), `${route} is a page an answer may name`);
  const labels = (has) => askPages({ platformAdmin: false, ...has }).map((e) => e.label);
  const off = labels({ dealsOn: false });
  assert.deepEqual(
    off.filter((l) => l.startsWith("Reports")),
    ["Reports", "Reports › Receptionist", "Reports › People", "Reports › Campaigns", "Reports › Reviews"],
  );
  assert.ok(labels({ dealsOn: true }).includes("Reports › Pipeline"));
  assert.ok(!off.includes("Reports › Pipeline"), "where deals are off the lens has no jump");
  assert.ok(
    askJump("receptionist", ASK_PAGES).some((e) => e.to === "reports/receptionist"),
    "a word of the lens finds it (after the page whose name starts with it: Receptionist memory)",
  );
  assert.equal(askJump("reports", ASK_PAGES)[0]?.to, "reports", "and Reports itself stays first");
});

test("the head says the lens's own sentence, from the view models that hold it", () => {
  const day = (d, over = {}) => ({
    day: d,
    messages_in: 0,
    conversations: 0,
    answered_ai: 0,
    answered_you: 0,
    unanswered: 0,
    out_ai: 0,
    out_you: 0,
    escalations: 0,
    calls: 0,
    call_seconds: 0,
    new_contacts: 0,
    ...over,
  });
  const busy = day("2026-09-04", { messages_in: 2, conversations: 1, answered_ai: 2 });
  const dto = (series) => ({
    timezone: "America/New_York",
    days: 1,
    span_days: 2,
    today: "2026-09-04",
    series,
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const vm = toReportVM(dto([day("2026-09-03"), busy]), { profile: null });
  const quiet = toReportVM(dto([day("2026-09-03"), day("2026-09-04")]), { profile: null });
  const sent = (n) => ({
    timezone: "America/New_York",
    days: 1,
    span_days: 2,
    today: "2026-09-04",
    series: [
      { day: "2026-09-03", sent: 0, delivered: 0, read: 0, replied: 0, opt_ins: 0, opt_outs: 0 },
      { day: "2026-09-04", sent: n, delivered: n, read: 0, replied: 0, opt_ins: 0, opt_outs: 0 },
    ],
    sources: [],
  });
  const campaigns = toCampaignReportVM(sent(3));
  const deals = toDealReportVM(
    {
      any: true,
      sent: 1,
      won: 0,
      lost: 0,
      waiting: 1,
      clients: 0,
      monthly_cents: 0,
      median_days_to_yes: null,
      open: { count: 0, amounts: [] },
      sources: [],
      reasons: [],
    },
    "in the last 1 day",
  );
  const parts = { vm, campaigns, deals, reviews: null };
  assert.equal(lensAnswerOf("overview", parts), vm.lines.hero);
  assert.equal(lensAnswerOf("receptionist", parts), vm.lines.answered ?? undefined);
  assert.equal(lensAnswerOf("people", parts), vm.lines.channels ?? undefined);
  assert.equal(lensAnswerOf("pipeline", parts), deals.headline);
  assert.equal(lensAnswerOf("campaigns", parts), campaigns.lines.funnel);
  assert.equal(lensAnswerOf("reviews", parts), undefined, "Reviews says nothing until its own read has landed");
  const reviews = toReviewsReportVM(reviewsDto(), { nowMs: REVIEWS_NOW });
  assert.equal(
    lensAnswerOf("reviews", { ...parts, reviews }),
    "4.8 on Google from 213 reviews; 6 new in the last 30 days, 3 answered.",
  );
  assert.equal(lensAnswerOf("reviews", { ...parts, reviews }), reviews.lines.head);
  assert.equal(lensAnswerOf("overview", { ...parts, reviews }), vm.lines.hero, "another lens's sentence is its own");
  assert.equal(
    lensAnswerOf("overview", { ...parts, vm: quiet }),
    undefined,
    "a period nobody wrote in has nothing to say",
  );
  assert.equal(
    lensAnswerOf("campaigns", { ...parts, campaigns: null }),
    undefined,
    "a campaign read that failed says nothing",
  );
  assert.equal(lensAnswerOf("pipeline", { ...parts, deals: toDealReportVM(null, "in the last 1 day") }), undefined);
});
