/**
 * Try again on a source that stopped (decision 0073, R23), both halves run: the edge's door (POST
 * /api/admin/imports/again, apps/edge/lib/imports/import-again.ts) over a database in memory -- the source started again
 * from where it stopped, through the mailbox its cursor names while it is connected, else the calendar's grant, else the
 * newest mailbox -- and the dashboard's route (POST /api/v1/imports/again) that asks it, with the edge answered by the
 * test. Beside it, the first run's two other new routes: the number kept looked up (POST /api/v1/lines/lookup), and the
 * rehearsal's agent made ahead (POST /api/v1/receptionist/agent).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken, verifyEdgeToken } from "@chanlytics/channels";
import { IMPORT_STOPPED_WORDS } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

const SECRET = "edge-secret-for-this-file";
const ENV = {
  EDGE_CALL_SECRET: SECRET,
  EDGE_URL: "https://edge.test",
  EDGE_PROVIDERS: "live",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-only",
};
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV);
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const door = await importSrc("apps/edge/api/admin/imports/again.ts");
const again = await import(at("apps/dashboard/app/api/v1/imports/again/route.ts"));
const lookup = await import(at("apps/dashboard/app/api/v1/lines/lookup/route.ts"));
const agent = await import(at("apps/dashboard/app/api/v1/receptionist/agent/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
after(() => setPg(null));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const OLD = "d1111111-1111-4111-8111-111111111111";
const NEW = "d2222222-2222-4222-8222-222222222222";
const GRANT = "d3333333-3333-4333-8333-333333333333";
const AUD = "/api/admin/imports/again";

/* ------------------------------------------------------------------ the edge's door */

/** A ledger row that stopped, its cursor naming the mailbox it was read through. */
const stopped = (source, connection) => ({
  tenant_id: A,
  source,
  state: "failed",
  counts: { messages: 40 },
  parts_done: 2,
  parts_total: null,
  oldest: null,
  started_at: "2026-10-24T12:00:00Z",
  finished_at: null,
  last_error: IMPORT_STOPPED_WORDS.signedOut,
  via: "google",
  job_cursor: connection ? { connection, page: "p3", at: 4 } : {},
  updated_at: "2026-10-24T12:30:00Z",
});
function world({ imports = [], boxes = [], grant = null } = {}) {
  const notes = [];
  const tables = {
    tenant_config: [
      { tenant_id: A, config: grant ? { calendar_grant: { mailbox_id: grant, provider: "google" } } : {} },
    ],
    imports,
    mailbox_connections: boxes,
    jobs: [],
  };
  setPg(
    fakeDb(
      tables,
      {},
      {
        import_ledger_note: (a) => {
          notes.push(a);
          return null;
        },
      },
    ),
  );
  return { tables, notes };
}
const box = (id, over = {}) => rows.mailboxConnection({ id, tenant_id: A, provider: "google", ...over });
async function ask(body, { workspace = A } = {}) {
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

test("Try again starts the source again from where it stopped, through the mailbox its cursor names, adding to what came", async () => {
  const w = world({ imports: [stopped("mailbox", OLD)], boxes: [box(OLD), box(NEW)] });
  assert.deepEqual(await ask({ source: "mailbox" }), [200, { ok: true }]);
  assert.deepEqual(
    w.notes.map((n) => [n.p_source, n.p_state, n.p_add, n.p_via]),
    [["mailbox", "queued", true, "google"]],
    "queued again, adding to what the first run brought, its cursor kept",
  );
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload.source, j.payload.connection_id]),
    [["history_import", "mailbox", OLD]],
  );
  assert.match(
    w.tables.jobs[0].payload.seq,
    /^\d+:1$/,
    "a run of its own, so it never collides with the first's parts",
  );
});

test("Try again finds the mailbox that reads it now: its own removed, the newest mailbox; the calendar, through its grant; none connected, refused", async () => {
  const gone = world({ imports: [stopped("contacts", OLD)], boxes: [box(OLD, { state: "removed" }), box(NEW)] });
  assert.equal((await ask({ source: "contacts" }))[0], 200);
  assert.equal(gone.tables.jobs[0].payload.connection_id, NEW);
  const cal = world({ imports: [stopped("calendar", null)], boxes: [box(GRANT), box(NEW)], grant: GRANT });
  assert.equal((await ask({ source: "calendar" }))[0], 200);
  assert.equal(cal.tables.jobs[0].payload.connection_id, GRANT, "the calendar the workspace reads");
  world({ imports: [stopped("mailbox", OLD)], boxes: [box(OLD, { state: "removed" })] });
  assert.deepEqual(await ask({ source: "mailbox" }), [
    409,
    { ok: false, error: "not_connected", detail: "no mailbox is connected to read it through" },
  ]);
});

test("Try again refuses what it cannot start here: a source by another name, one brought in where it was first brought in, one never brought in, another workspace's", async () => {
  world();
  assert.equal((await ask({ source: "everything" }))[0], 400);
  assert.deepEqual((await ask({ source: "clients_file" }))[0], 409, "the clients' file is added again from People");
  assert.deepEqual((await ask({ source: "whatsapp_history" }))[0], 409, "what Meta offers once");
  assert.deepEqual(await ask({ source: "mailbox" }), [
    404,
    { ok: false, error: "not_found", detail: "nothing of this source was brought in" },
  ]);
  assert.equal((await ask({ source: "mailbox" }, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }))[0], 403);
});

/* ------------------------------------------------------------------ the dashboard's routes */

const membership = (role) => ({
  user_id: U,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const ctx = (role = "owner") => ({
  supabase: fakeDb({ memberships: [membership(role)] }),
  userId: U,
  email: "ada@example.com",
  params: {},
});
const send = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });
/** The edge, answered by the test; every call kept with its body and the door its token was minted for. */
function edge(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, token: init.headers?.["x-edge-token"] ?? null });
    const [status, json] = answer(body, String(url));
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
async function refused(p, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

test("the dashboard's Try again: whoever may change the settings, in the settings bucket; the edge's yes is ok, its refusal said in its words; the clients' file sent back to People", async () => {
  assert.deepEqual(again.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "settings",
    spend: false,
  });
  const e = edge((b) =>
    b.source === "mailbox"
      ? [200, { ok: true }]
      : [409, { ok: false, error: "not_connected", detail: "no mailbox is connected to read it through" }],
  );
  try {
    assert.deepEqual(await again.POST.run(send({ source: "mailbox" }), ctx()), { ok: true });
    assert.equal(e.calls[0].url, "https://edge.test/api/admin/imports/again");
    assert.deepEqual(e.calls[0].body, { tenant_id: A, user_id: U, source: "mailbox" });
    assert.ok(verifyEdgeToken(SECRET, e.calls[0].token, AUD), "a token minted for that door");
    await refused(
      again.POST.run(send({ source: "contacts" }), ctx()),
      409,
      "No mailbox is connected to read it through",
    );
    await refused(again.POST.run(send({ source: "clients_file" }), ctx()), 409, IMPORT_STOPPED_WORDS.clientsAgain);
    assert.equal(e.calls.length, 2, "the clients' file never reaches the edge");
    await assert.rejects(again.POST.run(send({ source: "mailbox" }), ctx("operator")), (x) => x.code === "forbidden");
  } finally {
    e.restore();
  }
});

test("the number kept, looked up by the carrier's records: answered as the lookup, or none where it cannot be made", async () => {
  assert.deepEqual(lookup.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lines_search",
    spend: false,
  });
  const found = { type: "mobile", carrier: "verizon", name: "Verizon Wireless" };
  let answer = [200, { ok: true, lookup: found }];
  const e = edge(() => answer);
  try {
    assert.deepEqual(await lookup.POST.run(send({ number: "+13055550100" }), ctx()), { lookup: found });
    assert.deepEqual(e.calls[0].body, { op: "lookup", number: "+13055550100" });
    answer = [502, { ok: false, error: "provider_refused" }];
    assert.deepEqual(
      await lookup.POST.run(send({ number: "+13055550100" }), ctx()),
      { lookup: null },
      "the page asks the owner instead",
    );
    await assert.rejects(lookup.POST.run(send({ number: "12" }), ctx()), (x) => x.code === "validation");
  } finally {
    e.restore();
  }
});

test("the rehearsal's agent made ahead: made, or not, and the owner goes on either way; nothing dialed", async () => {
  assert.deepEqual(agent.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "receptionist_call",
    spend: false,
  });
  let answer = [200, { ok: true }];
  const e = edge(() => answer);
  try {
    assert.deepEqual(await agent.POST.run(send({}), ctx()), { made: true });
    assert.equal(e.calls[0].url, "https://edge.test/api/admin/rehearsal/agent");
    answer = [502, { ok: false, error: "provider_refused" }];
    assert.deepEqual(await agent.POST.run(send({}), ctx()), { made: false });
  } finally {
    e.restore();
  }
});
