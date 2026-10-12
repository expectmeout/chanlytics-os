/**
 * Reports' page by lens (surfaces/reports/reports-page.tsx), EXECUTED on the stub React over the one read the surface holds: each
 * lens draws its own body and none another's, the head says "Reports" and the lens's answer, a move between lenses asks for
 * nothing and never blanks the body, and a lens the workspace has no use for, or a period with nothing in it, says so in the
 * registry's words. The Reviews lens draws from the read that follows the period shown (`useFollower`): while it is of another
 * period the page dims once, when it could not be made the lens says so with its Retry, and what it says where nothing is linked is
 * the fold's, with a door only for a person who may use it.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find } from "../../_legacy-react.mjs";
import {
  DEALS,
  NO_DEALS,
  campaignDto,
  quiet,
  reviewsDto,
  reviewsGoogle,
  reviewsHeld,
  surface,
} from "../_report-world.mjs";
import { ownHeld } from "../receptionist/_receptionist-world.mjs";
import { dtoWith, held as peopleHeld } from "../people/_people-world.mjs";
import { dtoWith as campaignsLedger, held as campaignsHeld } from "../campaigns/_campaign-world.mjs";
import { reachOuts as campaignsReachOuts } from "../campaigns/_reach-out-world.mjs";

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
const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);
const { setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { standingSaid, forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { lensAnswerOf, lensEmpty } = await import("@chanlytics/contracts");
const { toCampaignLensVM, toPeopleReportVM } = await import("@chanlytics/contracts/report-lens");
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
const held = reviewsHeld;
const NOTHING_LINKED = { listing: null, connection: null, reviews: [], days: [] };
/** Google answered, and nothing is linked: this deployment can look a listing up, and none is kept. */
const REVIEWS_NONE = held(reviewsDto({ days: 7, google: reviewsGoogle(NOTHING_LINKED), ledger: null }));
/** Google answered, and nothing is linked: this deployment cannot look a listing up and none is kept. */
const REVIEWS_UNAVAILABLE = held(
  reviewsDto({
    days: 7,
    google: reviewsGoogle(NOTHING_LINKED),
    readable: false,
    ledger: null,
  }),
);
/** A listing linked and the Business Profile synced: Harbor Studio's reviews over seven days, the period the page shows. */
const REVIEWS_LINKED = held(reviewsDto({ days: 7 }));
/** The Receptionist lens's own read of the week, which that lens follows as Reviews' does: current when it is of the period shown. */
const RECEPTIONIST_HELD = ownHeld();
/** The People lens's own read, which that lens follows as well: current when it is of the period shown. */
const PEOPLE_HELD = peopleHeld(dtoWith(), "7d");
/** The Campaigns lens's own read (the sends, the ledger and the key), followed the same way. */
const CAMPAIGNS_HELD = campaignsHeld(campaignsLedger(), "7d", { reachOuts: campaignsReachOuts({ days: 7 }) });
/** The lens drawn over a surface: the page for its address. */
const draw = (lens, opts = {}) => {
  // The period the strip shows, which the Reviews, Receptionist, People and Campaigns reads follow: what each holds is current when it is of this one.
  keepReportPeriod("7d");
  setSurfaceValue("reports", opts.R ?? surface({ deals: DEALS }));
  setSurfaceValue("reports_reviews", "reviews" in opts ? opts.reviews : REVIEWS_NONE);
  setSurfaceValue("reports_receptionist", "receptionist" in opts ? opts.receptionist : RECEPTIONIST_HELD);
  setSurfaceValue("reports_people", "people" in opts ? opts.people : PEOPLE_HELD);
  setSurfaceValue("reports_campaigns", "campaigns" in opts ? opts.campaigns : CAMPAIGNS_HELD);
  fresh();
  return ReportsPage({ pathname: at(lens) });
};
const has = (tree, ids) => ids.map((id) => !!byTestId(tree, id));

const BODIES = {
  overview: ["reports-hero", "reports-facts", "reports-tiles"],
  receptionist: [
    "receptionist-strip",
    "chart-answered",
    "chart-reasons",
    "chart-hold",
    "chart-topics",
    "chart-languages",
    "chart-calls",
    "chart-call-endings",
    "chart-booking",
    "chart-reply",
    "receptionist-time",
    "receptionist-figures",
    "receptionist-stuck",
  ],
  people: [
    "people-strip",
    "chart-people-channels",
    "chart-people-first",
    "chart-people-yeses",
    "chart-people-stops",
    "chart-people-wires",
    "chart-people-fresh",
    "chart-rhythm",
    "chart-people",
    "people-time",
    "chart-people-steps",
    "chart-people-bounced",
    "people-stuck",
    "people-stand",
  ],
  pipeline: ["rpt-deals"],
  campaigns: [
    "campaigns-strip",
    "chart-funnel",
    "chart-campaigns",
    "chart-campaigns-held",
    "chart-campaigns-stopped",
    "chart-campaigns-failed-why",
    "chart-campaign-channels",
    "chart-campaigns-by-message",
    "chart-sources",
    "campaigns-time",
    "chart-campaigns-first-reply",
    "chart-campaigns-approval",
    "campaigns-stuck",
    "ro-strip",
    "ro-emails",
    "ro-funnel",
    "ro-angles",
    "ro-domains",
    "ro-written",
    "ro-sources",
  ],
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
    // The page hands the head the fold of each lens's own read: People's and Campaigns' are the sentences their figures are drawn from.
    const parts = {
      ...R,
      reviews: REVIEWS_NONE.vm,
      people: toPeopleReportVM(PEOPLE_HELD.dto),
      campaigns: toCampaignLensVM(
        { campaigns: CAMPAIGNS_HELD.campaigns, ledger: CAMPAIGNS_HELD.ledger, reachOuts: CAMPAIGNS_HELD.reachOuts },
        Date.now(),
      ),
    };
    assert.equal(said.sentence, lensAnswerOf(lens, parts), `${lens}: its answer`);
  }
  assert.equal(
    standingSaid().sentence,
    undefined,
    "with no listing linked, Reviews says nothing of itself (and the last lens drawn is Reviews)",
  );
  draw("campaigns", { R });
  assert.equal(
    standingSaid().sentence,
    "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before).",
    "Campaigns says the head of the fold its read folds to",
  );
  assert.notEqual(standingSaid().sentence, R.vm.lines.hero, "and nothing of the frame's");
  draw("people", { R });
  assert.equal(
    standingSaid().sentence,
    toPeopleReportVM(PEOPLE_HELD.dto).head,
    "People says the head of the fold its read folds to",
  );
  assert.notEqual(standingSaid().sentence, R.vm.lines.people, "and not the frame's count of new people");
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

test("the page dims once while the Receptionist read is of another period than the strip shows or still out, on that lens alone, and not when they agree", () => {
  workspace("proposal");
  const same = draw("receptionist");
  assert.deepEqual(dimmed(same), [], "the same period: nothing on its way");
  assert.equal(dims(same).length, 1, "the page's body is the one thing the rule dims");
  assert.equal(dims(same)[0].props["aria-busy"], "false");
  for (const [said, receptionist] of [
    ["held for another period", ownHeld(undefined, "30d")],
    ["not yet read", undefined],
  ]) {
    const behind = draw("receptionist", { receptionist });
    assert.deepEqual(
      dimmed(behind),
      [byTestId(behind, "reports-real")],
      `${said}: the page says a period is on its way`,
    );
    assert.equal(dims(behind).length, 1, "and one body dims, not the page's and the lens's both (they would compound)");
    assert.ok(byTestId(dims(behind)[0], "chart-answered"), "the lens's cards are in the body that dims");
    assert.equal(dims(behind)[0].props["aria-busy"], "true");
    assert.equal(byTestId(behind, "receptionist-failed"), null, `${said}: a read on its way is not a failed one`);
    // Another lens is of the report the page holds: the Receptionist read, behind or not, dims nothing there.
    assert.deepEqual(
      dimmed(draw("overview", { receptionist })),
      [],
      `${said}: it is the Receptionist lens's own to say`,
    );
    assert.deepEqual(dimmed(draw("reviews", { receptionist })), []);
  }
});

test("the page dims once while the People read is of another period than the strip shows or still out, on that lens alone, and not when they agree", () => {
  workspace("proposal");
  const same = draw("people");
  assert.deepEqual(dimmed(same), [], "the same period: nothing on its way");
  assert.equal(dims(same).length, 1, "the page's body is the one thing the rule dims");
  assert.equal(dims(same)[0].props["aria-busy"], "false");
  for (const [said, people] of [
    ["held for another period", peopleHeld(dtoWith(), "30d")],
    ["not yet read", undefined],
  ]) {
    const behind = draw("people", { people });
    assert.deepEqual(
      dimmed(behind),
      [byTestId(behind, "reports-real")],
      `${said}: the page says a period is on its way`,
    );
    assert.equal(dims(behind).length, 1, "and one body dims, not the page's and the lens's both (they would compound)");
    assert.ok(byTestId(dims(behind)[0], "chart-people"), "the lens's cards are in the body that dims");
    assert.equal(dims(behind)[0].props["aria-busy"], "true");
    assert.equal(byTestId(behind, "people-failed"), null, `${said}: a read on its way is not a failed one`);
    // Another lens is of the report the page holds: the People read, behind or not, dims nothing there.
    assert.deepEqual(dimmed(draw("overview", { people })), [], `${said}: it is the People lens's own to say`);
    assert.deepEqual(dimmed(draw("receptionist", { people })), []);
  }
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

test("Ads reaches a workspace without ads as the registry's empty at its address, with the door to Ads: none of its cards, no head sentence, and no fact on the Overview", () => {
  for (const sellsBy of ["booking", "proposal"]) {
    workspace(sellsBy);
    const tree = draw("ads", { R: surface({ deals: DEALS }) });
    const empty = byTestId(tree, "lens-empty");
    assert.ok(empty, `${sellsBy}: the lens says it has nothing, never a blank`);
    assert.equal(textOf(find(empty, (n) => classes(n).includes("empty-title"))), "No ads in this period");
    assert.ok(textOf(empty).includes("Open Ads"), "and where Ads is");
    for (const id of ["ads-lens", "ads-res-days", "ads-res-figures", "ads-res-funnel", "ads-res-platforms"])
      assert.equal(byTestId(tree, id), null, `${sellsBy}: ${id} is a card of the demo's lens alone`);
    assert.equal(standingSaid().sentence, undefined, "its head says Reports and nothing of ads");
    const overview = draw("overview", { R: surface({ deals: DEALS }) });
    assert.deepEqual(
      all(overview, (n) => n.props?.["data-fact"] === "ads"),
      [],
      `${sellsBy}: Worth knowing says nothing of ads where there are none`,
    );
  }
});

test("a period with nothing in it says so on each lens that draws sections, and on People it hides nothing: the lens never draws the empty", () => {
  workspace("booking");
  const R = surface({ report: quiet(), deals: NO_DEALS });
  for (const lens of ["overview", "receptionist"]) {
    const tree = draw(lens, { R });
    assert.ok(
      textOf(byTestId(tree, "reports-empty")).includes("Nobody wrote or called between Aug 29 and Sep 4."),
      lens,
    );
  }
  // A person who has not written in these days is still in the book, and the lens has the book to draw.
  const people = draw("people", { R });
  assert.equal(byTestId(people, "reports-empty"), null);
  assert.ok(byTestId(people, "chart-people-wires") && byTestId(people, "chart-people-fresh"), "the book draws");
});

test("Reviews says why nothing is drawn where nothing is linked, in the fold's words: a deployment that cannot look a listing up says so and offers no door, one that can says what the lens would show, and the door to find it is for a person who may use it", () => {
  workspace("booking");
  const wasCanDo = globalThis.canDo;
  const door = (tree) => find(byTestId(tree, "google-none"), (n) => n.type === "button");
  const found = lensEmpty("reviews", { since: "Aug 29", until: "Sep 4" });
  try {
    for (const [who, may] of [
      ["an owner", () => true],
      ["an operator", (action) => action === "approve"],
      ["a viewer", () => false],
    ]) {
      globalThis.canDo = may;
      // Nothing can be looked up or connected: the words say so, and no door leads anywhere.
      const unavailable = draw("reviews", { reviews: REVIEWS_UNAVAILABLE });
      assert.equal(REVIEWS_UNAVAILABLE.vm.state, "unavailable");
      assert.notEqual(
        REVIEWS_UNAVAILABLE.vm.lines.empty,
        found.title,
        "its own words, not the registry's for a listing still to find",
      );
      assert.ok(textOf(byTestId(unavailable, "google-none")).includes(REVIEWS_UNAVAILABLE.vm.lines.empty), who);
      assert.equal(door(unavailable), null, `${who}: a door to nothing is not drawn`);
      assert.equal(
        byTestId(unavailable, "lens-empty"),
        null,
        `${who}: and the registry's words for a listing still to find are not said`,
      );
      // A listing can be found: the fold's words, the registry's body, and the door for who may find it.
      const unlinked = draw("reviews", { reviews: REVIEWS_NONE });
      assert.equal(REVIEWS_NONE.vm.state, "unlinked");
      const said = textOf(byTestId(unlinked, "google-none"));
      assert.ok(said.includes(REVIEWS_NONE.vm.lines.empty) && said.includes(found.body), who);
      if (who === "an owner")
        assert.equal(textOf(door(unlinked)), found.door.label, `${who}: the door to the first run's Find`);
      else assert.equal(door(unlinked), null, `${who}: the words without a door`);
    }
  } finally {
    globalThis.canDo = wasCanDo;
  }
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

// These two follow every test above that draws Reviews, in this order: a surface that never had a read is failed only until one
// lands (surface-status.ts keeps `ready` for good), and those draw Reviews on a surface with neither. The second leaves it live, and
// no test after them draws Reviews.
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
  assert.equal(standingSaid().sentence, undefined, "the head says nothing of a period the lens cannot show");
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
  assert.equal(
    standingSaid().sentence,
    REVIEWS_LINKED.vm.lines.head,
    "and the figures that stand are said at the head",
  );
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
  /** The Campaigns lens's own read of the week's sends, split as asked (the ledger beside it is the world's). */
  const sends = (campaigns) => ({ campaigns: campaignsHeld(campaignsLedger(), "7d", { campaigns }) });
  const tree = draw("campaigns", sends({ ...campaignDto(), by_channel: split }));
  const card = byTestId(tree, "chart-campaign-channels");
  assert.ok(card, "the card");
  assert.match(textOf(card), /By channel/);
  assert.match(textOf(card), /Read receipts are WhatsApp's alone: 11 of its 14 were read\./);
  // D9: of four sends or fewer the count, never a percentage; of fourteen a share.
  for (const words of [
    "WhatsApp",
    "14 · 86% delivered",
    "Text",
    "4 · 3 of 4 delivered",
    "Email",
    "2 · 1 of 2 delivered",
  ])
    assert.ok(textOf(card).includes(words), words);
  assert.equal(byTestId(tree, "chart-people-channels"), null, "People's channels card is People's");
  const one = draw(
    "campaigns",
    sends({
      ...campaignDto(),
      by_channel: [{ channel: "whatsapp", sent: 20, delivered: 16, read: 11, replied: 4 }],
    }),
  );
  assert.equal(byTestId(one, "chart-campaign-channels"), null, "one channel: nothing to split");
  assert.equal(
    byTestId(draw("campaigns", sends(campaignDto())), "chart-campaign-channels"),
    null,
    "a report from before the channels",
  );
});

test("the page dims once while the Campaigns read is of another period than the strip shows or still out, on that lens alone, and not when they agree", () => {
  workspace("proposal");
  const same = draw("campaigns");
  assert.deepEqual(dimmed(same), [], "the same period: nothing on its way");
  assert.equal(dims(same).length, 1, "the page's body is the one thing the rule dims");
  assert.equal(dims(same)[0].props["aria-busy"], "false");
  for (const [said, campaigns] of [
    ["held for another period", campaignsHeld(campaignsLedger(), "30d")],
    ["not yet read", undefined],
  ]) {
    const behind = draw("campaigns", { campaigns });
    assert.deepEqual(
      dimmed(behind),
      [byTestId(behind, "reports-real")],
      `${said}: the page says a period is on its way`,
    );
    assert.equal(dims(behind).length, 1, "and one body dims, not the page's and the lens's both (they would compound)");
    assert.equal(dims(behind)[0].props["aria-busy"], "true");
    assert.equal(
      byTestId(behind, "chart-funnel"),
      null,
      `${said}: nothing of a period left is drawn under this one's name`,
    );
    assert.equal(byTestId(behind, "campaigns-failed-ledger"), null, `${said}: a read on its way is not a failed one`);
    // Another lens is of the report the page holds: the Campaigns read, behind or not, dims nothing there.
    assert.deepEqual(dimmed(draw("overview", { campaigns })), [], `${said}: it is the Campaigns lens's own to say`);
    assert.deepEqual(dimmed(draw("reviews", { campaigns })), []);
  }
});
