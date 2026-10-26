/**
 * A workspace a partner sets up and hands to its owner (decision 0016) starts as one an owner makes does: the platform
 * mailbox hears of it, and someone is emailed when a customer needs a person.
 *
 * Both used to run only in create_workspace's route (workspace-create.ts). A partner's workspace was never told to the
 * platform, and the owner who accepted it had no alert address, so every "a customer needs you" went to the platform,
 * redacted, until the owner found Settings › Notifications. The notice goes as the partner sets the workspace up, naming
 * the address it waits for; the owner's own address goes on the alert list as they accept, through the same versioned
 * write, beside any address the partner chose and never in its place.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
// The notice goes only where the providers are live: a preview or a laptop tells the platform nothing.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const partnerWorkspaces = await import(at("apps/dashboard/app/api/v1/partner/workspaces/route.ts"));
const accept = await import(at("apps/dashboard/app/api/v1/handovers/[id]/accept/route.ts"));

const PARTNER = "99999999-9999-4999-8999-999999999999";
const OWNER = "88888888-8888-4888-8888-888888888888";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LUNA = { id: B, slug: "luna-studio", name: "Luna Studio" };

/** Every request that leaves for the edge, answered with an empty yes. */
let wire;
beforeEach(() => {
  setRateStore(memoryStore());
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ path: new URL(String(url)).pathname, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  wire = { seen, restore: () => (globalThis.fetch = real) };
});
afterEach(() => {
  wire.restore();
  setServiceClient(null);
});

const ctxFor = (who, email, tables, rpcs, params = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: who,
  email,
  // Past the second factor (0013, M3): a partner's seat asks for it; second-factor.test.mjs proves the refusal.
  aal: "aal2",
  params,
  headers: {},
});
const send = (body) =>
  new Request("http://localhost/api/v1/x", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const configRow = (config, version = 1) => ({
  tenant_id: B,
  config,
  version,
  updated_at: "2026-10-25T00:00:00Z",
});

test("REGRESSION: a workspace a partner sets up is told to the platform, naming the owner it waits for -- the notice went only from the route an owner makes one through", async () => {
  // The invitation looks the address up with the service role; an account exists, so the edge writes to it.
  setServiceClient({ rpc: async () => ({ data: "an-account", error: null }) });
  const rpcs = { create_workspace_for_business: () => [{ ...LUNA, status: "active", timezone: "Europe/Madrid" }] };
  // The row create_workspace_for gives every workspace, empty, so a write to it as the partner would show.
  const tables = { tenant_config: [configRow({})] };
  const out = await partnerWorkspaces.POST.run(
    send({ name: "Luna Studio", email: "Owner@Example.com", timezone: "Europe/Madrid" }),
    ctxFor(PARTNER, "ada@example.com", tables, rpcs),
  );
  assert.deepEqual(out, { workspace: LUNA, sent: true });
  assert.deepEqual(
    [tables.tenant_config[0].config, tables.tenant_config[0].version],
    [{}, 1],
    "the partner is not made its alert address: that is the owner's, given as they accept, and a first one would block it",
  );

  const told = wire.seen.filter((r) => r.path === "/api/admin/signup-notify");
  assert.equal(told.length, 1, "the platform mailbox hears of the new workspace once");
  assert.deepEqual(
    JSON.parse(told[0].init.body),
    { tenant_id: B, email: "owner@example.com" },
    "the notice's owner is the address the workspace waits for, never the partner, who never owns it",
  );
  const claims = verifyEdgeToken(SECRET, told[0].init.headers["x-edge-token"], "/api/admin/signup-notify");
  assert.equal(claims.ok, true);
  assert.deepEqual([claims.claims.ws, claims.claims.user], [B, PARTNER], "the partner is who set it off");
  assert.ok(
    wire.seen.some((r) => r.path === "/api/admin/handover-invite"),
    "and the owner is still invited",
  );
});

test("REGRESSION: the owner who accepts a handover is its first alert address -- a handed-over workspace emailed nobody when a customer needed a person", async () => {
  const tables = { tenant_config: [configRow({})] };
  const rpcs = { handover_accept: (a) => (a.p_tenant === B ? [LUNA] : null) };
  const out = await accept.POST.run(send(), ctxFor(OWNER, "Owner@Example.com", tables, rpcs, { id: B }));
  assert.deepEqual(out, { workspace: LUNA });
  assert.deepEqual(
    [tables.tenant_config[0].config, tables.tenant_config[0].version, tables.tenant_config[0].updated_by],
    [{ notifications: { escalation_emails: ["owner@example.com"] } }, 2, OWNER],
    "the owner's own address, saved as the settings door saves: versioned, and by its author",
  );
});

test("the hand-over puts the owner beside an address the partner chose, never in its place; an owner already on the list is left alone; a refused accept gives none", async () => {
  const chosen = { notifications: { escalation_emails: ["desk@example.com"] } };
  const tables = { tenant_config: [configRow(chosen, 4)] };
  const rpcs = { handover_accept: () => [LUNA] };
  await accept.POST.run(send(), ctxFor(OWNER, "Owner@Example.com", tables, rpcs, { id: B }));
  assert.deepEqual(
    [tables.tenant_config[0].config, tables.tenant_config[0].version],
    [{ notifications: { escalation_emails: ["desk@example.com", "owner@example.com"] } }, 5],
    "the partner's address stays, and the business is told about its own customers too",
  );

  const listed = { notifications: { escalation_emails: ["owner@example.com"] } };
  const already = { tenant_config: [configRow(listed, 7)] };
  await accept.POST.run(send(), ctxFor(OWNER, "OWNER@example.com", already, rpcs, { id: B }));
  assert.deepEqual(
    [already.tenant_config[0].config, already.tenant_config[0].version],
    [listed, 7],
    "an owner already on the list is not written again",
  );

  const empty = { tenant_config: [configRow({})] };
  const refusing = {
    handover_accept: () => {
      throw Object.assign(new Error("There is no workspace waiting for you there."), { code: "P0002" });
    },
  };
  await assert.rejects(accept.POST.run(send(), ctxFor(OWNER, "owner@example.com", empty, refusing, { id: B })), {
    code: "not_found",
  });
  assert.deepEqual(
    [empty.tenant_config[0].config, empty.tenant_config[0].version],
    [{}, 1],
    "nobody who was refused the workspace is made its address",
  );
});
