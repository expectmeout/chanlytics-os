/**
 * Google's door: refresh of the profile, reply, draft, and disconnect and unlink.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GBP_REVIEWS_MAX_PAGES } from "@chanlytics/channels/google";
import { REVIEW_HOLD_MS, reviewRoute } from "@chanlytics/contracts";
import { scripted, said } from "../../ai/_model-world.mjs";
import {
  A,
  GBP_REVIEW,
  GHOST,
  HOUR,
  LOC,
  LOCATION_URL,
  PLACE,
  R1,
  R2,
  R3,
  REPLY_URL,
  REVIEWS_URL,
  REVOKE_URL,
  SCOPE,
  TOKEN_URL,
  U,
  ago,
  answer,
  autoModeWorld,
  connRow,
  form,
  google,
  knock,
  listingRow,
  liveCreds,
  refusal,
  reviewRow,
  setModelFetch,
  silent,
  use,
  wire,
  wired,
  withEnv,
  world,
  writes,
} from "./_door.mjs";

/* ---------------------------- refresh: the profile ------------------------ */

test("refresh with the profile connected syncs it as the owner -- the expired token in Vault traded for a fresh one that is kept -- and a credential Google rejects is written on the connection without a throw: the dashboard sees the words, the stamp does not move, the listing keeps its numbers", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    // Rosa's, which Google still lists, and one it took down since the last read (decision 0036, 00392).
    google_reviews: [
      reviewRow(R1),
      reviewRow("99999999-9999-4999-8999-999999999999", { review_id: "g-gone", author: "Dana", body: "Taken down." }),
    ],
  });
  const creds = new Map([
    [A, { refresh_token: "rt-1", access_token: "at-stale", expires_at: Date.now() - 60_000, scope: SCOPE }],
  ]);
  const { vault } = use(tables, creds);
  const before = { ...tables.google_connections[0] };
  let net = wired((req) =>
    req.url.split("?")[0] === TOKEN_URL
      ? { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }
      : (() => {
          throw new Error(`unexpected ${req.method} ${req.url}`);
        })(),
  );

  const [s1, b1] = await answer(await knock({ op: "refresh" }));
  assert.equal(s1, 502);
  assert.deepEqual(
    [b1.ok, b1.read],
    [false, { ok: false, error: "invalid_grant: Token has been expired or revoked." }],
  );
  assert.equal(
    b1.connection.sync_error,
    "invalid_grant: Token has been expired or revoked.",
    "Google's own words, on the connection the owner can see",
  );
  assert.equal(b1.connection.last_synced_at, before.last_synced_at, "a failed sync is not a sync");
  assert.deepEqual(
    [b1.listing.rating, b1.listing.review_count, b1.listing.check_error],
    [4.5, 10, null],
    "the listing keeps its last good numbers, and this was not the listing's failure",
  );
  assert.deepEqual(
    net.asked(),
    [["POST", TOKEN_URL]],
    "the stale token was not tried: it had expired, so the refresh went first, and Google refused it",
  );
  const refresh = form(net.calls[0]);
  assert.deepEqual(
    [refresh.get("grant_type"), refresh.get("refresh_token"), refresh.get("client_id"), refresh.get("client_secret")],
    ["refresh_token", "rt-1", "oauth-client-for-this-file", "oauth-secret-for-this-file"],
  );
  assert.deepEqual(vault.writes, [], "nothing kept from a refusal");
  assert.equal(
    tables.google_connections[0].sync_error,
    "invalid_grant: Token has been expired or revoked.",
    "on the row",
  );
  // A grant Google refused lasts until its owner reconnects: they are told, once, with the door to Connections (R11 S11-4).
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.title, n.route]),
    [["sweep", "Google Business Profile stopped updating", "admin/integrations"]],
  );
  assert.deepEqual(tables.events, []);
  const stopped = tables.notifications[0];

  // The owner reconnected at Google's end; the refresh is honoured and kept, the reviews read as the owner, and what is new rings.
  const NEW = {
    name: "accounts/111/locations/222/reviews/g-3",
    reviewId: "g-3",
    starRating: "FIVE",
    reviewer: { displayName: "Luis" },
    comment: "Great crew.",
    createTime: ago(2 * HOUR),
    updateTime: ago(2 * HOUR),
  };
  // What the workspace had been told when the bound location was read again: its bells and its events.
  let toldByTheLink = null;
  net = wired((req) => {
    const u = req.url.split("?")[0];
    if (u === TOKEN_URL)
      return { status: 200, body: { access_token: "at-new", expires_in: 3600, scope: SCOPE, token_type: "Bearer" } };
    if (u === REVIEWS_URL("accounts/111", "222"))
      return { status: 200, body: { reviews: [NEW, GBP_REVIEW], averageRating: 4.8, totalReviewCount: 2 } };
    if (u === LOCATION_URL("locations/222")) {
      toldByTheLink = [tables.notifications.length, tables.events.length];
      return { status: 200, body: LOC };
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const t0 = Date.now();
  const [s2, b2] = await answer(await knock({ op: "refresh" }));
  assert.equal(s2, 200, JSON.stringify(b2));
  assert.deepEqual(b2.read, { ok: true, fresh: 1, counted: 0, answered: 0 });
  assert.equal(b2.connection.sync_error, null, "a sync that succeeds clears the words");
  assert.ok(Date.parse(b2.connection.last_synced_at) >= t0, "the stamp is the successful sync");
  assert.deepEqual(
    [b2.listing.rating, b2.listing.review_count],
    [4.8, 2],
    "the rating and the count as the profile reports them",
  );
  assert.deepEqual(
    net.asked(),
    [
      ["POST", TOKEN_URL],
      ["GET", REVIEWS_URL("accounts/111", "222")],
      ["GET", LOCATION_URL("locations/222")],
    ],
    "a token first, then the reviews as the owner, then, alone, the bound location again for its review link",
  );
  assert.deepEqual(
    toldByTheLink,
    [2, 1],
    "the new review's bell (beside the stopped-syncing notice) and its event were kept before the location was read: the link's read is the sync's last",
  );
  assert.equal(
    tables.google_listings[0].new_review_uri,
    LOC.metadata.newReviewUri,
    "a listing bound before 00415 has its review link at the owner's Sync now",
  );
  assert.equal(net.calls[1].headers.Authorization, "Bearer at-new");
  assert.deepEqual(
    vault.writes.map((w) => [w.tenant, w.secret.refresh_token, w.secret.access_token]),
    [[A, "rt-1", "at-new"]],
    "the fresh access token goes back through the vault door, for next time",
  );
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.review_id, r.origin, r.author]).sort(),
    [
      ["g-1", "profile", "Rosa"],
      ["g-3", "profile", "Luis"],
    ],
    "a read that listed every review: Dana's, which Google no longer shows, is gone from the mirror",
  );
  assert.equal(
    tables.google_reviews.find((r) => r.review_id === "g-1").id,
    R1,
    "the review already on record keeps its row",
  );
  const luis = tables.google_reviews.find((r) => r.review_id === "g-3");
  assert.deepEqual(
    tables.notifications
      .filter((n) => n.kind === "review")
      .map((n) => [n.kind, n.title, n.route, n.subject_type, n.subject_id]),
    [["review", "New on Google: ★★★★★ from Luis", reviewRoute(luis.id), "review", luis.id]],
    "written since the last sync and not on record: news, about the review's row; Rosa's, on record, is not",
  );
  assert.ok(stopped.closed_at, "and the sync that worked closed the stopped-syncing notice (contracts NOTICE_MENDS)");
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data]),
    [["google.reviews", { source: "profile", fresh: 1, counted: 0, rating: 4.8, review_count: 2 }]],
  );
  assert.ok(
    !net.calls.some((c) => c.url.startsWith("https://places.googleapis.com")),
    "with the profile connected the reviews come from there: the public listing is not read here",
  );
  assert.equal(
    tables.google_connections[0].reviews_complete,
    true,
    "Google's list ended on this pass (no page left): the reviews on record are all of them",
  );

  // A location with more reviews than the pages the sync may read: the list does not end, and the record says it is not whole.
  tables.google_reviews.push(
    reviewRow("88888888-8888-4888-8888-888888888888", { review_id: "g-older", author: "Eli", body: "Years ago." }),
  );
  net = wired((req) => {
    const u = req.url.split("?")[0];
    if (u === TOKEN_URL)
      return { status: 200, body: { access_token: "at-newer", expires_in: 3600, scope: SCOPE, token_type: "Bearer" } };
    if (u === REVIEWS_URL("accounts/111", "222"))
      return {
        status: 200,
        body: { reviews: [GBP_REVIEW], averageRating: 4.8, totalReviewCount: 900, nextPageToken: "more" },
      };
    if (u === LOCATION_URL("locations/222")) return { status: 200, body: LOC };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const [s3] = await answer(await knock({ op: "refresh" }));
  assert.equal(s3, 200);
  assert.equal(
    net.calls.filter((c) => c.url.startsWith(REVIEWS_URL("accounts/111", "222"))).length,
    GBP_REVIEWS_MAX_PAGES,
    "the pages it may read, and no more",
  );
  assert.equal(
    tables.google_connections[0].reviews_complete,
    false,
    "Google's list had a page left when the pages ran out: the record is the newest reviews, not every one",
  );
  assert.ok(
    tables.google_reviews.some((r) => r.review_id === "g-older"),
    "a read that did not reach the oldest lets none go: Eli's may still be on Google",
  );
});

test("refresh under the auto mode: the review the receptionist answered rings one bell, under that review, that opens the Reviews lens, and files the reply as the receptionist's", async () => {
  const unanswered = reviewRow(R1, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) });
  const tables = autoModeWorld(unanswered);
  use(tables, new Map([[A, liveCreds()]]));
  const REPLY = "Thank you, Rosa. See you next time.";
  const model = scripted(said(REPLY));
  setModelFetch(model.fetch);
  const net = google({
    reviews: [{ ...GBP_REVIEW, createTime: unanswered.published_at, updateTime: unanswered.published_at }],
  });
  const [status, body] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.read, { ok: true, fresh: 0, counted: 0, answered: 1 });
  assert.equal(model.calls.length, 1, "one draft, for the one review");
  assert.deepEqual(
    net.asked().filter(([method]) => method === "PUT"),
    [["PUT", REPLY_URL("accounts/111", "222", "g-1")]],
    "and its reply posted under Google's name for the review",
  );
  assert.equal(tables.google_reviews.find((r) => r.id === R1).reply_text, REPLY);
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.route, n.subject_type, n.subject_id]),
    [[A, "review", "Replied to Rosa's review", reviewRoute(R1), "review", R1]],
    "one bell, about the review row, that opens the review where the reply is read",
  );
  assert.equal(tables.notifications[0].route, `reports/reviews:${R1}`);
  // The ledger the Reviews report reads who wrote a reply from (reviews_ledger, 00350, joined to this by the database test):
  // the event is the receptionist's, filed under the review row.
  const replied = tables.events.filter((e) => e.kind === "google.replied");
  assert.deepEqual(
    replied.map((e) => [e.tenant_id, e.subject_type, e.subject_id, e.data.review_id, e.data.by, e.data.chars]),
    [[A, "review", R1, "g-1", "receptionist", REPLY.length]],
    "one reply, filed as the receptionist's, with the words' length",
  );
  assert.equal(tables.events.filter((e) => e.kind === "google.reply_held").length, 0, "and none was held");
});

test("refresh under Holds it (decision 0064): the reply is written and held on its review, to post after its wait unless stopped, with one bell that says when; a later sync past its time posts it, and a reply held for naming a price waits for an OK with no time", async () => {
  const unanswered = reviewRow(R1, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) });
  const tables = autoModeWorld(unanswered, "veto");
  use(tables, new Map([[A, liveCreds()]]));
  const REPLY = "Thank you, Rosa. See you next time.";
  setModelFetch(scripted(said(REPLY)).fetch);
  let net = google({
    reviews: [{ ...GBP_REVIEW, createTime: unanswered.published_at, updateTime: unanswered.published_at }],
  });
  const before = Date.now();
  const [status, body] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.read, { ok: true, fresh: 0, counted: 0, answered: 0 }, "nothing posted yet");
  assert.deepEqual(
    net.asked().filter(([method]) => method === "PUT"),
    [],
    "it waits for its time",
  );
  const row = tables.google_reviews.find((r) => r.id === R1);
  assert.equal(row.draft_text, REPLY, "held on its review");
  assert.ok(Date.parse(row.posts_at) >= before + REVIEW_HOLD_MS, "to post after its wait");
  assert.equal(row.reply_text, null);
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.route, n.subject_type, n.subject_id]),
    [["review", reviewRoute(R1), "review", R1]],
    "one bell, about the review, that opens it",
  );
  assert.match(tables.notifications[0].title, /^A reply to Rosa's review posts after /);
  assert.match(tables.notifications[0].body, /Goes after .* unless you stop it\.$/);
  // An hour later the sync finds its time come: it is posted, its hold cleared, filed as the receptionist's.
  row.posts_at = ago(60_000);
  net = google({ reviews: [] });
  const [again] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(again, 200);
  assert.deepEqual(
    net.asked().filter(([method]) => method === "PUT"),
    [["PUT", REPLY_URL("accounts/111", "222", "g-1")]],
  );
  assert.deepEqual([row.reply_text, row.draft_text, row.posts_at], [REPLY, null, null]);
  // A reply that names a price is never posted alone: held for an OK, with no time.
  const priced = autoModeWorld(reviewRow(R2, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) }), "veto");
  use(priced, new Map([[A, liveCreds()]]));
  setModelFetch(scripted(said("Thank you. The full move is $450 and we would be glad to do it again.")).fetch);
  google({ reviews: [{ ...GBP_REVIEW, createTime: ago(2 * HOUR), updateTime: ago(2 * HOUR) }] });
  await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () => answer(await knock({ op: "refresh" })));
  const held = priced.google_reviews.find((r) => r.id === R2);
  assert.deepEqual([held.posts_at, held.reply_text], [null, null], "held for an OK, never posted alone");
  assert.match(held.draft_text, /\$450/);
});

test("refresh under Ask me (decision 0064): the reply is written and held for an OK, never posted alone; a stop of one with no time is no change, and of one under Holds it clears its time", async () => {
  const unanswered = reviewRow(R1, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) });
  const tables = autoModeWorld(unanswered, "ask");
  use(tables, new Map([[A, liveCreds()]]));
  setModelFetch(scripted(said("Thank you, Rosa.")).fetch);
  const net = google({
    reviews: [{ ...GBP_REVIEW, createTime: unanswered.published_at, updateTime: unanswered.published_at }],
  });
  const [status] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(status, 200);
  assert.deepEqual(
    net.asked().filter(([method]) => method === "PUT"),
    [],
  );
  const row = tables.google_reviews.find((r) => r.id === R1);
  assert.deepEqual([row.draft_text, row.posts_at], ["Thank you, Rosa.", null], "held, with no time to go");
  assert.equal(tables.notifications[0].title, "A reply to Rosa's review waits for your approval");
  // Its stop is no change: it has no time to clear.
  const [s1, b1] = await answer(await knock({ op: "hold", id: R1 }));
  assert.deepEqual([s1, b1], [200, { ok: true, held: false }]);
  // One under Holds it is stopped: its time cleared, its words kept for the owner's OK.
  row.posts_at = new Date(Date.now() + REVIEW_HOLD_MS).toISOString();
  const [s2, b2] = await answer(await knock({ op: "hold", id: R1 }));
  assert.deepEqual([s2, b2], [200, { ok: true, held: true }]);
  assert.deepEqual([row.posts_at, row.draft_text], [null, "Thank you, Rosa."]);
});

test("refresh under Never: no reply is written, held or posted, and the model is never asked", async () => {
  // Pinned as review-answers.ts's text in google/review-reply.test.mjs until 26 Nov 2026.
  const unanswered = reviewRow(R1, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) });
  const tables = autoModeWorld(unanswered, "never");
  use(tables, new Map([[A, liveCreds()]]));
  const model = scripted(said("Thank you, Rosa."));
  setModelFetch(model.fetch);
  const net = google({
    reviews: [{ ...GBP_REVIEW, createTime: unanswered.published_at, updateTime: unanswered.published_at }],
  });
  const [status, body] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.read.answered, 0);
  assert.equal(model.calls.length, 0, "the model is not asked");
  assert.deepEqual(
    net.asked().filter(([method]) => method === "PUT"),
    [],
    "nothing posted",
  );
  const row = tables.google_reviews.find((r) => r.id === R1);
  assert.deepEqual([row.draft_text, row.reply_text, row.posts_at], [null, null, null], "nor written, nor held");
  assert.deepEqual(
    tables.notifications.filter((n) => n.kind === "review"),
    [],
    "and nothing to tell",
  );
});

test("a reply is written from the business's own facts: the receptionist's name for it and the number it gives, else the workspace's name", async () => {
  // Pinned as review-answers.ts's text in google/review-reply.test.mjs until 26 Nov 2026.
  const told = async (config) => {
    const unanswered = reviewRow(R1, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) });
    const tables = autoModeWorld(unanswered);
    if (config) tables.tenant_config = [{ tenant_id: A, config }];
    use(tables, new Map([[A, liveCreds()]]));
    const model = scripted(said("Thank you, Rosa."));
    setModelFetch(model.fetch);
    google({ reviews: [{ ...GBP_REVIEW, createTime: unanswered.published_at, updateTime: unanswered.published_at }] });
    await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () => answer(await knock({ op: "refresh" })));
    assert.equal(model.calls.length, 1);
    return JSON.stringify(model.calls[0].body);
  };
  const brain = {
    business_name: "Harbor Moving & Storage",
    phone_display: "(212) 555-0142",
    system_prompt: "Answer as the front desk of Harbor Moving & Storage: brief and warm, and never guess a price.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  const own = await told({ brain });
  assert.ok(own.includes("Harbor Moving & Storage"), "the receptionist's name for the business");
  assert.ok(own.includes("(212) 555-0142"), "and the number it gives");
  const bare = await told(null);
  assert.ok(
    bare.includes("Harbor Moving") && !bare.includes("555-0142"),
    "no receptionist yet: the workspace's own name",
  );
});

test("refresh under the auto mode: a reply that names a price is held, not posted: the review waits for its owner, with the reason filed under it that the Reviews report reads", async () => {
  const unanswered = reviewRow(R1, { published_at: ago(2 * HOUR), first_seen_at: ago(HOUR) });
  const tables = autoModeWorld(unanswered);
  use(tables, new Map([[A, liveCreds()]]));
  const model = scripted(said("Thank you, Rosa. The full move is $450 and we would be glad to do it again."));
  setModelFetch(model.fetch);
  const net = google({
    reviews: [{ ...GBP_REVIEW, createTime: unanswered.published_at, updateTime: unanswered.published_at }],
  });
  const [status, body] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.read, { ok: true, fresh: 0, counted: 0, answered: 0 });
  assert.equal(model.calls.length, 1, "a reply was drafted for the one review");
  assert.deepEqual(
    net.asked().filter(([method]) => method === "PUT"),
    [],
    "and not posted: a price said in public cannot be taken back",
  );
  assert.equal(tables.google_reviews.find((r) => r.id === R1).reply_text, null, "the review waits for a reply");
  assert.deepEqual(tables.notifications, [], "no bell: nothing was answered");
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    [[A, "google.reply_held", "google", "review", R1, { review_id: "g-1", why: "price" }]],
    "the reason filed under the review row, which the report shows beside the review that waits",
  );
});

test("refresh under the auto mode: replies held for their owner never keep older reviews waiting, and one Google refuses gives its place to the next", async () => {
  // The three newest reviews each had a reply held for naming a price: they keep no reply_text, so they come back as
  // unreplied every hour. Three older ones, all on duty and in the window, still wait for an answer.
  const ids = [
    R1,
    R2,
    R3,
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
  ];
  const unanswered = ids.map((id, i) =>
    reviewRow(id, { review_id: `g-${i + 1}`, author: `Author ${i + 1}`, published_at: ago((i + 1) * HOUR) }),
  );
  const tables = autoModeWorld(unanswered[0]);
  tables.google_reviews = unanswered;
  tables.events = ids.slice(0, 3).map((id, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    tenant_id: A,
    kind: "google.reply_held",
    category: "google",
    subject_type: "review",
    subject_id: id,
    data: { review_id: `g-${i + 1}`, why: "price" },
    created_at: ago(30 * 60_000),
  }));
  use(tables, new Map([[A, liveCreds()]]));
  const model = scripted(said("Thank you for coming in. We hope to see you again."));
  setModelFetch(model.fetch);
  google({ reviews: [] });
  // Google refuses the reply under the fourth review (it was taken down, say); the rest it accepts.
  const accepts = wire.answer;
  const asked = [];
  wire.answer = (req) => {
    if (req.method === "PUT") asked.push(req.url.split("/reviews/")[1]);
    return req.method === "PUT" && req.url.endsWith("/reviews/g-4/reply")
      ? refusal(400, "The review is not available.", "FAILED_PRECONDITION")
      : accepts(req);
  };
  const [status, body] = await withEnv({ ANTHROPIC_API_KEY: "model-key-for-this-file" }, async () =>
    answer(await knock({ op: "refresh" })),
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(model.calls.length, 3, "a draft for each of the three older reviews, and none for a held one");
  assert.deepEqual(asked, ["g-4/reply", "g-5/reply", "g-6/reply"], "the refused one gave its place to the next");
  assert.equal(body.read.answered, 2);
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.review_id, r.reply_text !== null]),
    [
      ["g-1", false],
      ["g-2", false],
      ["g-3", false],
      ["g-4", false],
      ["g-5", true],
      ["g-6", true],
    ],
    "the held ones wait for their owner, the refused one for the next hour, and the older two are answered",
  );
});

/* ----------------------------------- reply -------------------------------- */

test("reply: the answer goes to Google as the owner under the review's own name, cleaned as Google accepts it, then onto the row and the ledger; a review the public listing showed, one not on record, a profile not connected and a refusal from Google are each named, and nothing is written for them", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1), reviewRow(R2, { origin: "places", review_id: "p-1" })],
  });
  const creds = new Map([[A, liveCreds()]]);
  use(tables, creds);
  const net = google();
  assert.deepEqual(await answer(await knock({ op: "reply", id: "nope", comment: "Thank you" })), [
    400,
    { ok: false, error: "bad_request", detail: "id (the review's row) is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "reply", id: R1, comment: "   " })), [
    400,
    { ok: false, error: "bad_request", detail: "comment is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "reply", id: R1 })), [
    400,
    { ok: false, error: "bad_request", detail: "comment is required" },
  ]);
  assert.deepEqual(
    await answer(await knock({ op: "reply", id: R2, comment: "Thank you" })),
    [409, { ok: false, error: "not_from_profile" }],
    "a review the public listing showed cannot be answered: its id is Places', not the profile's",
  );
  assert.deepEqual(await answer(await knock({ op: "reply", id: GHOST, comment: "Thank you" })), [
    404,
    { ok: false, error: "no_review" },
  ]);
  assert.equal(net.calls.length, 0, "nothing reached Google for a refusal");

  const COMMENT = "Thank you, Rosa.\nSee you next month.";
  const [status, body] = await answer(
    await knock({ op: "reply", id: R1, comment: "  Thank you, Rosa.  \r\n See you next month. " }),
  );
  assert.deepEqual(
    [status, body],
    [200, { ok: true, reply_text: COMMENT, replied_at: "2026-09-13T15:00:00Z" }],
    "the comment cleaned as Google accepts it; Google's answer as the row's",
  );
  assert.deepEqual(
    net.asked(),
    [["PUT", REPLY_URL("accounts/111", "222", "g-1")]],
    "the review's own name under the connected location; the token in Vault was still good, so no refresh",
  );
  assert.equal(net.calls[0].headers.Authorization, "Bearer at-good");
  assert.deepEqual(JSON.parse(net.calls[0].body), { comment: COMMENT });
  const row = tables.google_reviews.find((r) => r.id === R1);
  assert.deepEqual([row.reply_text, row.replied_at], [COMMENT, "2026-09-13T15:00:00Z"]);
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    [[A, "google.replied", "google", "review", R1, { review_id: "g-1", chars: COMMENT.length }]],
    "the reply on the ledger; the decision naming the person is the dashboard's",
  );
  assert.equal(tables.google_reviews.find((r) => r.id === R2).reply_text, null);

  tables.google_reviews.push(reviewRow(R3, { review_id: "g-3" }));
  wired((req) =>
    req.method === "PUT"
      ? refusal(403, "The caller does not have permission", "PERMISSION_DENIED")
      : (() => {
          throw new Error(`unexpected ${req.method} ${req.url}`);
        })(),
  );
  assert.deepEqual(await answer(await knock({ op: "reply", id: R3, comment: "Thanks" })), [
    502,
    { ok: false, error: "google_refused", detail: "PERMISSION_DENIED: The caller does not have permission" },
  ]);
  assert.equal(
    tables.google_reviews.find((r) => r.id === R3).reply_text,
    null,
    "nothing written for a reply Google did not take",
  );
  assert.equal(tables.events.length, 1);

  const nothing = silent("nothing to post without a connected location");
  use(world({ google_listings: [listingRow()], google_reviews: [reviewRow(R1)] }));
  assert.deepEqual(
    await answer(await knock({ op: "reply", id: R1, comment: "Thanks" })),
    [409, { ok: false, error: "not_connected" }],
    "a listing alone: no profile to answer from",
  );
  use(
    world({
      google_connections: [connRow({ location_name: null, location_title: null })],
      google_reviews: [reviewRow(R1)],
    }),
  );
  assert.deepEqual(
    await answer(await knock({ op: "reply", id: R1, comment: "Thanks" })),
    [409, { ok: false, error: "not_connected" }],
    "connected but no location chosen yet: the same",
  );
  assert.equal(nothing.calls.length, 0);
});

/* ----------------------------------- draft -------------------------------- */

test("draft: the Autonomy row is read first -- Never is a 409 before the review is even read -- then the review; without a model key on this edge the draft says so with a 503, and nothing is posted, written or rung", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1)],
    policies: [
      {
        id: "pol-reviews",
        tenant_id: A,
        class: "reviews",
        mode: "never",
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: ago(0),
      },
    ],
  });
  const { db } = use(tables, new Map([[A, liveCreds()]]));
  const net = silent("a draft never reaches Google, and this edge has no model key");
  assert.deepEqual(await answer(await knock({ op: "draft", id: "nope" })), [
    400,
    { ok: false, error: "bad_request", detail: "id (the review's row) is required" },
  ]);
  assert.deepEqual(
    await answer(await knock({ op: "draft", id: R1 })),
    [409, { ok: false, error: "policy_never", mode: "never" }],
    "the owner said never: refused",
  );
  assert.ok(!db.seen.some((q) => q.table === "google_reviews"), "before the review is read");
  tables.policies[0].mode = "ask";
  assert.deepEqual(await answer(await knock({ op: "draft", id: GHOST })), [404, { ok: false, error: "no_review" }]);
  assert.deepEqual(
    await answer(await knock({ op: "draft", id: R1 })),
    [503, { ok: false, error: "no_model_key" }],
    "no ANTHROPIC_API_KEY on this edge: the draft says so rather than guessing at words",
  );
  tables.policies.length = 0;
  assert.deepEqual(
    await answer(await knock({ op: "draft", id: R1 })),
    [503, { ok: false, error: "no_model_key" }],
    "no Autonomy row reads as ask: a draft on request, nothing posted alone",
  );
  assert.equal(tables.google_reviews[0].reply_text, null, "a draft never posts");
  assert.deepEqual([tables.events, tables.notifications], [[], []]);
  assert.equal(net.calls.length, 0);
});

/* ------------------------------ disconnect, unlink ------------------------ */

test("disconnect gives the grant back, drops the token from Vault, forgets the profile's reviews and the connection, keeps the listing, and says so on the ledger -- honestly about the revoke; unlink disconnects first, then forgets the listing, and the ledger says both", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1), reviewRow(R2, { origin: "places", review_id: "p-1" })],
  });
  const { vault, creds } = use(tables, new Map([[A, liveCreds()]]));
  let net = google();
  assert.deepEqual(await answer(await knock({ op: "disconnect" })), [200, { ok: true, removed: true, revoked: true }]);
  assert.deepEqual(net.asked(), [["POST", REVOKE_URL]]);
  assert.equal(form(net.calls[0]).get("token"), "rt-1", "the refresh token: the whole grant, given back");
  assert.deepEqual([vault.reads, vault.drops], [[A], [A]], "read for the token to revoke, then dropped");
  assert.equal(creds.has(A), false, "gone from Vault");
  assert.deepEqual(tables.google_connections, []);
  assert.deepEqual(
    tables.google_reviews.map((r) => r.review_id),
    ["p-1"],
    "the profile's reviews go with the connection; the public listing's stay",
  );
  assert.equal(tables.google_listings.length, 1, "the listing stays: the public half still works");
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.data]),
    [
      [
        A,
        "google.disconnected",
        "google",
        // Who gave the grant back: the ledger said the profile was disconnected and never whose hand it was.
        { email: "owner@example.com", location: "locations/222", revoked: true, by: U },
      ],
    ],
  );
  assert.deepEqual(
    await answer(await knock({ op: "disconnect" })),
    [200, { ok: true, removed: false, revoked: false }],
    "again: nothing to remove",
  );
  assert.equal(net.calls.length, 1);
  assert.equal(tables.events.length, 1);

  const t2 = world({ google_connections: [connRow()] });
  const w2 = use(t2, new Map([[A, liveCreds()]]));
  wired((req) =>
    req.url === REVOKE_URL
      ? { status: 400, body: { error: "invalid_token" } }
      : (() => {
          throw new Error(`unexpected ${req.method} ${req.url}`);
        })(),
  );
  assert.deepEqual(
    await answer(await knock({ op: "disconnect" })),
    [200, { ok: true, removed: true, revoked: false }],
    "Google would not take the grant back: disconnected all the same, and honest about it",
  );
  assert.deepEqual(
    [t2.google_connections, w2.vault.drops, w2.creds.has(A)],
    [[], [A], false],
    "the token is gone from Vault whatever Google said",
  );
  assert.equal(t2.events[0].data.revoked, false);

  const t3 = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1), reviewRow(R2, { origin: "places", review_id: "p-1" })],
  });
  const w3 = use(t3, new Map([[A, liveCreds()]]));
  net = google();
  assert.deepEqual(await answer(await knock({ op: "unlink" })), [200, { ok: true, removed: true }]);
  assert.deepEqual(
    net.asked(),
    [["POST", REVOKE_URL]],
    "the grant given back on the way: unlinking the listing disconnects the profile first",
  );
  assert.deepEqual([t3.google_connections, t3.google_listings, w3.vault.drops], [[], [], [A]]);
  const gone = writes(w3.db, "google_listings").find((q) => q.op === "delete");
  assert.deepEqual(
    gone.filters,
    [["eq", "tenant_id", A]],
    "the listing row deleted by workspace; its reviews and days go with it by the database's own cascade (00069), which the double does not model",
  );
  assert.deepEqual(
    t3.events.map((e) => [e.kind, e.data]),
    [
      ["google.disconnected", { email: "owner@example.com", location: "locations/222", revoked: true, by: U }],
      ["google.unlinked", { place_id: PLACE, name: "Harbor Moving", had_profile: true, by: U }],
    ],
  );

  const t4 = world({ google_listings: [listingRow()] });
  use(t4);
  const nothing = silent("no profile: nothing to give back");
  assert.deepEqual(await answer(await knock({ op: "unlink" })), [200, { ok: true, removed: true }]);
  assert.deepEqual(t4.google_listings, []);
  assert.deepEqual(
    t4.events.map((e) => [e.kind, e.data.had_profile]),
    [["google.unlinked", false]],
  );
  assert.equal(nothing.calls.length, 0);
  use(world());
  assert.deepEqual(
    await answer(await knock({ op: "unlink" })),
    [200, { ok: true, removed: false }],
    "nothing linked: nothing removed, and no event for it",
  );
});
