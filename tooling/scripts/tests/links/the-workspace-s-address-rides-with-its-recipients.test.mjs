/**
 * The workspace's address word rides with the recipients it is told at (wiring/records-not-pages, task 1.7; finding A2a): an
 * alert mail ends with a link to the workspace's own page, built from `tenants.slug`, and the edge's two loaders of "who is
 * told" read it where they already read the workspace, so the mail costs no query of its own. `loadTenantNotifications` is
 * the one a sweep or a job asks by tenant id (it reads the workspace beside the settings and the channel, three reads at
 * once); the runtime is what a message's handler holds (it reads the workspace's row already, for its name and its clock).
 *
 * A workspace whose slug cannot be read is still told: the recipients are not the slug, and a missing slug is a mail with no
 * link (every-alert-mail-ends-with-the-link-to-its-page).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { loadTenantNotifications, loadTenantRuntime } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/tenant-runtime.ts")).href
);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "owner@harbor.test";
const tenant = { id: T, name: "Harbor Moving", slug: "harbor", timezone: "America/New_York", status: "active" };
const config = { tenant_id: T, config: { notifications: { escalation_emails: [OWNER] } } };

/** The logger's lines, kept instead of printed. */
function capture() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real))
    console[k] = (...a) => lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  return {
    lines,
    restore: () => Object.assign(console, real),
  };
}

test("a workspace's recipients come with its address word, in the same three reads", async () => {
  const db = fakeDb({ tenants: [tenant], tenant_config: [config], tenant_channels: [] });
  assert.deepEqual(await loadTenantNotifications(db, T), {
    notifications: { escalation_emails: [OWNER] },
    isEnvDefault: false,
    slug: "harbor",
  });
  assert.deepEqual(
    db.seen
      .filter((s) => s.table)
      .map((s) => s.table)
      .sort(),
    ["tenant_channels", "tenant_config", "tenants"],
    "the recipients, the number and the workspace: one read each, none more",
  );
});

test("a workspace with no row to read has no address word to give, and its recipients are the same", async () => {
  const db = fakeDb({ tenants: [], tenant_config: [config], tenant_channels: [] });
  const got = await loadTenantNotifications(db, T);
  assert.deepEqual(got, { notifications: { escalation_emails: [OWNER] }, isEnvDefault: false });
  assert.equal("slug" in got, false, "unset is 'not read', which the mail reads once for itself; it is not null");
});

test("a workspace read that fails costs only the link: the recipients are still read, and the failure is said", async () => {
  const db = fakeDb(
    { tenants: [tenant], tenant_config: [config], tenant_channels: [] },
    { "tenants.select": { message: "statement timeout" } },
  );
  const log = capture();
  try {
    assert.deepEqual(await loadTenantNotifications(db, T), {
      notifications: { escalation_emails: [OWNER] },
      isEnvDefault: false,
    });
  } finally {
    log.restore();
  }
  assert.ok(
    log.lines.some((l) => l.includes("tenant_notifications_workspace_unreadable") && l.includes("statement timeout")),
    log.lines.join("\n"),
  );
});

test("the runtime a message's handler holds carries the address word from the row it already reads", async () => {
  const db = fakeDb(
    { tenants: [tenant], tenant_config: [config], policies: [], google_listings: [], tenant_channels: [] },
    {},
    { runtime_stamp: () => "stamp-slug", get_channel_credentials: () => null },
  );
  const routed = {
    tenantId: T,
    channelId: "ch1",
    kind: "voice",
    externalId: "agent_1",
    numberE164: null,
    credentialsRef: null,
    config: {},
  };
  const rt = await loadTenantRuntime(db, routed);
  assert.equal(rt.loadFailed, false);
  assert.equal(rt.slug, "harbor");
  assert.equal(
    db.seen.filter((s) => s.table === "tenants").length,
    1,
    "the workspace's row was read once for the name, the clock, the switch and now the address word",
  );
});

test("a runtime that could not be loaded names no address word", async () => {
  const db = fakeDb(
    { tenants: [tenant] },
    { "tenant_config.select": { message: "statement timeout" } },
    {
      runtime_stamp: () => "x",
      get_channel_credentials: () => null,
    },
  );
  const log = capture();
  let rt;
  try {
    rt = await loadTenantRuntime(db, {
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      channelId: "c",
      kind: "voice",
      externalId: "a",
      numberE164: null,
      credentialsRef: null,
      config: {},
    });
  } finally {
    log.restore();
  }
  assert.equal(rt.loadFailed, true);
  assert.equal(rt.slug ?? null, null);
});
