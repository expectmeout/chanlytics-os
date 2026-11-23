/**
 * Where a message's review link is read from: the owner's own link if they gave one (Settings › Details, the stored
 * config's `brain.review_link`), else the link the Google listing keeps (00415). Without the first, a business with no
 * listing was offered no review ask at all.
 *
 *   The rule    contracts reviewLinkFrom, ownReviewLinkOf and the row's check (whyNotAReviewLink), and the stored config
 *               taking the link as a web address and nothing else.
 *   The read    db reviewLinkOf, THE one reading for a message's review_link slot: the owner's own first, and the listing
 *               asked only where there is none. What it says when the database answers badly is as it was: "the column
 *               is not there yet" (a database before 00415) reads as no link, and any other failed read throws, since "we
 *               could not read it" is never "there is none".
 *
 * The client is a double that answers what it is told; nothing here reaches a database (review-link.db.test.mjs does).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARAM_SOURCE_HINTS,
  REVIEW_LINK_ROW_WORDS,
  ownReviewLinkOf,
  parseTenantConfigResult,
  reviewLinkFrom,
  reviewLinkSaved,
  whyNotAReviewLink,
} from "@chanlytics/contracts";
import { reviewLinkOf } from "@chanlytics/db/campaigns";

/**
 * A client whose config read and listing read each answer `{ data, error }` as given, and remembers what it asked. The
 * config's door for a member who is not the owner (tenant_config_read) answers `door`, none unless given.
 */
function client({ config = { data: null, error: null }, listing = { data: null, error: null }, door = null } = {}) {
  const asked = [];
  const answers = { tenant_config: config, google_listings: listing };
  const db = {
    from: (table) => {
      asked.push(["from", table]);
      const q = {
        select: (columns) => {
          asked.push(["select", columns]);
          return q;
        },
        eq: (column, value) => {
          asked.push(["eq", column, value]);
          return q;
        },
        maybeSingle: async () => answers[table],
      };
      return q;
    },
    rpc: (name) => {
      asked.push(["rpc", name]);
      return { maybeSingle: async () => door ?? { data: null, error: null } };
    },
  };
  return { db, asked };
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWN = "https://example.com/review/harbor-studio";
const LISTED = "https://example.com/listing/harbor-studio/review";
const error = (code, message) => ({ data: null, error: { code, message } });
const stored = (brain) => ({ data: { tenant_id: T, config: { brain }, version: 1, updated_at: "" }, error: null });
const listed = (uri) => ({ data: { new_review_uri: uri }, error: null });

test("the rule: the owner's own link if they gave one, else the Google listing's, else none; and it says which", () => {
  assert.deepEqual(reviewLinkFrom({ own: OWN, listing: LISTED }), { link: OWN, from: "own" });
  assert.deepEqual(reviewLinkFrom({ own: OWN, listing: null }), { link: OWN, from: "own" });
  assert.deepEqual(reviewLinkFrom({ own: null, listing: LISTED }), { link: LISTED, from: "listing" });
  assert.equal(reviewLinkFrom({ own: null, listing: null }), null);
  assert.deepEqual(reviewLinkFrom({ own: "  ", listing: ` ${LISTED} ` }), { link: LISTED, from: "listing" });
});

test("the owner's own link is read off the stored config as a real web address, or it is none", () => {
  assert.equal(ownReviewLinkOf({ brain: { review_link: OWN } }), OWN);
  assert.equal(ownReviewLinkOf({ brain: { review_link: `  ${OWN} ` } }), OWN, "trimmed");
  for (const none of [
    null,
    undefined,
    "a string",
    {},
    { brain: null },
    { brain: {} },
    { brain: { review_link: "" } },
    { brain: { review_link: 7 } },
    { brain: { review_link: "not a link" } },
    { brain: { review_link: "mailto:reviews@example.com" } },
    { brain: { review_link: "javascript:alert(1)" } },
  ])
    assert.equal(ownReviewLinkOf(none), null, JSON.stringify(none));
});

test("the row's check: empty is fine (the listing's link is used), a web address is fine, anything else says what to type", () => {
  assert.equal(whyNotAReviewLink(""), null);
  assert.equal(whyNotAReviewLink("   "), null);
  assert.equal(whyNotAReviewLink(OWN), null);
  assert.equal(whyNotAReviewLink("example.com/review"), null, "the https:// an owner leaves off is supplied");
  for (const bad of [
    "leave us a review",
    "mailto:reviews@example.com",
    "example",
    `https://example.com/${"x".repeat(600)}`,
  ])
    assert.equal(whyNotAReviewLink(bad), REVIEW_LINK_ROW_WORDS.problem, bad);
  assert.equal(REVIEW_LINK_ROW_WORDS.problem, "Use a full web address, like example.com/review");
});

test("the stored config takes the owner's review link as a web address, keeps it, and refuses anything else", () => {
  const brain = {
    business_name: "Harbor Studio",
    system_prompt: "You answer for Harbor Studio, a made-up business used in this test.",
    fallbacks: { greeting: "Hi", error: "One moment", non_text: "Text only" },
  };
  const taken = parseTenantConfigResult({ brain: { ...brain, review_link: OWN } });
  assert.equal(taken.ok, true, JSON.stringify(taken.issues ?? null));
  assert.equal(taken.config.brain.review_link, OWN);
  assert.equal(parseTenantConfigResult({ brain }).ok, true, "optional: every config written before it stays valid");
  assert.equal(parseTenantConfigResult({ brain: { ...brain, review_link: "leave us a review" } }).ok, false);
});

test("what the page says of it: the row's words, and where a filled slot says its link comes from", () => {
  assert.deepEqual(REVIEW_LINK_ROW_WORDS, {
    label: "Review link",
    empty: "Not set",
    listing: "From your Google listing",
    // True with a listing or with none: the owner's own link is the one a message sends.
    hint: "Where customers leave a review. Messages send it in place of your Google listing's link.",
    placeholder: "example.com/review",
    problem: "Use a full web address, like example.com/review",
    gate: "change the review link",
  });
  assert.equal(PARAM_SOURCE_HINTS.review_link, "From Settings › Details, else your Google listing");
  assert.equal(reviewLinkSaved(OWN), "Saved · messages send this link");
  assert.equal(reviewLinkSaved(""), "Saved", "emptied, the row says what stands: the listing's link, or none");
});

test("reviewLinkOf answers the owner's own link first, and asks the listing nothing", async () => {
  const read = client({ config: stored({ review_link: OWN }), listing: listed(LISTED) });
  assert.equal(await reviewLinkOf(read.db, T), OWN);
  assert.deepEqual(
    read.asked.filter(([what]) => what === "from").map(([, table]) => table),
    ["tenant_config"],
    "the listing is read only where the owner gave no link",
  );
});

test("a business with no Google listing has a review link once its owner gives one", async () => {
  assert.equal(await reviewLinkOf(client({ config: stored({ review_link: OWN }) }).db, T), OWN);
  assert.equal(await reviewLinkOf(client({ config: stored({}) }).db, T), null, "no link of its own, no listing");
});

test("a member who is not the owner reads the same link, through the config's door", async () => {
  // The table answers nothing to them (00366); the door answers the row with the calendar's address masked (00365).
  const read = client({
    door: { ...stored({ review_link: OWN }), data: { ...stored({ review_link: OWN }).data, feed_hidden: true } },
  });
  assert.equal(await reviewLinkOf(read.db, T), OWN);
  assert.ok(read.asked.some(([what, name]) => what === "rpc" && name === "tenant_config_read"));
});

test("with no link of the owner's own, reviewLinkOf reads the workspace's listing's one column, and answers its link, trimmed, or none", async () => {
  const read = client({ config: stored({}), listing: listed(`  ${LISTED} `) });
  assert.equal(await reviewLinkOf(read.db, T), LISTED);
  assert.deepEqual(
    read.asked.filter(
      (_, i) => i >= read.asked.findIndex(([what, table]) => what === "from" && table === "google_listings"),
    ),
    [
      ["from", "google_listings"],
      ["select", "new_review_uri"],
      ["eq", "tenant_id", T],
    ],
  );
  assert.equal(await reviewLinkOf(client({ listing: listed(null) }).db, T), null);
  assert.equal(await reviewLinkOf(client({ listing: listed("   ") }).db, T), null);
  assert.equal(await reviewLinkOf(client().db, T), null, "no config row and no listing, no link");
  // A link in the config that is no web address is none: the listing's stands.
  assert.equal(
    await reviewLinkOf(client({ config: stored({ review_link: "leave us a review" }), listing: listed(LISTED) }).db, T),
    LISTED,
  );
});

test("reviewLinkOf reads the listing as none only where Postgres says its own column is not there (42703): any other failed read throws, a schema cache that cannot find it among them", async () => {
  const before415 = error("42703", "column google_listings.new_review_uri does not exist");
  assert.equal(await reviewLinkOf(client({ listing: before415 }).db, T), null, "a database before 00415");
  for (const [what, e] of [
    ["another column", error("42703", "column google_listings.maps_uri does not exist")],
    [
      "PostgREST's schema cache (PGRST204)",
      error("PGRST204", "Could not find the 'new_review_uri' column of 'google_listings' in the schema cache"),
    ],
    ["a statement timeout", error("57014", "canceling statement due to statement timeout")],
  ])
    await assert.rejects(reviewLinkOf(client({ listing: e }).db, T), /cannot read the workspace's review link/, what);
});

test("a config that could not be read throws too: the listing's link is never used in place of one nobody could read", async () => {
  const timeout = error("57014", "canceling statement due to statement timeout");
  await assert.rejects(reviewLinkOf(client({ config: timeout, listing: listed(LISTED) }).db, T));
});
