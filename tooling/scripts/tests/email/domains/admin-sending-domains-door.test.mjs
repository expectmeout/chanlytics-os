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
import { fakeDb } from "../../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_COLD_API_KEY = "re_cold_test";
process.env.EMAIL_DOMAIN = "mail.chanlytics.com";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LEAD_TO"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
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
const PROVIDER_DOMAIN = (id, name, status = "not_started", created_at = new Date().toISOString()) => ({
  object: "domain",
  id,
  name,
  status,
  created_at,
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
/** A DKIM TXT by its full name ("resend._domainkey.getharbor.com"); "timeout" for DNS that does not answer. */
let dkim = {};
beforeEach(() => {
  dns = {};
  dkim = {};
  setTxtResolver(async (name) => {
    if (dkim[name] === "timeout") throw Object.assign(new Error("timed out"), { code: "ETIMEOUT" });
    if (dkim[name]) return [[dkim[name]]];
    if (dns[name.replace(/^_dmarc\./, "")] === "found") return [["v=DMARC1; p=none;"]];
    throw Object.assign(new Error("no data"), { code: "ENODATA" });
  });
});

/** 00175's unique index on the host, which the fake has none of: a second insert of a host answers PostgREST's 23505. */
function uniqueHosts(db, tables) {
  const from = db.from.bind(db);
  db.from = (table) => {
    const b = from(table);
    if (table !== "sending_domains") return b;
    const insert = b.insert.bind(b);
    b.insert = (values) => {
      const v = Array.isArray(values) ? values[0] : values;
      if (!tables.sending_domains.some((r) => r.host === v.host)) return insert(values);
      const refused = {
        data: null,
        error: { code: "23505", message: 'duplicate key value violates unique constraint "sending_domains_host_uq"' },
      };
      const chain = {
        select: () => chain,
        single: () => chain,
        maybeSingle: () => chain,
        then: (ok, no) => Promise.resolve(refused).then(ok, no),
      };
      return chain;
    };
    return b;
  };
  return db;
}

function world(rows = [], faults = {}) {
  const tables = {
    sending_domains: rows,
    events: [],
    notifications: [],
    tenant_config: [],
    tenant_channels: [],
    operator_pages: [],
  };
  const rpcs = { sending_domain_counts: () => tables.counts ?? { sent: 0, bounced: 0, complained: 0 } };
  const db = uniqueHosts(fakeDb(tables, faults, rpcs), tables);
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

test("a host already held is refused in words that say whose, and the provider is never asked", async () => {
  const w = world([
    row(D1, { host: "getharbor.com", tenant_id: A }),
    row(D2, { host: "busy-elsewhere.com", tenant_id: B }),
  ]);
  const net = provider(() => reply(201, PROVIDER_DOMAIN("pd-x", "getharbor.com")));
  try {
    const [s1, b1] = await answer(await knock(ADD));
    assert.deepEqual([s1, b1.error, b1.message], [409, "host_taken", "This workspace already sends from that domain."]);
    const [s2, b2] = await answer(await knock({ ...ADD, host: "busy-elsewhere.com" }));
    assert.deepEqual(
      [s2, b2.error, b2.message],
      [409, "host_taken", "That domain is already in use. We've been told and will get in touch."],
      "a fresh reservation elsewhere is its holder's for the provider's verification window",
    );
    assert.equal(net.calls.length, 0);
    assert.equal(w.tables.sending_domains.length, 2);
  } finally {
    net.restore();
  }
});

test("a host another workspace reserved and never verified is taken over after three days: theirs removed, and said to them", async () => {
  const stale = new Date(Date.now() - 4 * 86_400_000).toISOString();
  const w = world([row(D2, { host: "getharbor.com", tenant_id: B, created_at: stale, provider_domain_id: "pd-old" })]);
  const net = provider((url, init) =>
    init.method === "DELETE" && url.endsWith("/domains/pd-old")
      ? reply(200, { deleted: true })
      : init.method === "POST" && url === "https://api.resend.com/domains"
        ? reply(201, PROVIDER_DOMAIN("pd-new", "getharbor.com"))
        : reply(404, {}),
  );
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.equal(s, 200, JSON.stringify(b));
    assert.deepEqual(
      net.calls.map((c) => c.method + " " + c.url.replace("https://api.resend.com", "")),
      ["GET /domains/pd-old", "DELETE /domains/pd-old", "POST /domains"],
      "the provider is asked first, then theirs goes, then ours is made",
    );
    assert.deepEqual(
      w.tables.sending_domains.map((r) => [r.tenant_id, r.provider_domain_id]),
      [[A, "pd-new"]],
    );
    assert.deepEqual(
      w.tables.events.map((e) => [e.tenant_id, e.kind, e.data]),
      [
        [B, "sending_domain.removed", { host: "getharbor.com", why: "unverified" }],
        [A, "sending_domain.added", { host: "getharbor.com" }],
      ],
    );
  } finally {
    net.restore();
  }
  // A host that ever verified is its holder's until they remove it, however old.
  const w2 = world([
    row(D2, {
      host: "getharbor.com",
      tenant_id: B,
      created_at: stale,
      state: "held",
      held_why: "dmarc",
      held_at: stale,
      verified_at: stale,
      clean_since: stale,
    }),
  ]);
  const net2 = provider(() => reply(500, {}));
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error], [409, "host_taken"]);
    assert.equal(net2.calls.length, 0);
    assert.equal(w2.tables.sending_domains.length, 1);
  } finally {
    net2.restore();
  }
});

test("two adds pressed at once cannot make a sixth: the table's own limit is said as the count's", async () => {
  world([], {
    "sending_domains.insert": { message: "A workspace sends from 5 domains at most.", code: "P0001", hint: "too_many" },
  });
  const net = provider(() => reply(500, {}));
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error, b.message], [409, "too_many", "A workspace sends from 5 domains at most."]);
    assert.equal(net.calls.length, 0);
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

test("a create whose answer was lost adopts the domain the account made, rather than leaving it where nothing lists it", async () => {
  const w = world();
  const net = provider((url, init) => {
    if (init.method === "POST" && url === "https://api.resend.com/domains")
      throw new TypeError("fetch failed: the network went away");
    if (url.startsWith("https://api.resend.com/domains?limit=100"))
      return reply(200, {
        object: "list",
        has_more: false,
        data: [{ id: "pd-made", name: "getharbor.com", status: "not_started" }],
      });
    if (url === "https://api.resend.com/domains/pd-made")
      return reply(200, PROVIDER_DOMAIN("pd-made", "getharbor.com"));
    return reply(404, {});
  });
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.equal(s, 200, JSON.stringify(b));
    assert.equal(b.domain.records.length, 3);
    assert.equal(w.tables.sending_domains[0].provider_domain_id, "pd-made");
  } finally {
    net.restore();
  }
});

test("a create that failed and made nothing leaves nothing: the reservation goes, and the owner is told to try again", async () => {
  const w = world();
  const net = provider((url) =>
    url.startsWith("https://api.resend.com/domains?limit=100")
      ? reply(200, { object: "list", has_more: false, data: [] })
      : reply(503, { message: "Service Unavailable" }),
  );
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual(
      [s, b.error, b.message],
      [502, "provider", "The mail provider didn't answer. Try again in a minute."],
    );
    assert.equal(w.tables.sending_domains.length, 0);
  } finally {
    net.restore();
  }
});

test("a row that cannot be written takes the provider's domain with it", async () => {
  const w = world([], { "sending_domains.update": { message: "the database went away" } });
  const net = provider((url, init) =>
    init.method === "POST" && url === "https://api.resend.com/domains"
      ? reply(201, PROVIDER_DOMAIN("pd-new", "getharbor.com"))
      : reply(200, { deleted: true }),
  );
  try {
    const [s] = await answer(await knock(ADD));
    assert.equal(s, 503);
    assert.ok(
      net.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/domains/pd-new")),
      "the provider's domain is removed",
    );
    assert.equal(w.tables.sending_domains.length, 0, "and the reservation");
  } finally {
    net.restore();
  }
});

test("Check on a verified domain never asks the provider to verify: that marks it pending, which would read as a hold", async () => {
  const stale = new Date(Date.now() - 20 * 86_400_000).toISOString();
  const w = world([
    row(D1, { state: "verified", provider_status: "verified", dmarc: "found", verified_at: stale, clean_since: stale }),
  ]);
  dns["hd111.example"] = "found";
  const net = provider((url) =>
    url.endsWith("/verify") ? reply(200, {}) : reply(200, PROVIDER_DOMAIN("pd-d111", "hd111.example", "verified")),
  );
  try {
    const [s, b] = await answer(await knock({ op: "check", domain_id: D1 }));
    assert.equal(s, 200);
    assert.ok(!net.calls.some((c) => c.url.endsWith("/verify")));
    assert.deepEqual([b.domain.state, b.domain.clean_since], ["verified", stale], "the ramp keeps its days");
    assert.equal(w.tables.notifications.length, 0);
  } finally {
    net.restore();
  }
  // A domain still being checked is asked, and the pending the provider then says is "still checking", not a hold.
  const w2 = world([row(D2, { state: "verifying", provider_status: "pending" })]);
  const net2 = provider((url) =>
    url.endsWith("/verify") ? reply(200, {}) : reply(200, PROVIDER_DOMAIN("pd-d222", "hd222.example", "pending")),
  );
  try {
    const [s, b] = await answer(await knock({ op: "check", domain_id: D2 }));
    assert.equal(s, 200);
    assert.ok(net2.calls.some((c) => c.url.endsWith("/verify")));
    assert.equal(b.domain.state, "verifying");
    assert.equal(w2.tables.events.length, 0);
  } finally {
    net2.restore();
  }
});

test("a reservation that never learned its provider id is found by name when it is checked", async () => {
  const w = world([row(D1, { provider_domain_id: null })]);
  const net = provider((url) =>
    url.startsWith("https://api.resend.com/domains?limit=100")
      ? reply(200, {
          object: "list",
          has_more: false,
          data: [{ id: "pd-found", name: "hd111.example", status: "not_started" }],
        })
      : url.endsWith("/verify")
        ? reply(200, {})
        : reply(200, PROVIDER_DOMAIN("pd-found", "hd111.example")),
  );
  try {
    const [s, b] = await answer(await knock({ op: "check", domain_id: D1 }));
    assert.equal(s, 200, JSON.stringify(b));
    assert.equal(w.tables.sending_domains[0].provider_domain_id, "pd-found");
  } finally {
    net.restore();
  }
});

test("Resume lifts a reputation hold: sending again at 30 a day, its counts cleared, said once; a DNS hold and another workspace's domain are refused", async () => {
  const w = world([
    row(D1, {
      state: "held",
      held_why: "bounces",
      held_at: new Date(Date.now() - 86_400_000).toISOString(),
      verified_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      clean_since: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      sent_recent: 200,
      bounced_recent: 5,
      complaints: 0,
    }),
    row(D2, { state: "held", held_why: "dmarc", held_at: new Date().toISOString() }),
  ]);
  const host1 = w.tables.sending_domains.find((r) => r.id === D1).host;
  dns[host1] = "found";
  const net = provider((url) =>
    url.endsWith(`/domains/pd-${D1.slice(0, 4)}`)
      ? reply(200, PROVIDER_DOMAIN(`pd-${D1.slice(0, 4)}`, host1, "verified"))
      : reply(404, {}),
  );
  try {
    const before = Date.now();
    const [s, b] = await answer(await knock({ op: "resume", domain_id: D1 }));
    assert.equal(s, 200, JSON.stringify(b));
    const d = w.tables.sending_domains.find((r) => r.id === D1);
    assert.deepEqual(
      [d.state, d.held_why, d.held_at, d.sent_recent, d.bounced_recent, d.complaints],
      // Cleared with the window they counted, and counted again at once from the new one: nothing yet (2.6).
      ["verified", null, null, 0, 0, 0],
    );
    assert.ok(Date.parse(d.clean_since) >= before - 1000, "the ramp starts again from now");
    assert.equal(b.domain.state, "verified");
    assert.equal("provider_domain_id" in b.domain, false);
    const resumed = w.tables.events.filter((e) => e.kind === "sending_domain.resumed");
    assert.deepEqual(
      resumed.map((e) => e.data),
      [{ host: d.host, why: "bounces", by: "owner" }],
    );

    const [again, againBody] = await answer(await knock({ op: "resume", domain_id: D1 }));
    assert.deepEqual([again, againBody.error], [409, "not_held"], "a domain not held has nothing to resume");
    const [dnsS, dnsB] = await answer(await knock({ op: "resume", domain_id: D2 }));
    assert.deepEqual(
      [dnsS, dnsB.error, dnsB.message],
      [409, "dns_hold", "Press Check: this one lifts itself when it reads right again."],
    );
    assert.equal(w.tables.sending_domains.find((r) => r.id === D2).state, "held");
    assert.deepEqual(
      net.calls.map((c) => c.method + " " + c.url.replace("https://api.resend.com", "")),
      [`GET /domains/pd-${D1.slice(0, 4)}`],
      "read once, straight after the resume; never asked to verify, and a refused Resume asks nothing",
    );
  } finally {
    net.restore();
  }
  world([row(D1, { tenant_id: B, state: "held", held_why: "complaint", held_at: new Date().toISOString() })]);
  const [s, b] = await answer(await knock({ op: "resume", domain_id: D1 }));
  assert.deepEqual([s, b.error], [404, "not_found"]);
});

test("a create refused because the account already has the host adopts the one this very press made, so a lost create never strands a host (Part 2.5 review)", async () => {
  const w = world();
  const net = provider((url, init) => {
    if (init.method === "POST" && url === "https://api.resend.com/domains")
      return reply(422, { name: "validation_error", message: "This domain is already registered." });
    if (url.startsWith("https://api.resend.com/domains?limit=100"))
      return reply(200, {
        object: "list",
        has_more: false,
        data: [{ id: "pd-left", name: "getharbor.com", status: "not_started" }],
      });
    if (url === "https://api.resend.com/domains/pd-left")
      return reply(200, PROVIDER_DOMAIN("pd-left", "getharbor.com"));
    return reply(404, {});
  });
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.equal(s, 200, JSON.stringify(b));
    assert.equal(w.tables.sending_domains[0].provider_domain_id, "pd-left");
  } finally {
    net.restore();
  }
  // Refused for a reason, and nothing by that name at the account: the provider's own words.
  const w2 = world();
  const net2 = provider((url, init) => {
    if (init.method === "POST" && url === "https://api.resend.com/domains")
      return reply(422, { name: "validation_error", message: "The domain name is not valid." });
    if (url.startsWith("https://api.resend.com/domains?limit=100"))
      return reply(200, { object: "list", has_more: false, data: [] });
    return reply(404, {});
  });
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error], [502, "provider"]);
    assert.match(b.message, /not valid/);
    assert.equal(w2.tables.sending_domains.length, 0, "the reservation goes");
  } finally {
    net2.restore();
  }
});

test("a lost create never adopts a domain the account already verified: it is somebody's, the platform is told (Part 2.5)", async () => {
  const w = world();
  const net = provider((url, init) => {
    if (init.method === "POST" && url === "https://api.resend.com/domains")
      return reply(503, { message: "Service Unavailable" });
    if (url.startsWith("https://api.resend.com/domains?limit=100"))
      return reply(200, {
        object: "list",
        has_more: false,
        data: [{ id: "pd-theirs", name: "getharbor.com", status: "verified" }],
      });
    if (url === "https://api.resend.com/domains/pd-theirs")
      return reply(200, PROVIDER_DOMAIN("pd-theirs", "getharbor.com", "verified"));
    return reply(404, {});
  });
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual(
      [s, b.error, b.message],
      [409, "host_elsewhere", "That domain is set up somewhere else. We've been told and will get in touch."],
    );
    assert.equal(w.tables.sending_domains.length, 0);
    assert.deepEqual(
      w.tables.operator_pages.map((p) => p.key),
      ["sending_domain_conflict:getharbor.com"],
    );
  } finally {
    net.restore();
  }
});

test("a holder whose records already verify at the provider is never taken over, however old (Part 2.5)", async () => {
  const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const w = world([
    row(D2, {
      tenant_id: B,
      host: "getharbor.com",
      state: "records",
      provider_status: "partially_verified",
      created_at: old,
      updated_at: old,
    }),
  ]);
  const net = provider(() => reply(200, {}));
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error], [409, "host_taken"]);
    assert.match(b.message, /We've been told/);
    assert.equal(w.tables.sending_domains.length, 1, "theirs stays");
    assert.equal(net.calls.filter((c) => c.method === "DELETE").length, 0);
  } finally {
    net.restore();
  }
});

test("a remove whose provider domain cannot be found for sure keeps the row, and says so (Part 2.5)", async () => {
  const w = world([row(D1, { provider_domain_id: null })]);
  const net = provider((url) =>
    url.startsWith("https://api.resend.com/domains?limit=100") ? reply(500, { message: "boom" }) : reply(404, {}),
  );
  try {
    const [s, b] = await answer(await knock({ op: "remove", domain_id: D1 }));
    assert.deepEqual([s, b.error], [502, "provider"]);
    assert.equal(w.tables.sending_domains.length, 1, "kept, so nothing is stranded at the account");
  } finally {
    net.restore();
  }
});

test("a takeover asks the provider first: records that verify there are the holder's, whatever the row last said (Part 2.5 review)", async () => {
  const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const w = world([
    row(D2, {
      tenant_id: B,
      host: "getharbor.com",
      state: "records",
      provider_status: "not_started",
      provider_domain_id: "pd-theirs",
      created_at: old,
      updated_at: old,
    }),
  ]);
  const net = provider((url) =>
    url === "https://api.resend.com/domains/pd-theirs"
      ? reply(200, PROVIDER_DOMAIN("pd-theirs", "getharbor.com", "partially_verified"))
      : reply(404, {}),
  );
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error], [409, "host_taken"]);
    assert.equal(w.tables.sending_domains.length, 1, "theirs stays");
    assert.equal(net.calls.filter((c) => c.method === "DELETE").length, 0, "their provider domain is untouched");
  } finally {
    net.restore();
  }
});

test("a holder who published their DKIM key is never taken over, though the provider says not started (Part 2.6)", async () => {
  // Resend says not_started until someone presses Check: a holder who did every record at their registrar and never
  // pressed it looks, to the provider, like one who never came back. DNS tells them apart.
  const stale = new Date(Date.now() - 4 * 86_400_000).toISOString();
  const theirs = [
    { label: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=THEIRS", priority: null, status: "not_started" },
  ];
  const holder = () =>
    row(D2, { host: "getharbor.com", tenant_id: B, created_at: stale, provider_domain_id: "pd-old", records: theirs });
  for (const [said, why] of [
    ["p=THEIRS", "their key is published"],
    ["timeout", "DNS did not answer, and that is never read as not published"],
  ]) {
    const w = world([holder()]);
    dkim["resend._domainkey.getharbor.com"] = said;
    const net = provider((url) =>
      url.endsWith("/domains/pd-old") ? reply(200, PROVIDER_DOMAIN("pd-old", "getharbor.com")) : reply(404, {}),
    );
    try {
      const [s, b] = await answer(await knock(ADD));
      assert.deepEqual([s, b.error], [409, "host_taken"], why);
      assert.ok(!net.calls.some((c) => c.method === "DELETE"), `nothing of theirs is removed: ${why}`);
      assert.deepEqual(
        w.tables.sending_domains.map((r) => r.tenant_id),
        [B],
        why,
      );
    } finally {
      net.restore();
    }
  }
  // Nothing at that name, or another key there: theirs was never published, and the host can move after three days.
  const w = world([holder()]);
  dkim["resend._domainkey.getharbor.com"] = "p=SOMEONE-ELSES";
  const net = provider((url, init) =>
    init.method === "DELETE" && url.endsWith("/domains/pd-old")
      ? reply(200, { deleted: true })
      : url.endsWith("/domains/pd-old")
        ? reply(200, PROVIDER_DOMAIN("pd-old", "getharbor.com"))
        : init.method === "POST" && url === "https://api.resend.com/domains"
          ? reply(201, PROVIDER_DOMAIN("pd-new", "getharbor.com"))
          : reply(404, {}),
  );
  try {
    const [s] = await answer(await knock(ADD));
    assert.equal(s, 200);
    assert.deepEqual(
      w.tables.sending_domains.map((r) => [r.tenant_id, r.provider_domain_id]),
      [[A, "pd-new"]],
    );
  } finally {
    net.restore();
  }
});

test("a domain left at the account before this add is made again with keys of its own, never adopted (Part 2.6)", async () => {
  // Left by a removal or a takeover whose provider side did not finish: its DKIM key is the one another workspace was
  // given, and may have published. Adopting it would let this workspace verify against their DNS and send as them.
  const w = world();
  const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const net = provider((url, init) => {
    if (init.method === "POST" && url === "https://api.resend.com/domains")
      return net.calls.filter((c) => c.method === "POST").length === 1
        ? reply(422, { name: "validation_error", message: "This domain is already registered." })
        : reply(201, PROVIDER_DOMAIN("pd-fresh", "getharbor.com"));
    if (url.startsWith("https://api.resend.com/domains?limit=100"))
      return reply(200, {
        object: "list",
        has_more: false,
        data: [{ id: "pd-left", name: "getharbor.com", status: "not_started" }],
      });
    if (init.method === "DELETE" && url.endsWith("/domains/pd-left")) return reply(200, { deleted: true });
    if (url.endsWith("/domains/pd-left"))
      return reply(200, PROVIDER_DOMAIN("pd-left", "getharbor.com", "not_started", old));
    return reply(404, {});
  });
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.equal(s, 200, JSON.stringify(b));
    assert.equal(w.tables.sending_domains[0].provider_domain_id, "pd-fresh", "a domain of its own, with new keys");
    assert.ok(
      net.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/domains/pd-left")),
      "the old one goes",
    );
  } finally {
    net.restore();
  }
  // One the account cannot remove is not adopted either: the add is refused, and the reservation goes.
  const w2 = world();
  const net2 = provider((url, init) => {
    if (init.method === "POST" && url === "https://api.resend.com/domains")
      return reply(422, { name: "validation_error", message: "This domain is already registered." });
    if (url.startsWith("https://api.resend.com/domains?limit=100"))
      return reply(200, {
        object: "list",
        has_more: false,
        data: [{ id: "pd-left", name: "getharbor.com", status: "not_started" }],
      });
    if (init.method === "DELETE") return reply(500, {});
    if (url.endsWith("/domains/pd-left"))
      return reply(200, PROVIDER_DOMAIN("pd-left", "getharbor.com", "not_started", old));
    return reply(404, {});
  });
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual([s, b.error], [502, "provider"]);
    assert.equal(w2.tables.sending_domains.length, 0);
  } finally {
    net2.restore();
  }
});

test("Resume reads the domain at once: records that broke while its reputation held it hold it again, never a tick of sending first (Part 2.6)", async () => {
  // A reputation hold is never read while it stands, so a verification lost meanwhile is only seen when it is resumed.
  const w = world([
    row(D1, {
      state: "held",
      held_why: "bounces",
      held_at: new Date(Date.now() - 86_400_000).toISOString(),
      verified_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      clean_since: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      dmarc: "found",
      provider_status: "verified",
    }),
  ]);
  const host = w.tables.sending_domains[0].host;
  dns[host] = "found";
  const net = provider((url) =>
    url.endsWith(`/domains/pd-${D1.slice(0, 4)}`)
      ? reply(200, PROVIDER_DOMAIN(`pd-${D1.slice(0, 4)}`, host, "failed"))
      : reply(404, {}),
  );
  try {
    const [s, b] = await answer(await knock({ op: "resume", domain_id: D1 }));
    assert.equal(s, 200, JSON.stringify(b));
    assert.deepEqual(
      [b.domain.state, b.domain.held_why],
      ["held", "verification"],
      "the page is told what is true now",
    );
    assert.deepEqual(
      w.tables.events.map((e) => e.kind),
      ["sending_domain.resumed", "sending_domain.held"],
      "the resume, then the hold its records earned",
    );
  } finally {
    net.restore();
  }
});

test("a domain held twice in 30 days is the platform's to lift (D16): the owner's Resume is refused, the platform's key lifts it", async () => {
  const held = (over = {}) =>
    row(D1, {
      state: "held",
      held_why: "bounces",
      held_at: new Date().toISOString(),
      provider_status: "verified",
      dmarc: "found",
      verified_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      clean_since: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      resume_by: "platform",
      ...over,
    });
  const w = world([held()]);
  const host = w.tables.sending_domains[0].host;
  dns[host] = "found";
  const net = provider((url) =>
    url.endsWith(`/domains/pd-${D1.slice(0, 4)}`)
      ? reply(200, PROVIDER_DOMAIN(`pd-${D1.slice(0, 4)}`, host, "verified"))
      : reply(404, {}),
  );
  try {
    const [s1, b1] = await answer(await knock({ op: "resume", domain_id: D1 }));
    assert.deepEqual(
      [s1, b1.error, b1.message],
      [409, "platform_hold", "Held twice in 30 days: we lift this hold, and we've been told."],
    );
    // A dashboard's token speaks for an owner, whatever its body says.
    const [s2, b2] = await answer(await knock({ op: "resume", domain_id: D1, by: "platform" }));
    assert.deepEqual([s2, b2.error], [403, "platform_only"]);
    assert.equal(w.tables.sending_domains[0].state, "held", "neither lifted it");

    process.env.DIAG_KEY = "diag-key-for-this-file";
    const [s3, b3] = await answer(
      await knock(
        { op: "resume", tenant_id: A, domain_id: D1, by: "platform" },
        { "x-diag-key": process.env.DIAG_KEY },
      ),
    );
    assert.equal(s3, 200, JSON.stringify(b3));
    const d = w.tables.sending_domains[0];
    assert.deepEqual(
      [d.state, d.held_why, d.resume_by],
      ["verified", null, "owner"],
      "the next hold is its owner's again",
    );
    assert.deepEqual(
      w.tables.events.filter((e) => e.kind === "sending_domain.resumed").map((e) => e.data),
      [{ host, why: "bounces", by: "platform" }],
    );
    assert.equal(b3.domain.resume_by, "owner");
    assert.ok(
      w.tables.notifications.some((n) => n.title === `${host} sends again`),
      "the owner is told, as the hold's notice promised",
    );
  } finally {
    delete process.env.DIAG_KEY;
    net.restore();
  }
});

test("a domain removed while its hold was the platform's is not added again inside 30 days (D16); after the platform's Resume, it may be", async () => {
  const w = world([]);
  const host = "getharbor.com";
  const ev = (kind, data, daysAgo) => ({
    id: crypto.randomUUID(),
    tenant_id: A,
    kind,
    subject_type: "sending_domain",
    subject_id: "the-removed-row",
    data: { host, ...data },
    created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  });
  w.tables.events.push(ev("sending_domain.held", { why: "bounces", resume_by: "platform" }, 3));
  const net = provider(() => reply(200, PROVIDER_DOMAIN("pd-new", host)));
  try {
    const [s, b] = await answer(await knock(ADD));
    assert.deepEqual(
      [s, b.error, b.message],
      [
        409,
        "platform_hold",
        "This domain was held twice in the last 30 days, and removed before we lifted it. It can be added again 30 days after it was held.",
      ],
    );
    assert.equal(w.tables.sending_domains.length, 0, "nothing reserved");
    assert.equal(net.calls.length, 0, "nothing asked of the provider");
    // The platform lifted it before it was removed: added again as any domain.
    w.tables.events.push(ev("sending_domain.resumed", { why: "bounces", by: "platform" }, 2));
    const [s2] = await answer(await knock(ADD));
    assert.equal(s2, 200);
  } finally {
    net.restore();
  }
});
