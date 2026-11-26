/**
 * A deployment that may not reach its providers (a preview, a laptop) connects no real number: the connect route refuses
 * in the owner's words before the edge is asked, and the sign-up's door says it is not ready, so nobody is offered the
 * press. Run through route() with the modules' own `run`; pinned as the service's text until 26 Nov 2026. A file of its
 * own because the deployment is read once, as the dashboard's environment loads: the live half is
 * a-number-is-connected-through-the-edge.test.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["EDGE_PROVIDERS", "DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const connect = await importSrc("apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts");
const signup = await importSrc("apps/dashboard/app/api/v1/channels/whatsapp/signup/route.ts");
const realFetch = globalThis.fetch;
after(() => (globalThis.fetch = realFetch));

const T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ctx = () => ({
  supabase: fakeDb({
    memberships: [
      { user_id: USER, tenant_id: T, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-02-01T00:00:00Z" },
    ],
    tenants: [{ id: T, slug: "harbor", name: "Harbor Moving", status: "active", timezone: "America/New_York" }],
    decisions: [],
  }),
  userId: USER,
  email: "ada@example.com",
  aal: "aal2",
  params: {},
});
const ask = (method, body) =>
  new Request(`http://localhost/api/v1/channels/whatsapp/x?workspace=${T}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("a preview never connects a real number, and never offers to", async () => {
  setRateStore(memoryStore());
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response("{}", { status: 500 });
  };
  const refused = await connect.POST.run(ask("POST", { code: "AQBx-code" }), ctx()).then(
    () => assert.fail("a preview connected a number"),
    (e) => e,
  );
  assert.deepEqual(
    [refused.code, refused.status, refused.message],
    ["upstream_meta", 502, "Connecting only works on the production dashboard."],
  );
  const door = await signup.GET.run(ask("GET"), ctx());
  assert.deepEqual([door.ready, door.reason, door.can_connect], [false, "preview", false]);
  assert.deepEqual(asked, [], "nothing was asked of the edge");
});
