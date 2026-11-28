/**
 * The ledger giving up on a job, killed in the middle of giving up (the plan "Prove it works", guarantee 7: a deploy that
 * interrupts work leaves it resumed, or ended in a state someone can see).
 *
 * When a job will not finish, the tick fails its row and settles what it left (a message still saying "Sending", a post
 * still "Posting"). It failed the row first and settled after: a run killed between the two left a row that was final,
 * which nothing claims again, beside a message nobody had settled, for whatever sweep might later find it. Now the tick
 * renews its claim, settles while it still holds the row, and fails the row last: killed anywhere on the way, the row
 * is still claimed, comes back when its lease runs out, and is concluded again. Every settle is conditional on what is
 * still in flight, so concluding twice writes once.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { whatsappSender } from "@chanlytics/core";
import { fakeDb } from "../../_fake-db.mjs";
import { atEveryStep, claimDue, ledgerWorld, throughDispatch } from "./_kill-at.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

/**
 * A reply whose send died after the provider took it: its job fired and said to have spoken, its lease run out. The
 * next heartbeat gives up on it (a send is never run twice) and settles the message.
 */
async function aSendTheLedgerGivesUpOn() {
  const tables = {
    jobs: [],
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: "c1",
        status: "queued",
        body: "See you at 3",
        sender: "human",
        channel: "whatsapp",
        direction: "outbound",
        created_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    conversations: [
      {
        id: "c1",
        tenant_id: T,
        paused_until: null,
        contacts: { consent: "opted_in", dnc: false, marketing_consent: null, erased_at: null },
        tenants: { status: "active" },
      },
    ],
    events: [],
    escalations: [],
  };
  const graph = [];
  const world = ledgerWorld(fakeDb(tables, {}, { claim_due_jobs: (args) => claimDue(tables.jobs, args) }), {
    dispatch: throughDispatch(() => ({
      wire: { whatsapp: whatsappSender({ phoneId: "p1", accessToken: "tok" }), sms: null },
    })),
  });
  globalThis.fetch = world.outside("graph", async (url, init) => {
    graph.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.sent" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  await world.put({
    tenantId: T,
    kind: "outbound_send",
    dueAt: new Date(Date.now() - 1000),
    payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101" },
  });
  const first = await world.run({ killAfter: "out:graph" });
  assert.equal(first.died, true);
  await world.forward();
  return Object.assign(world, { tables, graph });
}

test("giving up, clean: the claim is renewed, what the job left is settled, and the row fails last", async () => {
  const world = await aSendTheLedgerGivesUpOn();
  const run = await world.run();
  const at = (step) => run.steps.indexOf(step);
  assert.ok(at("claim") === 0 && at("keep") === 1, `the claim, then the claim renewed: ${run.steps.join(", ")}`);
  assert.ok(at("fail") > at("keep") + 1, "the row fails after what it left is settled");
  assert.equal(run.steps.at(-1), "alert", "and the owner is told last, once all of it is true");
  assert.equal(world.tables.messages[0].status, "failed");
  assert.equal((await world.jobs())[0].state, "failed");
});

test("killed at any step of giving up: the message is settled and its thread handed to a person, the row ends failed, and nothing is sent again", async () => {
  const steps = await atEveryStep(aSendTheLedgerGivesUpOn, async (world, { killedAfter, n }) => {
    const at = `killed after step ${n} (${killedAfter})`;
    const [message] = world.tables.messages;
    assert.equal(message.status, "failed", `${at}: the message still says it is on its way`);
    assert.equal(message.error?.outcome, "unknown", `${at}: it may have gone, and says so`);
    assert.equal(world.tables.escalations.length, 1, `${at}: the thread is flagged for a person, once`);
    assert.equal((await world.jobs())[0].state, "failed", `${at}: the row is final`);
    assert.equal(world.graph.length, 1, `${at}: one text, ever`);
    assert.ok(world.told.length <= 1, `${at}: the owner is told at most once`);
  });
  assert.ok(steps.includes("keep") && steps.includes("fail"));
});

test("a run that no longer holds the row settles nothing: another run has it, and its own conclusion stands", async () => {
  const world = await aSendTheLedgerGivesUpOn();
  // The row is claimed here, and before this run renews its claim another runner takes the row back (its lease read
  // as run out): this run's claim is one behind.
  const taken = world.run({
    killAfter: (step) => {
      if (step !== "claim") return false;
      Object.assign(world.tables.jobs[0], { attempts: world.tables.jobs[0].attempts + 1 });
      return false;
    },
  });
  const run = await taken;
  assert.deepEqual(run.steps, ["claim", "keep"], "its renewal moved nothing, so it settled nothing and failed nothing");
  assert.equal(world.tables.messages[0].status, "queued", "what the other run is doing is left to it");
  assert.ok(run.lines.some((l) => l.event === "job_fail_lost_race"));
});
