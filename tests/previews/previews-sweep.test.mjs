/**
 * The previews sweep (decision 0079; apps/edge/lib/previews/sweep.ts), over a database in memory with the provider
 * answered by the test: a preview past its end has its agent and the LLM under it deleted at the provider, then is
 * ended; one that never had a call ends at once; a provider that says no, or gives no answer, leaves the preview for
 * the next hour and never an agent with no workspace behind it; gone already (404) is gone; the door's knock is the
 * sweep key's (door-policy.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const { sweepPreviews } = await importSrc("apps/edge/lib/previews/sweep.ts");

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const WS2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const NOW = Date.parse("2026-12-01T12:00:00Z");
const PAST = "2026-11-30T12:00:00Z";

function world({ agents = [{ tenant_id: WS1, agent_id: "agent_one", llm_id: "llm_one" }] } = {}) {
  const tables = {
    lead_previews: [
      { id: "p1", tenant_id: OURS, preview_tenant_id: WS1, state: "ready", ends_at: PAST },
      { id: "p2", tenant_id: OURS, preview_tenant_id: WS2, state: "failed", ends_at: PAST },
      { id: "p3", tenant_id: OURS, preview_tenant_id: null, state: "claimed", ends_at: PAST },
      { id: "p4", tenant_id: OURS, preview_tenant_id: null, state: "ready", ends_at: "2026-12-20T12:00:00Z" },
    ],
    voice_agents: agents,
  };
  const ended = [];
  const db = fakeDb(tables, {}, { preview_end: (a) => (ended.push(a.p_id), true) });
  const lines = [];
  const L = {
    info: (event, fields) => lines.push({ level: "info", event, ...fields }),
    warn: (event, fields) => lines.push({ level: "warn", event, ...fields }),
    error: (event, fields) => lines.push({ level: "error", event, ...fields }),
  };
  return { db, ended, lines, tick: { db, L, started: NOW } };
}

/** The provider, answering each delete as told, and what it was asked. */
function provider({ agent = { ok: true, status: 204 }, llm = { ok: true, status: 204 }, apiKey = "key_made_up" } = {}) {
  const asked = [];
  return {
    asked,
    apiKey,
    deleteAgent: async (_cfg, id) => {
      asked.push(["agent", id]);
      if (agent instanceof Error) throw agent;
      return agent;
    },
    deleteRetellLlm: async (_cfg, id) => (asked.push(["llm", id]), llm),
  };
}

test("past its end: the agent and its LLM deleted at the provider first, then ended; one with no call ends at once", async () => {
  const w = world();
  const p = provider();
  const r = await sweepPreviews(w.tick, p, () => NOW);
  assert.deepEqual(p.asked, [
    ["agent", "agent_one"],
    ["llm", "llm_one"],
  ]);
  assert.deepEqual(w.ended, ["p1", "p2"], "the claimed one and the one not yet due are left");
  const body = await r.json();
  assert.deepEqual([body.previews, body.ended, body.held, body.failed], [2, 2, 0, 0]);
});

test("a provider that says no, or gives no answer, leaves the preview for the next hour", async () => {
  const no = world();
  await sweepPreviews(no.tick, provider({ agent: { ok: false, status: 500 } }), () => NOW);
  assert.deepEqual(no.ended, ["p2"], "the one with an agent waits; the one without ends");
  assert.ok(no.lines.some((l) => l.event === "preview_end_failed" && l.preview_id === "p1" && l.status === 500));

  const silent = world();
  const r = await sweepPreviews(
    silent.tick,
    provider({ agent: new Error("retell delete-agent: no answer") }),
    () => NOW,
  );
  assert.deepEqual(silent.ended, ["p2"]);
  assert.equal((await r.json()).failed, 1);

  const keyless = world();
  await sweepPreviews(keyless.tick, provider({ apiKey: "" }), () => NOW);
  assert.deepEqual(keyless.ended, ["p2"], "no key, no delete, no end");
});

test("gone already at the provider is gone; an LLM it kept is logged and the preview still ends", async () => {
  const gone = world();
  await sweepPreviews(
    gone.tick,
    provider({ agent: { ok: true, status: 404 }, llm: { ok: false, status: 500 } }),
    () => NOW,
  );
  assert.deepEqual(gone.ended, ["p1", "p2"]);
  assert.ok(gone.lines.some((l) => l.event === "preview_end_failed" && l.step === "llm"));
});

test("the door is the sweep key's", async () => {
  const policy = JSON.parse(
    await (await import("node:fs/promises")).readFile(new URL("../edge/door-policy.json", import.meta.url), "utf8"),
  );
  const doors = policy.doors ?? policy;
  assert.deepEqual(doors["POST /api/cron/previews"], {
    wrapper: "sweepDoor",
    sweep: "previews",
    knock: "authorizeCron",
    knock_in: "sweepDoor in apps/edge/lib/ops/sweep-door.ts",
  });
});
