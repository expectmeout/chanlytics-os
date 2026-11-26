/**
 * The template routes' halves that reach WhatsApp, run: each through route() with its module's own `run`, over a
 * database in memory and an edge that answers as the edge does, on a deployment that may reach its providers.
 *
 * The routes' policies, their refusals in the person's words and the production guard are run in
 * playbooks/routes/broadcasts-templates-and-playbooks.test.mjs, and the edge's three doors (the number's own token, the
 * door to recategorise, Meta's own words, one language deleted by its id) in templates-doors.test.mjs. Between the two
 * stood the dashboard's calls of those doors, pinned as the routes' and meta-templates.ts's text until 26 Nov 2026
 * (templates-truth, templates-made-here, starter-templates): which door each asks, with what, and what each says of the
 * answer.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_SAME_NAME_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
// A deployment that may reach its providers: the guard the routes suite stops at is open here.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const { WHATSAPP_ACCOUNT_MISSING } = await importSrc("apps/dashboard/src/server/campaigns/whatsapp-refusals.ts");
const sync = await importSrc("apps/dashboard/app/api/v1/templates/sync/route.ts");
const templates = await importSrc("apps/dashboard/app/api/v1/templates/route.ts");
const template = await importSrc("apps/dashboard/app/api/v1/templates/[id]/route.ts");
const starter = await importSrc("apps/dashboard/app/api/v1/templates/starter/route.ts");
const realFetch = globalThis.fetch;
beforeEach(() => setRateStore(memoryStore()));
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

const T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const TPL = "77777777-7777-4777-8777-777777777771";
const row = (over = {}) => ({
  id: TPL,
  tenant_id: T,
  channel: "whatsapp",
  name: "fall_hours",
  language: "en_US",
  category: "utility",
  meta_status: "approved",
  meta_id: "hsm-1",
  quality: "GREEN",
  rejected_reason: null,
  synced_at: "2026-09-05T12:00:00Z",
  hidden_at: null,
  title: null,
  source: "chanlytics",
  body: "Our hours change on {{1}}.",
  variables: [{ position: 1, label: "Day", example: "Monday" }],
  components: [{ type: "BODY", text: "Our hours change on {{1}}." }],
  ...over,
});
/** An operator of a workspace with a WhatsApp number, over these tables; the ledger's service client over the same. */
function world(over = {}) {
  const tables = {
    memberships: [
      {
        user_id: USER,
        tenant_id: T,
        role: "operator",
        tenants: { slug: "bayside" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    tenants: [{ id: T, slug: "bayside", name: "Bayside", status: "active", timezone: "America/New_York" }],
    tenant_channels: [
      {
        id: "ch-wa",
        tenant_id: T,
        kind: "whatsapp",
        status: "active",
        external_id: "wa-1",
        number_e164: "+13055550188",
        config: { waba_id: "waba-1" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    templates: [],
    sequence_batches: [],
    playbooks: [],
    events: [],
    ...over,
  };
  setServiceClient(fakeDb(tables));
  return {
    tables,
    ctx: (params = {}) => ({ supabase: fakeDb(tables), userId: USER, email: "ada@example.com", params }),
  };
}
const inT = `?workspace=${T}`;
const send = (method, body) =>
  new Request(`http://localhost/api/v1/x${inT}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** The edge, as the routes meet it: every door asked and what it was sent, each answered by `reply(path, body)`. */
function edge(reply) {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(init.body) : null;
    asked.push({ path, body });
    const a = reply(path, body) ?? { status: 404, body: { ok: false, error: "not_found" } };
    return new Response(JSON.stringify(a.body), {
      status: a.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return asked;
}
const doors = (asked) => asked.map((a) => a.path).filter((p) => p !== "/api/admin/llm");
async function refusalOf(p) {
  try {
    await p;
  } catch (e) {
    return { code: e.code, status: e.status, message: e.message };
  }
  assert.fail("the route answered where it should have refused");
}

test("the sync asks the edge's sync door for this workspace, says what it found, and says a missing account or a silent Meta in the owner's words", async () => {
  const w = world();
  const asked = edge(() => ({
    body: { ok: true, seen: 4, approved: 3, marketing: 1, synced_at: "2026-09-05T12:00:00Z" },
  }));
  assert.deepEqual(await sync.POST.run(send("POST"), w.ctx()), {
    ok: true,
    seen: 4,
    approved: 3,
    marketing: 1,
    synced_at: "2026-09-05T12:00:00Z",
  });
  assert.deepEqual(asked, [{ path: "/api/admin/whatsapp/templates-sync", body: { tenant_id: T } }]);

  edge(() => ({ status: 409, body: { ok: false, error: "no_waba" } }));
  assert.deepEqual(await refusalOf(sync.POST.run(send("POST"), w.ctx())), {
    code: "conflict",
    status: 409,
    message: WHATSAPP_ACCOUNT_MISSING,
  });
  edge(() => ({ status: 502, body: { ok: false, error: "meta_failed" } }));
  assert.deepEqual(await refusalOf(sync.POST.run(send("POST"), w.ctx())), {
    code: "upstream_meta",
    status: 502,
    message: "Meta did not answer. Try again in a moment.",
  });
});

test("Settings' read carries what the picker tells marketing from utility by: the category, Meta's verdict and why, when it last matched Meta", async () => {
  const w = world({ templates: [row({ meta_status: "rejected", rejected_reason: "INVALID_FORMAT" })] });
  const [t] = (await templates.GET.run(new Request(`http://localhost/api/v1/x${inT}&all=1`), w.ctx())).templates;
  assert.deepEqual(
    [t.category, t.meta_status, t.quality, t.rejected_reason, t.synced_at],
    ["utility", "rejected", "GREEN", "INVALID_FORMAT", "2026-09-05T12:00:00Z"],
  );
});

test("a template written here goes to the edge's create door with its words; Meta's own reason comes back to the person; a name on file never leaves", async () => {
  const written = {
    name: "winter_hours",
    language: "en_US",
    category: "utility",
    body: "Our winter hours begin on {{1}}. Reply here with any question.",
    examples: ["Monday"],
    labels: ["Day"],
  };
  const w = world();
  const asked = edge((path) =>
    path === "/api/admin/whatsapp/templates-create"
      ? { body: { ok: true, id: "77777777-7777-4777-8777-777777777772", meta_status: "pending" } }
      : null,
  );
  const r = await templates.POST.run(send("POST", written), w.ctx());
  assert.deepEqual(
    [r.id, r.name, r.language, r.category, r.meta_status],
    ["77777777-7777-4777-8777-777777777772", "winter_hours", "en_US", "utility", "pending"],
    "the row Meta is reviewing, as the edge kept it",
  );
  assert.deepEqual(doors(asked), ["/api/admin/whatsapp/templates-create"]);
  const sent = asked.find((a) => a.path === "/api/admin/whatsapp/templates-create").body;
  assert.deepEqual(
    [sent.tenant_id, sent.user_id, sent.name, sent.language, sent.category, sent.body, sent.examples, sent.labels],
    [T, USER, written.name, "en_US", "utility", written.body, ["Monday"], ["Day"]],
  );
  assert.ok(
    sent.components.some((c) => c.type === "BODY" && c.text === written.body),
    "the words as Meta reads them",
  );

  // Meta says no: its own words reach the person, so they can fix the message rather than guess.
  edge((path) =>
    path === "/api/admin/whatsapp/templates-create"
      ? { status: 422, body: { ok: false, error: "meta_refused", detail: "The body must not start with a variable" } }
      : null,
  );
  assert.deepEqual(
    await refusalOf(templates.POST.run(send("POST", { ...written, name: "winter_hours_two" }), w.ctx())),
    {
      code: "validation",
      status: 400,
      message: "WhatsApp did not accept it: The body must not start with a variable. Change the message and try again.",
    },
  );

  // A name and language already on file is refused before anything leaves.
  const onFile = world({ templates: [row({ name: "winter_hours" })] });
  const none = edge(() => assert.fail("nothing may leave for a name on file"));
  assert.deepEqual(await refusalOf(templates.POST.run(send("POST", written), onFile.ctx())), {
    code: "conflict",
    status: 409,
    message: TEMPLATE_SAME_NAME_WORDS,
  });
  assert.deepEqual(none, []);
});

test("a template no send uses is deleted through the edge's delete door, by its own id", async () => {
  const w = world({ templates: [row()] });
  const asked = edge((path) =>
    path === "/api/admin/whatsapp/templates-delete" ? { body: { ok: true, at_meta: true } } : null,
  );
  const r = await template.DELETE.run(send("DELETE"), w.ctx({ id: TPL }));
  assert.deepEqual([r.deleted, r.id, r.name, r.language, r.at_meta], [true, TPL, "fall_hours", "en_US", true]);
  assert.deepEqual(asked, [
    { path: "/api/admin/whatsapp/templates-delete", body: { tenant_id: T, template_id: TPL, user_id: USER } },
  ]);

  // A run still sending it: nothing reaches the edge.
  const busy = world({
    templates: [row()],
    sequence_batches: [
      { id: "b1", tenant_id: T, template_name: "fall_hours", template_language: "en_US", state: "sending" },
    ],
  });
  const none = edge(() => assert.fail("nothing may leave while a send uses it"));
  assert.deepEqual(await refusalOf(template.DELETE.run(send("DELETE"), busy.ctx({ id: TPL }))), {
    code: "conflict",
    status: 409,
    message: "A send is still using this message. Cancel it first.",
  });
  assert.deepEqual(none, []);
});

test("a starter is submitted through the create door; one the number's account already holds is synced in, not refused", async () => {
  const body = { keys: ["visit_reminder"], languages: ["en_US"], channels: ["whatsapp"] };
  const w = world();
  const asked = edge((path) =>
    path === "/api/admin/whatsapp/templates-create"
      ? { body: { ok: true, id: "77777777-7777-4777-8777-777777777773", meta_status: "pending" } }
      : null,
  );
  const r = await starter.POST.run(send("POST", body), w.ctx());
  assert.deepEqual(
    r.results.map((x) => [x.key, x.language, x.status, x.meta_status]),
    [["visit_reminder", "en_US", "submitted", "pending"]],
  );
  assert.deepEqual(doors(asked), ["/api/admin/whatsapp/templates-create"]);
  assert.equal(asked.find((a) => a.path.endsWith("templates-create")).body.name, "visit_reminder");

  // Already at Meta (a shared account's copy): the sync brings it here, and the starter reads as synced.
  const shared = world();
  const again = edge((path) => {
    if (path === "/api/admin/whatsapp/templates-create")
      return {
        status: 422,
        body: { ok: false, error: "meta_refused", detail: "Content in this language already exists" },
      };
    if (path === "/api/admin/whatsapp/templates-sync") {
      shared.tables.templates.push(
        row({ id: "77777777-7777-4777-8777-777777777774", name: "visit_reminder", source: "meta" }),
      );
      return { body: { ok: true, seen: 1, approved: 1, marketing: 0 } };
    }
    return null;
  });
  const synced = await starter.POST.run(send("POST", body), shared.ctx());
  assert.deepEqual(
    synced.results.map((x) => [x.key, x.status, x.meta_status]),
    [["visit_reminder", "synced", "approved"]],
  );
  assert.deepEqual(doors(again), ["/api/admin/whatsapp/templates-create", "/api/admin/whatsapp/templates-sync"]);
});
