/**
 * Erasing a person scrubs every finished job that carried them, however many jobs the workspace has, and whichever
 * channel carried them.
 *
 * It did not, twice over (the scorecard of 26 September 2026). The scrub read the workspace's jobs in one select,
 * and PostgREST answers any select with at most 1,000 rows, silently: in a workspace past its thousandth job the
 * rest were never looked at, so an erased person's number and words stayed in the payloads of the jobs that sent
 * to them. Jobs are never purged, so every busy workspace passes a thousand. And it matched a job by the contact
 * id or by the number, while an email send carries neither: `to_email` and the body, so an erasure left the
 * person's address and every email the receptionist wrote them.
 *
 * Run over the fake database with PostgREST's cap on (maxRows), through the real scrub on the service client.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { scrubErasedJobs, FINISHED_JOB_STATES } = await import(at("apps/dashboard/src/server/people/erasure.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));

const TENANT = "00000000-0000-4000-8000-000000000001";
const OTHER_TENANT = "00000000-0000-4000-8000-000000000002";
const PERSON = "00000000-0000-4000-8000-0000000000aa";
const NUMBER = "+15550100001";
const DIGITS = "15550100001";
const ADDRESS = "ada@example.com";

const id = (n) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
/** Someone else's send: never touched. */
const noise = (n) => ({
  id: id(n),
  tenant_id: TENANT,
  kind: "outbound_send",
  state: "done",
  payload: { to_phone: "+15550100999", body: `someone else ${n}` },
});

/** A workspace with `before` other jobs first, then the person's own. */
function world(before, own, { maxRows = 1000 } = {}) {
  const jobs = [...Array.from({ length: before }, (_, i) => noise(i + 1)), ...own];
  const db = fakeDb({ jobs }, {}, {}, { maxRows });
  setServiceClient(db);
  return { jobs };
}
const payloadOf = (jobs, jid) => jobs.find((j) => j.id === jid).payload;
const scrubbed = (p) => typeof p.scrubbed_at === "string" && p.reason === "contact erased" && !("body" in p);

test("a job past the workspace's thousandth is scrubbed like the first", async () => {
  const late = {
    id: id(5000),
    tenant_id: TENANT,
    kind: "outbound_send",
    state: "done",
    payload: { to_phone: NUMBER, body: "your appointment" },
  };
  const { jobs } = world(2500, [late]);
  try {
    const n = await scrubErasedJobs(TENANT, PERSON, [DIGITS]);
    assert.equal(n, 1, "the one job that carried the number");
    assert.ok(scrubbed(payloadOf(jobs, late.id)), "its number and words are gone");
    assert.equal(payloadOf(jobs, id(1)).body, "someone else 1", "no one else's job is touched");
  } finally {
    setServiceClient(null);
  }
});

test("only the finished states are read when the caller names them, and still every page of them", async () => {
  const done = {
    id: id(3001),
    tenant_id: TENANT,
    kind: "outbound_send",
    state: "failed",
    payload: { to_phone: NUMBER, body: "x" },
  };
  const queued = {
    id: id(3002),
    tenant_id: TENANT,
    kind: "outbound_send",
    state: "queued",
    payload: { to_phone: NUMBER, body: "y" },
  };
  const { jobs } = world(1500, [done, queued]);
  try {
    const n = await scrubErasedJobs(TENANT, PERSON, [DIGITS], FINISHED_JOB_STATES);
    assert.equal(n, 1);
    assert.ok(scrubbed(payloadOf(jobs, done.id)));
    assert.equal(
      payloadOf(jobs, queued.id).body,
      "y",
      "a job still to run is erase_contact's to cancel, not this pass's",
    );
  } finally {
    setServiceClient(null);
  }
});

test("an email the receptionist sent them is scrubbed by its address, which it carries in place of a number", async () => {
  const mail = {
    id: id(4001),
    tenant_id: TENANT,
    kind: "outbound_send",
    state: "done",
    payload: { to_email: ADDRESS, body: "the quote you asked for" },
  };
  const shouted = {
    id: id(4002),
    tenant_id: TENANT,
    kind: "outbound_send",
    state: "done",
    payload: { to_email: " Ada@Example.com ", body: "z" },
  };
  const stranger = {
    id: id(4003),
    tenant_id: TENANT,
    kind: "outbound_send",
    state: "done",
    payload: { to_email: "bo@example.com", body: "not theirs" },
  };
  const { jobs } = world(10, [mail, shouted, stranger]);
  try {
    const n = await scrubErasedJobs(TENANT, PERSON, [DIGITS, ADDRESS]);
    assert.equal(n, 2, "their two emails, however the address was cased");
    assert.ok(scrubbed(payloadOf(jobs, mail.id)));
    assert.ok(scrubbed(payloadOf(jobs, shouted.id)));
    assert.equal(payloadOf(jobs, stranger.id).body, "not theirs");
  } finally {
    setServiceClient(null);
  }
});

test("the contact id still finds a job with neither a number nor an address, in this workspace only", async () => {
  const policy = {
    id: id(6001),
    tenant_id: TENANT,
    kind: "person_policy",
    state: "done",
    payload: { contact_id: PERSON, mode: "ask" },
  };
  const elsewhere = {
    id: id(6002),
    tenant_id: OTHER_TENANT,
    kind: "outbound_send",
    state: "done",
    payload: { to_phone: NUMBER, body: "another workspace's" },
  };
  const { jobs } = world(1200, [policy, elsewhere]);
  try {
    const n = await scrubErasedJobs(TENANT, PERSON, []);
    assert.equal(n, 1);
    assert.ok(scrubbed(payloadOf(jobs, policy.id)));
    assert.equal(payloadOf(jobs, elsewhere.id).body, "another workspace's", "a scrub never reaches past its workspace");
  } finally {
    setServiceClient(null);
  }
});

test("a read that fails is a failure the route can refuse on, never a scrub believed whole", async () => {
  setServiceClient(fakeDb({ jobs: [] }, { "jobs.select": { message: "the database is away" } }));
  try {
    await assert.rejects(() => scrubErasedJobs(TENANT, PERSON, [DIGITS]), /scrub_jobs_read: the database is away/);
  } finally {
    setServiceClient(null);
  }
});
