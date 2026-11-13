/**
 * The receptionist's day is one sum (00624).
 *
 * The edge's budget stops a workspace's automatic replies once its last 24 hours of receptionist tokens reach the reply
 * policy's max_llm_tokens_day (core reply-gates.ts, apps/edge/lib/ai/budget.ts). It paged every usage.llm_tokens event
 * of the day to the edge and added them there; llm_tokens_since adds them in the database, in one statement. What it
 * counts is what a sum over rows cannot show from source: the window, the kind, the workspace, a value that is not a
 * number, and who may call it. This runs against the local database the Database workflow builds from every
 * migration. Never production: `supabase start`, then `pnpm test:db` with its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

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
    .insert({ slug: `llm-day-${label}-${Date.now()}`, name: `Receptionist day ${label}`, timezone: "America/Chicago" })
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
  subject_type: "conversation",
  subject_id: null,
  data,
  created_at: at,
});

async function sum(tenant, since = ago(24 * HOUR)) {
  const { data, error } = await db.rpc("llm_tokens_since", { p_tenant: tenant, p_since: since });
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
  "the day is this workspace's receptionist tokens, in and out, from the time asked, and nothing else",
  { skip },
  async () => {
    const ws = await workspace("day");
    const other = await workspace("other");
    const { error } = await db.from("events").insert([
      row(ws, "usage.llm_tokens", { input_tokens: 1_000, output_tokens: 200, confidence: 0.9 }, ago(HOUR)),
      row(ws, "usage.llm_tokens", { input_tokens: 3_000, output_tokens: 800 }, ago(23 * HOUR)),
      // Yesterday's, Ask's, a value that is not a number, and another workspace's: none of them this day's.
      row(ws, "usage.llm_tokens", { input_tokens: 5_000_000, output_tokens: 0 }, ago(25 * HOUR)),
      row(ws, "usage.ask_tokens", { input_tokens: 7_000_000, output_tokens: 0 }, ago(HOUR)),
      row(ws, "usage.llm_tokens", { input_tokens: "12", output_tokens: null }, ago(HOUR)),
      row(other, "usage.llm_tokens", { input_tokens: 9_000_000, output_tokens: 0 }, ago(HOUR)),
    ]);
    assert.equal(error, null, error?.message);
    assert.equal(
      await sum(ws),
      1_000 + 200 + 3_000 + 800,
      "the day's two replies: not yesterday's, not Ask's, not a string, not another workspace's",
    );
    assert.equal(await sum(ws, ago(2 * HOUR)), 1_200, "from the time asked, and no earlier");
    assert.equal(await sum(other), 9_000_000, "each workspace its own day");
    assert.equal(await sum(await workspace("empty")), 0, "a workspace that answered nothing has spent nothing");
  },
);

test("many replies are one answer: a day of them sums whole", { skip }, async () => {
  const ws = await workspace("busy");
  // 2,500 replies, past the thousand rows one read of PostgREST answers: the old read had to page them.
  const rows = Array.from({ length: 2_500 }, (_, i) =>
    row(ws, "usage.llm_tokens", { input_tokens: 3, output_tokens: 1 }, ago(HOUR + i * 1_000)),
  );
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("events").insert(rows.slice(i, i + 500));
    assert.equal(error, null, error?.message);
  }
  assert.equal(await sum(ws), 10_000);
});

test(
  "only the service role may ask: a visitor is refused",
  { skip: skip || (!ANON && "no anon key in env") },
  async () => {
    const visitor = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error } = await visitor.rpc("llm_tokens_since", {
      p_tenant: made[0] ?? "00000000-0000-4000-8000-000000000000",
      p_since: ago(24 * HOUR),
    });
    assert.ok(error, "anon may not execute llm_tokens_since");
    assert.match(error.message, /permission denied/i);
  },
);
