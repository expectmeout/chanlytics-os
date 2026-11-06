/**
 * A notice of a review is kept about the review's ROW, and opens that review (the wiring plan's task 5.2, D1-review-twice).
 *
 * The first notices of a new review were kept about Google's own id for it, while the receptionist's reply notice, the reply
 * door, the ledger and the Activity line all name the review by its row: one record under two names, so nothing could tell a
 * notice from the review it told of, and no address could open it. The edge now looks the row up as it keeps the notice, and the
 * notice carries the review's address (contracts reviewRoute). Where the row cannot be found, or the lookup fails, the notice is
 * kept as it was, about Google's id and opening the lens: the bell is best effort, and a sync that has written its reviews does
 * not fail for it. The sync's own notices, over a database in memory, are run in google-door.test.mjs and cron/cron-doors-b.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lensRoute, reviewRoute } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { aboutReview, reviewRowIds } = await importSrc("apps/edge/lib/google/google-rows.ts");

const A = "11111111-1111-4111-8111-111111111111";
const B = "11111111-1111-4111-8111-222222222222";
const ANA = "22222222-2222-4222-8222-222222222221";
const ANA_B = "22222222-2222-4222-8222-222222222222";
const BO = "22222222-2222-4222-8222-222222222223";

const review = (id, tenant, googleId) => ({
  id,
  tenant_id: tenant,
  review_id: googleId,
  origin: "profile",
  rating: 5,
  author: "Ana",
  author_uri: null,
  author_photo_uri: null,
  body: "Careful movers.",
  language_code: null,
  published_at: "2026-10-10T12:00:00Z",
  reply_text: null,
  replied_at: null,
  maps_uri: null,
  first_seen_at: "2026-10-10T13:00:00Z",
  last_seen_at: "2026-10-10T13:00:00Z",
});
const world = () => ({
  google_reviews: [review(ANA, A, "g-ana"), review(BO, A, "g-bo"), review(ANA_B, B, "g-ana")],
});

test("the rows a workspace's reviews are on record under are found by Google's id for each, in that workspace alone", async () => {
  const ids = await reviewRowIds(fakeDb(world()), A, ["g-ana", "g-bo", "g-gone"]);
  assert.deepEqual([...ids.entries()].sort(), [
    ["g-ana", ANA],
    ["g-bo", BO],
  ]);
  assert.deepEqual(
    [...(await reviewRowIds(fakeDb(world()), B, ["g-ana"])).entries()],
    [["g-ana", ANA_B]],
    "another workspace's review of the same Google id is another row",
  );
  assert.equal((await reviewRowIds(fakeDb(world()), A, [])).size, 0, "nothing asked, nothing read");
});

test("a notice is about the review's row and opens it; with no row to find it keeps Google's id and opens the lens; a count is about none", () => {
  const rows = new Map([["g-ana", ANA]]);
  assert.deepEqual(aboutReview(rows, "g-ana"), { route: reviewRoute(ANA), about: { type: "review", id: ANA } });
  assert.equal(reviewRoute(ANA), `reports/reviews:${ANA}`);
  assert.deepEqual(aboutReview(rows, "g-bo"), {
    route: lensRoute("reviews"),
    about: { type: "review", id: "g-bo" },
  });
  assert.deepEqual(aboutReview(rows, null), { route: lensRoute("reviews"), about: null });
});

test("a lookup that fails is no failure of the sync: the notice is kept as it was", async () => {
  const db = fakeDb(world(), { "google_reviews.select": { message: "the database is away" } });
  const ids = await reviewRowIds(db, A, ["g-ana"]);
  assert.equal(ids.size, 0);
  assert.deepEqual(aboutReview(ids, "g-ana"), { route: lensRoute("reviews"), about: { type: "review", id: "g-ana" } });
});
