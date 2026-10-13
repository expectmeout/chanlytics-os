/**
 * Every WhatsApp send uses the credentials of the tenant it belongs to, or
 * does not happen.
 *
 * The environment pair (WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN) is one
 * tenant's credentials: the pilot line's. It used to be everyone's fallback --
 * a vault error, a channel with no reference, a runtime that could not load --
 * and a fallback is how one business's reply left from another business's
 * number on another business's token. Now "no credentials" is an answer, the
 * send is refused where a person is told, and the environment pair goes only
 * to the tenant whose channel row carries the environment's own number.
 *
 * Executed, not read: the resolver runs against a fake database and a
 * controlled environment.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { waCfgFor, waCredentialsForTenant, loadTenantNotifications, loadTenantRuntime, whatsappWireForTenant } =
  await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/tenant-runtime.ts")).href);

const ENV = { WHATSAPP_PHONE_ID: "111000", WHATSAPP_ACCESS_TOKEN: "env-token" };
async function withEnv(env, fn) {
  const saved = {};
  for (const k of ["WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"]) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const runtime = (over = {}) => ({ tenantId: "t2", waCreds: null, envNumber: false, loadFailed: false, ...over });

test("a tenant with vault credentials sends on them, whatever the environment holds", () =>
  withEnv(ENV, () => {
    assert.deepEqual(waCfgFor(runtime({ waCreds: { phoneId: "222000", accessToken: "vault-token" } })), {
      phoneId: "222000",
      accessToken: "vault-token",
    });
  }));

test("no credentials is null -- never the environment's pair", () =>
  withEnv(ENV, () => {
    assert.equal(waCfgFor(runtime()), null, "a second business with nothing in the vault");
    assert.equal(waCfgFor(null), null, "an unknown tenant");
    assert.equal(
      waCfgFor(runtime({ loadFailed: true })),
      null,
      "a runtime that could not load, for a business that is not the pilot",
    );
  }));

test("the environment pair belongs to the environment's own number, and to a message that arrived on it", () =>
  withEnv(ENV, () => {
    assert.deepEqual(waCfgFor(runtime({ envNumber: true })), { phoneId: "111000", accessToken: "env-token" });
    // Disaster posture: the control plane could not be read, but the webhook
    // itself knows the message came in on the pilot line.
    assert.deepEqual(waCfgFor(null, true), { phoneId: "111000", accessToken: "env-token" });
  }));

test("an environment with no pair has nothing to hand even the pilot line", () =>
  withEnv({}, () => {
    assert.equal(waCfgFor(runtime({ envNumber: true })), null);
    assert.equal(waCfgFor(null, true), null);
  }));

/* ------------------ by tenant id: the job runner's question ---------------- */

const channel = (over = {}) => ({
  id: "ch1",
  tenant_id: "t2",
  kind: "whatsapp",
  status: "active",
  credentials_ref: "wa-creds-t2",
  external_id: "222000",
  ...over,
});

test("a vault reference is read through the vault door", () =>
  withEnv(ENV, async () => {
    const db = fakeDb(
      { tenant_channels: [channel()] },
      {},
      {
        get_channel_credentials: ({ p_channel_id }) => {
          assert.equal(p_channel_id, "ch1");
          return { access_token: "vault-token", phone_id: "222000" };
        },
      },
    );
    assert.deepEqual(await waCredentialsForTenant(db, "t2"), {
      outcome: "present",
      credentials: { phoneId: "222000", accessToken: "vault-token" },
    });
  }));

test("a vault that does not answer is UNAVAILABLE: never the environment's pair, and never 'no credentials' either", () =>
  withEnv(ENV, async () => {
    // A read that FAILED is not a channel that carries nothing. The number may
    // well be connected; nobody knows. Said as its own outcome, so the send
    // path waits rather than fail a reply for good and tell the owner to
    // reconnect a number that works.
    const db = fakeDb(
      { tenant_channels: [channel()] },
      {},
      {
        get_channel_credentials: () => {
          throw new Error("vault unavailable");
        },
      },
    );
    assert.deepEqual(await waCredentialsForTenant(db, "t2"), { outcome: "unavailable", error: "vault unavailable" });
  }));

test("a vault that answers with a pair missing a half is a channel that carries none", () =>
  withEnv(ENV, async () => {
    const db = fakeDb(
      { tenant_channels: [channel()] },
      {},
      { get_channel_credentials: () => ({ access_token: "vault-token" }) },
    );
    assert.deepEqual(await waCredentialsForTenant(db, "t2"), { outcome: "absent" });
  }));

test("a channel with no reference gets the environment pair only when it IS the environment's number", () =>
  withEnv(ENV, async () => {
    const pilot = fakeDb({ tenant_channels: [channel({ credentials_ref: null, external_id: "111000" })] });
    assert.deepEqual(await waCredentialsForTenant(pilot, "t2"), {
      outcome: "present",
      credentials: { phoneId: "111000", accessToken: "env-token" },
    });
    const other = fakeDb({ tenant_channels: [channel({ credentials_ref: null, external_id: "333000" })] });
    assert.deepEqual(
      await waCredentialsForTenant(other, "t2"),
      { outcome: "absent" },
      "another business's number is not ours to send from",
    );
  }));

test("no active WhatsApp channel is ABSENT; a channel that cannot be read is UNAVAILABLE; neither is the pilot's token", () =>
  withEnv(ENV, async () => {
    assert.deepEqual(await waCredentialsForTenant(fakeDb({ tenant_channels: [] }), "t2"), { outcome: "absent" });
    assert.deepEqual(
      await waCredentialsForTenant(fakeDb({ tenant_channels: [channel({ status: "disabled" })] }), "t2"),
      { outcome: "absent" },
    );
    const broken = fakeDb(
      { tenant_channels: [channel()] },
      { "tenant_channels.select": { message: "connection reset" } },
    );
    // The numbers are read in packages/db (activeWhatsappNumbers), whose error says what it could not read.
    assert.deepEqual(
      await waCredentialsForTenant(broken, "t2"),
      { outcome: "unavailable", error: "cannot read the workspace's WhatsApp numbers: connection reset" },
      '"we could not check" is not "send on the pilot\'s token", and not "nothing on file" either',
    );
  }));

/* ---- a workspace with two active WhatsApp numbers ---- */

/**
 * Connecting a second number writes its row and turns it on, and leaves the first one on: nothing holds a workspace
 * to one active WhatsApp row (connect-number.ts; tenant_channels is unique on the number alone). Both route.
 */
function twoNumbers() {
  const T = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";
  const number = (id, external, created) => ({
    id,
    tenant_id: T,
    kind: "whatsapp",
    status: "active",
    credentials_ref: `ref-${id}`,
    external_id: external,
    number_e164: `+1305555${external.slice(0, 4)}`,
    config: {},
    created_at: created,
  });
  const db = fakeDb(
    {
      tenants: [{ id: T, name: "Harbor Nails", timezone: "America/New_York", status: "active" }],
      tenant_config: [],
      policies: [],
      google_listings: [],
      // The newer row first, as Postgres may return it to a read that names no order.
      tenant_channels: [
        number("wa-new", "555000", "2026-10-01T09:00:00.000Z"),
        number("wa-old", "111000", "2026-09-01T09:00:00.000Z"),
      ],
    },
    {},
    {
      runtime_stamp: () => "stamp-two-numbers",
      get_channel_credentials: ({ p_channel_id }) =>
        ({
          "wa-old": { access_token: "token-old", phone_id: "111000" },
          "wa-new": { access_token: "token-new", phone_id: "555000" },
        })[p_channel_id] ?? null,
    },
  );
  const routed = (channelId, externalId, kind = "whatsapp") => ({
    tenantId: T,
    channelId,
    kind,
    externalId,
    numberE164: null,
    credentialsRef: kind === "whatsapp" ? `ref-${channelId}` : null,
    config: {},
  });
  return { T, db, routed };
}

test("a workspace with two active WhatsApp numbers answers each customer from the number they wrote to, whichever warmed the runtime first", () =>
  withEnv(ENV, async () => {
    const { db, routed } = twoNumbers();
    const onNew = await loadTenantRuntime(db, routed("wa-new", "555000"));
    assert.deepEqual(onNew.waCreds, { accessToken: "token-new", phoneId: "555000" });
    const onOld = await loadTenantRuntime(db, routed("wa-old", "111000"));
    assert.deepEqual(
      [onOld.waCreds, onOld.envNumber],
      [{ accessToken: "token-old", phoneId: "111000" }, true],
      "REGRESSION: the runtime cached for the workspace answered from the number that warmed the instance first",
    );
    assert.equal(await loadTenantRuntime(db, routed("wa-new", "555000")), onNew, "and each is served from the cache");
  }));

test("a caller that knows no number the customer wrote to is given the workspace's oldest active WhatsApp number, every time", () =>
  withEnv(ENV, async () => {
    const { T, db, routed } = twoNumbers();
    // A call: the voice channel routed it, and its booking link goes by WhatsApp.
    const viaCall = await loadTenantRuntime(db, routed("voice-1", "agent_1", "voice"));
    assert.deepEqual(viaCall.waCreds, { accessToken: "token-old", phoneId: "111000" }, "not whichever row came first");
    // The job runner and the template doors.
    assert.deepEqual(await waCredentialsForTenant(db, T), {
      outcome: "present",
      credentials: { phoneId: "111000", accessToken: "token-old" },
    });
    // And whether the workspace is the environment's own is asked of the same row.
    assert.equal((await loadTenantNotifications(db, T)).isEnvDefault, true);
  }));

/* ---- the job runner's wire: from the number the person wrote to ---- */

const JT = "aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa";
/** A WhatsApp number of the job's workspace, connected on `created`. */
const waNumber = (id, external, created, over = {}) => ({
  id,
  tenant_id: JT,
  kind: "whatsapp",
  status: "active",
  credentials_ref: `ref-${id}`,
  external_id: external,
  number_e164: `+1305555${external.slice(0, 4)}`,
  config: {},
  created_at: created,
  ...over,
});
const OLD = waNumber("wa-old", "111100", "2026-09-01T09:00:00.000Z");
const NEW = waNumber("wa-new", "555500", "2026-10-01T09:00:00.000Z");
/** A message the person wrote on WhatsApp, kept with the line it came in on, `minutes` ago. */
const wroteOn = (conversation, line, minutes) => ({
  id: `in-${conversation}-${minutes}`,
  tenant_id: JT,
  conversation_id: conversation,
  channel: "whatsapp",
  direction: "inbound",
  sender: "customer",
  status: "received",
  meta: { raw_type: "text", ...(line ? { line } : {}) },
  created_at: new Date(Date.now() - minutes * 60_000).toISOString(),
});

/**
 * The job runner's WhatsApp wire over a workspace's numbers (the newer row first, as a read that names no order may
 * find it) and its people's messages, with every vault read counted and every request to Graph caught.
 */
async function jobWire({ numbers = [NEW, OLD], messages = [], vault = {}, faults = {} } = {}) {
  const reads = [];
  const db = fakeDb({ tenant_channels: numbers, messages }, faults, {
    get_channel_credentials: ({ p_channel_id }) => {
      reads.push(p_channel_id);
      const v =
        vault[p_channel_id] ?? { "wa-old": ["token-old", "111100"], "wa-new": ["token-new", "555500"] }[p_channel_id];
      if (typeof v === "function") return v();
      return Array.isArray(v) ? { access_token: v[0], phone_id: v[1] } : (v ?? null);
    },
  });
  const wire = await whatsappWireForTenant(db, JT);
  const posted = [];
  const send = async (conversationId) => {
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      posted.push([String(url), init.headers.Authorization]);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${posted.length}` }] }), { status: 200 });
    };
    try {
      return await wire("+13055550199", { body: "See you at 3", ...(conversationId ? { conversationId } : {}) });
    } finally {
      globalThis.fetch = real;
    }
  };
  return { db, reads, wire, send, posted };
}
const fromOld = ["https://graph.facebook.com/v25.0/111100/messages", "Bearer token-old"];
const fromNew = ["https://graph.facebook.com/v25.0/555500/messages", "Bearer token-new"];

test("the job runner's wire sends each thread's words from the number its person last wrote to, the oldest when nothing says, and reads each number's credentials once", () =>
  withEnv(ENV, async () => {
    const j = await jobWire({
      messages: [
        // Wrote to the old number, then to the new one: the newest message says which.
        wroteOn("cv-a", "wa-old", 30),
        wroteOn("cv-a", "wa-new", 5),
        // The other way round.
        wroteOn("cv-b", "wa-new", 30),
        wroteOn("cv-b", "wa-old", 5),
        // A number since turned off, a message kept before lines were, and one that is a text's: none says which.
        wroteOn("cv-c", "wa-gone", 5),
        wroteOn("cv-d", null, 5),
        { ...wroteOn("cv-e", "line-sms", 5), channel: "sms" },
      ],
    });
    for (const thread of ["cv-a", "cv-b", "cv-c", "cv-d", "cv-e", "cv-none", null]) {
      assert.equal((await j.send(thread)).ok, true, String(thread));
    }
    assert.deepEqual(
      j.posted,
      [fromNew, fromOld, fromOld, fromOld, fromOld, fromOld, fromOld],
      "the newer number for the one who wrote to it last; the oldest for everyone nothing names",
    );
    assert.deepEqual(j.reads, ["wa-old", "wa-new"], "the vault asked once per number, however many sends");
  }));

test("a workspace with one WhatsApp number reads no thread: its wire is the number's, as it was", () =>
  withEnv(ENV, async () => {
    const j = await jobWire({ numbers: [OLD], messages: [wroteOn("cv-a", "wa-new", 5)] });
    assert.equal((await j.send("cv-a")).ok, true);
    assert.deepEqual(j.posted, [fromOld]);
    assert.deepEqual(
      j.db.seen.filter((q) => q.table === "messages"),
      [],
      "nothing more is read than before there were two",
    );
  }));

test("the job runner's wire refuses rather than falls back: a thread or a vault it could not read holds the send, and a number with no credentials is no credentials", () =>
  withEnv(ENV, async () => {
    // The thread could not be read: which number is not known, so nothing leaves (the door's wire that could not be bound).
    const blind = await jobWire({ faults: { "messages.select": { message: "statement timeout" } } });
    await assert.rejects(
      blind.send("cv-a"),
      (e) => e.name === "WireUnavailableError" && /statement timeout/.test(e.message),
    );
    assert.deepEqual(blind.posted, [], "never the oldest in its stead");

    // The number they wrote to has credentials the vault did not answer for: held; the old number's people still go.
    const blip = await jobWire({
      messages: [wroteOn("cv-a", "wa-new", 5), wroteOn("cv-b", "wa-old", 5)],
      vault: {
        "wa-new": () => {
          throw new Error("vault unavailable");
        },
      },
    });
    await assert.rejects(
      blip.send("cv-a"),
      (e) => e.name === "WireUnavailableError" && /vault unavailable/.test(e.message),
    );
    assert.equal((await blip.send("cv-b")).ok, true);
    assert.deepEqual(blip.posted, [fromOld]);

    // The number they wrote to carries none: the door's "no credentials", never the other number's and never the pilot's.
    const bare = await jobWire({
      numbers: [NEW, OLD].map((n) => (n.id === "wa-new" ? { ...n, credentials_ref: null } : n)),
      messages: [wroteOn("cv-a", "wa-new", 5)],
    });
    assert.deepEqual(await bare.send("cv-a"), {
      ok: false,
      wamid: null,
      status: 503,
      errorBody: "no_credentials",
      reason: "no_credentials",
    });
    assert.deepEqual(bare.posted, []);

    // The oldest number's vault did not answer as the wire was bound: the whole wire could not be bound, as before.
    const unbound = await jobWire({
      vault: {
        "wa-old": () => {
          throw new Error("vault unavailable");
        },
      },
    });
    assert.deepEqual(unbound.wire, { unavailable: true, error: "vault unavailable" });
    // No active number at all: none, the door's refusal.
    assert.equal((await jobWire({ numbers: [] })).wire, null);
  }));

/* ---- who a tenant known only by id is addressed as ---- */

const cfgRow = (notifications) => ({ tenant_id: "t2", config: { notifications } });
const waRow = (over = {}) => ({
  id: "ch1",
  tenant_id: "t2",
  kind: "whatsapp",
  external_id: "111000",
  status: "active",
  ...over,
});

test("the workspace's own recipients are read, and its own number decides whether it is the environment's", () =>
  withEnv(ENV, async () => {
    const db = fakeDb({
      tenant_config: [cfgRow({ escalation_emails: ["ada@example.com"] })],
      tenant_channels: [waRow()],
    });
    assert.deepEqual(await loadTenantNotifications(db, "t2"), {
      notifications: { escalation_emails: ["ada@example.com"] },
      isEnvDefault: true,
    });
    const other = fakeDb({
      tenant_config: [cfgRow({ escalation_emails: ["bo@example.com"] })],
      tenant_channels: [waRow({ external_id: "999000" })],
    });
    assert.deepEqual(await loadTenantNotifications(other, "t2"), {
      notifications: { escalation_emails: ["bo@example.com"] },
      isEnvDefault: false,
    });
  }));

test("a second WhatsApp row does not cost a workspace its own alerts", () =>
  withEnv(ENV, async () => {
    // `tenant_channels` has no unique constraint on (tenant_id, kind) and the
    // product ADDS a row rather than replacing one -- a reconnected number
    // leaves the old row behind. A bare maybeSingle() over two rows is a
    // PostgREST error, and the error was not checked, so it arrived as
    // `data === null`: read as "not the environment's number", which quietly
    // downgraded this workspace's alerts to redacted platform notices with the
    // customer's own words withheld.
    const db = fakeDb({
      tenant_config: [cfgRow({ escalation_emails: ["ada@example.com"] })],
      tenant_channels: [waRow({ id: "old", status: "disabled", external_id: "222000" }), waRow()],
    });
    assert.deepEqual(
      await loadTenantNotifications(db, "t2"),
      { notifications: { escalation_emails: ["ada@example.com"] }, isEnvDefault: true },
      "the ACTIVE row answers, as it does for every other reader in this file",
    );
  }));

test("a channel read that fails costs only the env-default question, never the recipients", () =>
  withEnv(ENV, async () => {
    // The channel answers ONE thing here -- whether this workspace is the
    // environment's own -- and the mailbox is not it. Failing the whole read
    // on a channel error would withhold the customer's words from a workspace
    // whose recipients were read perfectly well, which is the outcome this
    // function's error path exists to avoid.
    const db = fakeDb(
      { tenant_config: [cfgRow({ escalation_emails: ["ada@example.com"] })], tenant_channels: [waRow()] },
      { "tenant_channels.select": { message: "statement timeout" } },
    );
    assert.deepEqual(
      await loadTenantNotifications(db, "t2"),
      { notifications: { escalation_emails: ["ada@example.com"] }, isEnvDefault: false },
      "addressed as itself; only isEnvDefault falls back",
    );
  }));

test("recipients that cannot be read ARE said as unknown, so notify withholds rather than guesses", () =>
  withEnv(ENV, async () => {
    const db = fakeDb(
      { tenant_config: [cfgRow({ escalation_emails: ["ada@example.com"] })], tenant_channels: [waRow()] },
      { "tenant_config.select": { message: "statement timeout" } },
    );
    // Said as unread too, so a caller that must not take "unknown" for "nobody" can wait (the line warning: the review's N1).
    assert.deepEqual(await loadTenantNotifications(db, "t2"), {
      notifications: null,
      isEnvDefault: false,
      unread: true,
    });
  }));
