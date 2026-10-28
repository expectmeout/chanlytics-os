/**
 * POST /api/admin/email/test-to-self, run: a sequence step's Send me a test (the parity review's W5). The real door over a
 * database in memory and a transport caught at fetch: the words the dashboard said go once, from the platform's sender,
 * to the sign-in address of the person the token names and to nobody else, never to an address a body gives; someone not
 * in the workspace, or with no address, is sent nothing; and the door's credential.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const DOOR = "/api/admin/email/test-to-self";
const { POST } = await import(at("apps/edge/api/admin/email/test-to-self.ts"));
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADA = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const MAIL = { subject: "Test: A note, Dani", text: "A test of what Harbor Moving sends.\n\nHi Dani" };

const token = (user = ADA, aud = DOOR, workspace = A) =>
  signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace, user });
const knock = (body, headers = { "x-edge-token": token() }) =>
  POST(
    new Request(`http://edge${DOOR}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

/** A workspace Ada belongs to, and the identity store as the service role reads it: whose address is whose. */
function world(addresses = { [ADA]: "ada@example.com", [STRANGER]: "stranger@example.com" }) {
  const db = fakeDb({
    tenants: [{ id: A, name: "Harbor Moving", slug: "harbor-moving", status: "active" }],
    memberships: [{ user_id: ADA, tenant_id: A, role: "operator" }],
  });
  const asked = [];
  db.auth = {
    admin: {
      getUserById: async (id) => {
        asked.push(id);
        return { data: { user: { id, email: addresses[id] ?? null } }, error: null };
      },
    },
  };
  setPg(db);
  return asked;
}

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

test("test-to-self: the words go once, from the platform's sender, to the token's person's own address and nobody else", async () => {
  world();
  const net = wire();
  try {
    // A body that names another address, or another person, is not believed: the token says who pressed.
    const body = { tenant_id: A, ...MAIL, to: "someone@example.com", user_id: STRANGER };
    assert.deepEqual(await answer(await knock(body)), [200, { ok: true, sent: true, to: "ada@example.com" }]);
    // Marked as a program's mail, as all the platform's sender sends is (#1858): a connected mailbox leaves the test be.
    assert.deepEqual(net.mail(), [
      {
        from: "Pager <pager@platform.test>",
        to: ["ada@example.com"],
        subject: MAIL.subject,
        text: MAIL.text,
        headers: { "Auto-Submitted": "auto-generated" },
      },
    ]);
  } finally {
    net.restore();
  }
});

test("test-to-self: someone not in the workspace, or an account with no address, is sent nothing", async () => {
  const net = wire();
  try {
    const asked = world();
    assert.deepEqual(await answer(await knock({ tenant_id: A, ...MAIL }, { "x-edge-token": token(STRANGER) })), [
      200,
      { ok: true, sent: false, why: "no_address" },
    ]);
    assert.deepEqual(asked, [], "the identity store is never asked about someone outside the workspace");
    world({});
    assert.deepEqual(await answer(await knock({ tenant_id: A, ...MAIL })), [
      200,
      { ok: true, sent: false, why: "no_address" },
    ]);
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});

test("test-to-self: no words, or words past their bound, are refused before anything is read", async () => {
  const asked = world();
  const net = wire();
  try {
    for (const bad of [{}, { subject: MAIL.subject }, { ...MAIL, subject: "x".repeat(201) }, { ...MAIL, text: "  " }]) {
      const [status, said] = await answer(await knock({ tenant_id: A, ...bad }));
      assert.equal(status, 400, JSON.stringify(bad));
      assert.equal(said.error, "bad_request");
    }
    assert.deepEqual(asked, []);
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});

test("test-to-self: a token for another door, or one that speaks for another workspace, is refused before anything is read", async () => {
  world();
  const net = wire();
  try {
    const [status] = await answer(
      await knock({ tenant_id: A, ...MAIL }, { "x-edge-token": token(ADA, "/api/admin/email/alert-test") }),
    );
    assert.equal(status, 403);
    const [other, said] = await answer(await knock({ tenant_id: B, ...MAIL }));
    assert.equal(other, 403, "a token about A never speaks for B");
    assert.equal(said.error, "workspace_mismatch");
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});
