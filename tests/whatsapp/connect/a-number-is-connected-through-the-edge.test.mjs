/**
 * The dashboard's half of connecting a WhatsApp number, run: POST channels/whatsapp/connect and GET
 * channels/whatsapp/signup through route() with their modules' own `run`, over a database in memory and an edge that
 * answers as the edge does, on a deployment that may reach its providers.
 *
 * The edge's two doors (the exchange, the four Graph calls, the Vault write) are run in whatsapp-connect-door.test.mjs, the
 * browser's sign-up in whatsapp-connect.test.mjs, and a preview's refusal in a-preview-connects-no-number.test.mjs. Between
 * them stood the route, its words and the service it calls, pinned as their text until 26 Nov 2026: who may ask, which
 * ids are Meta's, which door is asked with what, the ledger's row, and each refusal in the owner's words.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
// A deployment that may reach its providers: the guard a preview stops at is open here.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

// Next's server puts Node's AsyncLocalStorage on the global before its stores are made: so does this file.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const connect = await importSrc("apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts");
const signup = await importSrc("apps/dashboard/app/api/v1/channels/whatsapp/signup/route.ts");
// next/server's after(), which the connect route hands the starters to once its answer has gone, reads Next's two request
// stores: a request here holds both, and keeps what was handed to after() rather than run it.
const fromDashboard = createRequire(new URL("../../../apps/dashboard/package.json", import.meta.url));
const { workAsyncStorage } = fromDashboard("next/dist/server/app-render/work-async-storage.external");
const { workUnitAsyncStorage } = fromDashboard("next/dist/server/app-render/work-unit-async-storage.external");
const later = [];
const inRequest = (fn) =>
  workAsyncStorage.run({ afterContext: { after: (task) => void later.push(task) } }, () =>
    workUnitAsyncStorage.run({ type: "request" }, fn),
  );
const realFetch = globalThis.fetch;
beforeEach(() => {
  setRateStore(memoryStore());
  later.length = 0;
});
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

const T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CHANNEL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** A member of a workspace with no WhatsApp number yet, over these tables; the ledger's service client over the same. */
function world(role = "owner") {
  const tables = {
    memberships: [
      { user_id: USER, tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-02-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor Moving", status: "active", timezone: "America/New_York" }],
    tenant_channels: [],
    templates: [],
    decisions: [],
    events: [],
  };
  setServiceClient(fakeDb(tables));
  return {
    tables,
    ctx: { supabase: fakeDb(tables), userId: USER, email: "ada@example.com", aal: "aal2", params: {} },
  };
}
const ask = (method, body) =>
  new Request(`http://localhost/api/v1/channels/whatsapp/x?workspace=${T}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** The edge, as the routes meet it: every door asked, with what, each answered by `reply(path, body)`. */
function edge(reply) {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(init.body) : null;
    asked.push({ path, method: init?.method ?? "GET", body });
    const a = reply(path, body) ?? { status: 404, body: { ok: false, error: "not_found" } };
    return new Response(JSON.stringify(a.body), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return asked;
}
/** The connect door saying yes, with the number it connected. */
const connected = () =>
  edge((path) =>
    path === "/api/admin/whatsapp/connect"
      ? {
          body: {
            ok: true,
            channel_id: CHANNEL,
            phone_number_id: "123456789012",
            waba_id: "987654321098",
            ids_from: "message",
            number_e164: "+13055550188",
            verified_name: "Harbor Moving",
            quality_rating: "GREEN",
            registration: "registered",
          },
        }
      : null,
  );
/** A route's answer, or its refusal as the person meets it: the code, the status and the words. */
const run = async (route, req, ctx) => {
  try {
    return { status: 200, body: await inRequest(() => route.run(req, ctx)) };
  } catch (e) {
    if (!e?.code) throw e;
    return { status: e.status, body: { error: e.code, message: e.message } };
  }
};

test("connected the whole way: the edge is asked once with the code and the ids for this workspace and person, the ledger keeps the connection, and the owner is told the number", async () => {
  const { tables, ctx } = world("owner");
  const asked = connected();
  const res = await run(
    connect.POST,
    ask("POST", { code: " AQBx-code ", phone_number_id: "123456789012", waba_id: "987654321098" }),
    ctx,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(asked, [
    {
      path: "/api/admin/whatsapp/connect",
      method: "POST",
      body: {
        tenant_id: T,
        user_id: USER,
        code: "AQBx-code",
        phone_number_id: "123456789012",
        waba_id: "987654321098",
      },
    },
  ]);
  const said = res.body.data ?? res.body;
  assert.deepEqual(
    [said.channel_id, said.number_e164, said.verified_name, said.quality_rating],
    [CHANNEL, "+13055550188", "Harbor Moving", "GREEN"],
  );
  const [kept] = tables.decisions;
  assert.deepEqual(
    [kept?.verb, kept?.subject_type, kept?.subject_id, tables.decisions.length],
    ["connect_channel", "channel", CHANNEL, 1],
    "one row in the ledger, the connection of this channel",
  );
  assert.equal(said.decision_id, kept.id, "and the answer names it");
  assert.equal(JSON.stringify(tables.decisions).includes("AQBx-code"), false, "the one-time code is kept nowhere");
  assert.equal(later.length, 1, "the starters already in use get their WhatsApp versions once the answer has gone");
});

test("an id the window did not hand back is left for the edge to read from the token; an id that is not Meta's is refused before anyone is asked", async () => {
  const { ctx } = world("owner");
  const asked = connected();
  const res = await run(connect.POST, ask("POST", { code: "AQBx-code" }), ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(asked[0].body, { tenant_id: T, user_id: USER, code: "AQBx-code" }, "the code alone");
  // Keeping the WhatsApp Business app is said to the edge, which registers nothing again (decision 0073).
  await run(connect.POST, ask("POST", { code: "AQBx-code", keep_app: true }), ctx);
  assert.equal(asked[1].body.keep_app, true);

  asked.length = 0;
  for (const body of [
    { code: "AQBx-code", phone_number_id: "12; drop" },
    { code: "AQBx-code", waba_id: "abc" },
    { code: "AQBx-code", phone_number_id: "12345" },
  ]) {
    const refused = await run(connect.POST, ask("POST", body), ctx);
    assert.equal(refused.status, 400, JSON.stringify(body));
    assert.match(JSON.stringify(refused.body), /Chanlytics cannot read\. Start the connection again\./);
  }
  const noCode = await run(connect.POST, ask("POST", { code: "  " }), ctx);
  assert.equal(noCode.status, 400);
  assert.match(JSON.stringify(noCode.body), /The sign-up code is missing/);
  assert.deepEqual(asked, [], "nothing reached the edge");
});

test("each refusal of the edge reaches the owner in the owner's words: a number another workspace holds is a conflict, the rest is Meta's step failing", async () => {
  const { tables, ctx } = world("owner");
  for (const [reason, status, code, words] of [
    ["number_taken", 409, "conflict", "That number is already connected to another workspace."],
    [
      "pin_required",
      502,
      "upstream_meta",
      "This number has two-step verification on, and Chanlytics cannot register it without that PIN.",
    ],
    ["exchange_failed", 502, "upstream_meta", "Meta did not accept the sign-up code. Start the connection again."],
    ["something_new", 502, "upstream_meta", "The connection did not complete (something_new)."],
  ]) {
    edge((path) =>
      path === "/api/admin/whatsapp/connect" ? { status: 409, body: { ok: false, error: reason } } : null,
    );
    const res = await run(connect.POST, ask("POST", { code: "AQBx-code" }), ctx);
    assert.equal(res.status, status, reason);
    const text = JSON.stringify(res.body);
    assert.ok(text.includes(`"${code}"`), `${reason}: ${text}`);
    assert.ok(text.includes(words), `${reason}: ${text}`);
  }
  assert.deepEqual(tables.decisions, [], "a connection that did not happen is kept nowhere");
  assert.equal(later.length, 0, "and nothing is filed after it");
});

test("only who may connect a channel connects one: an operator is refused before the edge is asked", async () => {
  const { ctx } = world("operator");
  const asked = connected();
  const res = await run(connect.POST, ask("POST", { code: "AQBx-code" }), ctx);
  assert.equal(res.status, 403);
  assert.deepEqual(asked, []);
});

test("the sign-up's door: what Meta's window needs is the edge's, and who may press Connect is whoever may connect a channel, where the deployment is ready", async () => {
  const door = (over = {}) =>
    edge((path) =>
      path === "/api/admin/whatsapp/signup-config"
        ? {
            body: {
              ok: true,
              app_id: "100000000000001",
              config_id: "200000000000002",
              graph_version: "v25.0",
              ready: true,
              reason: null,
              keep_app: true,
              ...over,
            },
          }
        : null,
    );
  const said = async (role, over) => {
    const asked = door(over);
    const res = await run(signup.GET, ask("GET"), world(role).ctx);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      asked.map((a) => `${a.method} ${a.path}`),
      ["GET /api/admin/whatsapp/signup-config"],
    );
    return res.body.data ?? res.body;
  };
  const owner = await said("owner");
  assert.deepEqual(
    [owner.app_id, owner.config_id, owner.graph_version, owner.ready, owner.keep_app, owner.can_connect],
    ["100000000000001", "200000000000002", "v25.0", true, true, true],
  );
  assert.equal((await said("partner")).can_connect, true, "the partner who set it up (0012)");
  assert.equal((await said("operator")).can_connect, false, "an operator reads it and may not press it");
  const unready = await said("owner", { ready: false, reason: "no_config_id", config_id: null });
  assert.deepEqual([unready.can_connect, unready.reason], [false, "no_config_id"], "nobody, where it is not ready");
});
