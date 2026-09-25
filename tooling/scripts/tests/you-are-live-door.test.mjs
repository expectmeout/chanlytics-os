/**
 * POST /api/admin/you-are-live, run: the "you're live" email the first run's Finish asks for (5b). The real door over a
 * database in memory and a transport caught at fetch: who is told (the workspace's own alert addresses, never the
 * platform), what the email says (contracts' youAreLiveEmail over the workspace's numbers and its test call), and the
 * door's credential. The words themselves are proved in first-run-live.test.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";
import { newReceptionistDefaults } from "@chanlytics/contracts";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.example.com";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const DOOR = "/api/admin/you-are-live";
const { POST } = await import(at("apps/edge/api/admin/you-are-live.ts"));
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = (aud = DOOR, workspace = A) =>
  signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace, user: "u1" });
const knock = (body, headers = { "x-edge-token": token() }) =>
  POST(
    new Request(`http://edge${DOOR}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

const world = (over = {}) => ({
  tenants: [{ id: A, name: "Harbor Moving", slug: "harbor-moving", status: "active" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        // A config the receptionist reads whole (the edge parses it before it trusts a single address in it).
        brain: {
          business_name: "Harbor Moving",
          ...newReceptionistDefaults("Harbor Moving"),
          profile: { ...(newReceptionistDefaults("Harbor Moving").profile || {}), handoff_number: "+17865550199" },
        },
        notifications: { escalation_emails: ["owner@example.com"] },
      },
    },
  ],
  tenant_channels: [
    { tenant_id: A, kind: "voice", status: "active", number_e164: "+13055550142", created_at: "2026-09-24T14:00:00Z" },
  ],
  lines: [
    {
      tenant_id: A,
      kind: "forwarded",
      e164: "+13055550100",
      forwarding_state: "verified",
      facts: { carrier: "verizon", mode: "unanswered" },
      created_at: "2026-09-24T14:10:00Z",
    },
  ],
  calls: [
    {
      tenant_id: A,
      direction: "inbound",
      status: "ended",
      from_e164: "+17865550199",
      duration_ms: 48_000,
      started_at: "2026-09-24T14:20:00Z",
    },
  ],
  ...over,
});
function wire() {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: "email_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    mail: () => seen.filter((r) => r.url === "https://api.resend.com/emails").map((r) => r.body),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

test("you-are-live: the owner is told, at the workspace's own address, what the test call proved and what happens from now on", async () => {
  setPg(fakeDb(world()));
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [200, { ok: true, sent: true }]);
    const [m] = net.mail();
    assert.deepEqual(m.to, ["owner@example.com"], "the workspace's own people, never the platform");
    assert.equal(m.subject, "Your receptionist is answering Harbor Moving's calls");
    assert.equal(
      m.text,
      "It answered your test call (48 sec) from +1 (786) 555-0199 through +1 (305) 555-0100.\n\n" +
        "From now on, calls to +1 (305) 555-0100 that nobody picks up reach your receptionist.\n\n" +
        "A caller who asks for a person is put through to +1 (786) 555-0199.\n\n" +
        "We'll email you here when someone needs you.\n\n" +
        "Open Today: https://app.example.com/w/harbor-moving#/today\n",
    );
  } finally {
    net.restore();
  }
});

test("you-are-live: a workspace with no alert address of its own is not emailed, and the platform is not told its business", async () => {
  const w = world();
  w.tenant_config[0].config.notifications = { escalation_emails: [] };
  setPg(fakeDb(w));
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [200, { ok: true, sent: false, why: "no_address" }]);
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});

test("you-are-live: a token for another door, or one that speaks for another workspace, is refused before anything is read", async () => {
  const db = fakeDb(world());
  setPg(db);
  const net = wire();
  try {
    const [status] = await answer(await knock({ tenant_id: A }, { "x-edge-token": token("/api/admin/setup-request") }));
    assert.equal(status, 403);
    const [other, said] = await answer(await knock({ tenant_id: B }));
    assert.equal(other, 403, "a token about A never speaks for B");
    assert.equal(said.error, "workspace_mismatch");
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});
