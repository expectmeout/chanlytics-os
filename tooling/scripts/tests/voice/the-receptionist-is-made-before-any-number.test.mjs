/**
 * The workspace's receptionist made at the provider before any number (decision 0073, R1; POST
 * /api/admin/rehearsal/agent, apps/edge/lib/voice/rehearsal-call.ts makeRehearsalAgent over voice-agent.ts
 * ensureVoiceAgent), run over a database in memory with Retell answered by the test: the first run's Your receptionist
 * asks for it as the owner goes on to rehearse, so the first call starts at once. Made once and kept on the workspace
 * (voice_agents); a second ask, or a number's voice row, finds the one there; nothing dialed.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
const ENV = { EDGE_CALL_SECRET: SECRET, RETELL_API_KEY: "key_made_up_for_this_file", RETELL_FN_SECRET: "fn-secret" };
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV);
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const door = await importSrc("apps/edge/api/admin/rehearsal/agent.ts");
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const AUD = "/api/admin/rehearsal/agent";
const RETELL = "https://api.retellai.com";
const BRAIN = {
  business_name: "Harbor Salon",
  system_prompt: "You answer for Harbor Salon, a hair salon.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};

let worlds = 0;
/** The workspace: its settings (a persona, or none), a number's voice row where one is bought, the agent kept. */
function world({ brain = BRAIN, voiceRow = null, kept = null } = {}) {
  const tables = {
    tenants: [{ id: A, name: "Harbor Salon", timezone: "America/New_York", status: "active" }],
    tenant_config: [{ tenant_id: A, config: brain ? { brain } : {} }],
    tenant_channels: voiceRow
      ? [
          {
            id: "ch-voice",
            tenant_id: A,
            kind: "voice",
            status: "active",
            external_id: voiceRow,
            config: { llm_id: "llm_line" },
            created_at: "2026-10-01T00:00:00Z",
          },
        ]
      : [],
    voice_agents: kept
      ? [{ tenant_id: A, agent_id: kept, llm_id: "llm_kept", created_at: "2026-10-20T00:00:00Z" }]
      : [],
  };
  // The runtime's cache key moves with each world, as runtime_stamp's does with the workspace's rows.
  const stamp = `stamp-${++worlds}`;
  setPg(fakeDb(tables, {}, { runtime_stamp: () => stamp }));
  return tables;
}

/** Retell, answered by the test: an agent it knows by id, what a create answers, and every call kept. */
function retell({ agents = {}, refuse = {} } = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const path = u.slice(RETELL.length);
    calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(init.body) : null });
    const step = path.split("/")[1];
    if (refuse[step]) return new Response(JSON.stringify({ message: "refused" }), { status: refuse[step] });
    if (path.startsWith("/get-agent/")) {
      const a = agents[path.slice("/get-agent/".length)];
      return a ? Response.json(a) : new Response("{}", { status: 404 });
    }
    if (path === "/create-retell-llm") return Response.json({ llm_id: "llm_new", version: 0 });
    if (path === "/create-agent") return Response.json({ agent_id: "agent_new", version: 0, is_published: false });
    if (path.startsWith("/publish-agent-version/")) return Response.json({});
    return new Response("{}", { status: 404 });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
async function ask(body = {}, { workspace = A } = {}) {
  const raw = JSON.stringify({ tenant_id: A, user_id: U, ...body });
  const res = await door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(SECRET, AUD, { workspace, user: U, body: raw }),
      },
      body: raw,
    }),
  );
  return [res.status, await res.json()];
}

test("a workspace with no receptionist yet gets one made: the shell, the agent over it in its name, its first version published, and kept on the workspace -- no number, nothing dialed", async () => {
  const t = world();
  const r = retell();
  try {
    assert.deepEqual(await ask(), [200, { ok: true }]);
  } finally {
    r.restore();
  }
  assert.deepEqual(
    r.calls.map((c) => [c.method, c.path.replace(/\/[^/]+$/, (m) => (m.startsWith("/agent_") ? "/:id" : m))]),
    [
      ["POST", "/create-retell-llm"],
      ["POST", "/create-agent"],
      ["POST", "/publish-agent-version/:id"],
    ],
  );
  assert.equal(r.calls[1].body.agent_name, "Harbor Salon front desk");
  assert.deepEqual(r.calls[1].body.response_engine, { type: "retell-llm", llm_id: "llm_new", version: 0 });
  assert.ok(!r.calls.some((c) => /phone-number|create-web-call|create-phone-call/.test(c.path)), "nothing dialed");
  assert.deepEqual(
    t.voice_agents.map((a) => [a.tenant_id, a.agent_id, a.llm_id]),
    [[A, "agent_new", "llm_new"]],
    "kept, so the rehearsal and a number bought later answer in this one",
  );
});

test("a second ask finds the one kept; a workspace whose number is live answers in the line's own agent; neither makes another", async () => {
  const t = world({ kept: "agent_kept" });
  const again = retell({ agents: { agent_kept: { agent_id: "agent_kept", is_published: true } } });
  try {
    assert.deepEqual(await ask(), [200, { ok: true }]);
  } finally {
    again.restore();
  }
  assert.deepEqual(
    again.calls.map((c) => c.path),
    ["/get-agent/agent_kept"],
    "read back from the provider before it is trusted",
  );
  assert.equal(t.voice_agents.length, 1);

  world({ voiceRow: "agent_line" });
  const line = retell({ agents: { agent_line: { agent_id: "agent_line", is_published: true } } });
  try {
    assert.deepEqual(await ask(), [200, { ok: true }]);
  } finally {
    line.restore();
  }
  assert.deepEqual(
    line.calls.map((c) => c.path),
    ["/get-agent/agent_line"],
  );

  // One kept that the provider no longer knows: made again, and the one kept stays the workspace's word.
  const gone = world({ kept: "agent_gone" });
  const remade = retell();
  try {
    assert.equal((await ask())[0], 200);
  } finally {
    remade.restore();
  }
  assert.ok(remade.calls.some((c) => c.path === "/create-agent"));
  assert.deepEqual(
    gone.voice_agents.map((a) => a.agent_id),
    ["agent_gone"],
    "the first kept stands (voice_agents takes one per workspace); the caller is answered in it",
  );
});

test("refused in the door's words: the provider saying no, a workspace with no persona, a deployment without the key, another workspace's token", async () => {
  const t = world();
  const no = retell({ refuse: { "create-agent": 422 } });
  try {
    assert.deepEqual(await ask(), [
      502,
      { ok: false, error: "provider_refused", detail: "the receptionist could not be made at the provider" },
    ]);
  } finally {
    no.restore();
  }
  assert.equal(t.voice_agents.length, 0, "nothing kept of an agent never made");

  world({ brain: null });
  assert.deepEqual((await ask())[1].error, "no_persona");

  world();
  const key = process.env.RETELL_API_KEY;
  delete process.env.RETELL_API_KEY;
  try {
    assert.deepEqual(await ask(), [503, { ok: false, error: "no_provider_key" }]);
  } finally {
    process.env.RETELL_API_KEY = key;
  }
  assert.equal((await ask({}, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }))[0], 403);
});
