/**
 * Request limits shared across instances: the count lives in Postgres behind
 * one door, the memory store is the fallback when the door does not answer,
 * and every route awaits the verdict.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const { postgresStore, memoryStore, setRateStore, takeRate, RATE } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/rate-limit.ts")).href
);

test("the shared store: the door's verdict is the verdict; a door that does not answer falls back to memory and says so once a minute", async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      const n = calls.length;
      return n <= 2
        ? { data: { allowed: true, used: n }, error: null }
        : { data: { allowed: false, retry_after_s: 42 }, error: null };
    },
  };
  const store = postgresStore(db, memoryStore());
  const rule = RATE.whisper;
  assert.deepEqual(await store.take("whisper", "u1", rule, 1000), { allowed: true });
  assert.deepEqual(await store.take("whisper", "u1", rule, 1001), { allowed: true });
  assert.deepEqual(await store.take("whisper", "u1", rule, 1002), { allowed: false, retryAfterS: 42 });
  assert.deepEqual(calls[0], [
    "take_rate",
    { p_bucket: "whisper", p_actor: "u1", p_limit: rule.limit, p_window_ms: rule.windowMs },
  ]);

  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(" "));
  try {
    const down = postgresStore(
      { rpc: async () => ({ data: null, error: { message: "connection refused" } }) },
      memoryStore(),
    );
    for (let i = 0; i < rule.limit; i++)
      assert.deepEqual(await down.take("whisper", "u2", rule, 5000 + i), { allowed: true });
    const v = await down.take("whisper", "u2", rule, 5000 + rule.limit);
    assert.equal(v.allowed, false, "memory still refuses the burst");
    assert.equal(logs.filter((l) => l.includes("rate_store_failed")).length, 1, "one line for the whole minute");
    await down.take("whisper", "u2", rule, 5000 + 61_000);
    assert.equal(logs.filter((l) => l.includes("rate_store_failed")).length, 2, "and one more after it");
    // A door that answers nonsense is a failed door too.
    const odd = postgresStore({ rpc: async () => ({ data: { hello: true }, error: null }) }, memoryStore());
    assert.deepEqual(await odd.take("reply", "u3", RATE.reply, 9000), { allowed: true });
  } finally {
    console.error = orig;
  }
});

test("takeRate asks the store and turns a refusal into the 429 envelope with a retry hint", async () => {
  setRateStore({ take: async () => ({ allowed: false, retryAfterS: 90 }) });
  try {
    await assert.rejects(
      () => takeRate("u1", "reply"),
      (e) =>
        e.code === "rate_limited" &&
        e.status === 429 &&
        /Too many replies/.test(e.message) &&
        /2 minutes/.test(e.message) &&
        e.details.retry_after_s === 90,
    );
  } finally {
    setRateStore(null);
  }
});

test("every route awaits the count — a limiter that is not awaited limits nothing — and the door is the server's alone", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts") && !full.endsWith("rate-limit.ts")) files.push(full);
    }
  };
  walk(path.join(ROOT, "apps/dashboard/app"));
  walk(path.join(ROOT, "apps/dashboard/src"));
  let sites = 0;
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    for (const line of lines) {
      if (!/\btakeRate\(/.test(line) || /^\s*(\/\/|\*)/.test(line)) continue;
      sites++;
      assert.ok(/\bawait takeRate\(/.test(line), `${path.relative(ROOT, f)}: ${line.trim()}`);
    }
    // A route that declares its bucket (`rate: "…",` on route()) counts too:
    // the wrapper's one awaited takeRate serves every one of them, so the
    // floor holds as the routes migrate onto it.
    if (path.basename(f) === "route.ts") {
      for (const line of lines) if (/^\s*rate: "[a-z_]+",\s*$/.test(line)) sites++;
    }
  }
  assert.ok(sites >= 40, `forty call sites, found ${sites}`);
  // The live function is 00103's: the actor is text (a hashed network counts
  // as one, 00059's uuid could not), and the uuid signature is dropped there.
  const mig = readCode("supabase/migrations/00103_a_limit_counts_a_stranger.sql");
  assert.ok(
    mig.includes("alter table public.rate_hits alter column actor type text using actor::text;"),
    "a stranger is an actor",
  );
  assert.ok(
    mig.includes("drop function if exists public.take_rate(text, uuid, int, int);"),
    "the old signature is gone, so the store cannot call it by mistake",
  );
  assert.ok(
    mig.includes(
      "create or replace function public.take_rate(p_bucket text, p_actor text, p_limit int, p_window_ms int)",
    ),
  );
  assert.ok(
    mig.includes("pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_actor"),
    "one actor's one bucket at a time",
  );
  assert.ok(
    mig.includes("revoke all on function public.take_rate(text, text, int, int) from public, anon, authenticated;"),
    "the browser never counts",
  );
  assert.ok(mig.includes("grant execute on function public.take_rate(text, text, int, int) to service_role;"));
});
