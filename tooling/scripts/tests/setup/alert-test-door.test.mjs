/**
 * POST /api/admin/email/alert-test, run: Settings › Notifications' "Send a test" (decision 0040), the sibling of the first
 * run's "you're live" door (you-are-live-door.test.mjs), over the same kind of world. The real door over a database in
 * memory and a transport caught at fetch: one email to every address the workspace's alerts go to and to nobody else,
 * in contracts' words (alertTestMail), not held back by what the business turned off (a test is no kind), nothing sent
 * where the workspace has no address of its own, and the door's credential.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { newReceptionistDefaults } from "@chanlytics/contracts";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.example.com";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const DOOR = "/api/admin/email/alert-test";
const { POST } = await import(at("apps/edge/api/admin/email/alert-test.ts"));
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = (aud = DOOR, workspace = A) => {
  const secret = process.env.EDGE_CALL_SECRET;
  return (body) => signEdgeToken(secret, aud, { workspace, user: "u1", body });
};
/** The headers a knock sends, each token minted for the body it rides with: the edge refuses a token that names none. */
const minted = (headers, raw) =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, typeof v === "function" ? v(raw) : v]));
const knock = (body, headers = { "x-edge-token": token() }) =>
  POST(
    new Request(`http://edge${DOOR}`, {
      method: "POST",
      headers: minted({ ...headers, "content-type": "application/json" }, JSON.stringify(body)),
      body: JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

const world = (notifications) => ({
  tenants: [{ id: A, name: "Harbor Moving", slug: "harbor-moving", status: "active" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        // A config the receptionist reads whole (the edge parses it before it trusts a single address in it).
        brain: { business_name: "Harbor Moving", ...newReceptionistDefaults("Harbor Moving") },
        notifications,
      },
    },
  ],
  tenant_channels: [],
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

test("alert-test: one email to every alert address and nobody else, naming the business and where the choice is made", async () => {
  // email_off holds every kind it may: a test is no kind, so nothing the business turned off holds it back.
  const off = ["call", "playbook", "sweep", "job_failed"];
  setPg(fakeDb(world({ escalation_emails: ["owner@example.com", "desk@example.com"], email_off: off })));
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [200, { ok: true, sent: true, to: 2 }]);
    const mails = net.mail();
    assert.equal(mails.length, 1, "one email");
    assert.deepEqual(mails[0].to, ["owner@example.com", "desk@example.com"], "the workspace's own, never the platform");
    assert.equal(mails[0].subject, "Test alert for Harbor Moving");
    assert.ok(mails[0].text.includes("alerts for Harbor Moving reach this address"), mails[0].text);
    assert.ok(mails[0].text.includes("https://app.example.com/w/harbor-moving/settings/notifications"), mails[0].text);
  } finally {
    net.restore();
  }
});

test("alert-test: the link is contracts' appLink: the workspace's own page, and with its address word unread the front door with a hash route", async () => {
  const notifications = { escalation_emails: ["owner@example.com"] };
  const net = wire();
  try {
    setPg(fakeDb(world(notifications)));
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [200, { ok: true, sent: true, to: 1 }]);
    assert.ok(
      net.mail()[0].text.endsWith("\n\nhttps://app.example.com/w/harbor-moving/settings/notifications"),
      net.mail()[0].text,
    );
    // The workspace's row cannot be read (wiring task 1.7, N2): the mail still goes, and its link is a page the app has.
    setPg(fakeDb(world(notifications), { "tenants.select": { message: "statement timeout" } }));
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [200, { ok: true, sent: true, to: 1 }]);
    const text = net.mail()[1].text;
    assert.ok(text.endsWith("\n\nhttps://app.example.com/#/admin/notifications"), text);
    assert.ok(!text.includes("com/settings/notifications"), "never the origin and a path the app does not have");
  } finally {
    net.restore();
  }
});

test("alert-test: a workspace with no alert address of its own is sent nothing, and the platform is not told", async () => {
  setPg(fakeDb(world(undefined)));
  const net = wire();
  try {
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [
      200,
      { ok: true, sent: false, why: "no_address", to: 0 },
    ]);
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});

test("alert-test: a token for another door, or one that speaks for another workspace, is refused before anything is read", async () => {
  setPg(fakeDb(world({ escalation_emails: ["owner@example.com"] })));
  const net = wire();
  try {
    const [status] = await answer(await knock({ tenant_id: A }, { "x-edge-token": token("/api/admin/you-are-live") }));
    assert.equal(status, 403);
    const [other, said] = await answer(await knock({ tenant_id: B }));
    assert.equal(other, 403, "a token about A never speaks for B");
    assert.equal(said.error, "workspace_mismatch");
    assert.deepEqual(net.mail(), []);
  } finally {
    net.restore();
  }
});
