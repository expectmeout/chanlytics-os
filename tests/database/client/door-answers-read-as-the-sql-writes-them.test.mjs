/**
 * The shapes the repositories read a SQL function's answer through (decision 0112) hold every answer that function
 * writes, its refusals and its nulls included: each answer below is the one the function's own `jsonb_build_object`
 * writes (supabase/schema.sql), and none of them may be said as unexpected. A shape that misread its door would fill
 * the log with a false alarm, and hide the real one when the reader starts refusing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { observeDb } from "@chanlytics/db/shared";
import { claimAnthropicProfile } from "@chanlytics/db/ai";
import { openBookingRequest } from "@chanlytics/db/calendar";
import { addReachOutPerson, handRun } from "@chanlytics/db/campaigns";
import { connectMailbox } from "@chanlytics/db/email";
import { beginPeopleErasure } from "@chanlytics/db/erasure";
import { suggestPersonNote } from "@chanlytics/db/facts";
import { chooseLeadAddressee, createLeadPeopleSearch, upsertLeadCompany } from "@chanlytics/db/leads";

const lines = [];
observeDb({
  log: { info: () => {}, warn: (event, fields) => lines.push({ event, ...fields }), error: () => {} },
  requestId: () => "req-1",
});

/** A client whose one function answers this. */
const answering = (data) => ({ rpc: async () => ({ data, error: null }) });

/** Each door's call, and what it makes of the answers its function writes. */
const CASES = [
  {
    door: "anthropic_profile_claim",
    call: (db) => claimAnthropicProfile(db, { kind: "person", userId: "u1" }),
    answers: [
      [
        { id: "p1", reference_id: "r1", onboarded_at: "2026-11-08T00:00:00Z", email: "a@example.com" },
        { id: "p1", referenceId: "r1", onboardedAt: "2026-11-08T00:00:00Z" },
      ],
      [null, null],
    ],
  },
  {
    door: "booking_request_open",
    call: (db) => openBookingRequest(db, { tenantId: "t1", conversationId: "c1", contactId: "p1", words: "" }),
    answers: [
      [
        { appointment: { id: "a1", expires_at: "2026-11-09T00:00:00Z" }, replaced: null, hold: "opened" },
        { hold: "opened", appointmentId: "a1" },
      ],
      [{ error: "too_soon" }, { error: "too_soon" }],
    ],
  },
  {
    door: "reach_out_person",
    call: (db) => addReachOutPerson(db, "t1", "l1"),
    answers: [
      [
        { contact_id: "p1", conversation_id: "c1", made: true },
        { ok: true, contactId: "p1", conversationId: "c1", made: true },
      ],
      [{ refused: "erased" }, { ok: false, refused: "erased" }],
    ],
  },
  {
    door: "reach_out_hand_run",
    call: (db) => handRun(db, { tenantId: "t1", stepId: "s1", runId: "r1", day: "2026-11-08", items: [] }),
    answers: [
      [
        { run_id: "r1", made: 2, already: 1 },
        { made: 2, already: 1 },
      ],
    ],
  },
  {
    door: "mailbox_connection_connect",
    call: (db) => connectMailbox(db, { tenantId: "t1", scopes: [] }),
    answers: [
      [
        { id: "m1", made: false, state: "connected" },
        { ok: true, id: "m1", made: false, state: "connected" },
      ],
    ],
  },
  {
    door: "people_erase_begin",
    call: (db) => beginPeopleErasure(db, { tenantId: "t1", ids: ["p1"], notAPerson: false }),
    // No one going leaves its array unset, and to_jsonb of that is null.
    answers: [
      [
        { going: null, no_address: ["p2"] },
        { going: [], noAddress: ["p2"] },
      ],
    ],
  },
  {
    door: "person_note_suggest",
    call: (db) => suggestPersonNote(db, { tenantId: "t1", contactId: "p1", body: "x", source: "call", sourceId: null }),
    answers: [
      [{ note: { id: "n1", body: "x", state: "suggested" } }, { noteId: "n1" }],
      [{ error: "too_many" }, { refused: "too_many" }],
    ],
  },
  {
    door: "lead_people_search_create",
    call: (db) => createLeadPeopleSearch(db, { tenantId: "t1", plan: {}, via: "ask", estimateUsd: 1, threadId: null }),
    answers: [
      [
        { search_id: "s1", round_id: "r1" },
        { search_id: "s1", round_id: "r1" },
      ],
      [
        { error: "paused", sentence: "Paused." },
        { error: "paused", sentence: "Paused." },
      ],
    ],
  },
  {
    door: "lead_addressee_choose",
    call: (db) => chooseLeadAddressee(db, { leadId: "l1", person: 1 }),
    answers: [
      [
        { ok: true, addressee: 1, email_state: "checking", version: 4 },
        { data: { ok: true, addressee: 1, email_state: "checking", version: 4 }, error: null },
      ],
      [{ error: "gone" }, { data: { error: "gone" }, error: null }],
      [null, { data: { error: "no_answer" }, error: null }],
    ],
  },
  {
    door: "lead_company_upsert",
    call: (db) => upsertLeadCompany(db, "r1", []),
    answers: [
      [
        { made: 3, held: 1, left_out: 0 },
        { made: 3, held: 1, left_out: 0 },
      ],
      // A round gone answers none of the counts.
      [
        { ok: false, why: "round" },
        { made: 0, held: 0, left_out: 0 },
      ],
    ],
  },
];

for (const { door, call, answers } of CASES) {
  test(`${door}: each answer it writes reads as it should, and nothing is said`, async () => {
    for (const [answer, read] of answers) {
      lines.length = 0;
      assert.deepEqual(await call(answering(answer)), read);
      assert.deepEqual(lines, []);
    }
  });
}

test("an answer outside its door's shape is said, by the function and the field, and still read as it came", async () => {
  lines.length = 0;
  const going = await beginPeopleErasure(answering({ going: "p1", no_address: [] }), {
    tenantId: "t1",
    ids: ["p1"],
    notAPerson: false,
  });
  assert.deepEqual(going, { going: "p1", noAddress: [] });
  assert.deepEqual(lines, [
    { event: "rpc_answer_unexpected", fn: "people_erase_begin", fields: ["going"], request_id: "req-1" },
  ]);
});
