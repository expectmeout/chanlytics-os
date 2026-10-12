/**
 * What db reviewLinkOf says when the database answers badly (00415, a listing keeps its review link). Either deploy order
 * works only where "the column is not there yet" is told apart from "the read failed": the first is a database before
 * 00415 and reads as no link, so a send holds its review-ask people and the composer's refusal says to connect the
 * listing; the second is "we could not read it", which is never "there is none". The client is a double that answers what
 * it is told; nothing here reaches a database (review-link.db.test.mjs does).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewLinkOf } from "@chanlytics/db";

/** A client whose listing read answers `{ data, error }` as given, and remembers what it asked. */
function client(read) {
  const asked = [];
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
        maybeSingle: async () => read,
      };
      return q;
    },
  };
  return { db, asked };
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const error = (code, message) => ({ data: null, error: { code, message } });

test("reviewLinkOf reads the workspace's listing's one column, and answers its link, trimmed, or none", async () => {
  const link = "https://example.com/review/harbor-studio";
  const read = client({ data: { new_review_uri: `  ${link} ` }, error: null });
  assert.equal(await reviewLinkOf(read.db, T), link);
  assert.deepEqual(read.asked, [
    ["from", "google_listings"],
    ["select", "new_review_uri"],
    ["eq", "tenant_id", T],
  ]);
  assert.equal(await reviewLinkOf(client({ data: { new_review_uri: null }, error: null }).db, T), null);
  assert.equal(await reviewLinkOf(client({ data: { new_review_uri: "   " }, error: null }).db, T), null);
  assert.equal(await reviewLinkOf(client({ data: null, error: null }).db, T), null, "no listing, no link");
});

test("reviewLinkOf reads as none only where Postgres says its own column is not there (42703): any other failed read throws, a schema cache that cannot find it among them", async () => {
  assert.equal(
    await reviewLinkOf(client(error("42703", "column google_listings.new_review_uri does not exist")).db, T),
    null,
    "a database before 00415",
  );
  for (const [what, e] of [
    ["another column", error("42703", "column google_listings.maps_uri does not exist")],
    [
      "PostgREST's schema cache (PGRST204)",
      error("PGRST204", "Could not find the 'new_review_uri' column of 'google_listings' in the schema cache"),
    ],
    ["a statement timeout", error("57014", "canceling statement due to statement timeout")],
  ])
    await assert.rejects(reviewLinkOf(client(e).db, T), /cannot read the workspace's review link/, what);
});
