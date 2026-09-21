/**
 * A line is provisioned on the ledger: the handler is the durable part and
 * the saga is injected. Run here against fakes: the handler with a fake
 * context, the edge's port with a fake database and a fake saga.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JOB_KINDS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { provisionLineJob } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/line-provision-job.ts")).href);
const { dispatchJob, verdictFor, MAX_ATTEMPTS } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

const ctx = (provisionLine) => ({ db: fakeDb({}), wire: {}, alert: async () => {}, schedule: async () => {}, deadline: Date.now() + 60_000, provisionLine });
const job = (payload) => ({ id: "j1", tenant_id: "t1", kind: "line_provision", payload });

test("the kind is declared, and it is internal work: tried again up to the cap, then given up", () => {
  assert.ok(JOB_KINDS.includes("line_provision"));
  assert.equal(verdictFor({ kind: "line_provision", attempts: 1 }), "run");
  assert.equal(verdictFor({ kind: "line_provision", attempts: MAX_ATTEMPTS }), "run");
  assert.equal(verdictFor({ kind: "line_provision", attempts: MAX_ATTEMPTS + 1 }), "give_up");
});

test("the handler hands the line to the injected saga and is done; a saga that stopped fails the job with the step", async () => {
  const calls = [];
  const ok = await dispatchJob(ctx(async (lineId, by) => { calls.push([lineId, by]); return { ok: true, did: "ran" }; }), job({ line_id: "l1", by: "owner" }));
  assert.equal(ok, "done");
  assert.deepEqual(calls, [["l1", "owner"]]);
  await assert.rejects(
    () => dispatchJob(ctx(async () => ({ ok: false, step: "trunk", error: "the carrier said no", did: "ran" })), job({ line_id: "l1", by: "sweep" })),
    /line_provision: stopped at trunk: the carrier said no/,
  );
  await assert.rejects(() => dispatchJob(ctx(undefined), job({ line_id: "l1" })), /holds no line provider/);
  await assert.rejects(() => dispatchJob(ctx(async () => ({ ok: true, did: "ran" })), job({})), /line_id is required/);
});

/* ---- the edge's port: what the row says decides the run ---- */
const line = (voice_state, over = {}) => ({ id: "l1", tenant_id: "t1", e164: "+13055550101", kind: "chanlytics", provider: "dry", voice_state, sms_state: "none", step: "trunk", last_error: null, state_since: new Date(Date.now() - 60_000).toISOString(), facts: {}, subaccount_sid: "AC1", number_sid: null, trunk_sid: null, ...over });
const tenant = { id: "t1", name: "Harbor Nails", slug: "harbor" };
const deps = (provision, env = { apiKey: "k", fnSecret: "s" }) => ({
  provider: () => ({ name: "dry", provider: {}, master: {} }),
  env,
  provision,
  now: () => Date.now(),
});

test("a provisioning row is run as whoever asked; an answering or released one is nothing to do", async () => {
  const ran = [];
  const db = fakeDb({ lines: [line("provisioning")], tenants: [tenant] });
  const r = await provisionLineJob(db, "l1", "owner", deps(async (_db, _c, _cfg, _s, t, l, by) => { ran.push([t.id, l.id, by]); return { ok: true }; }));
  assert.deepEqual(r, { ok: true, did: "ran" });
  assert.deepEqual(ran, [["t1", "l1", "owner"]]);
  const idle = await provisionLineJob(fakeDb({ lines: [line("answering")], tenants: [tenant] }), "l1", "owner", deps(async () => { throw new Error("must not run"); }));
  assert.deepEqual(idle, { ok: true, did: "nothing", why: "answering" });
  const gone = await provisionLineJob(fakeDb({ lines: [], tenants: [tenant] }), "l1", "owner", deps(async () => { throw new Error("must not run"); }));
  assert.deepEqual(gone, { ok: true, did: "nothing", why: "released" });
});

test("a failed row is an automatic resume: taken exclusively, counted, bounded", async () => {
  const seen = [];
  const db = fakeDb({ lines: [line("failed")], tenants: [tenant] });
  const r = await provisionLineJob(db, "l1", "owner", deps(async (_db, _c, _cfg, _s, _t, l, by) => { seen.push([l.voice_state, by]); return { ok: true }; }));
  assert.equal(r.did, "resumed");
  assert.deepEqual(seen, [["provisioning", "sweep"]], "taken first, and it is the ledger's try, not a person's");
  const spent = await provisionLineJob(fakeDb({ lines: [line("failed", { facts: { automatic_resumes: 3 } })], tenants: [tenant] }), "l1", "owner", deps(async () => { throw new Error("must not run"); }));
  assert.equal(spent.ok, false);
  assert.match(spent.error, /exhausted/);
  assert.equal(spent.did, "nothing");
});

test("no provider or no credentials is a refusal the job carries, not a guess", async () => {
  const db = fakeDb({ lines: [line("provisioning")], tenants: [tenant] });
  const noKey = await provisionLineJob(db, "l1", "owner", deps(async () => ({ ok: true }), { apiKey: undefined, fnSecret: "s" }));
  assert.deepEqual(noKey, { ok: false, error: "no_provider_key", did: "nothing", why: "no credentials" });
  const noProvider = await provisionLineJob(db, "l1", "owner", { ...deps(async () => ({ ok: true })), provider: () => null });
  assert.equal(noProvider.error, "no_line_provider");
});

test("the ledger's automatic resume is COUNTED, so the ceiling it is bounded by can actually be reached", async () => {
  // The header claimed these resumes were "counted and bounded exactly as the
  // sweep's are" and only the sweep counted. `facts.automatic_resumes` stayed
  // 0 on this path for ever, so the ceiling below never tripped: a line that
  // can never finish -- a carrier slow every time, a step that always times
  // out -- was retried by the ledger indefinitely, and each retry is another
  // run of provider calls, another "your phone line hit a snag" bell for the
  // owner, and another platform email.
  const tables = { lines: [line("failed")], tenants: [tenant] };
  const db = fakeDb(tables);
  const r = await provisionLineJob(db, "l1", "sweep", deps(async () => ({ ok: true })));
  assert.deepEqual(r, { ok: true, did: "resumed" });
  assert.equal(tables.lines[0].facts.automatic_resumes, 1, "the try is on the row");

  // And it accumulates, rather than each run starting the count again.
  tables.lines[0].voice_state = "failed";
  await provisionLineJob(db, "l1", "sweep", deps(async () => ({ ok: true })));
  assert.equal(tables.lines[0].facts.automatic_resumes, 2);
});

test("at the ceiling the ledger stops resuming and hands the line to a person", async () => {
  const tables = { lines: [line("failed", { facts: { automatic_resumes: 3 } })], tenants: [tenant] };
  const r = await provisionLineJob(fakeDb(tables), "l1", "sweep", deps(async () => { throw new Error("must not run"); }));
  assert.equal(r.ok, false);
  assert.equal(r.did, "nothing");
  assert.equal(r.why, "exhausted");
  assert.match(r.error, /a person retries it from Setup/);
});

