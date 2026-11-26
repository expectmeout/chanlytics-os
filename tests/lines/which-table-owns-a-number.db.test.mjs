/**
 * Which table owns a number, on a real database (00087): the answer written on the tables, and number_drift() silent
 * about the states that are fine and loud about the ones that are not.
 *
 *   lines            the ASSET, and the saga that made it work
 *   tenant_channels  the ROUTING derived from it, joined by config.line_id
 *
 * A channel row with NO line is a perfectly good state -- a voice number bought inside Retell, or a WhatsApp number
 * that came through Meta and never touched Twilio -- so the drift report is silent about it and loud about the reverse.
 * Run here on workspaces of this file's own, each state made and the report read for those workspaces alone (the
 * database is shared with every other suite). Pinned as 00087's text in numbers-two-tables.test.mjs until 26 Nov 2026.
 * Runs against Postgres in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces' lines and routes"
      : false;

let db;
const made = [];
const stamp = Date.now().toString(36);
/** A number no other suite holds: a live line's number is unique across the database (lines_e164_live_idx). */
let seq = Date.now() % 900_000;
const number = () => `+15559${String(100_000 + (seq++ % 900_000)).padStart(6, "0")}`;

async function workspace(name) {
  const t = await db
    .from("tenants")
    .insert({ slug: `two-tables-${name}-${stamp}`, name: `Two tables ${name}` })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  made.push(t.data.id);
  return t.data.id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

/** What the report says of one workspace, as `kind: detail`. */
async function driftOf(tenantId) {
  const { data, error } = await db.rpc("number_drift");
  assert.equal(error, null, error?.message);
  return data.filter((r) => r.tenant_id === tenantId).map((r) => `${r.kind}: ${r.detail}`);
}
async function route(tenantId, row) {
  const r = await db
    .from("tenant_channels")
    .insert({ tenant_id: tenantId, status: "active", config: {}, ...row })
    .select("id")
    .single();
  assert.equal(r.error, null, r.error?.message);
  return r.data.id;
}
async function line(tenantId, row) {
  const r = await db
    .from("lines")
    .insert({ tenant_id: tenantId, kind: "chanlytics", provider: "dry", ...row })
    .select("id")
    .single();
  assert.equal(r.error, null, r.error?.message);
  return r.data.id;
}

test("the answer is written where it cannot be lost: on the tables themselves", { skip }, async () => {
  // A comment ON THE TABLE is findable by anyone with a psql prompt, which is who asks this question; the database
  // describes its tables with them (PostgREST's OpenAPI root, as database/tenancy/ reads it).
  const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  assert.equal(res.status, 200);
  const defs = (await res.json()).definitions ?? {};
  assert.match(
    defs.lines?.description ?? "",
    /config\.line_id points back here/,
    "lines says which way the arrow points",
  );
  assert.match(defs.tenant_channels?.description ?? "", /The ROUTING table/, "and tenant_channels says what it is for");
  // The two shapes a reader gets wrong, said on the table too. A voice route is per RECEPTIONIST, so two numbers on one
  // agent share it; a message's route is per number.
  const routing = defs.tenant_channels?.description ?? "";
  assert.match(routing, /keyed on the receptionist \(external_id = agent id\)/);
  assert.match(routing, /keyed on the number, because a message arrives addressed to one/);
  // And its config names the line behind a route, when there is one.
  assert.match(defs.tenant_channels?.properties?.config?.description ?? "", /line_id \(the lines row behind it/);
});

test("number_drift() is silent about the states that are fine", { skip }, async () => {
  const T = await workspace("fine");
  // A Retell-bought voice number and a Meta WhatsApp number: a channel row each, and no line.
  await route(T, { kind: "voice", external_id: `agent_retell${stamp}`, number_e164: number() });
  await route(T, { kind: "whatsapp", external_id: `wa-${stamp}`, number_e164: number() });
  // A line still being set up is not expected to be routable yet.
  await line(T, { e164: number(), voice_state: "provisioning" });
  // A config holding something that is not an id: a diagnostic that dies on the data it is diagnosing is worse than none.
  await route(T, { kind: "sms", external_id: `sms-odd-${stamp}`, config: { line_id: "not-an-id" } });
  assert.deepEqual(await driftOf(T), [], "nothing to report");
});

test(
  "number_drift() is loud about the ones that are not, each by its kind and in words a person reads",
  { skip },
  async () => {
    // A line that answers with nothing routing voice to its workspace; a route naming a line that is gone; and one
    // publishing a number no line of the workspace has.
    const V = await workspace("voice");
    const answers = number();
    const answering = await line(V, { e164: answers, voice_state: "answering" });
    await route(V, {
      kind: "sms",
      external_id: `sms-gone-${stamp}`,
      config: { line_id: "00000000-0000-4000-8000-00000000d1f7" },
    });
    const stranger = number();
    await route(V, {
      kind: "sms",
      external_id: `sms-stranger-${stamp}`,
      number_e164: stranger,
      config: { line_id: answering },
    });
    assert.deepEqual((await driftOf(V)).sort(), [
      `answering_unrouted: ${answers} answers calls, but nothing routes voice to this workspace`,
      "orphan_route: the sms route for (no number) names a line that no longer exists",
      `route_number_unknown: the sms route publishes ${stranger}, which is not a number this workspace has a line for`,
    ]);

    // A line switched on for texting with no route for its own number.
    const S = await workspace("texting");
    const texts = number();
    const texting = await line(S, { e164: texts, voice_state: "provisioning", sms_state: "registering" });
    const on = await db.from("lines").update({ sms_state: "active" }).eq("id", texting);
    assert.equal(on.error, null, on.error?.message);
    assert.deepEqual(await driftOf(S), [
      `texting_unrouted: ${texts} is switched on for texting, but nothing routes texts to it`,
    ]);
  },
);
