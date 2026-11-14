/**
 * Resume by words takes a real yes (server/ask/tools/act/press.ts, D18 and D22 of the answers canvas). A stop said in words
 * runs at once: a stop is always free. A resume starts sending again, so the model calling it is not enough: the same small
 * check a card's yes passes reads the person's own words, and without a clear yes nothing is resumed and they are told
 * where to press it. The check's model is stood in for (model-json.ts setModelStream), and each sequence's door by `fetch`.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { linesOf } from "../../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { press_card } = await import(at("apps/dashboard/src/server/ask/tools/act/press.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WIN_BACK = "11111111-1111-4111-8111-111111111111";
const member = { tenantId: TENANT, role: "owner", facts: {} };

/** A workspace Stop everything holds: its one sequence paused by it, replies held from auto. */
const world = ({ stopped }) => {
  const tables = {
    tenant_config: [
      {
        tenant_id: TENANT,
        version: 1,
        config: stopped
          ? { ask: { stopped: { at: "2026-11-13T10:00:00Z", playbooks: [WIN_BACK], reply: "auto" } } }
          : {},
      },
    ],
    sequence_steps: [{ id: WIN_BACK, tenant_id: TENANT, state: stopped ? "paused" : "running", after_step_id: null }],
    policies: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: TENANT,
        class: "reply",
        mode: stopped ? "ask" : "auto",
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: "2026-11-01T00:00:00Z",
      },
    ],
  };
  setServiceClient(fakeDb(tables));
  return tables;
};

/** What a turn hands the tool: the person's own words, the request it goes under, the member. */
const turnOf = (tables, question) => ({
  ctx: { supabase: fakeDb(tables), userId: USER, params: {} },
  tenantId: TENANT,
  role: "owner",
  timezone: "UTC",
  language: "en",
  now: new Date(),
  question,
  request: new Request(`http://app.test/api/v1/ask?workspace=harbor`, {
    method: "POST",
    headers: { cookie: "sb=session" },
  }),
  member,
});

const stopAction = press_card.actions.stop;
const recordOf = (tables) => tables.tenant_config[0].config.ask?.stopped ?? null;

let asked;
let doors;
const answerYes = (yes) =>
  setModelStream(async function* (call) {
    asked.push(call.request.messages[0].content);
    yield { type: "text", index: 0, text: JSON.stringify({ yes }) };
    yield { type: "stop", stopReason: "end_turn" };
  });
let tables;
const realFetch = globalThis.fetch;
beforeEach(() => {
  asked = [];
  doors = [];
  globalThis.fetch = async (url, init) => {
    const where = new URL(String(url)).pathname.replace("/api/v1/", "");
    const body = JSON.parse(init.body);
    doors.push(`${init.method} ${where}`);
    const [door, id] = where.split("/");
    if (door === "playbooks") tables.sequence_steps.find((s) => s.id === id).state = body.state;
    if (door === "policies") tables.policies.find((p) => p.class === body.class).mode = body.mode;
    return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
  setModelStream(null);
});

test("resume by words without a clear yes is refused: nothing starts sending, and it says where to press it", async () => {
  tables = world({ stopped: true });
  answerYes(false);
  const out = await stopAction.build(turnOf(tables, "what did the stop pause?"), { resume: true });
  assert.equal(out.isError, true, "refused");
  assert.match(out.refusal, /Settings › Autonomy/, "the person is told where to press it");
  assert.equal(asked.length, 1, "the check read their words");
  assert.match(asked[0], /what did the stop pause\?/);
  assert.deepEqual(doors, [], "no sequence was asked back, no reply row moved");
  assert.equal(tables.sequence_steps[0].state, "paused");
  assert.equal(tables.policies[0].mode, "ask");
  assert.ok(recordOf(tables), "Stop everything still holds");
});

test("a check that cannot answer is a no: nothing starts sending", async () => {
  tables = world({ stopped: true });
  setModelStream(async function* () {
    yield { type: "error", message: "overloaded" };
  });
  const { result: out } = await linesOf(() => stopAction.build(turnOf(tables, "resume everything"), { resume: true }));
  assert.equal(out.isError, true);
  assert.deepEqual(doors, []);
  assert.ok(recordOf(tables));
});

test("resume by words with a clear yes runs: what the stop paused goes back", async () => {
  tables = world({ stopped: true });
  answerYes(true);
  const out = await stopAction.build(turnOf(tables, "yes, resume everything"), { resume: true });
  assert.equal(out.isError, false);
  assert.equal(tables.sequence_steps[0].state, "running");
  assert.equal(tables.policies[0].mode, "auto");
  assert.equal(recordOf(tables), null);
  assert.equal(JSON.parse(out.result).stopped, false);
});

test("stop by words still runs at once, with no check: a stop is always free", async () => {
  tables = world({ stopped: false });
  setModelStream(() => {
    throw new Error("a stop asks no model");
  });
  const out = await stopAction.build(turnOf(tables, "stop everything"), {});
  assert.equal(out.isError, false);
  assert.equal(asked.length, 0);
  assert.equal(tables.sequence_steps[0].state, "paused");
  assert.equal(tables.policies[0].mode, "ask");
  assert.equal(JSON.parse(out.result).stopped, true);
});
