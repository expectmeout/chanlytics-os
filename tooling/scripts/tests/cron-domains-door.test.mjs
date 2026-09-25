/**
 * The domains sweep, run (Reach out, Part 2): POST /api/cron/domains over a database in memory, the cold mail
 * account's answers and DNS stubbed. Every ten minutes each domain being checked or able to send is read and judged
 * (contracts judgeDomain): one that stops verifying or loses its DMARC record is held and its owner told; one held
 * for DNS sends again once both read good; "we could not look" changes nothing, and a sweep that could read nothing
 * at all is red for sweep_health.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, wire, refusedAtTheDoor, vault, withEnv } from "./_cron-doors-world.mjs";

process.env.RESEND_API_KEY = "re_platform_test";
process.env.RESEND_COLD_API_KEY = "re_cold_test";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setTxtResolver } = await import(at("apps/edge/lib/email/dmarc.ts"));
const { POST } = await import(at("apps/edge/api/cron/domains.ts"));
after(() => {
  setPg(null);
  setTxtResolver(null);
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "owner@harbor.test";
const DAY = 86_400_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const domain = (id, over = {}) => ({
  id,
  tenant_id: A,
  host: `${id}.example`,
  from_local: "sam",
  from_name: "Sam at Harbor",
  provider_domain_id: `pd-${id}`,
  records: [],
  state: "verified",
  provider_status: "verified",
  dmarc: "found",
  held_why: null,
  held_at: null,
  verified_at: ago(20 * DAY),
  clean_since: ago(20 * DAY),
  checked_at: ago(10 * 60_000),
  created_by: null,
  created_at: ago(21 * DAY),
  updated_at: ago(10 * 60_000),
  ...over,
});

/** What DNS says, by host: "found", "missing", or "timeout". */
let dns = {};
beforeEach(() => {
  dns = {};
  setTxtResolver(async (name) => {
    const host = name.replace(/^_dmarc\./, "");
    const said = dns[host];
    if (said === "found") return [["v=DMARC1; p=none;"]];
    if (said === "timeout") throw Object.assign(new Error("timed out"), { code: "ETIMEOUT" });
    throw Object.assign(new Error("no data"), { code: "ENODATA" });
  });
});

/** The provider's word per domain id; "500" for an answer that is not one. */
function provider(statusById) {
  return wire((url, init) => {
    const m = /\/domains\/([^/]+)$/.exec(url);
    if (m && (init?.method ?? "GET") === "GET") {
      const s = statusById[decodeURIComponent(m[1])];
      if (s === "500") return new Response("upstream", { status: 500 });
      return new Response(JSON.stringify({ id: m[1], name: "x.example", status: s ?? "verified", records: [] }), {
        status: 200,
      });
    }
    return new Response("{}", { status: 200 });
  });
}

function world(rows) {
  const tables = {
    sending_domains: rows,
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: [OWNER] } } }],
    tenant_channels: [],
    notifications: [],
    events: [],
    operator_pages: [],
  };
  const db = fakeDb(tables, {}, { ...vault });
  setPg(db);
  return { db, tables, row: (id) => tables.sending_domains.find((r) => r.id === id) };
}

test("the door: the cron key or nothing, as every sweep", async () => {
  await refusedAtTheDoor(POST, "domains", setPg);
});

test("without the cold account's key the domains are unwatched, which is red, not quiet", async () => {
  world([domain("d1")]);
  await withEnv({ RESEND_COLD_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock(POST, "domains")), [503, { ok: false, error: "no_cold_key" }]);
  });
});

test("only a domain being checked or able to send is read; one waiting on its records is left to its owner", async () => {
  const w = world([domain("d1"), domain("d2", { state: "records", provider_status: "not_started", dmarc: null })]);
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.checked, 1);
    assert.deepEqual(
      net.calls.map((c) => c.url),
      ["https://api.resend.com/domains/pd-d1"],
      "one read of the cold account, and none for the domain still waiting on its records",
    );
    assert.equal(net.calls[0].init.headers.Authorization, "Bearer re_cold_test", "the cold key, never the platform's");
    assert.ok(w.row("d1").checked_at > ago(60_000), "the read is stamped");
  } finally {
    net.restore();
  }
});

test("a sending domain that stops verifying is held, said, and its owner told once", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "temporary_failure" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.held, 1);
    const d = w.row("d1");
    assert.deepEqual([d.state, d.held_why, d.provider_status], ["held", "verification", "temporary_failure"]);
    assert.ok(d.held_at);
    const held = w.tables.events.filter((e) => e.kind === "sending_domain.held");
    assert.equal(held.length, 1);
    assert.deepEqual(held[0].data, { host: "d1.example", why: "verification" });
    const bell = w.tables.notifications;
    assert.equal(bell.length, 1);
    assert.equal(bell[0].kind, "sweep");
    assert.equal(bell[0].route, "admin/integrations");
    assert.match(bell[0].title, /^d1\.example is held: it stopped verifying/);
    const mail = net
      .to("api.resend.com/emails")
      .map((c) => JSON.parse(c.init.body))
      .filter((m) => [].concat(m.to).includes(OWNER));
    assert.equal(mail.length, 1, "the owner's own mailbox");

    // The next tick: still held, nothing said twice.
    await answer(await knock(POST, "domains"));
    assert.equal(w.tables.events.filter((e) => e.kind === "sending_domain.held").length, 1);
    assert.equal(w.tables.notifications.length, 1);
  } finally {
    net.restore();
  }
});

test("a domain held for its DMARC record sends again once it reads good, and the ramp starts again", async () => {
  const w = world([domain("d1", { state: "held", held_why: "dmarc", held_at: ago(DAY), dmarc: "missing" })]);
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "verified" });
  try {
    const [, body] = await answer(await knock(POST, "domains"));
    assert.equal(body.released, 1);
    const d = w.row("d1");
    assert.deepEqual([d.state, d.held_why, d.held_at, d.dmarc], ["verified", null, null, "found"]);
    assert.ok(Date.parse(d.clean_since) > Date.now() - 60_000, "clean from now");
    assert.equal(w.tables.events.filter((e) => e.kind === "sending_domain.released").length, 1);
    assert.equal(w.tables.notifications.length, 0, "nobody is paged for good news");
  } finally {
    net.restore();
  }
});

test("DNS that does not answer holds nothing: we could not look is not a fact about the domain", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "timeout";
  const net = provider({ "pd-d1": "verified" });
  try {
    await answer(await knock(POST, "domains"));
    assert.equal(w.row("d1").state, "verified");
    assert.equal(w.row("d1").dmarc, "found", "the last answer stands");
  } finally {
    net.restore();
  }
});

test("a provider that answers nothing for every domain is a red sweep; one readable among them is a 200", async () => {
  world([domain("d1"), domain("d2")]);
  let net = provider({ "pd-d1": "500", "pd-d2": "500" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 503);
    assert.equal(body.error, "no_domain_readable");
  } finally {
    net.restore();
  }
  const w = world([domain("d1"), domain("d2")]);
  dns["d2.example"] = "found";
  net = provider({ "pd-d1": "500", "pd-d2": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.unreadable, 1);
    assert.equal(w.row("d1").state, "verified", "the unreadable one is left as it was");
  } finally {
    net.restore();
  }
});
