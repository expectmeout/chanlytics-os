/**
 * The three sending-domain routes (Reach out, Part 2), run: the real route modules over a database in memory, the
 * edge's door answered by the test. What is proved is the policy each declares, what is refused before the edge is
 * asked, what the edge is sent (the workspace and the person, in a token for this door), how its answers become the
 * owner's words, and that the page's read never carries the provider's id.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { verifyEdgeToken } from "@chanlytics/channels";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.test";
process.env.EDGE_PROVIDERS = "live";
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
after(() => {
  for (const k of ["EDGE_CALL_SECRET", "EDGE_URL", "EDGE_PROVIDERS", "EMAIL_DOMAIN"]) delete process.env[k];
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const add = await import(at("apps/dashboard/app/api/v1/sending-domains/route.ts"));
const one = await import(at("apps/dashboard/app/api/v1/sending-domains/[id]/route.ts"));
const check = await import(at("apps/dashboard/app/api/v1/sending-domains/[id]/check/route.ts"));
const resume = await import(at("apps/dashboard/app/api/v1/sending-domains/[id]/resume/route.ts"));
const { sendingDomainsFor, forgetDomainsReadiness, domainsReadiness } = await import(
  at("apps/dashboard/src/server/sending-domains.ts")
);

beforeEach(() => {
  setRateStore(memoryStore());
  forgetDomainsReadiness();
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D1 = "d1111111-1111-4111-8111-111111111111";
const membership = (role) => ({
  user_id: USER,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const ctx = (role = "owner", tables = {}) => ({
  supabase: fakeDb({ memberships: [membership(role)], ...tables }),
  userId: USER,
  email: "ada@example.com",
  params: { id: D1 },
});
const send = (method, body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

/** The edge's door, answered by the test; every call is kept with its body and token. */
function edge(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, token: init.headers?.["x-edge-token"] ?? null });
    const [status, json] = answer(body);
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const DOMAIN = { id: D1, host: "getharbor.com", address: "sam@getharbor.com", state: "records", records: [] };
async function refused(p, code, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (words) assert.match(e.message, words);
    return true;
  });
}

test("all three are an owner's or the partner's (0012), in the workspace, under the settings limit", () => {
  const policy = { kind: "write", scope: "workspace", role: "partner", rate: "settings", spend: false };
  assert.deepEqual(add.POST.policy, policy);
  assert.deepEqual(one.DELETE.policy, policy);
  assert.deepEqual(check.POST.policy, policy);
  assert.deepEqual(resume.POST.policy, policy);
});

test("an operator is refused, and a body with more than the three words is refused, before the edge is asked", async () => {
  const net = edge(() => [200, { ok: true, domain: DOMAIN }]);
  try {
    await refused(
      add.POST.run(send("POST", { host: "getharbor.com", from_local: "sam", from_name: "Sam" }), ctx("operator")),
      "forbidden",
    );
    await refused(
      add.POST.run(send("POST", { host: "getharbor.com", from_local: "sam", from_name: "Sam", tenant_id: "x" }), ctx()),
      "validation",
    );
    assert.equal(net.calls.length, 0);
  } finally {
    net.restore();
  }
});

test("an add reaches the edge's door for this workspace and this person, and answers the domain", async () => {
  const net = edge(() => [200, { ok: true, domain: DOMAIN }]);
  try {
    const out = await add.POST.run(
      send("POST", { host: "getharbor.com", from_local: "sam", from_name: "Sam at Harbor" }),
      ctx(),
    );
    assert.deepEqual(out, { domain: DOMAIN });
    const [c] = net.calls;
    assert.equal(c.url, "https://edge.test/api/admin/sending-domains");
    assert.deepEqual(c.body, {
      op: "add",
      tenant_id: A,
      user_id: USER,
      host: "getharbor.com",
      from_local: "sam",
      from_name: "Sam at Harbor",
    });
    const v = verifyEdgeToken(process.env.EDGE_CALL_SECRET, c.token, "/api/admin/sending-domains");
    assert.equal(v.ok, true);
    assert.deepEqual([v.claims.ws, v.claims.user], [A, USER], "the token names this workspace and this person");
  } finally {
    net.restore();
  }
});

test("the edge's refusals become the owner's words, the door's own sentence where it gave one", async () => {
  for (const [status, body, code, words] of [
    [503, { ok: false, error: "no_cold_key" }, "upstream_email", /isn't switched on here yet/],
    [
      409,
      { ok: false, error: "host_taken", message: "This workspace already sends from that domain." },
      "conflict",
      /already sends from that domain/,
    ],
    [
      409,
      { ok: false, error: "too_many", message: "A workspace sends from 5 domains at most." },
      "conflict",
      /5 domains at most/,
    ],
    [400, { ok: false, error: "invalid", message: "Write the domain without www." }, "validation", /without www/],
    [
      502,
      { ok: false, error: "provider", message: "The mail provider didn't answer. Try again in a minute." },
      "internal",
      /didn't answer/,
    ],
    [404, { ok: false, error: "not_found" }, "not_found", /isn't this workspace's/],
  ]) {
    const net = edge(() => [status, body]);
    try {
      await refused(check.POST.run(send("POST"), ctx()), code, words);
    } finally {
      net.restore();
    }
  }
});

test("check and remove name the domain; a remove answers removed", async () => {
  const net = edge((b) => [200, b.op === "remove" ? { ok: true, removed: true } : { ok: true, domain: DOMAIN }]);
  try {
    assert.deepEqual(await check.POST.run(send("POST"), ctx()), { domain: DOMAIN });
    assert.deepEqual(await one.DELETE.run(send("DELETE"), ctx()), { removed: true });
    assert.deepEqual(
      net.calls.map((c) => [c.body.op, c.body.domain_id, c.body.tenant_id]),
      [
        ["check", D1, A],
        ["remove", D1, A],
      ],
    );
  } finally {
    net.restore();
  }
});

test("the page's read of the domains names no provider id, and readiness is the edge's word, remembered", async () => {
  const db = fakeDb({
    sending_domains: [
      {
        id: D1,
        tenant_id: A,
        host: "getharbor.com",
        from_local: "sam",
        from_name: "Sam",
        provider_domain_id: "pd-secret",
        records: [
          {
            label: "DKIM",
            type: "TXT",
            name: "resend._domainkey",
            value: "p=x",
            priority: null,
            status: "not_started",
          },
        ],
        state: "records",
        provider_status: "not_started",
        dmarc: null,
        held_why: null,
        held_at: null,
        verified_at: null,
        clean_since: null,
        checked_at: null,
        created_at: "2026-09-25T12:00:00Z",
      },
    ],
  });
  const [d] = await sendingDomainsFor(db, A);
  assert.equal(d.address, "sam@getharbor.com");
  assert.equal("provider_domain_id" in d, false);
  const q = db.seen.find((s) => s.table === "sending_domains");
  assert.doesNotMatch(JSON.stringify(q), /provider_domain_id/, "the column is never selected");

  const net = edge(() => [200, { ok: true, ready: true }]);
  try {
    assert.equal(await domainsReadiness(), true);
    assert.equal(await domainsReadiness(), true);
    assert.equal(net.calls.length, 1, "asked once, then remembered");
  } finally {
    net.restore();
  }
});

test("Setup never waits on the edge before the mailbox exists, and a domains read that fails draws no block rather than failing Setup", async () => {
  const { emailSetupFor } = await import(at("apps/dashboard/src/server/email.ts"));
  const net = edge(() => [200, { ok: true, ready: true }]);
  try {
    const none = await emailSetupFor(fakeDb({ mailboxes: [] }), A);
    assert.deepEqual([none.mailbox, none.sending], [null, null]);
    assert.equal(net.calls.length, 0, "no edge call for a workspace with no mailbox");
    const mailbox = {
      id: "mb1",
      tenant_id: A,
      local_part: "harbor",
      reply_token: "a".repeat(24),
      reply_token_prev: null,
      from_name: "Harbor",
      reply_mode: "draft",
      last_received_at: null,
      last_error: null,
    };
    const broken = await emailSetupFor(
      fakeDb({ mailboxes: [mailbox] }, { "sending_domains.select": { message: "the database went away" } }),
      A,
    );
    assert.equal(broken.mailbox.address, "harbor@mail.chanlytics.com", "Setup still reads");
    assert.equal(broken.sending, null, "and the block is simply not drawn");
  } finally {
    net.restore();
  }
});

test("Resume reaches the edge's door for this domain, and its refusals are the owner's words", async () => {
  const net = edge(() => [200, { ok: true, domain: { ...DOMAIN, state: "verified" } }]);
  try {
    assert.deepEqual(await resume.POST.run(send("POST"), ctx()), { domain: { ...DOMAIN, state: "verified" } });
    assert.deepEqual(
      [net.calls[0].body.op, net.calls[0].body.domain_id, net.calls[0].body.tenant_id],
      ["resume", D1, A],
    );
  } finally {
    net.restore();
  }
  for (const [error, message] of [
    ["dns_hold", "Press Check: this one lifts itself when it reads right again."],
    ["not_held", "getharbor.com isn't held."],
    ["moved", "getharbor.com changed just now. Look again, then resume it."],
  ]) {
    const n = edge(() => [409, { ok: false, error, message }]);
    try {
      await refused(resume.POST.run(send("POST"), ctx()), "conflict", new RegExp(message.slice(0, 20)));
    } finally {
      n.restore();
    }
  }
  const n = edge(() => [200, { ok: true }]);
  try {
    await refused(resume.POST.run(send("POST"), ctx("operator")), "forbidden");
    assert.equal(n.calls.length, 0);
  } finally {
    n.restore();
  }
});
