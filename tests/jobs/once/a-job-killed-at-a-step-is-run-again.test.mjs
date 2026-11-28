/**
 * The helper that kills a job at a named step (_kill-at.mjs), proven on itself and on two real handlers.
 *
 * On itself: a run's steps are named in the order they happened; killed after one, that step landed and nothing after it
 * did, whoever caught the kill; the run reports nothing back; the next heartbeat claims the row again once its lease has
 * run out. On a reply's send (outbound_send, which speaks to a person): whichever step the run dies after, the provider is
 * asked at most once, the job ends, and the message never stays "on its way" with nobody looking. On a phone's receipts
 * (push_receipts, safe to repeat): a run that died is run again and finishes.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { whatsappSender } from "@chanlytics/core";
import { atEveryStep, claimDue, Killed, ledgerWorld, throughDispatch } from "./_kill-at.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

/** A ledger in memory whose claim keeps the database's rule. */
const memory = (tables) => fakeDb(tables, {}, { claim_due_jobs: (args) => claimDue(tables.jobs, args) });

/* ------------------------------------------------------------------------------------------- the helper itself -- */

/** A job that writes two lines, one inside a catch that goes on, then a third. */
function threeWrites() {
  const tables = { jobs: [], events: [] };
  const line = (n) => ({ tenant_id: T, kind: "message.sent", category: "message", data: { n } });
  const world = ledgerWorld(memory(tables), {
    dispatch: (db) => async () => {
      await db.from("events").insert(line(1));
      // A handler that catches and goes on: a dead process writes nothing however its code is written.
      try {
        await db.from("events").insert(line(2));
      } catch {
        await db
          .from("events")
          .insert(line(99))
          .then(
            () => {},
            () => {},
          );
      }
      await db.from("events").insert(line(3));
      return "done";
    },
  });
  return { tables, world };
}
const put = (world, kind = "canary", payload = {}) =>
  world.put({ tenantId: T, kind, dueAt: new Date(Date.now() - 1000), payload });
const written = (tables) => tables.events.map((e) => e.data.n);

test("a clean run's steps are named in the order they happened, and the row ends done", async () => {
  const { tables, world } = threeWrites();
  assert.equal(await put(world), "scheduled");
  assert.equal(
    tables.jobs[0].dedupe_key,
    `canary:${T}`,
    "written as the ledger writes it: its once-only key is on the row",
  );
  const run = await world.run();
  assert.deepEqual(run.steps, ["claim", "events.insert", "events.insert", "events.insert", "complete"]);
  assert.equal(run.died, false);
  assert.deepEqual(written(tables), [1, 2, 3]);
  assert.equal((await world.jobs())[0].state, "done");
});

test("killed after a step: that step landed, nothing after it did whoever caught the kill, and nothing was reported back", async () => {
  const { tables, world } = threeWrites();
  await put(world);
  const run = await world.run({ killAfter: { step: "events.insert", nth: 2 } });
  assert.equal(run.died, true);
  assert.equal(run.killedAfter, "events.insert");
  assert.deepEqual(run.steps, ["claim", "events.insert", "events.insert"]);
  assert.deepEqual(written(tables), [1, 2], "the second line landed; the catch's line and the third never did");
  const [job] = await world.jobs();
  assert.equal(job.state, "fired", "no complete, no fail: the row is as the dead run left it");
  assert.equal(job.attempts, 1);
  assert.equal(run.counts, null);
});

test("killed after the claim, the job never started: the next heartbeat takes it back once its lease has run out", async () => {
  const { tables, world } = threeWrites();
  await put(world);
  const first = await world.run({ killAfter: "claim" });
  assert.deepEqual(first.steps, ["claim"]);
  assert.deepEqual(written(tables), []);
  // Its lease still holds: nothing claims it.
  assert.deepEqual((await world.run()).steps, []);
  const rest = await world.untilQuiet();
  assert.deepEqual(rest[0].steps, ["claim", "events.insert", "events.insert", "events.insert", "complete"]);
  assert.deepEqual(rest.at(-1).steps, [], "then the ledger is quiet");
  const [job] = await world.jobs();
  assert.deepEqual([job.state, job.attempts], ["done", 2]);
});

test("a step is named by its number, by its name and place, or by a rule; a kill that names no step kills nothing", async () => {
  for (const killAfter of [3, { step: "events.insert", nth: 2 }, (step, n) => step === "events.insert" && n === 3]) {
    const { tables, world } = threeWrites();
    await put(world);
    assert.equal((await world.run({ killAfter })).died, true);
    assert.deepEqual(written(tables), [1, 2]);
  }
  const { world } = threeWrites();
  await put(world);
  assert.equal((await world.run({ killAfter: "rpc:nothing_calls_this" })).died, false);
});

test("a call that leaves for a provider is a step: killed after it, the provider took the request and the run never knew", async () => {
  const tables = { jobs: [], events: [] };
  const asked = [];
  const world = ledgerWorld(memory(tables), {
    dispatch: (db, w) => {
      const provider = w.outside("provider", async (what) => {
        asked.push(what);
        return { id: "p-1" };
      });
      return async () => {
        const answer = await provider("send");
        await db
          .from("events")
          .insert({ tenant_id: T, kind: "message.sent", category: "message", data: { n: answer.id } });
        return "done";
      };
    },
  });
  await put(world);
  const run = await world.run({ killAfter: "out:provider" });
  assert.deepEqual(run.steps, ["claim", "out:provider"]);
  assert.deepEqual(asked, ["send"], "the request left");
  assert.deepEqual(tables.events, [], "and its answer was never written down");
});

test("the kill is the helper's own: any other throw of a tick is raised, and a killed world can be read through its own way in", async () => {
  const tables = { jobs: [], events: [] };
  const world = ledgerWorld(memory(tables), { dispatch: () => async () => "done" });
  await put(world);
  await world.run({ killAfter: "claim" });
  assert.equal((await world.raw.from("jobs").select("id")).data.length, 1, "the test's own client is never dead");
  assert.ok(new Killed("x") instanceof Error);
});

/* ---------------------------------------------------------------------------- a reply's send, which speaks -- */

/** A reply waiting in the outbox, its job on the ledger, and Graph answering as it answers an accepted message. */
async function aReplyToSend() {
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
        created_at: ago(60_000),
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
  const world = ledgerWorld(memory(tables), {
    dispatch: throughDispatch(() => ({
      wire: { whatsapp: whatsappSender({ phoneId: "p1", accessToken: "tok" }), sms: null },
    })),
  });
  // Graph, as a step: the request leaves, and the run may die before it reads the answer.
  globalThis.fetch = world.outside("graph", async (url, init) => {
    graph.push({ url: String(url), body: JSON.parse(init.body) });
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
  return Object.assign(world, { tables, graph });
}

test("a reply's send, clean: claimed on its own row before the wire, sent once, recorded, done", async () => {
  const world = await aReplyToSend();
  const run = await world.run();
  assert.equal(run.steps.filter((s) => s === "out:graph").length, 1);
  assert.ok(run.steps.indexOf("out:graph") > run.steps.indexOf("claim"));
  assert.equal(run.steps.at(-1), "complete");
  assert.equal(world.tables.messages[0].status, "sent");
  assert.equal(world.graph.length, 1);
});

test("a reply's send killed after Graph took it: never sent again, and the message says its outcome is unknown, flagged for a person, the owner told", async () => {
  const world = await aReplyToSend();
  const first = await world.run({ killAfter: "out:graph" });
  assert.equal(first.died, true);
  const rest = await world.untilQuiet();
  assert.equal(world.graph.length, 1, "one text, whatever the ledger did next");
  const [job] = await world.jobs();
  assert.deepEqual([job.state, job.attempts], ["failed", 2], "the second claim gave up: a send is never run twice");
  const [message] = world.tables.messages;
  assert.equal(message.status, "failed");
  assert.equal(message.error?.outcome, "unknown", "it may have gone: said so, never as a plain failure");
  assert.equal(world.tables.escalations.length, 1, "the thread is flagged for a person");
  assert.equal(world.told.length, 1, "and the owner is told once");
  assert.ok(rest.some((r) => r.settled.some((s) => s.what === "message" && s.changed)));
});

test("whichever step a reply's send dies after: Graph is asked at most once, the job ends, and the message is sent or failed and flagged", async () => {
  const steps = await atEveryStep(aReplyToSend, async (world, { killedAfter, n }) => {
    const at = `killed after step ${n} (${killedAfter})`;
    assert.ok(world.graph.length <= 1, `${at}: Graph was asked ${world.graph.length} times`);
    const [job] = await world.jobs();
    assert.ok(["done", "failed"].includes(job.state), `${at}: the job ended ${job.state}`);
    const [message] = world.tables.messages;
    assert.notEqual(message.status, "queued", `${at}: the message still says it is on its way`);
    if (message.status === "failed")
      assert.equal(world.tables.escalations.length, 1, `${at}: nobody was handed the thread`);
  });
  assert.ok(steps.includes("out:graph") && steps.at(-1) === "complete", "the steps a clean send takes were each tried");
});

/* ---------------------------------------------------------------------- a phone's receipts, safe to repeat -- */

test("a job that is safe to repeat, killed after it asked its provider, is run again and finishes", async () => {
  const tables = { jobs: [], push_devices: [] };
  const asked = [];
  const world = ledgerWorld(memory(tables), {
    dispatch: (db, w) =>
      throughDispatch(() => ({
        push: {
          send: async () => [],
          receipts: w.outside("expo", async (ids) => {
            asked.push(ids);
            return {};
          }),
        },
      }))(db, w),
  });
  await world.putAgain({
    tenantId: T,
    kind: "push_receipts",
    dueAt: new Date(Date.now() - 1000),
    payload: { tickets: [{ id: "t-1", to: "ExponentPushToken[x]" }] },
  });
  const first = await world.run({ killAfter: "out:expo" });
  assert.deepEqual(first.steps, ["claim", "out:expo"]);
  await world.untilQuiet();
  assert.equal(asked.length, 2, "asked again: reading a receipt twice costs nothing");
  const [job] = await world.jobs();
  assert.deepEqual([job.state, job.attempts], ["done", 2]);
});
