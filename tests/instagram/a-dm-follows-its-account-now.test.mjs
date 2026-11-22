/**
 * A DM goes where its account is connected now, never where it was a minute ago (decision 0143).
 *
 * Where a webhook's account goes is kept a few minutes for every wire (packages/db resolveChannelDetailed): a number
 * does not change workspace. An Instagram account can: disconnected in one workspace and connected in another inside
 * those minutes. A kept answer would then file a customer's DM, and AI's answer, in the business the account just left.
 * Instagram's door and AI's answer job ask `fresh`, which reads the row every time and, where the read fails, says so
 * instead of answering from memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChannelDetailed } from "@chanlytics/db/channels";
import { fakeDb } from "../_fake-db.mjs";

const FIRST = "abababab-4444-4000-8000-000000000001";
const SECOND = "abababab-4444-4000-8000-000000000002";
const ACCOUNT = "17841400000044444";

const row = (id, tenant, over = {}) => ({
  id,
  tenant_id: tenant,
  kind: "instagram",
  external_id: ACCOUNT,
  status: "active",
  number_e164: null,
  credentials_ref: null,
  config: {},
  ...over,
});

test("an account that moved is routed to the workspace that has it now, at once", async () => {
  const tables = { tenant_channels: [row("efefefef-4444-4000-8000-000000000001", FIRST)] };
  const db = fakeDb(tables);
  // A delivery routed the way every other wire's is: the answer is kept for minutes.
  assert.equal((await resolveChannelDetailed(db, "instagram", ACCOUNT)).channel?.tenantId, FIRST);
  // Disconnected in the first workspace (its row lets the account go), connected in the second.
  Object.assign(tables.tenant_channels[0], {
    status: "disabled",
    external_id: "let-go:efefefef-4444-4000-8000-000000000001",
  });
  tables.tenant_channels.push(row("efefefef-4444-4000-8000-000000000002", SECOND));
  // The kept answer still says the first business: a customer's DM would be filed there, and answered from there.
  assert.equal((await resolveChannelDetailed(db, "instagram", ACCOUNT)).channel?.tenantId, FIRST);
  // Asked fresh, as Instagram's door and AI's answer ask: the second's, now.
  const now = await resolveChannelDetailed(db, "instagram", ACCOUNT, { fresh: true });
  assert.equal(now.channel?.tenantId, SECOND);
  assert.equal(now.lookupFailed, false);
});

test("a disconnected account routes nowhere on the next delivery, not minutes later", async () => {
  const tables = {
    tenant_channels: [row("efefefef-4444-4000-8000-000000000003", FIRST, { external_id: "17841400000055555" })],
  };
  const db = fakeDb(tables);
  assert.ok((await resolveChannelDetailed(db, "instagram", "17841400000055555", { fresh: true })).channel);
  Object.assign(tables.tenant_channels[0], {
    status: "disabled",
    external_id: "let-go:efefefef-4444-4000-8000-000000000003",
  });
  assert.deepEqual(await resolveChannelDetailed(db, "instagram", "17841400000055555", { fresh: true }), {
    channel: null,
    lookupFailed: false,
  });
});

test("a fresh read that fails says it could not find out, never the last answer", async () => {
  const tables = {
    tenant_channels: [row("efefefef-4444-4000-8000-000000000004", FIRST, { external_id: "17841400000066666" })],
  };
  const working = fakeDb(tables);
  // Both ways of asking have an answer in hand.
  await resolveChannelDetailed(working, "instagram", "17841400000066666");
  await resolveChannelDetailed(working, "instagram", "17841400000066666", { fresh: true });
  const down = fakeDb(tables, { "tenant_channels.select": { message: "the database did not answer" } });
  assert.deepEqual(await resolveChannelDetailed(down, "instagram", "17841400000066666", { fresh: true }), {
    channel: null,
    lookupFailed: true,
  });
});
