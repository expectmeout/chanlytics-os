/**
 * What the database's reads and writes of offers by email say when the database answers badly (One message, every channel,
 * step 4; migration 00299). Either deploy order works only where "the column is not there yet" is told apart from "the read
 * failed": the first is a database before 00299, and reads as no pause; the second is "we could not check", which is never
 * "not paused". PostgREST's schema-cache message ("Could not find ... in the schema cache") is the second: a cache that has
 * not caught up with a column that exists, or a fault, and the send door that asked must not send an offer on it.
 * The client is a double that answers what it is told; nothing here reaches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailOffersPause,
  offersEmailReach,
  pauseEmailOffers,
  setEmailOffersYes,
  stopAllMessages,
} from "@chanlytics/db";

/** A client whose mailbox read and rpc answer `{ data, error }` as given; the rpc remembers its calls. */
function client({ read = { data: null, error: null }, rpc = { data: null, error: null } } = {}) {
  const calls = [];
  const db = {
    from: (table) => {
      assert.equal(table, "mailboxes");
      const q = {
        select: (columns) => {
          calls.push(["select", columns]);
          return q;
        },
        eq: () => q,
        maybeSingle: async () => read,
      };
      return q;
    },
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      return rpc;
    },
  };
  return { db, calls };
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const error = (code, message) => ({ data: null, error: { code, message } });

test("the pause reads as none only where Postgres says the pause's own column is not there (42703): any other failed read throws, a schema cache that cannot find it among them", async () => {
  // A database before 00299: the column does not exist, said by Postgres about that column.
  for (const column of ["offers_paused_at", "offers_paused_reason"])
    assert.equal(
      await emailOffersPause(client({ read: error("42703", `column mailboxes.${column} does not exist`) }).db, T),
      null,
      column,
    );
  // The words PostgREST uses for a cache that has not caught up, with and without a code: "we could not check".
  for (const [what, e] of [
    [
      "PostgREST's schema cache (PGRST204)",
      error("PGRST204", "Could not find the 'offers_paused_at' column of 'mailboxes' in the schema cache"),
    ],
    [
      "the same words with no code",
      error(undefined, "Could not find the 'offers_paused_at' column of 'mailboxes' in the schema cache"),
    ],
    ["the words 'does not exist' with no code", error(undefined, "column mailboxes.offers_paused_at does not exist")],
    ["a missing column, but another one (42703)", error("42703", "column mailboxes.something_else does not exist")],
    ["the 42703 code with a message about nothing", error("42703", "an unrelated failure")],
    ["a permission refusal", error("42501", "permission denied for table mailboxes")],
    ["a timeout", error("57014", "canceling statement due to statement timeout")],
    ["a connection that failed", error(undefined, "fetch failed")],
  ])
    await assert.rejects(
      emailOffersPause(client({ read: e }).db, T),
      /cannot read whether offers by email are paused/,
      what,
    );
  // What a database that has the columns says: none, a pause, and a workspace with no mailbox.
  assert.equal(await emailOffersPause(client({ read: { data: null, error: null } }).db, T), null, "no mailbox");
  assert.equal(
    await emailOffersPause(
      client({ read: { data: { offers_paused_at: null, offers_paused_reason: null }, error: null } }).db,
      T,
    ),
    null,
  );
  assert.deepEqual(
    await emailOffersPause(
      client({
        read: { data: { offers_paused_at: "2026-10-01T10:00:00Z", offers_paused_reason: "bounces" }, error: null },
      }).db,
      T,
    ),
    { at: "2026-10-01T10:00:00Z", reason: "bounces" },
  );
});

test("Setup's count is none only where its function is not there yet (PGRST202 or 42883 naming offers_email_reach); any other failure throws", async () => {
  for (const e of [
    error("PGRST202", "Could not find the function public.offers_email_reach(p_tenant_id) in the schema cache"),
    error("42883", "function public.offers_email_reach(uuid) does not exist"),
  ])
    assert.equal(await offersEmailReach(client({ rpc: e }).db, T), null, e.error.code);
  for (const e of [
    error("PGRST202", "Could not find the function public.another_function(p_x) in the schema cache"),
    error("42501", "permission denied for function offers_email_reach"),
    error(undefined, "fetch failed"),
  ])
    await assert.rejects(offersEmailReach(client({ rpc: e }).db, T), /cannot count who an offer by email reaches/);
  assert.equal(await offersEmailReach(client({ rpc: { data: 12, error: null } }).db, T), 12);
  assert.equal(await offersEmailReach(client({ rpc: { data: "12", error: null } }).db, T), null, "not a count: none");
});

test("a pause is written with the counts it was judged by, and answers whether this call paused it", async () => {
  const counts = { complaintSample: 400, complaints: 2, bounceSample: 120, bounces: 1 };
  const c = client({ rpc: { data: true, error: null } });
  assert.equal(await pauseEmailOffers(c.db, { tenantId: T, reason: "complaints", counts }), true);
  assert.deepEqual(c.calls, [
    [
      "rpc",
      "pause_email_offers",
      {
        p_tenant_id: T,
        p_reason: "complaints",
        p_counts: { complaint_sample: 400, complaints: 2, bounce_sample: 120, bounces: 1 },
      },
    ],
  ]);
  assert.equal(
    await pauseEmailOffers(client({ rpc: { data: false, error: null } }).db, {
      tenantId: T,
      reason: "bounces",
      counts,
    }),
    false,
    "already paused: the first moment stands",
  );
  await assert.rejects(
    pauseEmailOffers(client({ rpc: error("42501", "permission denied") }).db, {
      tenantId: T,
      reason: "bounces",
      counts,
    }),
    /cannot pause offers by email/,
  );
});

test("a yes to offers by email says what became of it: recorded, refused because they unsubscribed, or unchanged; and a failed write throws", async () => {
  const yes = (answer) =>
    setEmailOffersYes(client({ rpc: { data: answer, error: null } }).db, {
      tenantId: T,
      contactId: "k1",
      source: "customer_message",
      messageId: null,
      evidence: { channel: "email" },
    });
  assert.equal(await yes({ changed: true, found: true }), "recorded");
  assert.equal(await yes({ changed: false, found: true, refused: "unsubscribed" }), "unsubscribed");
  assert.equal(await yes({ changed: false, found: true }), "unchanged", "already their answer");
  assert.equal(await yes({ changed: false, found: false }), "unchanged", "nobody to write it for");
  assert.equal(await yes(null), "unchanged");
  await assert.rejects(
    setEmailOffersYes(client({ rpc: error("XX000", "boom") }).db, {
      tenantId: T,
      contactId: "k1",
      source: "customer_message",
      messageId: null,
      evidence: {},
    }),
    /cannot record the yes to offers by email/,
  );
  // The other stop, for completeness of this module's reads: a failed write throws, and a repeat is not a change.
  await assert.rejects(
    stopAllMessages(client({ rpc: error("XX000", "boom") }).db, { tenantId: T, contactId: "k1", messageId: null }),
    /cannot record that all messages stop/,
  );
});
