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
const { waCfgFor, waCredentialsForTenant, loadTenantNotifications } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/tenant-runtime.ts")).href
);

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
    assert.deepEqual(await waCredentialsForTenant(db, "t2"), { phoneId: "222000", accessToken: "vault-token" });
  }));

test("a vault that does not answer is a refusal, not the environment's pair", () =>
  withEnv(ENV, async () => {
    const db = fakeDb(
      { tenant_channels: [channel()] },
      {},
      {
        get_channel_credentials: () => {
          throw new Error("vault unavailable");
        },
      },
    );
    assert.equal(await waCredentialsForTenant(db, "t2"), null);
  }));

test("a channel with no reference gets the environment pair only when it IS the environment's number", () =>
  withEnv(ENV, async () => {
    const pilot = fakeDb({ tenant_channels: [channel({ credentials_ref: null, external_id: "111000" })] });
    assert.deepEqual(await waCredentialsForTenant(pilot, "t2"), { phoneId: "111000", accessToken: "env-token" });
    const other = fakeDb({ tenant_channels: [channel({ credentials_ref: null, external_id: "333000" })] });
    assert.equal(await waCredentialsForTenant(other, "t2"), null, "another business's number is not ours to send from");
  }));

test("no active WhatsApp channel, or a channel that cannot be read, is a refusal", () =>
  withEnv(ENV, async () => {
    assert.equal(await waCredentialsForTenant(fakeDb({ tenant_channels: [] }), "t2"), null);
    assert.equal(
      await waCredentialsForTenant(fakeDb({ tenant_channels: [channel({ status: "disabled" })] }), "t2"),
      null,
    );
    const broken = fakeDb(
      { tenant_channels: [channel()] },
      { "tenant_channels.select": { message: "connection reset" } },
    );
    assert.equal(
      await waCredentialsForTenant(broken, "t2"),
      null,
      '"we could not check" is not "send on the pilot\'s token"',
    );
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
    assert.deepEqual(await loadTenantNotifications(db, "t2"), { notifications: null, isEnvDefault: false });
  }));
