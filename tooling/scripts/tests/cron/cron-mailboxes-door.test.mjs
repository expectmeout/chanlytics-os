/**
 * The mailboxes sweep, run: POST /api/cron/mailboxes over a database in memory (decision 0056), the providers and DNS
 * answered by the test. Every five minutes each mailbox a business connected that is connected, paused or held has its
 * watch kept, is read back from its cursor, and has its health tended: its own mail judged hourly (a hold said in the
 * Activity log and told to its owner once), its ramp's days kept, a provider's rest lifted once its day has turned, its
 * records read daily. A signed-out mailbox is set to reconnect and left. Nothing is tended for a knock without the key.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mailboxMessageId } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { at, knock, answer, refusedAtTheDoor, vault as cronVault } from "../_cron-doors-world.mjs";
import {
  MAILBOX_ENV,
  dnsAnswers,
  liveCredentials,
  providers,
  vault,
  withEnv,
} from "../email/mailboxes/_mailbox-world.mjs";

const restore = withEnv({
  ...MAILBOX_ENV,
  UNSUBSCRIBE_SECRET: null,
  SUPABASE_URL: null,
  SUPABASE_SERVICE_ROLE_KEY: null,
});
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/mailboxes.ts"));
const dnsRestore = dnsAnswers({
  txt: async (name) => {
    if (name.endsWith("getharbor.example") && !name.startsWith("_")) return [["v=spf1 include:_spf.google.com ~all"]];
    throw Object.assign(new Error("none"), { code: "ENODATA" });
  },
  mx: async () => [{ exchange: "aspmx.l.google.com", priority: 1 }],
});
after(() => {
  setPg(null);
  dnsRestore();
  restore();
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOUR = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/** The mailboxes, their tokens, and each one's counts as 00424 would answer them. */
function world(boxes, { counts = {}, creds } = {}) {
  const v = vault(creds ?? Object.fromEntries(boxes.map((b) => [b.id, liveCredentials(`ya29.${b.id.slice(-4)}`)])));
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving" }],
    tenant_config: [{ tenant_id: T, config: {} }],
    mailbox_connections: boxes,
    messages: [],
    sequence_sends: [],
    jobs: [],
    events: [],
    notifications: [],
    memberships: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      ...cronVault,
      ...v.rpcs,
      mailbox_threads_known: () => [],
      // 00424: an email the mailbox sent, stamped with what it went under.
      stamp_email_from_mailbox: (a) => {
        const m = tables.messages.find((x) => x.id === a.p_message_id && x.tenant_id === a.p_tenant_id);
        if (!m) return false;
        m.external_id ??= a.p_provider_id;
        m.meta = {
          ...m.meta,
          email: {
            ...m.meta?.email,
            message_id: a.p_rfc_message_id,
            thread_id: a.p_thread_id,
            mailbox_id: a.p_mailbox_id,
          },
        };
        return true;
      },
      mailbox_connection_counts: (a) =>
        counts[a.p_mailbox_id] ?? { sent: 0, bounced: 0, complained: 0, unsubscribed: 0 },
      mailbox_capacity: (a) => {
        const m = tables.mailbox_connections.find((x) => x.id === a.p_mailbox_id);
        return {
          state: m.state,
          clean_since: m.clean_since,
          resting_until: m.resting_until,
          daily_cap: m.daily_cap,
          customer_domain: m.customer_domain,
          sent_days: 8,
          sent_today: 0,
          used: 0,
          recent: [],
          last_sent_at: null,
        };
      },
    },
  );
  setPg(db);
  return tables;
}
/** Gmail, quiet: a profile to start a cursor from, and history with nothing new. */
const quietGmail = () =>
  providers((c) => {
    if (c.url.endsWith("/profile")) return { json: { emailAddress: "x@getharbor.example", historyId: "500" } };
    if (c.url.includes("/history?")) return { json: { historyId: "501" } };
    if (c.url.includes("/messages?q=from")) return { json: { messages: [] } };
    return { status: 404 };
  });

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "mailboxes", setPg);
});

test("each mailbox is tended: its watch made and its cursor started, read back, its records and its ramp's days kept; a paused one is read too", async () => {
  const fresh = rows.mailboxConnection({ tenant_id: T });
  const paused = rows.mailboxConnection({
    tenant_id: T,
    address: "dana@getharbor.example",
    provider_account: "acct-dana",
    state: "paused",
    sync_cursor: "450",
    watch_expires_at: iso(5 * 24 * HOUR),
  });
  const tables = world([fresh, paused]);
  const net = quietGmail();
  try {
    const [status, body] = await answer(await knock(POST, "mailboxes"));
    assert.equal(status, 200);
    assert.deepEqual([body.tended, body.synced, body.held, body.failed, body.unsubscribe], [2, 2, 0, 0, "no_secret"]);
    const [f, p] = tables.mailbox_connections;
    assert.equal(f.sync_cursor, "501", "started from the profile, then read on");
    assert.ok(
      Date.parse(f.watch_expires_at) > Date.now(),
      "a week's watch with no push, so it is not asked every tick",
    );
    assert.deepEqual([f.dns.spf, f.dns.dkim, f.dns.dmarc, f.dns.mx], ["found", "missing", "missing", "found"]);
    assert.equal(f.dns.spf_record, "v=spf1 include:_spf.google.com ~all", "the record it has, kept to offer back");
    assert.ok(f.dns_checked_at);
    assert.equal(f.sent_days, 8, "its ramp's days, as its sends say them");
    assert.ok(f.judged_at, "judged");
    assert.equal(p.sync_cursor, "501", "a paused mailbox's replies still come back");
    assert.equal(
      net.calls.filter((c) => c.url.endsWith("/profile")).length,
      1,
      "a mailbox whose watch stands is not asked for one",
    );
  } finally {
    net.restore();
  }
});

test("its own mail holds it: said in the Activity log, its owner told once; the next tick, judged within the hour, says nothing again", async () => {
  const box = rows.mailboxConnection({ tenant_id: T, sync_cursor: "450", watch_expires_at: iso(5 * 24 * HOUR) });
  const tables = world([box], { counts: { [box.id]: { sent: 60, bounced: 6, complained: 0, unsubscribed: 0 } } });
  const net = quietGmail();
  try {
    const [, body] = await answer(await knock(POST, "mailboxes"));
    assert.equal(body.held, 1);
    const m = tables.mailbox_connections[0];
    assert.deepEqual([m.state, m.held_why], ["held", "bounces"]);
    assert.deepEqual(
      tables.events.map((e) => [e.kind, e.data.why, e.data.bounced]),
      [["mailbox_connection.held", "bounces", 6]],
    );
    await answer(await knock(POST, "mailboxes"));
    assert.equal(tables.events.length, 1, "held once, said once");
    assert.equal(tables.mailbox_connections[0].state, "held", "only its owner's Resume lifts it");
  } finally {
    net.restore();
  }
});

test("a provider's rest is lifted once its day has turned; one still ahead stands", async () => {
  const done = rows.mailboxConnection({
    tenant_id: T,
    sync_cursor: "450",
    watch_expires_at: iso(5 * 24 * HOUR),
    resting_until: iso(-60_000),
  });
  const ahead = rows.mailboxConnection({
    tenant_id: T,
    address: "dana@getharbor.example",
    provider_account: "acct-dana",
    sync_cursor: "450",
    watch_expires_at: iso(5 * 24 * HOUR),
    resting_until: iso(HOUR),
  });
  const tables = world([done, ahead]);
  const net = quietGmail();
  try {
    await answer(await knock(POST, "mailboxes"));
    assert.equal(tables.mailbox_connections[0].resting_until, null);
    assert.ok(tables.mailbox_connections[1].resting_until);
  } finally {
    net.restore();
  }
});

test("a mailbox its provider signed out is set to reconnect, said once, and nothing more is asked of it", async () => {
  const box = rows.mailboxConnection({ tenant_id: T });
  const tables = world([box], { creds: { [box.id]: { ...liveCredentials("old"), expires_at: Date.now() - 1000 } } });
  const net = providers((c) =>
    c.url === "https://oauth2.googleapis.com/token"
      ? { status: 400, json: { error: "invalid_grant" } }
      : { status: 500, json: {} },
  );
  try {
    const [status] = await answer(await knock(POST, "mailboxes"));
    assert.equal(status, 200);
    assert.equal(tables.mailbox_connections[0].state, "reconnect");
    assert.deepEqual(
      tables.events.map((e) => e.kind),
      ["mailbox_connection.signed_out"],
    );
    assert.equal(net.calls.filter((c) => c.url.includes("gmail.googleapis.com")).length, 0);
  } finally {
    net.restore();
  }
});

test("nothing to tend: a 200 that says so", async () => {
  world([]);
  assert.deepEqual(await answer(await knock(POST, "mailboxes")), [200, { ok: true, tended: 0 }]);
});

test("an email whose send's outcome was unknown is looked for in what the mailbox sent: found, it is sent with its thread; not there, it never left", async () => {
  const box = rows.mailboxConnection({
    tenant_id: T,
    sync_cursor: "450",
    watch_expires_at: iso(5 * 24 * HOUR),
    host: "getharbor.example",
    address: "sam@getharbor.example",
  });
  const tables = world([box]);
  const email = (id) => ({
    id,
    tenant_id: T,
    conversation_id: "c1",
    contact_id: "k1",
    channel: "email",
    direction: "outbound",
    status: "failed",
    external_id: null,
    error: { http_status: 0, body: null, outcome: "unknown" },
    created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    meta: { email: { request: { to: ["office@fixture-movers.example"], subject: "A quick one" } } },
  });
  const WENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const NEVER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  tables.messages.push(email(WENT), email(NEVER));
  tables.sequence_sends.push(
    { id: "s1", tenant_id: T, mailbox_id: box.id, state: "queued", message_id: WENT, lead_id: "l1" },
    { id: "s2", tenant_id: T, mailbox_id: box.id, state: "queued", message_id: NEVER, lead_id: "l2" },
  );
  const went = mailboxMessageId(WENT, "getharbor.example");
  const net = providers((c) => {
    if (c.url.includes("/history?")) return { json: { historyId: "501" } };
    const q = new URL(c.url).searchParams.get("q") ?? "";
    if (q.startsWith("from:")) return { json: { messages: [] } };
    if (q === `rfc822msgid:${went}`) return { json: { messages: [{ id: "gm-9", threadId: "gt-9" }] } };
    if (q.startsWith("rfc822msgid:") || q.startsWith("in:sent")) return { json: { resultSizeEstimate: 0 } };
    if (c.url.includes("/messages/gm-9?"))
      return { json: { id: "gm-9", threadId: "gt-9", payload: { headers: [{ name: "Message-ID", value: went }] } } };
    return { status: 404 };
  });
  try {
    const [status, body] = await answer(await knock(POST, "mailboxes"));
    assert.equal(status, 200);
    assert.equal(body.settled, 2);
    const [sent, never] = [WENT, NEVER].map((id) => tables.messages.find((m) => m.id === id));
    assert.deepEqual([sent.status, sent.external_id, sent.meta.email.thread_id], ["sent", "gm-9", "gt-9"]);
    assert.deepEqual([never.status, never.error.reason, never.error.outcome], ["failed", "never_delivered", undefined]);
  } finally {
    net.restore();
  }
});
