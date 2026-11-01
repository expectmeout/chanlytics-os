/**
 * erasure_finish, the job (packages/jobs/src/erasure.ts), run through the dispatcher over a database in memory: a
 * stopped erasure finishes without a second press (decision 0036; 00501).
 *
 * Every press puts the finish on the ledger beside the block, due once the press has had time to end. A press that
 * ended well had erase_contact withdraw it with every other scheduled job naming the person; one that stopped at a
 * fail-closed leg, or died, left the person blocked (erasing_since) and the finish to run. The finish runs the same
 * erasure the press ran, on the service role, which the rows leg and the Ask scrub admit for a person whose block an
 * owner's press wrote; a person already erased has the id-keyed legs run again; one never blocked is nobody's press.
 * A throw is the next try's (ledger RETRY_WAITS_MS). erasure-door.test.mjs holds the press's side: the finish
 * scheduled, and what the owner is told.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
import { LEASE_SECONDS, MAX_ATTEMPTS, RETRY_WAITS_MS } from "../../../../packages/jobs/src/ledger.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";

/** A scrub the database refused. */
const refused = () => {
  throw new Error("refused");
};

/**
 * The finish job for P1 over a world: `contact` as the press left them, a finished job that carried their number, a
 * policy row. The fake is the service role's client; `rpcs` override the legs' functions.
 */
async function finish({ contact, faults = {}, rpcs = {}, payload = { contact_id: P1 }, tenantId = T } = {}) {
  const tables = {
    contacts: contact ? [contact] : [],
    contact_identities: [],
    calls: [],
    messages: [],
    jobs: [{ id: "j1", tenant_id: T, state: "done", payload: { to_phone: "+15550100123", body: "hello" } }],
    policies: [{ tenant_id: T, class: "reply", subject_type: "contact", subject_id: P1, mode: "off" }],
    decisions: [],
  };
  const db = fakeDb(tables, faults, {
    scrub_ask_for_contact: () => 2,
    provider_events_scrub: () => 1,
    person_notes_scrub: () => 1,
    model_turns_scrub: () => 1,
    appointments_scrub: () => 1,
    erase_contact: () => ({ counts: { calls: 0 }, storage_paths: [], jobs_canceled: 0 }),
    ...rpcs,
  });
  const out = await dispatchJob(
    { db },
    { id: "f1", tenant_id: tenantId, kind: "erasure_finish", payload, attempts: 1 },
  ).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const steps = db.seen
    .filter((s) => s.rpc || ["insert", "update", "delete"].includes(s.op))
    .map((s) => (s.rpc ? `rpc:${s.rpc}` : `${s.table}.${s.op}`));
  return { ...out, steps, tables };
}

const blocked = () => ({
  id: P1,
  tenant_id: T,
  phone_e164: "+15550100123",
  email: "Ada@Example.com",
  erased_at: null,
  erasing_since: "2026-10-31T10:00:00.000Z",
});

test("a person a press left blocked is erased by the finish, in the design's order, on the service role, with no second finish scheduled", async () => {
  const { value, error, steps, tables } = await finish({ contact: blocked() });
  assert.equal(error, undefined, error?.message);
  assert.equal(value, "done");
  assert.deepEqual(steps, [
    "rpc:erasure_digests", // the block again, idempotent: the digests were written by the press
    "contacts.update",
    "rpc:scrub_ask_for_contact", // the copies keyed on the number, which the row still holds
    "jobs.update", // the finished job
    "rpc:provider_events_scrub",
    "rpc:person_notes_scrub",
    "rpc:model_turns_scrub",
    "rpc:erase_contact", // the rows, as the service role, admitted for a person whose block an owner wrote
    "policies.delete",
    "rpc:scrub_ask_for_contact",
    "rpc:provider_events_scrub",
    "rpc:person_notes_scrub",
    "rpc:model_turns_scrub",
    "rpc:appointments_scrub",
  ]);
  assert.ok(!steps.includes("jobs.insert"), "the finish schedules no finish of its own: its tries are the ledger's");
  assert.equal(tables.policies.length, 0);
  assert.equal(tables.jobs[0].payload.reason, "contact erased");
});

test("a person already erased has the id-keyed legs run again, and nothing destroyed twice", async () => {
  const { value, steps } = await finish({
    contact: { ...blocked(), phone_e164: null, email: null, erased_at: "2026-10-31T10:00:05.000Z" },
  });
  assert.equal(value, "done");
  // The finished job here names them by their number alone, which a re-drive has no digits to find by (erase_contact
  // scrubbed the number off the row): the jobs leg runs and overwrites nothing.
  assert.deepEqual(steps, ["policies.delete", "rpc:scrub_ask_for_contact", "rpc:appointments_scrub"]);
});

test("nobody's press is finished: a person never blocked, one not found, one of another workspace, a payload naming none", async () => {
  for (const [why, world] of [
    ["never blocked", { contact: { ...blocked(), erasing_since: null } }],
    ["not found", { contact: null }],
    ["another workspace's", { contact: blocked(), tenantId: OTHER }],
  ]) {
    const { value, error, steps } = await finish(world);
    assert.equal(error, undefined, `${why}: ${error?.message}`);
    assert.equal(value, "done", why);
    assert.deepEqual(steps, [], `${why}: nothing written`);
  }
  const { error } = await finish({ contact: blocked(), payload: {} });
  assert.match(error.message, /names no contact/, "a payload naming nobody is a throw, never a silent done");
});

test("a leg that stops the finish is the next try's: a throw, and waits that outlast the lease", async () => {
  const { error, steps, tables } = await finish({ contact: blocked(), rpcs: { model_turns_scrub: refused } });
  assert.ok(error, "the stop is thrown to the ledger");
  assert.match(error.message, /kept turns that named this person could not be scrubbed/);
  assert.ok(!steps.includes("rpc:erase_contact"), "the rows are untouched");
  assert.equal(tables.contacts[0].erasing_since, "2026-10-31T10:00:00.000Z", "the person stays blocked meanwhile");
  const waits = RETRY_WAITS_MS.erasure_finish;
  assert.ok(waits?.length, "erasure_finish is tried again after a throw");
  assert.ok(waits.length <= MAX_ATTEMPTS - 1);
  assert.ok(
    waits.every((w) => w > LEASE_SECONDS * 1000),
    "each wait outlasts the lease",
  );
});
