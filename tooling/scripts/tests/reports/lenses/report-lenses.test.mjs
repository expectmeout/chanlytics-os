/**
 * Reports' lenses as contracts hold them (reports/lenses.ts): seven, in the strip's order, each at an address, shown by one
 * predicate, with its words; and every other list of them (the palette's jumps, Ask's page routes) read from the table, never
 * spelled again. Ads (11 Oct 2026) is shown only where ads are on, and its address says what it is narrowed to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  LENS_ROUTES,
  REPORT_LENSES,
  adsReportRoute,
  askJump,
  askPages,
  isLensParam,
  lensAnswerOf,
  lensEmpty,
  lensIsShown,
  lensOfRoute,
  lensRoute,
  lensesFor,
  reportsParamParts,
  reportsRouteParts,
  reviewRoute,
  toDealReportVM,
  toReportVM,
  toReviewsReportVM,
} from "@chanlytics/contracts";
import { REVIEWS_NOW, reviewsDto } from "../_report-world.mjs";

const OWNER = { role: "owner", adsOn: false };

test("seven lenses in the strip's order, each with its words, and none for a lens that is not drawn", () => {
  assert.deepEqual(
    REPORT_LENSES.map((l) => l.id),
    ["overview", "receptionist", "people", "pipeline", "campaigns", "ads", "reviews"],
  );
  for (const l of REPORT_LENSES) {
    assert.ok(l.label && l.sub, `${l.id}: the strip's word and the palette's sub-line`);
    assert.equal(l.role, "viewer", `${l.id}: any member reads it`);
    const empty = l.empty({ since: "Aug 29", until: "Sep 4" });
    assert.ok(empty.title && empty.body, `${l.id}: its empty state's words`);
  }
  assert.equal(
    REPORT_LENSES.find((l) => l.id === "people")?.sub,
    "who reached you, whether you can reach them, and who is slipping away",
    "People's sub-line says the four questions the lens answers",
  );
  assert.equal(
    REPORT_LENSES.find((l) => l.id === "campaigns")?.sub,
    "did your messages reach people, did they answer, and what is stuck",
    "Campaigns' sub-line says the three questions the lens answers",
  );
  assert.equal(
    REPORT_LENSES.find((l) => l.id === "ads")?.shownWhen,
    "ads_on",
    "Ads is shown where ads are on, by its own rule and not Pipeline's",
  );
  assert.deepEqual(
    lensEmpty("ads", { since: "Aug 29", until: "Sep 4" }),
    {
      title: "No ads in this period",
      body: "Nothing was spent on ads, and nobody got in touch through one, between Aug 29 and Sep 4.",
      door: { label: "Open Ads", to: "campaigns/ads" },
    },
    "a period with no ad in it says so, with the door to Ads",
  );
  assert.equal(
    lensEmpty("overview", { since: "Aug 29", until: "Sep 4" }).body,
    "Nobody wrote or called between Aug 29 and Sep 4.",
    "the words the page said, unchanged",
  );
  assert.equal(
    lensEmpty("campaigns", { since: "Aug 29", until: "Sep 4" }).body,
    "No campaign run reached anyone between Aug 29 and Sep 4, and nobody said yes or asked to stop.",
    "a campaign to its reader, never a playbook (decision 19)",
  );
});

test("a lens is an address: the Overview is /reports, every other /reports/<lens>, and nothing else is one", () => {
  assert.deepEqual(
    REPORT_LENSES.map((l) => lensRoute(l.id)),
    [
      "reports",
      "reports/receptionist",
      "reports/people",
      "reports/pipeline",
      "reports/campaigns",
      "reports/ads",
      "reports/reviews",
    ],
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

test("one review is an address of the Reviews lens: reports/reviews:<id>, the row's uuid, and nothing else after the colon is a review", () => {
  const id = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
  assert.equal(reviewRoute(id), `reports/reviews:${id}`);
  assert.deepEqual(reportsParamParts(`reviews:${id}`), { lens: "reviews", days: null, review: id });
  assert.deepEqual(reportsRouteParts(`reports/reviews:${id}`), { lens: "reviews", days: null, review: id });
  assert.equal(lensOfRoute(`reports/reviews:${id}`), "reviews", "it is the lens, with a review open");
  // The lens alone, and over days, name no review.
  assert.deepEqual(reportsParamParts("reviews"), { lens: "reviews", days: null, review: null });
  assert.equal(reportsParamParts("reviews:2026-09-01~2026-09-20")?.review, null);
  // A word after the colon that is no uuid is no address of Reports', and another lens takes no review.
  for (const no of [`reviews:r-ana`, "reviews:", `people:${id}`, `receptionist:${id}`, `${id}`])
    assert.equal(reportsParamParts(no), null, no);
  // Google's own id for a review is no address any page parses: it opens the lens, never a page that is not there.
  assert.equal(reviewRoute("r-ana"), lensRoute("reviews"));
});

test("Ads is shown where ads are on, and nowhere else; the other six, Pipeline among them (0008, amended 18 Oct 2026), are shown to every member", () => {
  const ids = (who) => lensesFor(who).map((l) => l.id);
  const WITHOUT_ADS = REPORT_LENSES.map((l) => l.id).filter((id) => id !== "ads");
  assert.deepEqual(ids(OWNER), ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"]);
  assert.deepEqual(ids(OWNER), WITHOUT_ADS);
  assert.deepEqual(
    ids({ role: "operator", adsOn: true }),
    REPORT_LENSES.map((l) => l.id),
    "ads on: every lens",
  );
  assert.deepEqual(
    ids({ ...OWNER, adsOn: true }),
    ["overview", "receptionist", "people", "pipeline", "campaigns", "ads", "reviews"],
    "ads on: Ads stands between Campaigns and Reviews",
  );
  assert.ok(lensIsShown("ads", { ...OWNER, adsOn: true }));
  assert.ok(
    !lensIsShown("ads", OWNER),
    "a workspace without ads is not shown the lens, and reads its empty at the address",
  );
  assert.deepEqual(ids({ role: "viewer", adsOn: false }), WITHOUT_ADS, "a viewer sees every lens but Ads");
  assert.ok(lensIsShown("pipeline", OWNER));
  assert.deepEqual(ids({ role: undefined, adsOn: false }), WITHOUT_ADS, "a role not yet known reads as a viewer");
  assert.deepEqual(ids({ role: "stranger", adsOn: true }), [], "a role the ladder does not know stands on no rung");
});

test("Ads' address says the days and what it is narrowed to, after the lens: every ad is no word, and nothing else is read", () => {
  const DAYS = { from: "2026-09-11", to: "2026-10-10" };
  const KEY = "2026-09-11~2026-10-10";
  assert.equal(adsReportRoute(DAYS), `reports/ads:${KEY}`, "the Results sheet's foot: the same days, every ad");
  assert.equal(adsReportRoute(DAYS, { kind: "all" }), `reports/ads:${KEY}`);
  assert.equal(adsReportRoute(DAYS, { kind: "platform", platform: "google" }), `reports/ads:${KEY}:platform:google`);
  assert.equal(adsReportRoute(DAYS, { kind: "ad", id: "5b0e8c1a" }), `reports/ads:${KEY}:ad:5b0e8c1a`);
  assert.equal(adsReportRoute(null), "reports/ads");
  assert.equal(
    adsReportRoute(null, { kind: "ad", id: "x" }),
    "reports/ads:ad:x",
    "a scope with no days is the period kept",
  );
  assert.equal(
    lensRoute("people", DAYS, { kind: "ad", id: "x" }),
    `reports/people:${KEY}`,
    "no other lens has a scope",
  );
  assert.equal(lensRoute("ads", DAYS, null), `reports/ads:${KEY}`);
  for (const route of [
    "reports/ads",
    `reports/ads:${KEY}`,
    `reports/ads:${KEY}:platform:meta`,
    `reports/ads:${KEY}:ad:5b0e8c1a`,
    "reports/ads:platform:tiktok",
    "reports/ads:ad:5b0e8c1a",
  ]) {
    const at = reportsRouteParts(route);
    assert.equal(at?.lens, "ads", route);
    assert.equal(
      adsReportRoute(at.days, at.scope ?? { kind: "all" }),
      route,
      `${route}: the address is read back to itself`,
    );
  }
  assert.deepEqual(
    reportsRouteParts(`reports/ads:${KEY}`),
    { lens: "ads", days: DAYS, review: null },
    "every ad: no scope in the parts",
  );
  assert.deepEqual(reportsParamParts(`ads:${KEY}:platform:google`), {
    lens: "ads",
    days: DAYS,
    scope: { kind: "platform", platform: "google" },
    review: null,
  });
  for (const no of [
    "ads:",
    `ads:${KEY}:`,
    `ads:${KEY}:all`, // every ad is no word of an address
    `ads:${KEY}:platform:bing`, // a platform we do not run on
    `ads:${KEY}:platform:`,
    `ads:${KEY}:ad:`,
    `ads:${KEY}:more`,
    "ads:30d",
    `people:${KEY}:ad:x`, // only Ads has a scope
    `reviews:${KEY}:platform:meta`,
  ])
    assert.equal(reportsParamParts(no), null, no);
});

test("the palette and Ask's page routes are the registry's: no lens spelled twice", () => {
  for (const route of LENS_ROUTES) assert.ok(ASK_PAGE_ROUTES.includes(route), `${route} is a page an answer may name`);
  const labels = (has) => askPages({ platformAdmin: false, ...has }).map((e) => e.label);
  const every = labels({});
  assert.deepEqual(
    every.filter((l) => l.startsWith("Reports")),
    [
      "Reports",
      "Reports › Receptionist",
      "Reports › People",
      "Reports › Pipeline",
      "Reports › Campaigns",
      "Reports › Reviews",
    ],
    "every workspace's lenses, Pipeline among them",
  );
  assert.ok(
    !every.includes("Reports › Ads"),
    "Ads is no jump of the palette: a real workspace's has none, and a demo's lens is reached from the strip",
  );
  assert.ok(ASK_PAGE_ROUTES.includes("reports/ads"), "but an answer may name the page, which says why it is empty");
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
  // The Campaigns lens's own read, which the page holds beside the report: its head alone (the fold that makes it is the page's).
  const campaigns = { head: "3 messages over 1 run." };
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
  const parts = { vm, campaigns, deals, reviews: null, people: null, ads: null };
  assert.equal(lensAnswerOf("overview", parts), vm.lines.hero);
  assert.equal(lensAnswerOf("receptionist", parts), vm.lines.receptionist ?? undefined);
  assert.equal(
    lensAnswerOf("receptionist", parts),
    "2 of 2 messages answered without you.",
    "the Receptionist's head is how many of how many, not the busiest day",
  );
  assert.equal(
    lensAnswerOf("receptionist", { ...parts, vm: quiet }),
    undefined,
    "a period nobody wrote in says nothing",
  );
  assert.equal(lensAnswerOf("people", parts), vm.lines.people);
  assert.equal(
    lensAnswerOf("people", { ...parts, people: { head: "40 people reached you, 12 new." } }),
    "40 people reached you, 12 new.",
    "the lens's own sentence, once its read has landed",
  );
  assert.equal(
    lensAnswerOf("people", { ...parts, people: { head: null } }),
    vm.lines.people,
    "a read that said nothing leaves the frame's sentence",
  );
  assert.equal(
    lensAnswerOf("people", { ...parts, vm: quiet }),
    quiet.lines.people,
    "a quiet period still has the frame's sentence: never undefined",
  );
  assert.equal(typeof lensAnswerOf("people", { ...parts, vm: quiet }), "string");
  assert.equal(lensAnswerOf("pipeline", parts), deals.headline);
  assert.equal(
    lensAnswerOf("campaigns", parts),
    "3 messages over 1 run.",
    "the part's head, as the lens's read folds it",
  );
  assert.equal(
    lensAnswerOf("campaigns", { ...parts, vm: quiet }),
    "3 messages over 1 run.",
    "whatever the receptionist's period",
  );
  assert.equal(lensAnswerOf("ads", parts), undefined, "Ads says nothing where its fold is not drawn");
  assert.equal(
    lensAnswerOf("ads", { ...parts, ads: { head: "6 of 14 new people from your ads have booked." } }),
    "6 of 14 new people from your ads have booked.",
    "the head of the fold the lens draws",
  );
  assert.equal(
    lensAnswerOf("ads", { ...parts, ads: { head: null } }),
    undefined,
    "a fold with nothing to say says nothing",
  );
  assert.equal(
    lensAnswerOf("overview", { ...parts, ads: { head: "x" } }),
    vm.lines.hero,
    "another lens's sentence is its own",
  );
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
    "a campaign read that has not landed, or failed, says nothing",
  );
  assert.equal(
    lensAnswerOf("campaigns", { ...parts, campaigns: { head: null } }),
    undefined,
    "a read whose sends could not be read has no head to say",
  );
  assert.equal(lensAnswerOf("overview", { ...parts, campaigns: null }), vm.lines.hero, "another lens's is its own");
  assert.equal(lensAnswerOf("pipeline", { ...parts, deals: toDealReportVM(null, "in the last 1 day") }), undefined);
});
