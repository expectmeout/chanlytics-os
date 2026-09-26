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
  sent_days: null,
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

function world(rows, counts, capacity) {
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
  // 00184's capacity, answered per domain id; an Error is a read that failed.
  if (capacity)
    rpcs.sending_domain_capacity = (a) => {
      const c = capacity[a.p_domain_id];
      if (c instanceof Error) throw c;
      return c ?? { state: "verified", clean_since: null, sent_days: 0, used: 0, recent: [], last_sent_at: null };
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
      ["d1", "d2", "d3", "d4"].map((h) => [`${h}.example`, w.row(h).clean_since]),
      "verified and held domains, each since its count began: a held one still answers for its reputation (2.6)",
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
        // What was counted stays on the ledger: a Resume clears the row's counts (2.6).
        { host: "d2.example", why: "bounces", sent: 200, bounced: 5, complaints: 0, unsubscribed: 0 },
        { host: "d3.example", why: "complaint", sent: 12, bounced: 0, complaints: 1, unsubscribed: 0 },
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

test("a domain held for DNS whose records read good again, with a complaint made meanwhile, stays held for the complaint: never a tick of sending first (Part 2.6)", async () => {
  const w = world([domain("d1", { state: "held", held_why: "dmarc", held_at: ago(DAY), dmarc: "missing" })], {
    "d1.example": { sent: 20, bounced: 0, complained: 1 },
  });
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "verified" });
  try {
    const [status, body] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.equal(body.released, 0, "not released");
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "complaint"]);
    assert.deepEqual(
      w.tables.notifications.map((n) => n.title),
      ["d1.example is held: someone marked an email from it as spam"],
      "its owner is told it waits for them now",
    );
  } finally {
    net.restore();
  }
});

test("the sweep reads a bounce hold too: a complaint since makes it a complaint hold, whether or not the receipt's own try landed (Part 2.6)", async () => {
  const w = world([domain("d1", { state: "held", held_why: "bounces", held_at: ago(DAY) })], {
    "d1.example": { sent: 200, bounced: 5, complained: 1 },
  });
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "verified" });
  try {
    assert.equal((await knock(POST, "domains")).status, 200);
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "complaint"]);
    assert.deepEqual(
      w.tables.notifications.map((n) => n.title),
      ["d1.example is held: someone marked an email from it as spam"],
    );
  } finally {
    net.restore();
  }
});

/* --------------------------------------------- the probe of the unsubscribe links (Part 2.6) */

const { verifyUnsubscribeToken } = await import("@chanlytics/channels");
const dashboard = await import(at("apps/dashboard/src/server/unsubscribe.ts"));
after(() => dashboard.setServiceClient(null));
const EDGE_KEY = "the-edge-unsubscribe-key";

/**
 * The sweep's fetches, with the dashboard's real page answering the unsubscribe link under the dashboard's own keys
 * (`current`, `previous`; undefined for unset), as the other project would: the edge and the dashboard read the same
 * variable name, so the page's keys are swapped in only while it answers.
 */
function dashboardAt({ current, previous, answer } = {}) {
  dashboard.setServiceClient(fakeDb({ tenants: [], messages: [] }));
  const opened = [];
  const net = wire(async (url, init) => {
    if (url.includes("/u/")) {
      opened.push({ url, init });
      // A stub answer for the nth ask, or undefined to let the real page answer it.
      const stubbed = answer?.(opened.length);
      if (stubbed) return stubbed;
      const token = url.slice(url.lastIndexOf("/u/") + 3);
      // The dashboard project's own variables, its database among them (the page answers over the one set above).
      const page = {
        UNSUBSCRIBE_SECRET: current,
        UNSUBSCRIBE_SECRET_PREVIOUS: previous,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1",
        SUPABASE_SERVICE_ROLE_KEY: "the-dashboard-service-key",
      };
      return withEnv(page, () => dashboard.unsubscribeGet(token));
    }
    const m = /\/domains\/([^/]+)$/.exec(url);
    if (m && (init?.method ?? "GET") === "GET")
      return new Response(JSON.stringify({ id: m[1], name: "x.example", status: "verified", records: [] }), {
        status: 200,
      });
    return new Response("{}", { status: 200 });
  });
  return { net, opened };
}

test("the sweep seals a link naming nobody and opens it on the dashboard's page: the same key opens, and nothing is paged (Part 2.6)", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "found";
  const { net, opened } = dashboardAt({ current: EDGE_KEY });
  try {
    const [status, body] = await withEnv({ UNSUBSCRIBE_SECRET: EDGE_KEY }, async () =>
      answer(await knock(POST, "domains")),
    );
    assert.equal(status, 200);
    assert.equal(body.unsubscribe, "opens");
    assert.equal(opened.length, 1, "one probe a tick");
    assert.match(opened[0].url, /^https:\/\/app\.chanlytics\.com\/u\/[A-Za-z0-9_-]{87}$/, "where the links go");
    assert.equal(opened[0].init.redirect, "manual", "a redirect is seen, never followed");
    const nobody = "00000000-0000-0000-0000-000000000000";
    assert.deepEqual(verifyUnsubscribeToken([EDGE_KEY], opened[0].url.split("/u/")[1]), {
      tenantId: nobody,
      contactId: nobody,
      messageId: nobody,
    });
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    net.restore();
  }
});

test("a rotation done dashboard first breaks nothing: the edge's old key is the page's previous one (Part 2.6)", async () => {
  world([domain("d1")]);
  dns["d1.example"] = "found";
  const { net } = dashboardAt({ current: "the-new-key", previous: EDGE_KEY });
  try {
    const body = await withEnv(
      { UNSUBSCRIBE_SECRET: EDGE_KEY },
      async () => (await answer(await knock(POST, "domains")))[1],
    );
    assert.equal(body.unsubscribe, "opens");
  } finally {
    net.restore();
  }
});

/** The sweep, run with the edge's key; its answer's body. */
const sweptWithKey = async () =>
  withEnv({ UNSUBSCRIBE_SECRET: EDGE_KEY }, async () => answer(await knock(POST, "domains")));

test("the page's own refusals page the platform, by what it said: another key, no key; and so does a redirect (Part 2.6)", async () => {
  const cases = [
    [
      "key_differs",
      { current: "a-key-the-edge-never-had" },
      /UNSUBSCRIBE_SECRET is not the same on the edge and the dashboard/,
    ],
    ["page_cannot_open", { current: undefined }, /says it cannot open any link/],
    [
      "redirects",
      { answer: () => new Response(null, { status: 308, headers: { location: "https://elsewhere.example/" } }) },
      /answered 308, a redirect/,
    ],
  ];
  for (const [outcome, page, words] of cases) {
    const w = world([domain("d1")]);
    dns["d1.example"] = "found";
    const { net, opened } = dashboardAt(page);
    try {
      const [status, body] = await sweptWithKey();
      assert.equal(status, 200, "the domains were read: the sweep is green, the page is the signal");
      assert.equal(body.unsubscribe, outcome);
      assert.equal(body.checked, 1);
      assert.equal(opened.length, 1, `${outcome}: the page's own answer is not asked twice`);
      assert.deepEqual(
        w.tables.operator_pages.map((p) => p.key),
        ["email_unsubscribe_links_broken"],
        outcome,
      );
      const [sent] = pagesSent(net);
      assert.equal(sent.subject, "[Chanlytics] Cold email: unsubscribe links don't open");
      assert.match(sent.text, words);
      assert.match(sent.text, /https:\/\/app\.chanlytics\.com\/u\//, "where the links go");
      assert.ok(!sent.text.includes(opened[0].url.split("/u/")[1]), "never the probe's own link");
      assert.equal(w.tables.notifications.length, 0, "no owner is told: the keys are the platform's");
    } finally {
      net.restore();
    }
  }
});

test("a 404 or a 503 that is not the page's own says nothing about the keys: asked again, and paged as unreachable only if it stays so (Part 2.6)", async () => {
  const timeout = () => {
    throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  };
  const cases = [
    // The platform's own 404 (an origin with no such page) and its 503 (a throttle), twice: never "the keys differ".
    [() => new Response("The page could not be found", { status: 404 }), "404, then 404"],
    [() => new Response("Service Unavailable", { status: 503 }), "503, then 503"],
    [timeout, "no answer, then no answer"],
    [() => new Response("upstream", { status: 502 }), "502, then 502"],
  ];
  for (const [stub, seen] of cases) {
    const w = world([domain("d1")]);
    dns["d1.example"] = "found";
    const { net, opened } = dashboardAt({ current: EDGE_KEY, answer: stub });
    try {
      const body = (await sweptWithKey())[1];
      assert.equal(body.unsubscribe, "unreachable", seen);
      assert.equal(opened.length, 2, "asked twice");
      const [sent] = pagesSent(net);
      assert.ok(sent.text.includes(`did not answer as the page, twice in a row: ${seen}.`), sent.text);
      assert.doesNotMatch(sent.text, /not the same/, "no cause it cannot know");
      assert.deepEqual(
        w.tables.operator_pages.map((p) => p.key),
        ["email_unsubscribe_links_broken"],
      );
    } finally {
      net.restore();
    }
  }
});

test("one slow second pages nobody: a blip, then the page's own answer, is that answer (Part 2.6)", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "found";
  // The first ask gets the platform's 503; the second reaches the real page, which opens the link.
  const { net, opened } = dashboardAt({
    current: EDGE_KEY,
    answer: (n) => (n === 1 ? new Response("Service Unavailable", { status: 503 }) : undefined),
  });
  try {
    const body = (await sweptWithKey())[1];
    assert.equal(body.unsubscribe, "opens");
    assert.equal(opened.length, 2);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    net.restore();
  }
});

test("without the edge's key nothing is sealed, so nothing is probed (Part 2.6)", async () => {
  const w = world([domain("d1")]);
  dns["d1.example"] = "found";
  const { net, opened } = dashboardAt({ current: EDGE_KEY });
  try {
    const body = await withEnv(
      { UNSUBSCRIBE_SECRET: undefined },
      async () => (await answer(await knock(POST, "domains")))[1],
    );
    assert.equal(body.unsubscribe, "no_secret");
    assert.equal(opened.length, 0);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    net.restore();
  }
});

test("the clock writes the days each domain sent (D15) beside its counts; a read that fails leaves the row's last answer", async () => {
  const w = world(
    [
      domain("d1"),
      domain("d2", { sent_days: 7 }),
      domain("d3", { state: "records", verified_at: null, clean_since: null }),
    ],
    {},
    {
      d1: { state: "verified", clean_since: null, sent_days: 4, used: 0, recent: [], last_sent_at: null },
      d2: new Error("statement timeout"),
    },
  );
  for (const h of ["d1", "d2", "d3"]) dns[`${h}.example`] = "found";
  const net = provider({ "pd-d3": "pending" });
  try {
    const [status] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    assert.deepEqual([w.row("d1").sent_days, w.row("d2").sent_days, w.row("d3").sent_days], [4, 7, null]);
    assert.deepEqual(
      w.db.seen
        .filter((s) => s.rpc === "sending_domain_capacity")
        .map((s) => s.args.p_domain_id)
        .sort(),
      ["d1", "d2"],
      "a domain not yet sending has no days to count",
    );
  } finally {
    net.restore();
  }
});

test("a domain clean again starts its days over in the same write: a hold released never says the days before it", async () => {
  const w = world(
    [domain("d1", { state: "held", held_why: "dmarc", held_at: ago(DAY), dmarc: "missing", sent_days: 20 })],
    {},
    { d1: { state: "held", clean_since: ago(20 * DAY), sent_days: 20, used: 0, recent: [], last_sent_at: null } },
  );
  dns["d1.example"] = "found";
  const net = provider({ "pd-d1": "verified" });
  try {
    const [status] = await answer(await knock(POST, "domains"));
    assert.equal(status, 200);
    const d = w.row("d1");
    assert.equal(d.state, "verified");
    assert.ok(Date.parse(d.clean_since) > Date.now() - 60_000, "clean from now");
    assert.equal(d.sent_days, 0, "the ramp's first step, as the door and the claim will count it");
  } finally {
    net.restore();
  }
});

test("unsubscribes hold a domain past 2% of what it sent (D18), after bounces; its owner resumes it", async () => {
  const w = world([domain("d1"), domain("d2")], {
    "d1.example": { sent: 200, bounced: 0, complained: 0, unsubscribed: 5 },
    // Under the floor: three of a hundred is not yet a pattern.
    "d2.example": { sent: 100, bounced: 0, complained: 0, unsubscribed: 3 },
  });
  for (const h of ["d1", "d2"]) dns[`${h}.example`] = "found";
  const net = provider({});
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "unsubscribes"]);
    assert.equal(w.row("d2").state, "verified");
    assert.deepEqual(
      w.tables.events.filter((e) => e.kind === "sending_domain.held").map((e) => e.data),
      [{ host: "d1.example", why: "unsubscribes", sent: 200, bounced: 0, complaints: 0, unsubscribed: 5 }],
    );
    assert.deepEqual(
      w.tables.notifications.map((n) => n.title),
      ["d1.example is held: more than 2% of the people it wrote to unsubscribed"],
    );
    assert.match(w.tables.notifications[0].body, /resume it on Connections/, "the owner's to resume");
    assert.notEqual(w.row("d1").resume_by, "platform");
  } finally {
    net.restore();
  }
});

test("a second reputation hold in 30 days is the platform's to lift (D16): paged, and the owner told there is nothing to press", async () => {
  const w = world([domain("d1"), domain("d2"), domain("d3")], {
    "d1.example": { sent: 200, bounced: 5, complained: 0 },
    "d2.example": { sent: 200, bounced: 5, complained: 0 },
    "d3.example": { sent: 200, bounced: 5, complained: 0 },
  });
  const held = (host, why, at) => ({
    id: crypto.randomUUID(),
    tenant_id: A,
    kind: "sending_domain.held",
    category: "setup",
    subject_type: "sending_domain",
    subject_id: "an-earlier-row",
    data: { host, why },
    created_at: at,
  });
  w.tables.events.push(
    // Held for bounces ten days ago, removed and added again since: the host, not the row, remembers.
    held("d1.example", "bounces", ago(10 * DAY)),
    // Forty days ago is past remembering.
    held("d2.example", "complaint", ago(40 * DAY)),
    // A records hold is not a reputation hold.
    held("d3.example", "dmarc", ago(5 * DAY)),
  );
  for (const h of ["d1", "d2", "d3"]) dns[`${h}.example`] = "found";
  const net = provider({});
  try {
    await answer(await knock(POST, "domains"));
    for (const h of ["d1", "d2", "d3"]) assert.deepEqual([w.row(h).state, w.row(h).held_why], ["held", "bounces"], h);
    assert.equal(w.row("d1").resume_by, "platform");
    assert.equal(w.row("d2").resume_by ?? "owner", "owner", "a first hold in 30 days is its owner's");
    assert.equal(w.row("d3").resume_by ?? "owner", "owner");
    assert.deepEqual(
      w.tables.operator_pages.map((p) => p.key),
      ["sending_domain_held_twice:d1.example"],
    );
    const d1 = w.tables.events.find((e) => e.kind === "sending_domain.held" && e.subject_id === "d1");
    assert.equal(d1.data.resume_by, "platform", "the ledger says who lifts it");
    const told = w.tables.notifications.find((n) => n.title.startsWith("d1.example"));
    assert.match(told.body, /held twice in 30 days, so we lift this hold ourselves/);
    assert.doesNotMatch(told.body, /resume it on Connections/, "nothing for the owner to press");
  } finally {
    net.restore();
  }
});

test("a worse reason inside one hold is the same hold: held for unsubscribes, bounces take its place and stay the owner's", async () => {
  const w = world([domain("d1", { state: "held", held_why: "unsubscribes", held_at: ago(DAY) })], {
    "d1.example": { sent: 200, bounced: 5, complained: 0, unsubscribed: 5 },
  });
  w.tables.events.push({
    id: crypto.randomUUID(),
    tenant_id: A,
    kind: "sending_domain.held",
    subject_type: "sending_domain",
    subject_id: "d1",
    data: { host: "d1.example", why: "unsubscribes" },
    created_at: ago(DAY),
  });
  dns["d1.example"] = "found";
  const net = provider({});
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").state, w.row("d1").held_why], ["held", "bounces"]);
    assert.notEqual(w.row("d1").resume_by, "platform");
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    net.restore();
  }
});

test("what never makes a hold the platform's: another workspace's hold of the host, a late complaint about mail from before, a history that cannot be read", async () => {
  const held = (tenant, host, why) => ({
    id: crypto.randomUUID(),
    tenant_id: tenant,
    kind: "sending_domain.held",
    subject_type: "sending_domain",
    subject_id: "an-earlier-row",
    data: { host, why },
    created_at: ago(5 * DAY),
  });
  const w = world([domain("d1"), domain("d2")], {
    "d1.example": { sent: 200, bounced: 5, complained: 0 },
    // The one complaint is about an email sent before the count began: it holds, and is the episode already answered.
    "d2.example": { sent: 200, bounced: 0, complained: 1, complained_new: 0 },
  });
  w.tables.events.push(
    held("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "d1.example", "bounces"),
    held(A, "d2.example", "bounces"),
  );
  for (const h of ["d1", "d2"]) dns[`${h}.example`] = "found";
  const net = provider({});
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([w.row("d1").held_why, w.row("d1").resume_by ?? "owner"], ["bounces", "owner"]);
    assert.deepEqual([w.row("d2").held_why, w.row("d2").resume_by ?? "owner"], ["complaint", "owner"]);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    net.restore();
  }

  // The holds before cannot be read: the hold is its owner's, and the platform is not paged on a guess.
  const u = world([domain("d1")], { "d1.example": { sent: 200, bounced: 5, complained: 0 } });
  u.tables.events.push(held(A, "d1.example", "bounces"));
  setPg(
    fakeDb(
      u.tables,
      { "events.select": { message: "statement timeout" } },
      {
        ...vault,
        cold_receipts_owed: () => [],
        sending_domain_counts: () => ({ sent: 200, bounced: 5, complained: 0 }),
      },
    ),
  );
  dns["d1.example"] = "found";
  const net2 = provider({});
  try {
    await answer(await knock(POST, "domains"));
    assert.deepEqual([u.row("d1").held_why, u.row("d1").resume_by ?? "owner"], ["bounces", "owner"]);
  } finally {
    net2.restore();
  }
});

test("the probe opens the links where they are minted: UNSUBSCRIBE_ORIGIN when it is an origin (D17), the dashboard's otherwise", async () => {
  for (const [origin, expected] of [
    ["https://links.coldmail.example", /^https:\/\/links\.coldmail\.example\/u\/[A-Za-z0-9_-]{87}$/],
    ["links.coldmail.example", /^https:\/\/app\.chanlytics\.com\/u\//],
    ["https://links.coldmail.example/path", /^https:\/\/app\.chanlytics\.com\/u\//],
  ]) {
    world([domain("d1")]);
    dns["d1.example"] = "found";
    const { net, opened } = dashboardAt({ current: EDGE_KEY });
    try {
      await withEnv({ UNSUBSCRIBE_SECRET: EDGE_KEY, UNSUBSCRIBE_ORIGIN: origin }, async () =>
        answer(await knock(POST, "domains")),
      );
      assert.match(opened[0].url, expected, origin);
    } finally {
      net.restore();
    }
  }
});

test("an origin typed with a trailing slash is the same origin: the probe opens the page there", async () => {
  world([domain("d1")]);
  dns["d1.example"] = "found";
  const { net, opened } = dashboardAt({ current: EDGE_KEY });
  try {
    await withEnv({ UNSUBSCRIBE_SECRET: EDGE_KEY, UNSUBSCRIBE_ORIGIN: "https://links.coldmail.example/" }, async () =>
      answer(await knock(POST, "domains")),
    );
    assert.match(opened[0].url, /^https:\/\/links\.coldmail\.example\/u\/[A-Za-z0-9_-]{87}$/);
  } finally {
    net.restore();
  }
});
