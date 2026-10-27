/**
 * The Instagram door, run (decision 0001, step 8): a delivery posted the way Meta posts one, signed with the app's
 * secret, over a database in memory, with the receptionist's world handed in through lib/whatsapp/ports.ts and every
 * request that leaves the process captured.
 *
 * The handshake answers Meta's challenge for the verify token and nothing else. A body is proven by Meta's signature
 * with the Instagram app's secret, or the Meta app's, and by nothing else. A person's DM to an account a workspace holds
 * is recorded with the name their profile gives, its answer left to an inbound_answer job, and that job answers it by
 * DM from the account's own token, to the person's Instagram-scoped id. An echo of a DM we sent changes nothing; one the
 * team sent from the Instagram app is kept as their words and pauses the receptionist; one to a person nobody holds is
 * nobody's. An unsend takes the DM's words back. What the database did not take, or whose account could not be routed,
 * is not acknowledged (503); an account no workspace holds is told to the platform and acknowledged.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS: the channel resolver keeps a routing answer in module state, and the platform's note
 * stays quiet for fifteen minutes per account.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { instagramDmChunks, resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const IG_SECRET = "instagram-app-secret-for-this-file";
const META_SECRET = "meta-app-secret-for-this-file";
const VERIFY = "verify-token-for-this-file";
process.env.INSTAGRAM_APP_SECRET = IG_SECRET;
process.env.META_APP_SECRET = META_SECRET;
process.env.INSTAGRAM_VERIFY_TOKEN = VERIFY;
Object.assign(process.env, {
  RESEND_API_KEY: "re_test_only",
  LEAD_TO: "ops@platform.test",
  LEAD_FROM: "Pager <pager@platform.test>",
});
for (const k of ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg, pg } = await import(at("apps/edge/lib/pg.ts"));
const { setInboundPorts } = await import(at("apps/edge/lib/whatsapp/ports.ts"));
const { IngestFailed } = await import(at("apps/edge/lib/whatsapp/persist.ts"));
const door = await import(at("apps/edge/api/instagram.ts"));
const { instagramReceiver } = await import(at("apps/edge/lib/instagram/webhook.ts"));
const { answerInboundJob } = await import(at("apps/edge/lib/whatsapp/answer-later.ts"));
const { dispatchJob } = await import(at("packages/jobs/dist/index.js"));

/* -------------------------------------------------------------- the wire */

const GRAPH = "https://graph.instagram.com/v26.0";
const RESEND = "https://api.resend.com/";
const requests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  requests.push({ url: u, init });
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (!u.startsWith(GRAPH)) return json(200, {});
  if (u.includes("/messages")) return json(200, { recipient_id: "x", message_id: `mid.out.${requests.length}` });
  return json(200, { name: "Dana Ruiz", username: "dana.r", id: "x" });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
  setInboundPorts(null);
});

const DOOR = "https://chanlytics-messaging.vercel.app/api/instagram";
const event = () => ({ waitUntil: () => {} });
const sign = (raw, secret = IG_SECRET) => "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
const settled = instagramReceiver(5);

/** A delivery as Meta posts it, signed (or as given), through the receiver with a short echo wait. */
const post = (body, { signature, receiver = settled } = {}) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return receiver(
    new Request(DOOR, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature ?? sign(raw) },
      body: raw,
    }),
  );
};
const heard = async (res) => [res.status, await res.json()];

/** The tables of the world last opened, and what its jobs threw. */
let openTables = null;
const jobThrows = [];
/** The answers the door left as jobs, run as the ledger runs one, into the edge's own job half. */
async function runAnswers() {
  const db = pg();
  for (const job of openTables?.jobs ?? []) {
    if (!db || job.kind !== "inbound_answer" || (job.state ?? "scheduled") !== "scheduled") continue;
    job.state = "fired";
    try {
      const claimed = { id: job.id, tenant_id: job.tenant_id, kind: job.kind, payload: job.payload };
      assert.equal(await dispatchJob({ db, inbound: { answer: (j) => answerInboundJob(db, j) } }, claimed), "done");
      job.state = "done";
    } catch (e) {
      job.state = "failed";
      jobThrows.push(e);
    }
  }
}

/** What the door says on the console while `fn` runs: one structured line each. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const stream of ["log", "warn", "error"])
    console[stream] = (...args) => {
      let line = null;
      try {
        line = JSON.parse(args[0]);
      } catch {}
      lines.push(
        line && typeof line === "object" && line.event ? { stream, ...line } : { stream, event: String(args[0]) },
      );
    };
  try {
    return await fn({ lines, said: (name) => lines.filter((l) => l.event === name) });
  } finally {
    Object.assign(console, real);
  }
}

/* ------------------------------------------------------------- the world */

const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

/** One workspace with one connected Instagram account, every identifier its own. */
function world() {
  const i = ++seq;
  const T = `abababab-0000-4000-8000-${pad(i, 12)}`;
  const ACCOUNT = `178414000000${pad(i, 5)}`;
  const TOKEN = `IGAA-token-${i}`;
  const channel = {
    id: `cdcdcdcd-0000-4000-8000-${pad(i, 12)}`,
    tenant_id: T,
    kind: "instagram",
    external_id: ACCOUNT,
    number_e164: null,
    credentials_ref: `ref-${i}`,
    config: {},
    status: "active",
  };
  const tables = {
    tenant_channels: [channel],
    jobs: [],
    messages: [],
    contacts: [],
    contact_identities: [],
    conversations: [],
    events: [],
    escalations: [],
  };
  const vault = { [channel.id]: { access_token: TOKEN, account_id: ACCOUNT } };
  const unsent = [];
  const removed = [];
  let mids = 0;
  let people = 0;
  return {
    i,
    T,
    ACCOUNT,
    TOKEN,
    channel,
    tables,
    unsent,
    removed,
    open: (faults = {}) => {
      const db = fakeDb(tables, faults, {
        get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
        message_unsent: ({ p_external_id }) => {
          unsent.push(p_external_id);
          return { outcome: "forgot", message_id: "m-gone", storage_path: `${T}/conv/m-gone.jpg` };
        },
      });
      db.storage = { from: () => ({ remove: async (paths) => (removed.push(...paths), { error: null }) }) };
      setPg(db);
      openTables = tables;
      return db;
    },
    person: () => `61000${pad(i, 4)}${pad(++people, 4)}`,
    mid: () => `aWdfZAG1-${i}-${++mids}`,
    envelope: (...messaging) => ({ object: "instagram", entry: [{ id: ACCOUNT, time: 1, messaging }] }),
  };
}

const blank = () => ({ history: [], pausedUntil: 0, replies: [], textedBefore: false });

/** The receptionist's world, recording what crosses it: it answers every DM with one line, on the DM's own wire. */
function receptionist({ ingest = () => {} } = {}) {
  const kept = new Set();
  const seen = { ingested: [], sent: [] };
  setInboundPorts({
    db: pg,
    runtime: async (_db, routed) => ({
      tenantId: routed.tenantId,
      brain: {
        business_name: "Harbor Nails",
        booking_link: null,
        system_prompt: "You answer for Harbor Nails.",
        fallbacks: {
          greeting: "Hi! A person will be with you shortly.",
          error: "We'll reply soon.",
          non_text: "Thanks!",
        },
      },
      notifications: { escalation_emails: ["owner@harbor.example"], from: "Harbor <hello@platform.test>" },
      calendar: null,
      features: null,
      policy: { reply: { mode: "auto", limits: {} } },
      waCreds: null,
      envNumber: false,
      paused: false,
      loadFailed: false,
      configBroken: false,
    }),
    leads: {
      read: async () => ({ name: null }),
      readById: async () => ({ name: null }),
      personReplyMode: async () => null,
    },
    calendar: { openings: async () => null, visits: async () => null },
    budget: { tokensLast24h: async () => 0 },
    persist: {
      thread: async () => blank(),
      ingest: async (_db, tenantId, n, line) => {
        const isNew = !kept.has(n.externalId);
        kept.add(n.externalId);
        if (isNew)
          seen.ingested.push({ tenantId, channel: n.channel, body: n.body, who: n.profileName, id: n.identity, line });
        ingest(n);
        return {
          message_id: `m-${n.externalId}`,
          conversation_id: "conv-1",
          contact_id: "k-1",
          is_new: isNew,
          processed: false,
          consent: "unknown",
          dnc: false,
          paused_until: null,
        };
      },
      sink: (_db, tenantId, _ing, _rt, channel, wires) => ({
        on: true,
        deliver: async (to, body) => {
          const r = await wires[channel](to, { body });
          seen.sent.push({ tenantId, channel, to, body, ok: r.ok });
          return r.ok
            ? { outcome: "sent", messageId: "m-out", externalId: r.wamid }
            : { outcome: "failed", reason: "provider", status: r.status, errorBody: null, messageId: null };
        },
        processed: async () => {},
        allowlistSkip: async () => {},
        unreachableSender: async () => {},
        noteEmail: async () => {},
        vetoFallback: async () => {},
        pause: async () => {},
        usage: async () => {},
        escalate: async () => "opened",
        media: async () => null,
      }),
      queueReply: async () => false,
    },
    alertStaff: async () => {},
    page: async () => "sent",
    sender: () => async () => {
      throw new Error("a DM must not be answered on WhatsApp");
    },
    brain: async () => ({ generateReply: async () => ({ text: "We're open Saturday 9 to 5!", escalate: false }) }),
    env: { allowlist: "", modelKey: "a-key-for-this-file" },
  });
  return seen;
}

/* ------------------------------------------------------------- the cases */

test("the handshake answers Meta's challenge for the verify token, and nothing else", async () => {
  const get = (q) => door.GET(new Request(`${DOOR}?${new URLSearchParams(q)}`), event());
  const ok = await get({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "12345" });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");
  assert.equal((await get({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" })).status, 403);
  assert.equal(
    (await get({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" })).status,
    403,
  );
});

test("a body is proven by Meta's signature with either app secret, and a forged or unsigned one is refused", async () => {
  const w = world();
  w.open();
  receptionist();
  const body = w.envelope({
    sender: { id: w.person() },
    recipient: { id: w.ACCOUNT },
    timestamp: 1,
    read: { mid: "x" },
  });
  const raw = JSON.stringify(body);
  assert.deepEqual(await heard(await post(body, { signature: sign(raw, "someone-else") })), [
    401,
    { ok: false, error: "bad_signature" },
  ]);
  assert.deepEqual(await heard(await post(body, { signature: "" })), [401, { ok: false, error: "bad_signature" }]);
  assert.equal((await post(body, { signature: sign(raw, IG_SECRET) })).status, 200);
  assert.equal((await post(body, { signature: sign(raw, META_SECRET) })).status, 200);
});

test("a person's DM is recorded with their name, and its job answers it by DM from the account's own token", async () => {
  resetBreakers();
  const w = world();
  w.open();
  const seen = receptionist();
  const who = w.person();
  const mid = w.mid();
  const mark = requests.length;
  const res = await post(
    w.envelope({
      sender: { id: who },
      recipient: { id: w.ACCOUNT },
      timestamp: Date.now(),
      message: { mid, text: "Open Saturday?" },
    }),
  );
  assert.deepEqual(await heard(res), [200, { ok: true }]);
  assert.deepEqual(seen.ingested, [
    {
      tenantId: w.T,
      channel: "instagram",
      body: "Open Saturday?",
      who: "Dana Ruiz",
      id: { externalId: who, phoneE164: null, email: null },
      line: w.channel.id,
    },
  ]);
  // The name came from the person's profile, with the account's token.
  const profile = requests.slice(mark).find((r) => r.url.startsWith(`${GRAPH}/${who}?`));
  assert.ok(profile, "the person's profile was read");
  assert.match(profile.url, new RegExp(`access_token=${w.TOKEN}$`));
  // Nothing was sent at the door: the answer is its job's.
  assert.equal(seen.sent.length, 0);
  const [job] = w.tables.jobs;
  assert.equal(job.kind, "inbound_answer");
  assert.equal(job.payload.ig.account, w.ACCOUNT);
  assert.equal(job.payload.ig.item.message.mid, mid);
  assert.equal(job.payload.message_id, `m-${mid}`);

  await runAnswers();
  assert.deepEqual(jobThrows, []);
  assert.equal(job.state, "done");
  assert.equal(seen.sent.length, 1);
  assert.equal(seen.sent[0].channel, "instagram");
  assert.equal(seen.sent[0].to, who);
  const dm = requests.slice(mark).find((r) => r.url === `${GRAPH}/${w.ACCOUNT}/messages`);
  assert.ok(dm, "the reply went to Instagram from the account");
  assert.equal(dm.init.headers.Authorization, `Bearer ${w.TOKEN}`);
  assert.deepEqual(JSON.parse(dm.init.body).recipient, { id: who });
  assert.ok(job.spoke_at, "the job said it was speaking before Instagram was called");
});

test("an account no workspace holds keeps nothing, is told to the platform, and is acknowledged", async () => {
  const w = world();
  w.channel.status = "disabled";
  w.open();
  const seen = receptionist();
  const mark = requests.length;
  await listening(async ({ said }) => {
    const res = await post(
      w.envelope({
        sender: { id: w.person() },
        recipient: { id: w.ACCOUNT },
        timestamp: 1,
        message: { mid: w.mid(), text: "hi" },
      }),
    );
    assert.deepEqual(await heard(res), [200, { ok: true }]);
    assert.equal(said("ig_unroutable").length, 1);
  });
  assert.equal(seen.ingested.length, 0);
  assert.equal(w.tables.jobs.length, 0);
  const mail = requests
    .slice(mark)
    .filter((r) => r.url.startsWith(RESEND))
    .map((r) => JSON.parse(r.init.body));
  assert.equal(mail.length, 1);
  assert.match(mail[0].subject, /Instagram DMs are arriving for an account that is switched off/);
});

test("a routing read that fails, or a DM the database did not take, is not acknowledged", async () => {
  const w = world();
  w.open({ "tenant_channels.select": { message: "connection reset" } });
  receptionist();
  const res = await post(
    w.envelope({
      sender: { id: w.person() },
      recipient: { id: w.ACCOUNT },
      timestamp: 1,
      message: { mid: w.mid(), text: "hi" },
    }),
  );
  assert.deepEqual(await heard(res), [503, { ok: false, unrecorded: 1 }]);

  const v = world();
  v.open();
  receptionist({
    ingest: () => {
      throw new IngestFailed("ingest_inbound: connection reset", false);
    },
  });
  const failed = await post(
    v.envelope({
      sender: { id: v.person() },
      recipient: { id: v.ACCOUNT },
      timestamp: 1,
      message: { mid: v.mid(), text: "hi" },
    }),
  );
  assert.deepEqual(await heard(failed), [503, { ok: false, unrecorded: 1 }]);
  assert.equal(v.tables.jobs.length, 0);
});

test("an echo of a DM we sent changes nothing; one from the Instagram app is the team's words and pauses the receptionist", async () => {
  const w = world();
  const who = w.person();
  w.tables.contacts.push({
    id: "eeeeeeee-0000-4000-8000-000000000001",
    tenant_id: w.T,
    merged_into_contact_id: null,
    erased_at: null,
  });
  w.tables.contact_identities.push({
    id: "ffffffff-0000-4000-8000-000000000001",
    tenant_id: w.T,
    contact_id: "eeeeeeee-0000-4000-8000-000000000001",
    channel: "instagram",
    external_id: who,
    assurance: "observed",
  });
  w.tables.conversations.push({
    id: "c0c0c0c0-0000-4000-8000-000000000001",
    tenant_id: w.T,
    contact_id: "eeeeeeee-0000-4000-8000-000000000001",
  });
  const ours = w.mid();
  w.tables.messages.push({
    id: "m-ours",
    tenant_id: w.T,
    external_id: ours,
    channel: "instagram",
    direction: "outbound",
  });
  w.open();
  receptionist();
  const echo = (mid, text) => ({
    sender: { id: w.ACCOUNT },
    recipient: { id: who },
    timestamp: 1,
    message: { mid, text, is_echo: true },
  });

  assert.deepEqual(await heard(await post(w.envelope(echo(ours, "We're open Saturday 9 to 5!")))), [200, { ok: true }]);
  assert.equal(w.tables.messages.length, 1, "our own echo is not kept twice");
  assert.equal(w.tables.conversations[0].paused_until ?? null, null);

  const theirs = w.mid();
  assert.deepEqual(await heard(await post(w.envelope(echo(theirs, "Hi Dana, it's Maria here")))), [200, { ok: true }]);
  const kept = w.tables.messages.find((m) => m.external_id === theirs);
  assert.ok(kept, "the team's words are kept");
  assert.equal(kept.channel, "instagram");
  assert.equal(kept.sender, "human");
  assert.equal(kept.body, "Hi Dana, it's Maria here");
  assert.ok(w.tables.conversations[0].paused_until, "the receptionist stepped out of the thread");
});

test("a reply we sent as several DMs is ours in every part: a later part's echo, under its own id, pauses nothing", async () => {
  const w = world();
  const who = w.person();
  const PERSON = "eeeeeeee-0000-4000-8000-000000000002";
  w.tables.contacts.push({ id: PERSON, tenant_id: w.T, merged_into_contact_id: null, erased_at: null });
  w.tables.contact_identities.push({
    id: "ffffffff-0000-4000-8000-000000000002",
    tenant_id: w.T,
    contact_id: PERSON,
    channel: "instagram",
    external_id: who,
    assurance: "observed",
  });
  w.tables.conversations.push({ id: "c0c0c0c0-0000-4000-8000-000000000002", tenant_id: w.T, contact_id: PERSON });
  // Long enough for two DMs (1000 bytes each): the row keeps the whole reply under the first part's id, as deliver does.
  const reply = `${"We move apartments and houses across the county, with packing on request. ".repeat(10)}\n\n${"Saturday is open from nine to five, and a weekday estimate is free. ".repeat(6)}`;
  const parts = instagramDmChunks(reply);
  assert.equal(parts.length, 2, "the reply goes as two DMs");
  w.tables.messages.push({
    id: "m-long",
    tenant_id: w.T,
    conversation_id: "c0c0c0c0-0000-4000-8000-000000000002",
    external_id: w.mid(),
    channel: "instagram",
    direction: "outbound",
    sender: "ai",
    status: "sent",
    body: reply,
    created_at: new Date().toISOString(),
  });
  w.open();
  receptionist();
  const second = {
    sender: { id: w.ACCOUNT },
    recipient: { id: who },
    timestamp: 1,
    message: { mid: w.mid(), text: parts[1], is_echo: true },
  };

  assert.deepEqual(await heard(await post(w.envelope(second))), [200, { ok: true }]);
  assert.equal(w.tables.messages.length, 1, "the second part is our reply's, not the team's words");
  assert.equal(w.tables.conversations[0].paused_until ?? null, null, "and the receptionist goes on answering");
});

test("an echo to a person nobody here holds is nobody's thread, and is acknowledged", async () => {
  const w = world();
  w.open();
  receptionist();
  await listening(async ({ said }) => {
    const res = await post(
      w.envelope({
        sender: { id: w.ACCOUNT },
        recipient: { id: w.person() },
        timestamp: 1,
        message: { mid: w.mid(), text: "Hello!", is_echo: true },
      }),
    );
    assert.deepEqual(await heard(res), [200, { ok: true }]);
    assert.equal(said("ig_echo_unheld").length, 1);
  });
  assert.equal(w.tables.messages.length, 0);
});

test("an unsent DM's words and attachment are taken back; a reaction, a read and an edit ask nothing", async () => {
  const w = world();
  w.open();
  const seen = receptionist();
  const who = w.person();
  const gone = w.mid();
  const res = await post(
    w.envelope(
      { sender: { id: who }, recipient: { id: w.ACCOUNT }, timestamp: 1, message: { mid: gone, is_deleted: true } },
      {
        sender: { id: who },
        recipient: { id: w.ACCOUNT },
        timestamp: 1,
        reaction: { mid: "x", action: "react", emoji: "❤" },
      },
      { sender: { id: who }, recipient: { id: w.ACCOUNT }, timestamp: 1, read: { mid: "x" } },
      {
        sender: { id: who },
        recipient: { id: w.ACCOUNT },
        timestamp: 1,
        message_edit: { mid: "x", text: "y", num_edit: 1 },
      },
    ),
  );
  assert.deepEqual(await heard(res), [200, { ok: true }]);
  assert.deepEqual(w.unsent, [gone]);
  assert.deepEqual(w.removed, [`${w.T}/conv/m-gone.jpg`]);
  assert.equal(seen.ingested.length, 0);
  assert.equal(w.tables.jobs.length, 0);
});
