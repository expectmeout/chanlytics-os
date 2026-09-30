/**
 * The ledger's heartbeat, run: POST /api/jobs/tick knocked the way pg_net
 * knocks it, over a ledger in memory whose claim keeps the SQL function's rule,
 * with every request that leaves the process captured. Until 14 Sep 2026 this
 * handler's binding was held by one read of its text and its POST had never
 * been called; the loop it binds and the send job it dispatches were already
 * run against fakes (jobs-tick.test.mjs, outbound-send.test.mjs).
 *
 * What runs here is the binding. The door is the cron key's, and nothing is
 * claimed behind a refused knock. A ledger that cannot be claimed from is a 503
 * that sweep_health() reads. Each job leaves on its OWN workspace's wires:
 * WhatsApp on that workspace's credentials from the vault and never the
 * environment's pair; a text on that workspace's own line, in E.164 however
 * the number was written; and a workspace holding neither is refused at the
 * wire. Ten failures in one heartbeat, failed or given up alike, page the
 * platform, once a window.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS: every workspace, channel, line, message and
 * job is numbered for this file, and every case has a ledger of its own, so no
 * case reads another's rows or another's pager memory.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { withoutRequestId } from "../_log-lines.mjs";
import { at, KEY, answer, wire } from "../_cron-doors-world.mjs";

const MAIL = { RESEND_API_KEY: "re_test_only", LEAD_TO: "ops@platform.test", LEAD_FROM: "Pager <pager@platform.test>" };
/** The environment's own WhatsApp pair: present, so a job that fell back to it would show. */
const ENV_WHATSAPP = { phoneId: "109990000000003", token: "the-environments-own-whatsapp-token" };
/** The platform's own Twilio account: what makes the texting provider Twilio's, and never what a line sends with. */
const MASTER = { sid: "ACplatformmasteraccountforthisfile", token: "platform-master-token-for-this-file" };

// Each test file is its own process, so this is the whole environment, set
// before the route is imported below. The platform's mailbox is configured, so
// what is not paged below is not paged by decision, never for want of an address.
process.env.WHATSAPP_PHONE_ID = ENV_WHATSAPP.phoneId;
process.env.WHATSAPP_ACCESS_TOKEN = ENV_WHATSAPP.token;
process.env.TWILIO_ACCOUNT_SID = MASTER.sid;
process.env.TWILIO_AUTH_TOKEN = MASTER.token;
Object.assign(process.env, MAIL);
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LINES_DRY_RUN", "VERCEL_ENV"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/jobs/tick.ts"));

/* -------------------------------------------------------------- the wire */

const GRAPH = "https://graph.facebook.com/v25.0";
const TWILIO = "https://api.twilio.com/2010-04-01";
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Every request that leaves this process, captured for the whole file rather
 * than per case, because every job below is a real send: Graph answers as it
 * answers an accepted message, Twilio as it answers a queued text, anything
 * else (Resend) as a delivered mail.
 */
let answered = 0;
const net = wire((url) => {
  answered += 1;
  if (url.startsWith(GRAPH))
    return json(200, { messaging_product: "whatsapp", messages: [{ id: `wamid.tick.${answered}` }] });
  if (url.startsWith(TWILIO)) return json(201, { sid: `SM${String(answered).padStart(32, "0")}`, status: "accepted" });
  return json(200, {});
});
after(() => {
  net.restore();
  setPg(null);
});

/** What left after `mark`: Graph sends, Twilio sends, and the mail Resend was asked to send. */
function leftSince(mark) {
  const calls = net.calls.slice(mark);
  return {
    graph: calls
      .filter((c) => c.url.startsWith(GRAPH))
      .map((c) => {
        const body = JSON.parse(c.init.body);
        return { url: c.url, authorization: c.init.headers.Authorization, to: body.to, text: body.text?.body };
      }),
    twilio: calls
      .filter((c) => c.url.startsWith(TWILIO))
      .map((c) => ({
        url: c.url,
        authorization: c.init.headers.Authorization,
        form: Object.fromEntries(new URLSearchParams(c.init.body)),
      })),
    mail: calls.filter((c) => c.url.includes("api.resend.com")).map((c) => JSON.parse(c.init.body)),
  };
}

/* ------------------------------------------------------------- the knock */

const DOOR = "http://edge/api/jobs/tick";
/**
 * What Vercel hands a method export beside the request: its runtime calls
 * `webHandler(request, new FetchEvent(request))`, and Vercel's FetchEvent
 * carries `waitUntil` (lib/whatsapp/ports.ts). Every knock carries one.
 */
const event = () => ({ waitUntil: () => {} });
/** pg_net's call, as trigger_jobs_tick makes it: a bare POST with the sweep key in its header. `null` sends no key. */
const knock = (key = KEY) =>
  POST(new Request(DOOR, { method: "POST", headers: key == null ? {} : { "x-cron-key": key } }), event());
const asked = (db) => db.seen.map((s) => s.rpc ?? `${s.table}.${s.op}`);

/** What the route says on the console while `fn` runs: one structured line each. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const stream of ["log", "warn", "error"]) {
    console[stream] = (...args) => {
      let line = null;
      try {
        line = JSON.parse(args[0]);
      } catch {}
      lines.push(
        line && typeof line === "object" && line.event ? { stream, ...line } : { stream, event: String(args[0]), args },
      );
    };
  }
  try {
    return await fn({ lines, said: (name) => lines.filter((l) => l.event === name) });
  } finally {
    Object.assign(console, real);
  }
}

/* ------------------------------------------------------------- the world */

const iso = (ms) => new Date(ms).toISOString();
const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

/**
 * claim_due_jobs as 00098 writes it: what is due, or fired with its lease run
 * out, oldest first, up to the limit -- each fired, with a fresh lease and one
 * more attempt, and handed back as the row now reads.
 */
function claimDue(jobs, { p_limit, p_lease_seconds }) {
  const t = Date.now();
  const due = jobs
    .filter(
      (j) =>
        (j.state === "scheduled" && Date.parse(j.due_at) <= t) ||
        (j.state === "fired" && j.lease_until != null && Date.parse(j.lease_until) < t),
    )
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
    .slice(0, p_limit);
  for (const j of due)
    Object.assign(j, {
      state: "fired",
      fired_at: iso(t),
      attempts: j.attempts + 1,
      lease_until: iso(t + p_lease_seconds * 1000),
    });
  return due.map((j) => ({ ...j }));
}

/**
 * A ledger in memory, handed to the route, and the workspaces whose jobs are in
 * it. `workspace()` adds one with its owner's mailbox and, as asked, a WhatsApp
 * channel with its own credentials in the vault ("own"), one that carries none
 * ("none"), or no channel (false), and a texting line with its token in the
 * vault (true), or one the vault does not answer for ("unreadable"). `queue()`
 * adds one reply to its outbox, and the job that sends it.
 */
function ledger({ faults = {}, claim } = {}) {
  const tables = {
    jobs: [],
    messages: [],
    conversations: [],
    tenant_channels: [],
    lines: [],
    tenant_config: [],
    events: [],
    escalations: [],
    notifications: [],
    operator_pages: [],
    mailboxes: [],
  };
  const vault = { channels: {}, lines: {} };
  const db = fakeDb(tables, faults, {
    get_cron_sweep_key: () => KEY,
    claim_due_jobs: claim ?? ((args) => claimDue(tables.jobs, args)),
    // A channel whose entry is a function is one Vault does not answer for ("unreadable"): the throw becomes the
    // rpc's error envelope, as the double answers every refused function.
    get_channel_credentials: ({ p_channel_id }) => {
      const v = vault.channels[p_channel_id];
      return typeof v === "function" ? v() : (v ?? null);
    },
    get_line_credentials: ({ p_line_id }) => {
      const v = vault.lines[p_line_id];
      return typeof v === "function" ? v() : (v ?? {});
    },
  });
  setPg(db);
  const mark = net.calls.length;
  let due = 0;

  function workspace({ whatsapp = "own", texting = false } = {}) {
    const i = ++seq;
    const ws = { T: `ffffffff-0000-4000-8000-${pad(i, 12)}`, owner: `owner-${i}@workspace.test` };
    tables.tenant_config.push({ tenant_id: ws.T, config: { notifications: { escalation_emails: [ws.owner] } } });
    if (whatsapp) {
      const channel = {
        id: `wa-ch-${i}`,
        tenant_id: ws.T,
        kind: "whatsapp",
        external_id: String(106570000000000 + i),
        number_e164: `+1786555${pad(i, 4)}`,
        status: "active",
        credentials_ref: whatsapp === "own" || whatsapp === "unreadable" ? `vault-ref-${i}` : null,
        config: {},
      };
      tables.tenant_channels.push(channel);
      if (whatsapp === "own") {
        ws.phoneId = channel.external_id;
        ws.token = `workspace-${i}-whatsapp-token`;
        vault.channels[channel.id] = { access_token: ws.token, phone_id: ws.phoneId };
      }
      // Its credentials are in the vault, and the vault does not answer this heartbeat.
      if (whatsapp === "unreadable")
        vault.channels[channel.id] = () => {
          throw new Error("vault unavailable");
        };
    }
    if (texting) {
      ws.line = {
        id: `line-${i}`,
        tenant_id: ws.T,
        e164: `+1305557${pad(i, 4)}`,
        provider: "twilio",
        subaccount_sid: `AC${pad(i, 32)}`,
        messaging_service_sid: `MG${pad(i, 32)}`,
        sms_state: "active",
        voice_state: "active",
        created_at: iso(Date.now() - 86_400_000),
      };
      ws.lineToken = `line-${i}-subaccount-token`;
      tables.lines.push(ws.line);
      vault.lines[ws.line.id] =
        texting === "unreadable"
          ? () => {
              throw new Error("vault unavailable");
            }
          : { auth_token: ws.lineToken };
    }
    let n = 0;
    /** One reply in the outbox and its job: due now, or (`died`) claimed once by a run that never reported back. */
    ws.queue = ({ channel = "whatsapp", to, body = "See you at 3", died = false } = {}) => {
      const id = `${i}-${++n}`;
      const conversation = {
        id: `conv-${id}`,
        tenant_id: ws.T,
        paused_until: null,
        contacts: { consent: "opted_in", dnc: false, marketing_consent: null, erased_at: null },
        tenants: { status: "active" },
      };
      const message = {
        id: `msg-${id}`,
        tenant_id: ws.T,
        conversation_id: conversation.id,
        status: "queued",
        body,
        sender: "human",
        channel,
        direction: "outbound",
        created_at: iso(Date.now() - 60_000),
      };
      const job = {
        id: `job-${id}`,
        tenant_id: ws.T,
        kind: "outbound_send",
        payload: {
          message_id: message.id,
          conversation_id: conversation.id,
          to_phone: to ?? `+1347555${pad(i * 10 + n, 4)}`,
          body,
        },
        due_at: iso(Date.now() - 30_000 + due++),
        ...(died
          ? { state: "fired", attempts: 1, lease_until: iso(Date.now() - 1_000) }
          : { state: "scheduled", attempts: 0, lease_until: null }),
      };
      tables.conversations.push(conversation);
      tables.messages.push(message);
      tables.jobs.push(job);
      return { job, message };
    };
    return ws;
  }

  return { db, tables, workspace, left: () => leftSince(mark) };
}

/* -------------------------------------------------------------- the door */

test("the door: the wrong key or none is a 401, a key Vault cannot produce is a 503, no database is a 503, and nothing is claimed behind any of them", async () => {
  // No claim is modelled: a knock that got past the key would be refused by name, and answer something else.
  const held = fakeDb({}, {}, { get_cron_sweep_key: () => KEY });
  setPg(held);
  assert.deepEqual(await answer(await knock("not-the-key")), [401, { ok: false, error: "unauthorized" }]);
  assert.deepEqual(await answer(await knock(null)), [401, { ok: false, error: "unauthorized" }], "no key at all");
  assert.deepEqual(
    asked(held),
    ["get_cron_sweep_key", "get_cron_sweep_key"],
    "the key is the only thing asked of the database",
  );

  await listening(async (log) => {
    for (const db of [
      fakeDb(
        {},
        {},
        {
          get_cron_sweep_key: () => {
            throw new Error("permission denied for function get_cron_sweep_key");
          },
        },
      ),
      fakeDb({}, {}, { get_cron_sweep_key: () => null }),
    ]) {
      setPg(db);
      assert.deepEqual(
        await answer(await knock()),
        [503, { ok: false, error: "key_unavailable" }],
        "a key Vault cannot produce is never a way in",
      );
      assert.deepEqual(asked(db), ["get_cron_sweep_key"]);
    }
    assert.deepEqual(
      log.said("cron_key_unavailable").map((l) => [l.stream, l.sweep]),
      [
        ["error", "jobs"],
        ["error", "jobs"],
      ],
      "said, as the jobs sweep's",
    );
  });

  setPg(null);
  assert.deepEqual(
    await answer(await knock()),
    [503, { ok: false, error: "no_database" }],
    "no database: refused before the key is asked for",
  );
});

test("a ledger that cannot be claimed from is a 503 carrying the error, said as jobs_tick_failed, and nothing runs; a ledger with nothing due answers 200 with nothing counted", async () => {
  const L = ledger({
    claim: () => {
      throw new Error("connection refused");
    },
  });
  const { message } = L.workspace().queue();
  await listening(async (log) => {
    assert.deepEqual(
      await answer(await knock()),
      [503, { ok: false, error: "query_failed", detail: "Error: claim_due_jobs: connection refused" }],
      "the 503 is what sweep_health() reads as the database's problem",
    );
    assert.deepEqual(
      log.said("jobs_tick_failed").map((l) => [l.stream, l.sweep, l.error]),
      [["error", "jobs", "Error: claim_due_jobs: connection refused"]],
    );
    assert.deepEqual(log.said("jobs_tick"), [], "and no heartbeat is reported");
  });
  assert.equal(message.status, "queued", "nothing was sent");
  assert.deepEqual(L.left(), { graph: [], twilio: [], mail: [] });

  const idle = ledger();
  await listening(async (log) => {
    assert.deepEqual(await answer(await knock()), [
      200,
      { ok: true, claimed: 0, done: 0, failed: 0, gaveUp: 0, deferred: 0 },
    ]);
    assert.deepEqual(
      log.said("jobs_tick").map((l) => [l.stream, l.sweep, l.claimed, l.done, l.failed, l.gaveUp]),
      [["log", "jobs", 0, 0, 0, 0]],
    );
  });
  assert.deepEqual(asked(idle.db), ["get_cron_sweep_key", "claim_due_jobs"], "the key, then one look at the ledger");
});

/* ------------------------------------------------------------- the wires */

test("each job leaves on its own workspace's WhatsApp credentials from the vault, never the environment's pair, and a workspace that holds none is refused at the wire", async () => {
  const L = ledger();
  const a = L.workspace();
  const b = L.workspace();
  const none = L.workspace({ whatsapp: "none" });
  const toA = a.queue({ to: "+13475550101", body: "See you at 3" });
  const toB = b.queue({ to: "+13475550102", body: "Your table is ready" });
  const refused = none.queue({ to: "+13475550103", body: "We open at 9" });

  await listening(async (log) => {
    assert.deepEqual(
      await answer(await knock()),
      [200, { ok: true, claimed: 3, done: 3, failed: 0, gaveUp: 0, deferred: 0 }],
      "a refusal at the wire is a job done: its message says why",
    );
    assert.deepEqual(
      log.said("jobs_tick").map((l) => [l.claimed, l.done]),
      [[3, 3]],
    );
  });

  assert.deepEqual(
    L.left().graph,
    [
      {
        url: `${GRAPH}/${a.phoneId}/messages`,
        authorization: `Bearer ${a.token}`,
        to: "13475550101",
        text: "See you at 3",
      },
      {
        url: `${GRAPH}/${b.phoneId}/messages`,
        authorization: `Bearer ${b.token}`,
        to: "13475550102",
        text: "Your table is ready",
      },
    ],
    "each from its own number on its own token, and nothing at all for the workspace that holds none",
  );
  assert.ok(
    !JSON.stringify(L.left().graph).includes(ENV_WHATSAPP.token) &&
      !JSON.stringify(L.left().graph).includes(ENV_WHATSAPP.phoneId),
    "the environment's pair never left",
  );

  assert.deepEqual([toA.message.status, toB.message.status], ["sent", "sent"]);
  assert.match(toA.message.external_id, /^wamid\.tick\./, "the row keeps the id Meta gave");
  assert.deepEqual(
    [refused.message.status, refused.message.error],
    ["failed", { http_status: 503, body: "no_credentials" }],
    "the workspace with none: the message says why",
  );
  assert.deepEqual(
    L.tables.escalations.map((e) => [e.tenant_id, e.conversation_id, e.reason]),
    [[none.T, refused.message.conversation_id, "send_failed"]],
    "its thread is flagged for a person",
  );
  assert.deepEqual(
    L.left().mail.map((m) => [m.to, m.subject]),
    [[[none.owner], "Reply delivery failed: +13475550103"]],
    "and its own owner is told, nobody else",
  );
  assert.deepEqual(
    L.tables.jobs.map((j) => [j.kind, j.tenant_id, j.state ?? "scheduled"]),
    [
      ["outbound_send", a.T, "done"],
      ["outbound_send", b.T, "done"],
      ["outbound_send", none.T, "done"],
      ["push_send", none.T, "scheduled"],
    ],
    "the three ran; the refused one's kept row leaves one push job for its own owner's phone (00162), for the next heartbeat",
  );
});

test("a workspace whose vault did not answer is not a workspace that holds none: its reply stays queued for a fresh job, nobody is flagged, nobody is told to reconnect", async () => {
  // Two workspaces, two facts. One carries no credentials: refused at the wire,
  // its thread flagged, its owner told the number is not connected, as before.
  // The other has credentials the vault did not answer for this heartbeat: a
  // read that FAILED, said under its own event name, and its reply is handed
  // to a fresh job a while on with the row still queued -- never failed, never
  // flagged, and nobody told to reconnect a number that works.
  const L = ledger();
  const blip = L.workspace({ whatsapp: "unreadable" });
  const none = L.workspace({ whatsapp: "none" });
  const waiting = blip.queue({ to: "+13475550104", body: "See you at 3" });
  const refused = none.queue({ to: "+13475550105", body: "We open at 9" });
  const before = Date.now();

  await listening(async (log) => {
    assert.deepEqual(
      await answer(await knock()),
      [200, { ok: true, claimed: 2, done: 2, failed: 0, gaveUp: 0, deferred: 0 }],
      "both jobs are done: one refused at the wire, one handed to a fresh job",
    );
    assert.deepEqual(
      log.said("wa_credentials_for_tenant_failed").map((l) => [l.stream, l.tenant_id, l.error]),
      [["error", blip.T, "vault unavailable"]],
      "the read's failure is said, under the name alerting greps for",
    );
  });

  assert.deepEqual(L.left().graph, [], "nothing left on any wire");
  assert.deepEqual(
    L.left().mail.map((m) => [m.to, m.subject]),
    [
      [[MAIL.LEAD_TO], "[Chanlytics] whatsapp: a workspace's credentials could not be read"],
      [[none.owner], "Reply delivery failed: +13475550105"],
    ],
    "the platform is paged for its own condition, the workspace that holds none is told; the one whose vault blinked is not",
  );
  const page = JSON.stringify(L.left().mail[0]);
  assert.ok(page.includes(blip.T) && page.includes("vault unavailable"), "the page names the workspace and the read");
  assert.ok(!/not connected|reconnect/i.test(page), "and never says the number is off");
  assert.equal(waiting.message.status, "queued", "still on its way");
  assert.equal(waiting.message.error, undefined);
  assert.deepEqual(
    [refused.message.status, refused.message.error],
    ["failed", { http_status: 503, body: "no_credentials" }],
    "the workspace with none: today's answer, unchanged",
  );
  assert.deepEqual(
    L.tables.escalations.map((e) => [e.tenant_id, e.reason]),
    [[none.T, "send_failed"]],
    "only the disconnected workspace's thread is flagged",
  );
  assert.equal(waiting.job.state, "done");
  const fresh = L.tables.jobs.filter((j) => j.tenant_id === blip.T && j.id !== waiting.job.id);
  assert.deepEqual(
    fresh.map((j) => [j.kind, j.state ?? "scheduled"]),
    [["outbound_send", "scheduled"]],
    "one fresh job, for a heartbeat that can read the vault",
  );
  assert.deepEqual(
    withoutRequestId(fresh[0].payload),
    { ...waiting.job.payload, resumes: 1 },
    "the same send, counting its fresh jobs",
  );
  assert.ok(Date.parse(fresh[0].due_at) >= before + 60_000, "a while on, not this second");
});

test("a texting workspace's job leaves on its own line: the subaccount's token from the vault, the line's Messaging Service, the number in E.164 however it was written; a workspace with no line is refused at the wire", async () => {
  const L = ledger();
  const s = L.workspace({ whatsapp: false, texting: true });
  const bare = s.queue({ channel: "sms", to: "16465550142", body: "Your table is ready" });
  const plus = s.queue({ channel: "sms", to: "+16465550143", body: "See you at 7" });
  const lineless = L.workspace({ whatsapp: false });
  const refused = lineless.queue({ channel: "sms", to: "+16465550144", body: "We open at 9" });

  await listening(async (log) => {
    assert.deepEqual(await answer(await knock()), [
      200,
      { ok: true, claimed: 3, done: 3, failed: 0, gaveUp: 0, deferred: 0 },
    ]);
    assert.deepEqual(
      log.said("sms_sent").map((l) => [l.tenant_id, l.line_id, l.to_tail]),
      [
        [s.T, s.line.id, "0142"],
        [s.T, s.line.id, "0143"],
      ],
      "said as the workspace's own line, with tails",
    );
  });

  const line = {
    url: `${TWILIO}/Accounts/${s.line.subaccount_sid}/Messages.json`,
    authorization: `Basic ${Buffer.from(`${s.line.subaccount_sid}:${s.lineToken}`).toString("base64")}`,
  };
  assert.deepEqual(
    L.left().twilio,
    [
      {
        ...line,
        form: {
          MessagingServiceSid: s.line.messaging_service_sid,
          To: "+16465550142",
          Body: "Your table is ready",
          StatusCallback: "https://chanlytics-messaging.vercel.app/api/sms-status",
        },
      },
      {
        ...line,
        form: {
          MessagingServiceSid: s.line.messaging_service_sid,
          To: "+16465550143",
          Body: "See you at 7",
          StatusCallback: "https://chanlytics-messaging.vercel.app/api/sms-status",
        },
      },
    ],
    "bare digits given their +, an E.164 number left as it was, on this workspace's own account and never the platform's master",
  );
  assert.deepEqual(L.left().graph, [], "a text never leaves on WhatsApp");

  assert.deepEqual([bare.message.status, plus.message.status], ["sent", "sent"]);
  assert.match(bare.message.external_id, /^SM/, "the row keeps the id Twilio gave");
  assert.deepEqual(
    [refused.message.status, refused.message.error],
    ["failed", { http_status: 503, body: "no_credentials" }],
    "no line is a refusal at the wire, never another wire",
  );
  assert.deepEqual(
    L.tables.escalations.map((e) => [e.tenant_id, e.reason]),
    [[lineless.T, "send_failed"]],
  );
  assert.deepEqual(
    L.tables.jobs.map((j) => [j.kind, j.state ?? "scheduled"]),
    [
      ["outbound_send", "done"],
      ["outbound_send", "done"],
      ["outbound_send", "done"],
      ["push_send", "scheduled"],
    ],
    "the three ran; the lineless one's kept row leaves one push job for its owner's phone, for the next heartbeat",
  );
  assert.equal(L.tables.jobs[3].tenant_id, lineless.T, "that workspace's, nobody else's");
});

test("two replies waiting on one unreadable vault page the platform once: the pager's quiet holds per channel", async () => {
  const L = ledger();
  const blip = L.workspace({ whatsapp: "unreadable" });
  blip.queue({ to: "+13475550106", body: "See you at 3" });
  blip.queue({ to: "+13475550107", body: "See you at 4" });
  await listening(async () => {
    assert.deepEqual(await answer(await knock()), [
      200,
      { ok: true, claimed: 2, done: 2, failed: 0, gaveUp: 0, deferred: 0 },
    ]);
  });
  assert.deepEqual(
    L.left().mail.map((m) => m.subject),
    ["[Chanlytics] whatsapp: a workspace's credentials could not be read"],
    "one page for both",
  );
  assert.equal(L.tables.jobs.filter((j) => j.tenant_id === blip.T && j.kind === "outbound_send").length, 4);
});

test("a texting line the vault did not answer for is not a workspace with no line: the text stays queued for a fresh job, nobody is flagged or told, and nothing goes to the carrier", async () => {
  const L = ledger();
  const blip = L.workspace({ whatsapp: false, texting: "unreadable" });
  const waiting = blip.queue({ channel: "sms", to: "+16465550145", body: "See you at 7" });
  const before = Date.now();

  await listening(async (log) => {
    assert.deepEqual(await answer(await knock()), [
      200,
      { ok: true, claimed: 1, done: 1, failed: 0, gaveUp: 0, deferred: 0 },
    ]);
    assert.deepEqual(
      log.said("sms_sender_unavailable").map((l) => [l.stream, l.tenant_id]),
      [["error", blip.T]],
      "the read's failure is said, under its own name",
    );
  });

  assert.deepEqual(L.left().twilio, [], "nothing went to the carrier");
  assert.equal(waiting.message.status, "queued", "still on its way");
  assert.equal(waiting.message.error, undefined);
  assert.deepEqual(L.tables.escalations, [], "the thread is not flagged");
  assert.deepEqual(
    L.left().mail.map((m) => m.subject),
    ["[Chanlytics] sms: a workspace's credentials could not be read"],
    "the platform is paged; the owner is not told a delivery failed",
  );
  const fresh = L.tables.jobs.filter((j) => j.tenant_id === blip.T && j.id !== waiting.job.id);
  assert.deepEqual(
    fresh.map((j) => [j.kind, j.state ?? "scheduled"]),
    [["outbound_send", "scheduled"]],
  );
  assert.deepEqual(withoutRequestId(fresh[0].payload), { ...waiting.job.payload, resumes: 1 });
  assert.ok(Date.parse(fresh[0].due_at) >= before + 60_000, "a while on, not this second");
});

test("a mailbox that could not be read unbinds email's wire and nothing else: a WhatsApp reply in the same workspace leaves on the same heartbeat", async () => {
  // The re-score's probe (case B): email on, the mailbox read fails once, and the tick used to throw building the
  // job's wires -- so a WhatsApp reply that needs no email was failed for good as "may have sent", its thread flagged.
  const L = ledger({ faults: { "mailboxes.select": { message: "connection reset" } } });
  const ws = L.workspace({ whatsapp: "own" });
  const reply = ws.queue({ to: "+13475550108", body: "See you at 3" });
  const before = process.env.EMAIL_DOMAIN;
  process.env.EMAIL_DOMAIN = "mail.platform.test";
  try {
    await listening(async (log) => {
      assert.deepEqual(await answer(await knock()), [
        200,
        { ok: true, claimed: 1, done: 1, failed: 0, gaveUp: 0, deferred: 0 },
      ]);
      assert.deepEqual(
        log.said("email_wire_unavailable").map((l) => [l.stream, l.tenant_id, l.error]),
        [["error", ws.T, "Error: mailbox: connection reset"]],
        "said once, under its own name",
      );
    });
  } finally {
    if (before === undefined) delete process.env.EMAIL_DOMAIN;
    else process.env.EMAIL_DOMAIN = before;
  }
  assert.equal(reply.message.status, "sent", "the WhatsApp reply left");
  assert.equal(L.left().graph.length, 1, "on Meta's wire, once");
  assert.deepEqual(L.tables.escalations, [], "nobody flagged");
});

/* ------------------------------------------------------------ tried again */

test("an email intake that throws is claimed again five minutes later, then thirty; nobody is told while it is still being tried, and its last failed try tells the owner and marks the mailbox", async () => {
  // This file's deployment names no EMAIL_DOMAIN, so its runtime holds no email
  // provider and every intake throws. The stand-in for 18 Sep 2026, when the
  // key could send mail but not read it, and one throw lost an email for good.
  const L = ledger();
  const ws = L.workspace({ whatsapp: false });
  const mailbox = { id: `mb-${ws.T}`, tenant_id: ws.T, local_part: "salon", last_error: null };
  L.tables.mailboxes.push(mailbox);
  const intake = {
    id: `job-intake-${ws.T}`,
    tenant_id: ws.T,
    kind: "email_ingest",
    payload: { mailbox_id: mailbox.id, received_id: "rcv-1" },
    due_at: iso(Date.now() - 30_000),
    state: "scheduled",
    attempts: 0,
    lease_until: null,
    last_error: null,
  };
  L.tables.jobs.push(intake);
  const NOTHING = [200, { ok: true, claimed: 0, done: 0, failed: 0, gaveUp: 0, deferred: 0 }];

  await listening(async (log) => {
    for (const [attempt, minutes] of [
      [1, 5],
      [2, 30],
    ]) {
      const t0 = Date.now();
      assert.deepEqual(
        await answer(await knock()),
        [200, { ok: true, claimed: 1, done: 0, failed: 0, gaveUp: 0, deferred: 1 }],
        `try ${attempt}`,
      );
      const wait = Date.parse(intake.lease_until) - t0;
      assert.ok(
        wait >= minutes * 60_000 && wait < minutes * 60_000 + 5_000,
        `try ${attempt}: claimed again in ${minutes} minutes, not ${wait} ms`,
      );
      assert.deepEqual(
        [intake.state, intake.attempts, intake.last_error],
        ["fired", attempt, "email_ingest: this runtime holds no email provider"],
        "kept, with why on the row",
      );
      assert.deepEqual(await answer(await knock()), NOTHING, "and not claimed again before its lease ends");
      assert.equal(mailbox.last_error, null, "the mailbox is not marked while the email is still being tried");
      assert.deepEqual(L.left().mail, [], "and nobody is told");
      intake.lease_until = iso(Date.now() - 1_000);
    }
    assert.deepEqual(
      await answer(await knock()),
      [200, { ok: true, claimed: 1, done: 0, failed: 1, gaveUp: 0, deferred: 0 }],
      "the third try is the last",
    );
    assert.deepEqual(
      log.said("job_deferred").map((l) => [l.kind, l.attempts]),
      [
        ["email_ingest", 1],
        ["email_ingest", 2],
      ],
    );
  });

  assert.deepEqual([intake.state, intake.attempts], ["failed", 3]);
  assert.equal(mailbox.last_error, "An email could not be taken in. Anything since then is in your Inbox as usual.");
  const told = L.left().mail;
  assert.deepEqual(
    told.map((m) => m.to),
    [[ws.owner]],
    "the owner, once",
  );
  assert.match(told[0].text, /It stopped after 3 tries and will not start again on its own/);
  assert.match(told[0].subject ?? told[0].text, /An email could not be taken in/);
});

/* --------------------------------------------------------- mass failure */

test("ten failures in one heartbeat page the platform once with the counts, failed and given up alike, and nine do not; the next heartbeat's ten are remembered, not paged again", async () => {
  // The outbox cannot be read, so a send that runs throws; a send whose last
  // run died is given up without running. The two add up to one condition.
  const L = ledger({ faults: { "messages.select": { message: "canceling statement due to statement timeout" } } });
  const ws = L.workspace();
  const beat = (thrown, died) => {
    for (let k = 0; k < thrown; k++) ws.queue();
    for (let k = 0; k < died; k++) ws.queue({ died: true });
    return knock();
  };
  const pages = () => L.left().mail.filter((m) => m.subject.startsWith("[Chanlytics]"));

  await listening(async () => {
    assert.deepEqual(await answer(await beat(4, 5)), [
      200,
      { ok: true, claimed: 9, done: 0, failed: 4, gaveUp: 5, deferred: 0 },
    ]);
    assert.deepEqual([pages(), L.tables.operator_pages], [[], []], "nine is not the platform's condition");

    assert.deepEqual(
      await answer(await beat(5, 5)),
      [200, { ok: true, claimed: 10, done: 0, failed: 5, gaveUp: 5, deferred: 0 }],
      "still 200: the jobs failed, the ledger did not",
    );
    assert.equal(pages().length, 1);
    const [page] = pages();
    assert.equal(page.subject, "[Chanlytics] 10 jobs failed in one heartbeat");
    assert.deepEqual([page.from, page.to], [MAIL.LEAD_FROM, [MAIL.LEAD_TO]], "the platform's own mailbox");
    assert.ok(
      page.text.startsWith(
        "10 of the 10 jobs this heartbeat claimed failed: 5 while running, and 5 given up because their last run never reported back. 0 finished.",
      ),
      "the counts, in words",
    );
    assert.ok(
      page.text.includes("from jobs where state = 'failed' order by updated_at desc limit 20;"),
      "and where to look first",
    );
    assert.deepEqual(
      L.tables.operator_pages.map((p) => [p.key, p.count, typeof p.alerted_at]),
      [["jobs_mass_failure", 1, "string"]],
      "remembered, and stamped as told",
    );

    assert.deepEqual(await answer(await beat(10, 0)), [
      200,
      { ok: true, claimed: 10, done: 0, failed: 10, gaveUp: 0, deferred: 0 },
    ]);
    assert.equal(pages().length, 1, "one page a window");
    assert.deepEqual(
      L.tables.operator_pages.map((p) => [p.key, p.count]),
      [["jobs_mass_failure", 2]],
      "and the second firing is counted",
    );
  });

  // Each failure's kept row leaves one push_send for its owner's phone (00162): those rows are the ledger's next
  // heartbeat, not this one's, and they are not what was failing.
  const ran = L.tables.jobs.filter((j) => j.kind !== "push_send");
  assert.ok(ran.length === 29 && ran.every((j) => j.state === "failed"), "every job is recorded failed");
  const told = L.tables.jobs.filter((j) => j.kind === "push_send");
  assert.equal(told.length, 29, "and each failure's kept row leaves one push job for its owner's phone");
  assert.ok(
    told.every((j) => j.payload?.notification_id && j.state === undefined),
    "each naming its row, scheduled for the ledger (the fake keeps the database's default state as unset)",
  );
  assert.equal(
    L.tables.messages.filter((m) => m.status === "failed").length,
    29,
    "and no message it was sending still shows as on its way",
  );
});

/* ------------------------------------------------------ how late (0018) */

test("the heartbeat's line says how late each kind's first claim came, and its answer to pg_net keeps the counts alone (0018, step 1)", async () => {
  const L = ledger();
  L.workspace().queue({ to: "+13475550106", body: "See you at 3" }); // due thirty seconds ago

  await listening(async (log) => {
    const [status, body] = await answer(await knock());
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, claimed: 1, done: 1, failed: 0, gaveUp: 0, deferred: 0 });
    const [tick] = log.said("jobs_tick");
    assert.ok(
      tick.late_ms_outbound_send >= 29_000 && tick.late_ms_outbound_send < 60_000,
      `the reply waited about thirty seconds past its due time, not ${tick.late_ms_outbound_send} ms`,
    );
    assert.equal(tick.lateMs, undefined, "the line is flat: one field per kind, not an object");
  });
});
