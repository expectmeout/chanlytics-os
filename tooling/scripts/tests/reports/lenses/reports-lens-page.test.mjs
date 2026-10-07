/**
 * Reports' page by lens (surfaces/reports/reports-page.tsx), EXECUTED on the stub React over the one read the surface holds: each
 * lens draws its own body and none another's, the head says "Reports" and the lens's answer, a move between lenses asks for
 * nothing and never blanks the body, and a lens the workspace has no use for, or a period with nothing in it, says so in the
 * registry's words.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find } from "../../_legacy-react.mjs";
import {
  DEALS,
  NO_DEALS,
  REVIEWS_NOW,
  campaignDto,
  quiet,
  reviewsDto,
  reviewsGoogle,
  surface,
} from "../_report-world.mjs";

const reads = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
globalThis.window.fetch = async (url) => {
  reads.push(String(url));
  return new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "not read here" } }), {
    status: 500,
  });
};
const S = "../../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { standingSaid, forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { lensAnswerOf, toReviewsReportVM } = await import("@chanlytics/contracts");
after(() => forgetStanding());

const at = (lens) => `/w/harbor/reports${lens === "overview" ? "" : `/${lens}`}`;
const workspace = (sellsBy) => {
  globalThis.__WORKSPACES = [
    {
      id: "w1",
      slug: "harbor",
      name: "Harbor Studio",
      status: "active",
      timezone: "America/New_York",
      sells_by: sellsBy,
      role: "owner",
    },
  ];
  globalThis.__ACTIVE_WORKSPACE = "w1";
};
/** The Reviews read as the surface holds it: the answer, its fold, the period it is of and when it was made. */
const held = (dto, period = "7d") => ({
  dto,
  vm: toReviewsReportVM(dto, { nowMs: REVIEWS_NOW }),
  period,
  fetchedAt: 1,
});
const NOTHING_LINKED = { listing: null, connection: null, reviews: [], days: [] };
/** Google answered, and nothing is linked: this deployment can look a listing up, and none is kept. */
const REVIEWS_NONE = held(reviewsDto({ days: 7, google: reviewsGoogle(NOTHING_LINKED), ledger: null }));
/** Google answered, and nothing is linked: this deployment cannot look a listing up and none is kept. */
const REVIEWS_UNLINKED = held(
  reviewsDto({
    days: 7,
    google: reviewsGoogle({ ...NOTHING_LINKED, ready: { places: false, profile: false } }),
    ledger: null,
  }),
);
/** A listing linked and the Business Profile synced: Harbor Studio's reviews over seven days, the period the page shows. */
const REVIEWS_LINKED = held(reviewsDto({ days: 7 }));
/** The lens drawn over a surface: the page for its address. */
const draw = (lens, opts = {}) => {
  setSurfaceValue("reports", opts.R ?? surface({ deals: DEALS }));
  setSurfaceValue("reports_reviews", "reviews" in opts ? opts.reviews : REVIEWS_NONE);
  fresh();
  return ReportsPage({ pathname: at(lens) });
};
const has = (tree, ids) => ids.map((id) => !!byTestId(tree, id));

const BODIES = {
  overview: ["reports-hero", "reports-facts", "reports-tiles"],
  receptionist: ["chart-answered", "chart-reply", "chart-reasons", "chart-calls", "chart-booking"],
  people: ["chart-channels", "chart-rhythm", "chart-people"],
  pipeline: ["rpt-deals"],
  campaigns: ["chart-funnel", "chart-campaigns", "chart-sources"],
  reviews: ["google-none"],
};

test("each lens draws its own body and none another's, from one read, under the page's testid", () => {
  workspace("proposal");
  for (const [lens, ids] of Object.entries(BODIES)) {
    const tree = draw(lens);
    assert.ok(byTestId(tree, "reports-real"), `${lens}: the page`);
    assert.equal(byTestId(tree, "reports-real").props["data-lens"], lens);
    assert.deepEqual(
      has(tree, ids),
      ids.map(() => true),
      `${lens}: its cards`,
    );
    for (const [other, theirs] of Object.entries(BODIES))
      if (other !== lens)
        assert.deepEqual(
          has(tree, theirs),
          theirs.map(() => false),
          `${lens} draws none of ${other}'s`,
        );
  }
});

test("a move between lenses asks for nothing, and the body is never blank: every lens is drawn from the read already held", () => {
  workspace("proposal");
  reads.length = 0;
  for (const lens of ["people", "receptionist", "overview", "campaigns", "people"]) {
    const tree = draw(lens);
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, `${lens}: nothing on its way`);
    assert.ok(all(tree, (n) => classes(n).includes("ck-card")).length > 0, `${lens}: a body, not a blank`);
  }
  assert.deepEqual(reads, [], "no read was made");
});

test("the head says Reports and the lens's own answer, from contracts, on every lens", () => {
  workspace("proposal");
  const R = surface({ deals: DEALS });
  for (const lens of Object.keys(BODIES)) {
    draw(lens, { R });
    const said = standingSaid();
    assert.equal(said.title, "Reports", lens);
    assert.equal(said.sentence, lensAnswerOf(lens, { ...R, reviews: REVIEWS_NONE.vm }), `${lens}: its answer`);
  }
  assert.equal(standingSaid().sentence, undefined, "with no listing linked, Reviews says nothing of itself");
});

test("the Reviews head says the sentence of the fold its figures are drawn from, and nothing while that read is out", () => {
  workspace("proposal");
  draw("reviews", { reviews: REVIEWS_LINKED });
  assert.equal(
    standingSaid().sentence,
    "4.8 on Google from 213 reviews; 2 new in the last 7 days, all answered.",
    "the sentence, from the profile's reviews on record",
  );
  assert.equal(standingSaid().sentence, REVIEWS_LINKED.vm.lines.head, "the one the lens's own fold says");
  draw("overview", { reviews: REVIEWS_LINKED });
  assert.equal(
    standingSaid().sentence,
    lensAnswerOf("overview", { ...surface({ deals: DEALS }), reviews: null }),
    "no other lens says it",
  );
  draw("reviews", { reviews: undefined });
  assert.equal(standingSaid().sentence, undefined, "a read still out: the name alone");
});

/** What is on its way, by the one rule every page uses: the nodes that wear data-loading, and those it dims. */
const dimmed = (tree) => all(tree, (n) => n.props?.["data-loading"] === "");
const dims = (tree) => all(tree, (n) => n.props?.["data-dims"] === true);

test("the page dims once while the Reviews read is of another period than the strip shows, by the one rule every page uses, and not when they agree", () => {
  workspace("proposal");
  const same = draw("reviews", { reviews: REVIEWS_LINKED });
  assert.deepEqual(dimmed(same), [], "the same period: nothing on its way");
  assert.equal(dims(same).length, 1, "the page's body is the one thing the rule dims");
  assert.equal(dims(same)[0].props["aria-busy"], "false");
  const behind = draw("reviews", { reviews: held(reviewsDto({ days: 30 }), "30d") });
  assert.deepEqual(
    dimmed(behind),
    [byTestId(behind, "reports-real")],
    "the page says a period is on its way, and nothing else does",
  );
  assert.equal(dims(behind).length, 1, "and one body dims, not the page's and the lens's both (they would compound)");
  assert.ok(byTestId(dims(behind)[0], "google-tiles"), "the lens's cards are in the body that dims");
  assert.equal(dims(behind)[0].props["aria-busy"], "true");
  assert.equal(byTestId(behind, "reviews-failed"), null, "a read on its way is not a failed one");
  // Another lens is of the report the page holds: the Reviews read, behind or not, dims nothing there.
  const other = draw("overview", { reviews: held(reviewsDto({ days: 30 }), "30d") });
  assert.deepEqual(dimmed(other), [], "the Reviews read's period is the Reviews lens's own to say");
});

test("a lens the workspace has no use for says so at its address, in the registry's words, and draws none of its cards", () => {
  workspace("booking");
  const tree = draw("pipeline", { R: surface({ deals: DEALS }) });
  const empty = byTestId(tree, "lens-empty");
  assert.equal(textOf(find(empty, (n) => classes(n).includes("empty-title"))), "No proposals to report");
  assert.ok(textOf(empty).includes("Open Settings"));
  assert.equal(byTestId(tree, "rpt-deals"), null);
  workspace("proposal");
  const none = draw("pipeline", { R: surface({ deals: NO_DEALS }) });
  assert.ok(byTestId(none, "lens-empty"), "deals on and none ever recorded: the same words, never a blank");
});

test("a period with nothing in it says so on each lens that draws sections, and Reviews says what it needs where Google answered that nothing is linked", () => {
  workspace("booking");
  const R = surface({ report: quiet(), deals: NO_DEALS });
  for (const lens of ["overview", "receptionist", "people"]) {
    const tree = draw(lens, { R });
    assert.ok(
      textOf(byTestId(tree, "reports-empty")).includes("Nobody wrote or called between Aug 29 and Sep 4."),
      lens,
    );
  }
  const reviews = draw("reviews", { reviews: REVIEWS_UNLINKED });
  assert.ok(textOf(byTestId(reviews, "lens-empty")).includes("Find your business on Google once."));
});

test("Reviews draws nothing while its own read is out: a read still out is not 'nothing is linked'", () => {
  workspace("booking");
  const unread = draw("reviews", { reviews: undefined });
  assert.equal(
    byTestId(unread, "lens-empty"),
    null,
    "REGRESSION: the empty that says nothing is linked, drawn before the Reviews read's first answer",
  );
  assert.equal(byTestId(unread, "reviews-failed"), null, "and no failure: nothing has failed");
  assert.ok(byTestId(unread, "reports-real"), "the page itself stands");
});

test("a lens that waits on how the workspace sells draws nothing until the workspace list is held, and the Overview stands without it", () => {
  delete globalThis.__WORKSPACES;
  delete globalThis.__ACTIVE_WORKSPACE;
  const pipeline = draw("pipeline", { R: surface({ deals: NO_DEALS }) });
  assert.equal(
    byTestId(pipeline, "lens-empty"),
    null,
    "REGRESSION: 'you book directly' said to a workspace nobody had asked",
  );
  assert.equal(byTestId(pipeline, "rpt-deals"), null);
  assert.ok(
    byTestId(draw("overview", { R: surface({ deals: DEALS }) }), "reports-hero"),
    "open to everyone: no list needed",
  );
  workspace("proposal");
  assert.ok(byTestId(draw("pipeline", { R: surface({ deals: DEALS }) }), "rpt-deals"), "the list held: the lens draws");
});

// LAST in the file, in this order: a surface that never had a read is failed only until one lands (surface-status.ts keeps `ready`
// for good), and every test above draws Reviews on a surface with neither.
test("Reviews says the read failed, with its Retry, where its read could not be made, and never the empty that says nothing is linked", () => {
  workspace("booking");
  setStatus("reports_reviews", "seeded");
  const failed = draw("reviews", { reviews: undefined });
  const words = byTestId(failed, "reviews-failed");
  assert.ok(words, "the house's failed read, as Today draws one");
  assert.ok(textOf(words).includes("Couldn't read your Google reviews"), textOf(words));
  assert.ok(
    find(failed, (n) => n.props?.surface === "reports_reviews"),
    "its Retry reads the Reviews surface again",
  );
  assert.equal(
    byTestId(failed, "lens-empty"),
    null,
    "REGRESSION: a failed read said 'find your business on Google once'",
  );
});

test("a pick whose Reviews read could not be made says so, with its Retry, and never holds the period it left dimmed for good", () => {
  workspace("proposal");
  // The report landed for the pick and the Reviews read did not: the surface holds the period left, and its latest read failed
  // (a read that landed once is never "failed" to useSurfaceFailed, so the lens would dim the old period for ever).
  setStatus("reports_reviews", "degraded");
  const left = held(reviewsDto({ days: 30 }), "30d");
  const stuck = draw("reviews", { reviews: left });
  const words = byTestId(stuck, "reviews-failed");
  assert.ok(words, "the house's failed read, drawn in place of the period left");
  assert.ok(textOf(words).includes("Couldn't read your Google reviews"), textOf(words));
  assert.ok(
    find(stuck, (n) => n.props?.surface === "reports_reviews"),
    "its Retry reads the Reviews surface again",
  );
  assert.equal(byTestId(stuck, "google-tiles"), null, "the period left is not drawn under the strip's period");
  assert.deepEqual(dimmed(stuck), [], "nothing is dimmed: a dimmed card takes no press, and the Retry is on it");
  assert.equal(dims(stuck)[0].props["aria-busy"], "false");
  // The same failed read, with what is held of the period the strip shows, says nothing: the figures are current.
  const current = draw("reviews", { reviews: REVIEWS_LINKED });
  assert.equal(byTestId(current, "reviews-failed"), null);
  assert.ok(byTestId(current, "google-tiles"), "the figures stand");
  // And the lens is the only page that says it: on another lens the Reviews read is nobody's.
  assert.equal(byTestId(draw("overview", { reviews: left }), "reviews-failed"), null);
  // A Retry that lands: the surface is live again, and what is held is drawn, dimmed while it is of another period.
  setStatus("reports_reviews", "live");
  const retried = draw("reviews", { reviews: left });
  assert.equal(byTestId(retried, "reviews-failed"), null, "no longer failed");
  assert.deepEqual(dimmed(retried), [byTestId(retried, "reports-real")], "a read on its way again, as a pick's is");
});

test("the Campaigns lens draws its channels where more than one sent (0030): a bar each in the channel's own colour, its delivered share beside it, every figure in its table, and what a read is under it; one channel, no card", () => {
  workspace("proposal");
  const split = [
    { channel: "whatsapp", sent: 14, delivered: 12, read: 11, replied: 3 },
    { channel: "sms", sent: 4, delivered: 3, read: 0, replied: 1 },
    { channel: "email", sent: 2, delivered: 1, read: 0, replied: 0 },
  ];
  const tree = draw("campaigns", { R: surface({ deals: DEALS, campaigns: { ...campaignDto(), by_channel: split } }) });
  const card = byTestId(tree, "chart-campaign-channels");
  assert.ok(card, "the card");
  assert.match(textOf(card), /By channel/);
  assert.match(textOf(card), /Read receipts are WhatsApp's alone: 11 of its 14 were read\./);
  for (const words of ["WhatsApp", "14 · 86% delivered", "Text", "4 · 75% delivered", "Email", "2 · 50% delivered"])
    assert.ok(textOf(card).includes(words), words);
  assert.equal(byTestId(tree, "chart-channels"), null, "People's channels card is People's");
  const one = draw("campaigns", {
    R: surface({
      deals: DEALS,
      campaigns: {
        ...campaignDto(),
        by_channel: [{ channel: "whatsapp", sent: 20, delivered: 16, read: 11, replied: 4 }],
      },
    }),
  });
  assert.equal(byTestId(one, "chart-campaign-channels"), null, "one channel: nothing to split");
  assert.equal(byTestId(draw("campaigns"), "chart-campaign-channels"), null, "a report from before the channels");
});
