/**
 * A call to a lead's own receptionist (decision 0079, L3), on the edge: the rehearsal's own call door
 * (apps/edge/lib/voice/rehearsal-call.ts startRehearsalCall) for a preview's workspace and no person, and the webhook's
 * end of it (settleRehearsalEvent), over a database in memory with Retell answered by the test.
 *
 *   - a preview has its six minutes in all, three at most a call, whatever its plan; spent, it is refused in the door's
 *     own code with its allowance, which the dashboard says in the page's words;
 *   - one made theirs is a workspace like any other, its minutes the plan's;
 *   - a call's end adds its seconds to the preview's row once, though the provider tells an end twice.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { REHEARSAL_LIMITS, rehearsalAllowance, rehearsalCallMs, REHEARSE_WORDS } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const ENV = { RETELL_API_KEY: "key_made_up_for_this_file", RETELL_FN_SECRET: "fn-secret" };
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV);
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const { setPg, pg } = await importSrc("apps/edge/lib/pg.ts");
const { startRehearsalCall, settleRehearsalEvent } = await importSrc("apps/edge/lib/voice/rehearsal-call.ts");
after(() => setPg(null));

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RETELL = "https://api.retellai.com";
const MIN = 60_000;
const BRAIN = {
  business_name: "Fixture Barbers",
  system_prompt: "You answer for Fixture Barbers, a barber shop.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};

let worlds = 0;
/** The preview's workspace, its row on the sender's, the calls it has made, and preview_called as its door answers. */
function world({ state = "ready", spokenSeconds = [] } = {}) {
  const tables = {
    tenants: [
      {
        id: WS,
        name: "Fixture Barbers",
        timezone: "America/Chicago",
        status: state === "claimed" ? "active" : "preview",
      },
    ],
    tenant_config: [{ tenant_id: WS, config: { brain: BRAIN } }],
    tenant_channels: [],
    voice_agents: [],
    billing_accounts: [],
    lead_previews: [
      { id: "p1", tenant_id: OURS, lead_id: "l1", preview_tenant_id: WS, state, call_count: 0, call_seconds: 0 },
    ],
    rehearsals: spokenSeconds.map((seconds, i) => ({
      id: `r${i}`,
      tenant_id: WS,
      kind: "call",
      retell_call_id: `call_old_${i}`,
      created_at: "2026-11-01T12:00:00Z",
      ended_at: "2026-11-01T12:03:00Z",
      seconds,
    })),
  };
  const called = [];
  const stamp = `stamp-${++worlds}`;
  setPg(
    fakeDb(
      tables,
      {},
      {
        runtime_stamp: () => stamp,
        preview_called: (a) => {
          called.push(a);
          const row = tables.lead_previews.find(
            (r) => r.preview_tenant_id === a.p_preview_tenant_id && r.state === "ready",
          );
          if (!row) return false;
          row.call_count += 1;
          row.call_seconds += a.p_seconds;
          return true;
        },
      },
    ),
  );
  return { tables, called };
}

/** Retell, answered by the test: the shell and the agent made, its version published, and the web call made. */
function retell() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).slice(RETELL.length);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    if (path === "/create-retell-llm") return Response.json({ llm_id: "llm_new", version: 0 });
    if (path === "/create-agent") return Response.json({ agent_id: "agent_new", version: 0, is_published: false });
    if (path.startsWith("/publish-agent-version/")) return Response.json({});
    if (path === "/v3/create-web-call")
      return Response.json({ call_id: "call_new", access_token: "token_new", call_type: "web_call" }, { status: 201 });
    return new Response("{}", { status: 404 });
  };
  return calls;
}

const start = () =>
  startRehearsalCall({ via: "token", workspace: WS, user: null }, { tenant_id: WS }).then(async (res) => [
    res.status,
    await res.json(),
  ]);

test("the rule: a preview's six minutes in all, three at most a call, whatever its plan, said as a preview's", () => {
  const fresh = rehearsalAllowance({ hasPlan: true, preview: true, spentMs: 0, running: false });
  assert.deepEqual([fresh.window, fresh.of_ms, fresh.left_ms, fresh.can_call], ["preview", 6 * MIN, 6 * MIN, true]);
  assert.equal(rehearsalCallMs(fresh), REHEARSAL_LIMITS.callMs);
  const late = rehearsalAllowance({ hasPlan: false, preview: true, spentMs: 5.5 * MIN, running: false });
  assert.deepEqual([late.can_call, late.why], [false, "used"]);
  assert.equal(REHEARSE_WORDS.left(4 * MIN, "preview"), "4 free minutes left on this preview");
  assert.equal(REHEARSE_WORDS.used("preview"), "That's all a preview calls. Make it yours to keep talking.");
  assert.equal(
    rehearsalAllowance({ hasPlan: false, preview: false, spentMs: 0, running: false }).window,
    "before_plan",
  );
});

test("a preview's call: made at the provider for its workspace and no person, three minutes, its six counted", async () => {
  const { tables } = world({ spokenSeconds: [60] });
  const calls = retell();
  const [status, body] = await start();
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.max_ms, 3 * MIN);
  assert.deepEqual([body.allowance.window, body.allowance.of_ms], ["preview", 6 * MIN]);
  assert.equal(body.allowance.left_ms, 6 * MIN - MIN - 3 * MIN, "what is left once this call runs its whole length");
  const made = calls.find((c) => c.path === "/v3/create-web-call");
  assert.equal(made.body.metadata.tenant_id, WS);
  const kept = tables.rehearsals.find((r) => r.retell_call_id === "call_new");
  assert.equal(kept.created_by, null, "nobody is a member of a preview");
});

test("its minutes spent, the door refuses in its own code with its allowance, and dials nothing", async () => {
  world({ spokenSeconds: [180, 150] });
  const calls = retell();
  const [status, body] = await start();
  assert.equal(status, 409);
  assert.equal(body.error, "rehearsal_minutes_used");
  assert.deepEqual([body.allowance.window, body.allowance.why], ["preview", "used"]);
  assert.ok(!calls.some((c) => c.path === "/v3/create-web-call"));
});

test("one made theirs is a workspace like any other: its minutes are the plan's, not the preview's", async () => {
  world({ state: "claimed", spokenSeconds: [180, 150] });
  retell();
  const [status, body] = await start();
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.allowance.window, "before_plan");
});

test("a call's end adds its seconds to the preview's row once, though the provider tells it twice", async () => {
  const { tables, called } = world();
  tables.rehearsals.push({
    id: "r-live",
    tenant_id: WS,
    kind: "call",
    retell_call_id: "call_live",
    created_at: "2026-11-02T12:00:00Z",
    ended_at: null,
    seconds: null,
  });
  const call = {
    call_id: "call_live",
    call_type: "web_call",
    call_status: "ended",
    start_timestamp: Date.parse("2026-11-02T12:00:05Z"),
    end_timestamp: Date.parse("2026-11-02T12:01:17Z"),
    duration_ms: 72_000,
    transcript_object: [],
  };
  assert.equal(await settleRehearsalEvent(pg(), "call_ended", call), "ended");
  assert.equal(await settleRehearsalEvent(pg(), "call_analyzed", call), "ended");
  assert.deepEqual(called, [{ p_preview_tenant_id: WS, p_seconds: 72 }]);
  assert.deepEqual([tables.lead_previews[0].call_count, tables.lead_previews[0].call_seconds], [1, 72]);
});
