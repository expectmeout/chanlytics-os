/**
 * An ordinary failure of a job ends somewhere with a way back (the plan "Prove it works", lane 7, item 7): a provider
 * down, a quota spent, a sign-in gone stale. Every kind the ledger knows is run here by the real tick against a provider
 * that throws each time, and where it ends is read: tried again as its policy says, then failed with its owner told,
 * the platform paged, what it left settled, or a net this file names that tells the right person. Never a job that
 * fails for good and says nothing to anyone.
 *
 * The list of nets is the review: a kind that tells "elsewhere" and settles nothing must say here who does tell. A new
 * kind of that sort fails this file until its net is written down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPORT_STOPPED_WORDS } from "@chanlytics/contracts";
import { KIND_POLICY, MAX_ATTEMPTS, SETTLERS, settleJob } from "@chanlytics/jobs";
import { fakeDb } from "../../_fake-db.mjs";
import { claimDue, ledgerWorld, throughDispatch } from "./_kill-at.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Who tells, for a kind whose failure rings no bell, pages nobody and leaves nothing for the ledger to settle: each
 * read in the code on 28 Nov 2026.
 */
const TOLD_BY = {
  inbound_answer:
    "the deadman sweep: a customer's message accepted and never answered is opened for a person, with their words (apps/edge/lib/receptionist/unfinished.ts)",
  file_fetch:
    "the Content page's own line for the road it came by, which stops saying Looking by itself; a link pasted again asks again (apps/edge/lib/files/found.ts)",
  file_purge:
    "Health counts it, and the files sweep asks for a removal not finished again for a week (apps/edge/lib/files/upkeep.ts)",
  post_observe:
    "the piece says that step's numbers could not be read, and the next step reads again (apps/edge/lib/content/results-upkeep.ts)",
  canary: "Health says the ledger's own check stopped finishing (sweep_status, /api/health)",
};

/** A payload its kind can run on: every id it must name, named. */
const payloadOf = (kind) => Object.fromEntries(KIND_POLICY[kind].ids.map((id) => [id, `${id}-1`]));

for (const [kind, policy] of Object.entries(KIND_POLICY)) {
  test(`${kind}: a provider that is down every time ends with ${policy.told === "owner" ? "its owner told" : policy.told === "platform" ? "the platform paged" : policy.settles === "ledger" ? "what it left settled" : "its net"}`, async () => {
    const tables = { jobs: [] };
    const settled = [];
    const world = ledgerWorld(fakeDb(tables, {}, { claim_due_jobs: (args) => claimDue(tables.jobs, args) }), {
      dispatch: () => async () => {
        throw new Error("the provider did not answer");
      },
      // Each kind's own settle is proven with its record (settle-every-ending.test.mjs and its domain's tests): here,
      // that the ledger reached it.
      settle: async (_db, job) => {
        settled.push(job.kind);
        return [];
      },
    });
    await world.putAgain({ tenantId: T, kind, dueAt: new Date(Date.now() - 1000), payload: payloadOf(kind) });
    await world.untilQuiet();
    const [job] = await world.jobs();
    assert.equal(job.state, "failed", "it ends: never left waiting or running");
    // A kind that speaks is never tried again after a throw; any other as often as its waits say, within the cap.
    const tries = policy.speaks ? 1 : Math.min(policy.retryWaitsMs.length + 1, MAX_ATTEMPTS);
    assert.equal(job.attempts, tries, `tried ${tries} time${tries === 1 ? "" : "s"}, as its policy says`);
    assert.match(job.last_error, /the provider did not answer/, "and its row keeps why");
    assert.deepEqual(settled, [kind], "what it left is the ledger's to settle, once");
    if (policy.told === "owner") assert.equal(world.told.length, 1, "its owner is told, once");
    else assert.equal(world.told.length, 0, "no owner's bell rings for what an owner cannot act on");
    if (policy.told === "platform") assert.ok(world.paged.length >= 1, "the platform is paged");
    if (policy.told === "elsewhere" && policy.settles === "nothing")
      assert.ok(TOLD_BY[kind], `${kind} tells nobody from the ledger and settles nothing: say here who does tell`);
  });
}

test("the list of nets names only kinds that need one", () => {
  const need = Object.entries(KIND_POLICY)
    .filter(([, p]) => p.told === "elsewhere" && p.settles === "nothing")
    .map(([kind]) => kind)
    .sort();
  assert.deepEqual(Object.keys(TOLD_BY).sort(), need);
  // And a kind that says the ledger settles what it leaves has a settler to do it.
  for (const [kind, policy] of Object.entries(KIND_POLICY))
    assert.equal(SETTLERS[kind] !== null, policy.settles === "ledger", `${kind}: settles ${policy.settles}`);
});

/* --------------------------------------------------------------------------- one that ended in silence, mended -- */

test("an Instagram read whose job ended for good says it stopped on its line, with nothing lost", async () => {
  // Its provider down for every try, or its run dead: the line said it was still reading, until the page gave up on it.
  const noted = [];
  const db = fakeDb({}, {}, { import_ledger_note: (a) => (noted.push(a), null) });
  const out = await settleJob(
    db,
    { id: "j", kind: "instagram_read", tenant_id: T, payload: { handle: "harbor", step: "collect", try: "2" } },
    false,
  );
  assert.deepEqual(out, [{ what: "import", changed: true }]);
  assert.equal(noted.length, 1);
  assert.deepEqual(
    [noted[0].p_source, noted[0].p_state, noted[0].p_via, noted[0].p_error, noted[0].p_add],
    ["instagram", "failed", "harbor", IMPORT_STOPPED_WORDS.failed, true],
    "the account's own line, stopped, in the words every stopped import says, and what came is kept",
  );
});

test("an Instagram read that names no account has no line to say it on", async () => {
  const db = fakeDb({}, {}, { import_ledger_note: () => null });
  const out = await settleJob(db, { id: "j", kind: "instagram_read", tenant_id: T, payload: {} }, false);
  assert.deepEqual(out, [{ what: "import", changed: false, error: "no account on the job" }]);
});

test("through the ledger: three tries against a provider that is down, then the line says it stopped", async () => {
  const tables = { jobs: [] };
  const noted = [];
  const world = ledgerWorld(
    fakeDb(
      tables,
      {},
      { claim_due_jobs: (args) => claimDue(tables.jobs, args), import_ledger_note: (a) => (noted.push(a), null) },
    ),
    {
      dispatch: throughDispatch(() => ({
        instagram: {
          read: async () => {
            throw new Error("apify: 503");
          },
        },
      })),
    },
  );
  await world.put({
    tenantId: T,
    kind: "instagram_read",
    dueAt: new Date(Date.now() - 1000),
    payload: { handle: "harbor", step: "start", try: "0" },
  });
  await world.untilQuiet();
  const [job] = await world.jobs();
  assert.deepEqual([job.state, job.attempts], ["failed", 3]);
  assert.deepEqual(
    noted.map((n) => [n.p_source, n.p_state]),
    [["instagram", "failed"]],
  );
  assert.deepEqual(world.told, [], "the line says it; no bell");
});
