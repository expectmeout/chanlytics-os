/**
 * The sending-domains door, run (Reach out, Part 2): POST /api/admin/sending-domains over a database in memory, the
 * cold mail account and DNS answered by the test. Who may knock (a token minted for this door, about this
 * workspace), and each op:
 *   status   whether this deployment holds the cold account's key;
 *   add      what may not be added refused in words before the provider is asked; the host held for the workspace;
 *            nothing half-made left when the provider refuses; the page told the records, never the provider's id;
 *   check    the provider asked to look again, and what it and DNS say now judged onto the row;
 *   remove   gone at the provider (already gone is gone), then gone here.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_COLD_API_KEY = "re_cold_test";
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LEAD_TO"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setTxtResolver } = await import(at("apps/edge/lib/email/dmarc.ts"));
const door = await import(at("apps/edge/api/admin/sending-domains.ts"));
after(() => {
  setPg(null);
  setTxtResolver(null);
});

const AUD = "/api/admin/sending-domains";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D1 = "d1111111-1111-4111-8111-111111111111";
const D2 = "d2222222-2222-4222-8222-222222222222";

const token = (workspace = A) => signEdgeToken(process.env.EDGE_CALL_SECRET, AUD, { workspace, user: USER });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** The provider's documented domain, as it answers a create or a read. */
const PROVIDER_DOMAIN = (id, name, status = "not_started") => ({
  object: "domain",
  id,
  name,
  status,
  records: [
    {
      record: "SPF",
      name: "send",
      type: "MX",
      ttl: "Auto",
      status,
      value: "feedback-smtp.us-east-1.amazonses.com",
      priority: 10,
    },
    { record: "SPF", name: "send", type: "TXT", ttl: "Auto", status, value: '"v=spf1 include:amazonses.com ~all"' },
    { record: "DKIM", name: "resend._domainkey", type: "TXT", ttl: "Auto", status, value: "p=MIGf" },
  ],
});

/** The cold account, answering by route; every request is kept. */
function provider(reply) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body) : null,
      headers: init.headers,
    });
    return reply(u, init);
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const reply = (status, body) => new Response(JSON.stringify(body), { status });

let dns = {};
beforeEach(() => {
  dns = {};
  setTxtResolver(async (name) => {
    if (dns[name.replace(/^_dmarc\./, "")] === "found") return [["v=DMARC1; p=none;"]];
    throw Object.assign(new Error("no data"), { code: "ENODATA" });
  });
});

function world(rows = [], faults = {}) {
  const tables = { sending_domains: rows, events: [], notifications: [], tenant_config: [], tenant_channels: [] };
  const db = fakeDb(tables, faults, {});
  setPg(db);
  return { db, tables };
}

const row = (id, over = {}) => ({
  id,
  tenant_id: A,
  host: `h${id.slice(0, 4)}.example`,
  from_local: "sam",
  from_name: "Sam",
  provider_domain_id: `pd-${id.slice(0, 4)}`,
  records: [],
  state: "records",
  provider_status: "not_started",
  dmarc: null,
  held_why: null,
  held_at: null,
  verified_at: null,
  clean_since: null,
  checked_at: null,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});
const ADD = { op: "add", host: "getharbor.com", from_local: "sam", from_name: "Sam at Harbor" };

test("the knock: a token for this door and this workspace, or nothing", async () => {
  world();
  assert.equal((await knock({ op: "status" }, {})).status, 403, "no token and no key");
  const [status, body] = await answer(await knock({ ...ADD, tenant_id: B }));
  assert.deepEqual([status, body.error], [403, "workspace_mismatch"], "a body that names another workspace");
});

test("status says whether this deployment holds the cold account's key; without it nothing else opens", async () => {
  world();
  assert.deepEqual(await answer(await knock({ op: "status" })), [200, { ok: true, ready: true }]);
  await withEnv({ RESEND_COLD_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "status" })), [200, { ok: true, ready: false }]);
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error], [503, "no_cold_key"]);
  });
  assert.equal((await knock({ op: "rename" })).status, 400, "an op this door does not have");
});

test("what may not be added is refused in words before the provider is asked", async () => {
  const w = world([row(D1), row(D2), row(`d3${D1.slice(2)}`), row(`d4${D1.slice(2)}`)]);
  const net = provider(() => reply(500, {}));
  try {
    for (const [host, re] of [
      ["gmail.com", /free mail/],
      ["www.getharbor.com", /without www/],
      ["mail.chanlytics.com", /Chanlytics' own/],
      ["https://getharbor.com/", /domain alone/],
    ]) {
      const [s, b] = await answer(await knock({ ...ADD, host }));
      assert.deepEqual([s, b.error], [400, "invalid"], host);
      assert.match(b.message, re, host);
    }
    const [s1, b1] = await answer(await knock({ ...ADD, from_local: "noreply" }));
    assert.deepEqual([s1, b1.error], [400, "invalid"]);
    const [s2, b2] = await answer(await knock({ ...ADD, from_name: "  " }));
    assert.deepEqual([s2, b2.error], [400, "invalid"]);
    w.tables.sending_domains.push(row(`d5${D1.slice(2)}`));
    const [s3, b3] = await answer(await knock(ADD));
    assert.deepEqual([s3, b3.error, b3.message], [409, "too_many", "A workspace sends from 5 domains at most."]);
    assert.equal(net.calls.length, 0, "the provider was never asked");
  } finally {
    net.restore();
  }
});

test("a host another workspace sends from is taken, and the provider is never asked", async () => {
  const w = world([], {
    "sending_domains.insert": { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  const net = provider(() => reply(201, PROVIDER_DOMAIN("pd-x", "getharbor.com")));
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error, b.message], [409, "host_taken", "Another workspace already sends from that domain."]);
    assert.equal(net.calls.length, 0);
    assert.equal(w.tables.sending_domains.length, 0);
  } finally {
    net.restore();
  }
});

test("a refusal at the provider leaves nothing half-made, and says why in its words", async () => {
  const w = world();
  const net = provider(() =>
    reply(422, { statusCode: 422, message: "The domain getharbor.com is not a valid domain." }),
  );
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.equal(s, 502);
    assert.equal(
      b.message,
      "The mail provider would not take getharbor.com: The domain getharbor.com is not a valid domain.",
    );
    assert.equal(w.tables.sending_domains.length, 0, "the reservation went with it");
    assert.equal(w.tables.events.length, 0);
  } finally {
    net.restore();
  }
});

test("an owner adds a domain: held for the workspace, created with tracking off, and the page told its records", async () => {
  const w = world();
  const net = provider((url, init) =>
    init.method === "POST" && url === "https://api.resend.com/domains"
      ? reply(201, PROVIDER_DOMAIN("pd-new", "getharbor.com"))
      : reply(404, {}),
  );
  try {
    const [s, b] = await answer(await knock({ ...ADD, host: " GetHarbor.com ", from_local: "Sam.Lee", user_id: USER }));
    assert.equal(s, 200, JSON.stringify(b));
    assert.equal(net.calls[0].headers.Authorization, "Bearer re_cold_test", "the cold account, never the platform's");
    assert.deepEqual(net.calls[0].body, {
      name: "getharbor.com",
      region: "us-east-1",
      open_tracking: false,
      click_tracking: false,
      capabilities: { sending: "enabled", receiving: "disabled" },
    });
    const d = b.domain;
    assert.deepEqual(
      [d.host, d.address, d.from_name, d.state, d.provider_status, d.records.length],
      ["getharbor.com", "sam.lee@getharbor.com", "Sam at Harbor", "records", "not_started", 3],
    );
    assert.equal(d.records[1].value, "v=spf1 include:amazonses.com ~all");
    assert.equal("provider_domain_id" in d, false, "the page never holds the provider's id");
    const stored = w.tables.sending_domains[0];
    assert.deepEqual([stored.provider_domain_id, stored.created_by, stored.tenant_id], ["pd-new", USER, A]);
    assert.deepEqual(
      w.tables.events.map((e) => [e.kind, e.data]),
      [["sending_domain.added", { host: "getharbor.com" }]],
    );
  } finally {
    net.restore();
  }
});

test("Check asks the provider to look again, then judges what it and DNS say now", async () => {
  const w = world([row(D1, { state: "verifying", provider_status: "pending" })]);
  dns["hd111.example"] = "found";
  const net = provider((url) =>
    url.endsWith("/verify")
      ? reply(200, { object: "domain", id: "pd-d111" })
      : reply(200, PROVIDER_DOMAIN("pd-d111", "hd111.example", "verified")),
  );
  try {
    const [s, b] = await answer(await knock({ op: "check", domain_id: D1 }));
    assert.equal(s, 200, JSON.stringify(b));
    assert.deepEqual(
      net.calls.map((c) => `${c.method} ${c.url.replace("https://api.resend.com", "")}`),
      ["POST /domains/pd-d111/verify", "GET /domains/pd-d111"],
    );
    assert.deepEqual([b.domain.state, b.domain.dmarc, b.change], ["verified", "found", "verified"]);
    assert.ok(b.domain.clean_since, "the ramp's clock starts");
    assert.equal(w.tables.events.filter((e) => e.kind === "sending_domain.verified").length, 1);
    assert.equal(w.tables.notifications.length, 0, "nobody is paged for a domain that verified");
  } finally {
    net.restore();
  }
});

test("another workspace's domain is not found, whatever id the body names", async () => {
  world([row(D1, { tenant_id: B })]);
  const net = provider(() => reply(200, {}));
  try {
    for (const op of ["check", "remove"]) {
      const [s, b] = await answer(await knock({ op, domain_id: D1 }));
      assert.deepEqual([s, b.error], [404, "not_found"], op);
    }
    const [s, b] = await answer(await knock({ op: "check", domain_id: "not-a-uuid" }));
    assert.deepEqual([s, b.error], [404, "not_found"]);
    assert.equal(net.calls.length, 0);
  } finally {
    net.restore();
  }
});

test("remove: gone at the provider (already gone is gone), then gone here; a provider that fails keeps the row", async () => {
  const w = world([row(D1), row(D2)]);
  let net = provider((url, init) =>
    init.method === "DELETE" && url.endsWith("pd-d111") ? reply(200, { deleted: true }) : reply(404, {}),
  );
  try {
    assert.deepEqual(await answer(await knock({ op: "remove", domain_id: D1 })), [200, { ok: true, removed: true }]);
    assert.deepEqual(
      await answer(await knock({ op: "remove", domain_id: D2 })),
      [200, { ok: true, removed: true }],
      "404 at the provider",
    );
    assert.equal(w.tables.sending_domains.length, 0);
    assert.deepEqual(
      w.tables.events.map((e) => e.kind),
      ["sending_domain.removed", "sending_domain.removed"],
    );
  } finally {
    net.restore();
  }
  const w2 = world([row(D1)]);
  net = provider(() => reply(500, {}));
  try {
    const [s, b] = await answer(await knock({ op: "remove", domain_id: D1 }));
    assert.deepEqual([s, b.error], [502, "provider"]);
    assert.equal(w2.tables.sending_domains.length, 1, "the row stays, so it can be removed again");
  } finally {
    net.restore();
  }
});
