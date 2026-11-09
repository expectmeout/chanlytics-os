/**
 * Who never hears from you: the stop list, counted. Its rows are scrambled, so the page can say how many and never who.
 * A person who said no leaves one row for their address and one for their company, so people are counted by address.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { countLeadSuppressions } from "@chanlytics/db/leads";
import { fakeDb } from "../../_fake-db.mjs";

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const row = (tenant_id, kind, what, hash) => ({ tenant_id, kind, what, hash });

test("said no and asked to stop are counted by address, one person each", async () => {
  const db = fakeDb({
    lead_suppressions: [
      row(T, "email", "said_no", "a"),
      row(T, "domain", "said_no", "a-company"),
      row(T, "email", "said_no", "b"),
      row(T, "domain", "said_no", "b-company"),
      row(T, "email", "email_opt_out", "c"),
    ],
  });
  assert.deepEqual(await countLeadSuppressions(db, T), { said_no: 2, asked_to_stop: 1 });
});

test("an erasure and a customer are not said here: one is a promise to forget, the other always holds", async () => {
  const db = fakeDb({
    lead_suppressions: [
      row(T, "email", "erased", "a"),
      row(T, "email", "customer", "b"),
      row(T, "place", "customer", "c"),
    ],
  });
  assert.deepEqual(await countLeadSuppressions(db, T), { said_no: 0, asked_to_stop: 0 });
});

test("another workspace's list is never counted", async () => {
  const db = fakeDb({ lead_suppressions: [row(OTHER, "email", "said_no", "a")] });
  assert.deepEqual(await countLeadSuppressions(db, T), { said_no: 0, asked_to_stop: 0 });
});
