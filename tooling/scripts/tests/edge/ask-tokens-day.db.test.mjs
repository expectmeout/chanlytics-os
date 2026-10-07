/**
 * Ask's day is one sum (00240).
 *
 * The edge's model gateway refuses a workspace's Ask round once its last 24 hours of Ask tokens reach the day's budget
 * (apps/edge/api/admin/llm.ts). It used to read every usage.ask_tokens event of the day and sum them in JavaScript;
 * ask_tokens_day sums them in the database. What it counts is what a sum over rows cannot show from source: the window,
 * the kind, the workspace, a value that is not a number, and who may call it. This runs against the local database the
 * Database workflow builds from every migration. Never production: `supabase start`, then `pnpm test:db` with its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ASK_TOKENS_DAY } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes tenants"
      : false;

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
let db;
const made = [];

async function workspace(label) {
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `ask-day-${label}-${Date.now()}`, name: `Ask day ${label}`, timezone: "America/Chicago" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  made.push(data.id);
  return data.id;
}

const row = (tenant, kind, data, at) => ({
  tenant_id: tenant,
  kind,
  category: "usage",
  subject_type: "user",
  subject_id: null,
  data,
  created_at: at,
});

async function sum(tenant) {
  const { data, error } = await db.rpc("ask_tokens_day", { p_tenant: tenant });
  assert.equal(error, null, error?.message);
  return Number(data);
}

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip || !made.length) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test(
  "the day is the last 24 hours of this workspace's Ask tokens, input plus output, and nothing else",
  { skip },
  async () => {
    const ws = await workspace("day");
    const other = await workspace("other");
    const { error } = await db
      .from("events")
      .insert([
        row(
          ws,
          "usage.ask_tokens",
          { input_tokens: 1_000, output_tokens: 200, cache_read_input_tokens: 9_000 },
          ago(HOUR),
        ),
        row(ws, "usage.ask_tokens", { input_tokens: 3_000, output_tokens: 800 }, ago(23 * HOUR)),
        row(ws, "usage.ask_tokens", { input_tokens: 5_000_000, output_tokens: 0 }, ago(25 * HOUR)),
        row(ws, "usage.llm_tokens", { input_tokens: 7_000_000, output_tokens: 0 }, ago(HOUR)),
        row(ws, "usage.ask_tokens", { input_tokens: "12", output_tokens: null }, ago(HOUR)),
        row(other, "usage.ask_tokens", { input_tokens: 9_000_000, output_tokens: 0 }, ago(HOUR)),
      ]);
    assert.equal(error, null, error?.message);
    assert.equal(
      await sum(ws),
      1_000 + 200 + 3_000 + 800,
      "the two rounds of the day: not yesterday's, not the receptionist's, not the cache counts, not a string, not another workspace's",
    );
    assert.equal(await sum(other), 9_000_000, "each workspace its own day");
    assert.equal(await sum(await workspace("empty")), 0, "a workspace that asked nothing has spent nothing");
  },
);

test("the gateway's line: a day summed to the cap is the cap, so the round after it is refused", { skip }, async () => {
  const ws = await workspace("cap");
  const { error } = await db
    .from("events")
    .insert([
      row(ws, "usage.ask_tokens", { input_tokens: ASK_TOKENS_DAY - 400_000, output_tokens: 399_999 }, ago(2 * HOUR)),
    ]);
  assert.equal(error, null, error?.message);
  assert.ok((await sum(ws)) < ASK_TOKENS_DAY, "one token under: the gateway serves");
  await db.from("events").insert([row(ws, "usage.ask_tokens", { input_tokens: 0, output_tokens: 1 }, ago(HOUR))]);
  assert.equal(await sum(ws), ASK_TOKENS_DAY, "at the cap: `used >= ASK_TOKENS_DAY` refuses the next round");
});

test(
  "only the service role may ask: a visitor is refused",
  { skip: skip || (!ANON && "no anon key in env") },
  async () => {
    const visitor = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error } = await visitor.rpc("ask_tokens_day", {
      p_tenant: made[0] ?? "00000000-0000-4000-8000-000000000000",
    });
    assert.ok(error, "anon may not execute ask_tokens_day");
    assert.match(error.message, /permission denied/i);
  },
);
