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
function provider(statusById, onRead = () => {}) {
  return wire((url, init) => {
    const m = /\/domains\/([^/]+)$/.exec(url);
    if (m && (init?.method ?? "GET") === "GET") {
      onRead(decodeURIComponent(m[1]));
      const s = statusById[decodeURIComponent(m[1])];
      if (/^\d{3}$/.test(s ?? "")) return new Response("upstream", { status: Number(s) });
      return new Response(JSON.stringify({ id: m[1], name: "x.example", status: s ?? "verified", records: [] }), {
        status: 200,
      });
    }
    return new Response("{}", { status: 200 });
  });
}

/** 00179's cold_receipts_owed as the watch reads it: each row a verified domain that sent in the window. */
let owed = () => [];
beforeEach(() => {
  owed = () => [];
});

function world(rows, counts) {
  const tables = {
    sending_domains: rows,
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: [OWNER] } } }],
    tenant_channels: [],
    notifications: [],
    events: [],
    operator_pages: [],
  };
  const rpcs = { ...vault, cold_receipts_owed: (a) => owed(a) };
  // 00176's count, answered per host; a host answering an Error is a read that failed.
  if (counts)
    rpcs.sending_domain_counts = (a) => {
      const c = counts[a.p_host];
      if (c instanceof Error) throw c;
      return c ?? { sent: 0, bounced: 0, complained: 0 };
    };
  const db = fakeDb(tables, {}, rpcs);
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
  const net = provider({ "pd-d1": "failed" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.held, 1);
    const d = w.row("d1");
    assert.deepEqual([d.state, d.held_why, d.provider_status], ["held", "verification", "failed"]);
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

test("a blip is not a red sweep: every domain unreadable for a 5xx or a 429 is a 200, read again next tick", async () => {
  for (const code of ["500", "429"]) {
    const w = world([domain("d1"), domain("d2")]);
    const net = provider({ "pd-d1": code, "pd-d2": code });
    try {
      const [status, body] = await answer(await knock(POST, "domains"));
      assert.equal(status, 200, code);
      assert.deepEqual([body.unreadable, body.refused], [2, 0]);
      assert.equal(w.row("d1").state, "verified", "an unreadable domain is left as it was");
      assert.equal(w.tables.notifications.length, 0);
    } finally {
      net.restore();
    }
  }
});

test("the key refused for every domain is a red sweep: ours, not the domains'", async () => {
  world([domain("d1"), domain("d2")]);
  const net = provider({ "pd-d1": "401", "pd-d2": "403" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 503);
    assert.equal(body.error, "no_domain_readable");
    assert.equal(body.refused, 2);
  } finally {
    net.restore();
  }
});

test("one domain readable among unreadable ones is a 200, and the unreadable one is left as it was", async () => {
  const w = world([domain("d1"), domain("d2")]);
  dns["d2.example"] = "found";
  const net = provider({ "pd-d1": "401", "pd-d2": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.unreadable, 1);
    assert.equal(w.row("d1").state, "verified");
  } finally {
    net.restore();
  }
});

test("a missing DMARC record holds a sending domain on the second read in a row, not the first", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "missing";
  const net = provider({ "pd-d1": "verified" });
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").state, w.row("d1").dmarc], ["verified", "missing"], "stored, not held");
    assert.equal(w.tables.notifications.length, 0);
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "dmarc"]);
    assert.equal(w.tables.events.filter((e) => e.kind === "sending_domain.held").length, 1);
    assert.equal(w.tables.notifications.length, 1);
  } finally {
    net.restore();
  }
});

test("a check that raced another writer writes nothing: the row as it was read is not the row any more", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "found";
  // An owner's Check, or a removal, lands while the sweep's read is on its way.
  const net = provider({ "pd-d1": "failed" }, () => {
    w.row("d1").updated_at = new Date().toISOString();
  });
  try {
    const [status] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(w.row("d1").state, "verified", "the stale read held nothing");
    assert.equal(w.tables.events.length, 0);
    assert.equal(w.tables.notifications.length, 0, "and told nobody");
  } finally {
    net.restore();
  }
});

test("a verified domain is counted since it was clean; bounces or a complaint hold it and tell its owner; the counts land on the row", async () => {
  const w = world(
    [
      domain("d1"),
      domain("d2"),
      domain("d3"),
      domain("d4", { state: "held", held_why: "dmarc", held_at: ago(DAY), dmarc: "missing" }),
    ],
    {
      "d1.example": { sent: 200, bounced: 1, complained: 0 },
      "d2.example": { sent: 200, bounced: 5, complained: 0 },
      "d3.example": { sent: 12, bounced: 0, complained: 1 },
    },
  );
  for (const h of ["d1", "d2", "d3", "d4"]) dns[`${h}.example`] = h === "d4" ? "missing" : "found";
  const net = provider({});
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.held, 2);
    const calls = w.db.seen.filter((s) => s.rpc === "sending_domain_counts");
    assert.deepEqual(
      calls.map((c) => [c.args.p_host, c.args.p_since]).sort(),
      ["d1", "d2", "d3"].map((h) => [`${h}.example`, w.row(h).clean_since]),
      "verified domains only, each since it was clean",
    );
    assert.deepEqual(
      [w.row("d1").state, w.row("d1").sent_recent, w.row("d1").bounced_recent, w.row("d1").complaints],
      ["verified", 200, 1, 0],
    );
    assert.deepEqual([w.row("d2").state, w.row("d2").held_why], ["held", "bounces"]);
    assert.deepEqual([w.row("d3").state, w.row("d3").held_why], ["held", "complaint"]);
    assert.deepEqual(
      w.tables.events
        .filter((e) => e.kind === "sending_domain.held")
        .map((e) => e.data)
        .sort((a, b) => a.host.localeCompare(b.host)),
      [
        { host: "d2.example", why: "bounces" },
        { host: "d3.example", why: "complaint" },
      ],
    );
    assert.deepEqual(w.tables.notifications.map((n) => n.title).sort(), [
      "d2.example is held: more than 2% of its recent emails bounced",
      "d3.example is held: someone marked an email from it as spam",
    ]);
  } finally {
    net.restore();
  }
});

test("a count that cannot be read judges nothing about reputation, and the domain stays as it was", async () => {
  const w = world([domain("d1")], { "d1.example": new Error("statement timeout") });
  dns["d1.example"] = "found";
  const net = provider({});
  try {
    const [status] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.deepEqual([w.row("d1").state, w.row("d1").sent_recent ?? null], ["verified", null]);
    assert.equal(w.tables.events.length, 0);
  } finally {
    net.restore();
  }
});

test("a complaint holds a domain even on a tick the provider could not be asked", async () => {
  const w = world([domain("d1")], { "d1.example": { sent: 12, bounced: 0, complained: 1 } });
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "500" });
  try {
    const [status] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200, "a blip is still not a red sweep");
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why, w.row("d1").complaints], ["held", "complaint", 1]);
    assert.equal(w.tables.events.filter((e) => e.kind === "sending_domain.held").length, 1);
    assert.equal(w.tables.notifications.length, 1);
  } finally {
    net.restore();
  }
});

test("a domain the provider no longer knows is held as provider: its owner is not emailed, the platform is (Part 2.5 D10)", async () => {
  // The first read that found nothing was stored (provider_status not_found); this is the second.
  const w = world([domain("d1", { provider_status: "not_found" }), domain("d2")]);
  dns["d1.example"] = "found";
  dns["d2.example"] = "found";
  const net = provider({ "pd-d1": "404", "pd-d2": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "provider"]);
    assert.equal(w.row("d2").state, "verified");
    assert.equal(w.tables.notifications.length, 0, "no owner is told of the platform's account");
    assert.deepEqual(
      w.tables.operator_pages.map((p) => p.key),
      ["sending_domain_provider_lost"],
    );
    assert.equal(body.held, 1);
    // It lifts itself when the provider knows it again, and keeps its ramp.
    const clean = w.row("d1").clean_since;
    const net2 = provider({ "pd-d1": "verified", "pd-d2": "verified" });
    try {
      await answer(await knock(POST, "domains"));
      assert.equal(w.row("d1").state, "verified");
      assert.equal(w.row("d1").clean_since, clean, "an account blip does not restart the ramp");
    } finally {
      net2.restore();
    }
  } finally {
    net.restore();
  }
});

test("a domain the provider could not be asked about is stamped read, so it waits its turn next tick (Part 2.5)", async () => {
  const w = world([domain("d1", { checked_at: ago(3 * 3600_000) })]);
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "500" });
  try {
    await answer(await knock(POST, "domains"));
    assert.ok(Date.parse(w.row("d1").checked_at) > Date.now() - 60_000, "the attempt is its read time");
    assert.equal(w.row("d1").state, "verified", "and nothing else changed");
  } finally {
    net.restore();
  }
});

test("a reputation hold is not read: only its owner lifts it (Part 2.5)", async () => {
  world([domain("d1", { state: "held", held_why: "complaint", held_at: ago(DAY) }), domain("d2")]);
  dns["d2.example"] = "found";
  const read = [];
  const net = provider({}, (id) => read.push(id));
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual(read, ["pd-d2"]);
  } finally {
    net.restore();
  }
});

test("every due domain a tick has time for is read: sixty in one tick, not thirty (Part 2.5)", async () => {
  const rows = Array.from({ length: 60 }, (_, i) => domain(`d${i}`));
  for (const r of rows) dns[r.host] = "found";
  const w = world(rows);
  const read = [];
  const net = provider({}, (id) => read.push(id));
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(read.length, 60);
    assert.equal(body.checked, 60);
    assert.equal(typeof body.oldest_read_s, "number", "the answer says how stale the oldest read was");
    assert.ok(w.tables.sending_domains.every((r) => r.checked_at && Date.parse(r.checked_at) > Date.now() - 60_000));
  } finally {
    net.restore();
  }
});

test("a domain held again within a day tells its owner once (Part 2.5)", async () => {
  const w = world([domain("d1")]);
  w.tables.events.push({
    id: "e0",
    tenant_id: A,
    kind: "sending_domain.held",
    category: "setup",
    subject_type: "sending_domain",
    subject_id: "d1",
    data: { host: "d1.example", why: "verification" },
    created_at: ago(3 * 3600_000),
  });
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "failed" });
  try {
    await answer(await knock(POST, "domains"));
    assert.equal(w.row("d1").state, "held");
    assert.equal(w.tables.events.filter((e) => e.kind === "sending_domain.held").length, 2, "the hold is said");
    assert.equal(w.tables.notifications.length, 0, "but its owner was told three hours ago");
  } finally {
    net.restore();
  }
});
test("the once-a-day notice is for DNS holds only: a provider blip earlier never hides a hold the owner must act on (Part 2.5 review)", async () => {
  const w = world([domain("d1")]);
  w.tables.events.push({
    id: "e1",
    tenant_id: A,
    kind: "sending_domain.held",
    category: "setup",
    subject_type: "sending_domain",
    subject_id: "d1",
    data: { host: "d1.example", why: "provider" },
    created_at: ago(3 * 3600_000),
  });
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "failed" });
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "verification"]);
    assert.equal(w.tables.notifications.length, 1, "the provider's hold earlier told nobody, so this one tells");
  } finally {
    net.restore();
  }
});

test("a complaint hold always tells its owner: only they can resume it (Part 2.5 review)", async () => {
  const w = world([domain("d1")], { "d1.example": { sent: 9, bounced: 0, complained: 1 } });
  w.tables.events.push({
    id: "e2",
    tenant_id: A,
    kind: "sending_domain.held",
    category: "setup",
    subject_type: "sending_domain",
    subject_id: "d1",
    data: { host: "d1.example", why: "dmarc" },
    created_at: ago(3 * 3600_000),
  });
  dns["d1.example"] = "found";
  const net = provider({});
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "complaint"]);
    assert.equal(w.tables.notifications.length, 1);
  } finally {
    net.restore();
  }
});

/* --------------------------------------------- the watch on cold receipts (Part 2.5) */

const pagesSent = (net) => net.to("/emails").map((c) => JSON.parse(c.init.body));

test("a domain whose emails of the last day heard nothing back pages the platform, in counts, never an address", async () => {
  const w = world([domain("d1"), domain("d2")]);
  dns["d1.example"] = "found";
  dns["d2.example"] = "found";
  const asked = [];
  owed = (a) => {
    asked.push(a);
    return [
      { tenant_id: A, host: "d1.example", sent: 5, unanswered: 5 },
      // Heard back about one: its receipts arrive, whatever became of the other three.
      { tenant_id: A, host: "d2.example", sent: 4, unanswered: 3 },
    ];
  };
  const net = provider({ "pd-d1": "verified", "pd-d2": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200, "the domains were read: the sweep is green, the page is the signal");
    assert.equal(body.checked, 2);
    assert.deepEqual(
      w.tables.operator_pages.map((p) => p.key),
      ["email_cold_receipts_missing"],
    );
    const [page] = pagesSent(net);
    assert.equal(page.subject, "[Chanlytics] Cold email: no receipts are arriving");
    assert.match(page.text, /^5 emails left one own domain between 2 and 26 hours ago/);
    assert.match(page.text, /RESEND_COLD_WEBHOOK_SECRET/);
    assert.doesNotMatch(page.text, /d1\.example|d2\.example|@/, "no domain, no address");
    assert.equal(w.tables.notifications.length, 0, "no owner is told: the account is the platform's");
    // The window it asked about: 26 to 2 hours back.
    const [a] = asked;
    assert.ok(Math.abs(Date.parse(a.p_from) - (Date.now() - 26 * 3600_000)) < 60_000, a.p_from);
    assert.ok(Math.abs(Date.parse(a.p_to) - (Date.now() - 2 * 3600_000)) < 60_000, a.p_to);
  } finally {
    net.restore();
  }
});

test("a few emails, or any that heard back, page nothing: one slow server is not a secret set wrong", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "found";
  owed = () => [
    { tenant_id: A, host: "d1.example", sent: 2, unanswered: 2 },
    { tenant_id: A, host: "d2.example", sent: 30, unanswered: 29 },
  ];
  const net = provider({ "pd-d1": "verified" });
  try {
    assert.equal((await knock(POST, "domains")).status, 200);
    assert.deepEqual(w.tables.operator_pages, []);
    assert.deepEqual(pagesSent(net), []);
  } finally {
    net.restore();
  }
});

test("a watch that could not be read changes nothing else: the domains were still read", async () => {
  // The first read that found no DMARC was stored; this is the second, which holds it.
  const w = world([domain("d1", { dmarc: "missing" })]);
  dns["d1.example"] = "missing";
  owed = () => {
    throw new Error("the database is not answering");
  };
  const net = provider({ "pd-d1": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.held, 1, "the sweep's own work stands");
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "dmarc"]);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    net.restore();
  }
});
