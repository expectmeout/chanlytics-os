/**
 * Request limits (review F45) and the production guard (F42).
 *
 * Nothing limited any route: a session could send thirty templates a minute,
 * mint invitations without end, or hammer the two plpgsql aggregates. And the
 * "not production" guard on the pause mirror fired only when VERCEL_ENV was
 * SET, so a laptop running `next dev` mirrored pauses into the live store.
 *
 * The limiter is executed here, not grepped; the routes are pinned to call it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode } from "../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { takeRate, resetRates, RATE, memoryStore, postgresStore, memoryByConfiguration, setRateStore } = await import(
  pathToFileURL(path.join(here, "../../../../apps/dashboard/src/server/rate-limit.ts")).href
);

test("the limit is per person per bucket, refuses with 429 and a retry hint, and forgets after the window", async () => {
  resetRates();
  const t0 = 1_000_000;
  for (let i = 0; i < RATE.whisper.limit; i++) await takeRate("u1", "whisper", t0 + i);
  let refused = null;
  try {
    await takeRate("u1", "whisper", t0 + 100);
  } catch (e) {
    refused = e;
  }
  assert.ok(refused, "the request past the limit is refused");
  assert.equal(refused.code, "rate_limited");
  assert.equal(refused.status, 429);
  assert.match(refused.message, /Too many whispers/);
  assert.ok(refused.details.retry_after_s >= 1, "the client is told when to try again");
  // Another person, and another bucket for the same person, are untouched.
  await assert.doesNotReject(() => takeRate("u2", "whisper", t0 + 100));
  await assert.doesNotReject(() => takeRate("u1", "reply", t0 + 100));
  // After the window the same person may whisper again.
  await assert.doesNotReject(() => takeRate("u1", "whisper", t0 + RATE.whisper.windowMs + 1));
  resetRates();
});

/** console.error, kept instead of printed. */
function capture() {
  const lines = [];
  const real = console.error;
  console.error = (...a) => lines.push(a.map(String).join(" "));
  return {
    lines,
    restore: () => {
      console.error = real;
    },
  };
}

test("the shared store: the function's verdict is the verdict; a store that does not answer falls back to this instance and says so once a minute; a strict take refuses instead", async () => {
  const calls = [];
  let answer = () => ({ data: { allowed: true }, error: null });
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return answer();
    },
  };
  const store = postgresStore(db, memoryStore());
  const rule = RATE.whisper;
  assert.deepEqual(await store.take("whisper", "u1", rule, 1_000), { allowed: true });
  assert.deepEqual(
    calls[0],
    ["take_rate", { p_bucket: "whisper", p_actor: "u1", p_limit: rule.limit, p_window_ms: rule.windowMs }],
    "one door, the actor as text",
  );
  answer = () => ({ data: { allowed: false, retry_after_s: 7.2 }, error: null });
  assert.deepEqual(
    await store.take("whisper", "u1", rule, 1_000),
    { allowed: false, retryAfterS: 8 },
    "the function's own retry hint, whole seconds up",
  );
  const log = capture();
  try {
    answer = () => ({ data: null, error: { message: "connection refused" } });
    assert.deepEqual(
      await store.take("whisper", "u1", rule, 2_000),
      { allowed: true },
      "counted by this instance instead",
    );
    assert.deepEqual(await store.take("whisper", "u1", rule, 3_000), { allowed: true });
    assert.equal(
      log.lines.filter((l) => l.startsWith("rate_store_failed")).length,
      1,
      "said once a minute, not once a request",
    );
    assert.match(log.lines[0], /connection refused/);
    assert.deepEqual(await store.take("whisper", "u1", rule, 70_000), { allowed: true });
    assert.equal(log.lines.filter((l) => l.startsWith("rate_store_failed")).length, 2, "and again after a minute");
    answer = () => ({ data: {}, error: null });
    assert.deepEqual(
      await store.take("whisper", "u1", rule, 71_000),
      { allowed: true },
      "a verdict without a verdict is a failure, not an allow",
    );
    // Strict: money is not spent on a count this instance alone would hold.
    answer = () => ({ data: null, error: { message: "connection refused" } });
    await assert.rejects(
      store.take("lines_buy", "u1", RATE.lines_buy, 200_000, true),
      (e) => e.status === 503 && /shared count could not be read/.test(e.message),
    );
    answer = () => ({ data: { allowed: true }, error: null });
    assert.deepEqual(
      await store.take("lines_buy", "u1", RATE.lines_buy, 200_001, true),
      { allowed: true },
      "strict and answered: counted",
    );
  } finally {
    log.restore();
  }
});

test("memory by configuration: no database keys means per-instance ceilings, said once when the store is chosen, louder in production; a strict take refuses", async () => {
  const log = capture();
  try {
    const store = memoryByConfiguration(memoryStore(), false);
    assert.deepEqual(await store.take("whisper", "u1", RATE.whisper, 1_000), { allowed: true });
    assert.deepEqual(await store.take("whisper", "u1", RATE.whisper, 1_001), { allowed: true });
    const said = log.lines.filter((l) => l.startsWith("rate_store_memory_by_configuration"));
    assert.equal(said.length, 1, "once");
    assert.match(said[0], /"production":false/);
    assert.match(said[0], /on a laptop/);
    await assert.rejects(
      store.take("lines_buy", "u1", RATE.lines_buy, 1_002, true),
      (e) => e.status === 503 && /no shared store/.test(e.message),
      "a deployment that cannot count across instances does not spend",
    );
    const prod = memoryByConfiguration(memoryStore(), true);
    await prod.take("whisper", "u1", RATE.whisper, 1_000);
    const loud = log.lines.filter((l) => l.startsWith("rate_store_memory_by_configuration")).at(-1);
    assert.match(loud, /"production":true/);
    assert.match(loud, /is missing/, "in production it is a misconfiguration, and the line names the keys");
  } finally {
    log.restore();
  }
});

test("takeRate, strict: the store's refusal is the route's 503; the chosen store is asked again from the env when reset", async () => {
  const failing = postgresStore({ rpc: async () => ({ data: null, error: { message: "timeout" } }) }, memoryStore());
  const log = capture();
  try {
    setRateStore(failing);
    await assert.doesNotReject(() => takeRate("u1", "lines_buy", 5_000), "a plain take falls back and proceeds");
    await assert.rejects(takeRate("u1", "lines_buy", 5_001, true), (e) => e.code === "internal" && e.status === 503);
  } finally {
    setRateStore(null);
    log.restore();
  }
});

test("the ceilings are ones a person never reaches and a script reaches at once", () => {
  assert.ok(RATE.invite.limit <= 20 && RATE.invite.windowMs >= 3_600_000, "invitations send real email");
  assert.ok(RATE.erase.limit <= 10 && RATE.erase.windowMs >= 3_600_000, "erasure is irreversible");
  assert.ok(RATE.reply.limit <= 60 && RATE.reply.windowMs <= 60_000, "a reply reaches a real person");
  assert.ok(
    RATE.aggregate.limit >= 240,
    "one load of Today spends four aggregate reads; the ceiling must clear sixty loads a minute, not fifteen",
  );
  assert.ok(RATE.aggregate.limit <= 600 && RATE.aggregate.windowMs <= 60_000, "…and still stop a script");
});

test("every route that sends, spends or aggregates counts against its bucket", () => {
  const routes = [
    ["team/invite/route.ts", 'rate: "invite",'],
    ["conversations/[id]/reply/route.ts", 'rate: "reply",'],
    ["contacts/[id]/route.ts", 'rate: "erase",'],
    ["calls/[id]/whisper/route.ts", 'rate: "whisper",'],
    ["metrics/route.ts", 'rate: "aggregate",'],
    ["reports/route.ts", 'rate: "aggregate",'],
    ["settings/route.ts", 'rate: "settings",'],
    ["policies/route.ts", 'rate: "settings",'],
    ["workspaces/create/route.ts", 'rate: "create_workspace",'],
    ["contacts/[id]/receptionist/route.ts", 'rate: "person_mode",'],
  ];
  for (const [rel, call] of routes) {
    const src = readCode(`apps/dashboard/app/api/v1/${rel}`);
    // A route that declares its policy (route()) never imports the limiter itself: the wrapper takes the token.
    assert.ok(
      src.includes('from "@/server/rate-limit"') || src.includes('from "@/server/route"'),
      `${rel} imports the limiter, or declares its bucket to the wrapper that does`,
    );
    assert.ok(src.includes(call), `${rel} counts against its bucket`);
  }
  // The role door still comes first where there is one: a viewer is refused
  // as a viewer, not told to slow down.
  // For a declared route the order is route()'s: role before rate, by construction.
  const invite = readCode("apps/dashboard/app/api/v1/team/invite/route.ts");
  assert.ok(invite.includes('role: "owner",') && invite.includes('rate: "invite",'));
  const reply = readCode("apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts");
  assert.ok(reply.includes('role: "operator",') && reply.includes('rate: "reply",'));
});

test("F42: only the production dashboard reaches the live store or a live call — an unset VERCEL_ENV is not production", () => {
  // The doors that were service.ts, now by domain; the count is theirs together.
  const service = [
    "apps/dashboard/src/server/conversations/live-call.ts",
    "apps/dashboard/src/server/conversations/thread-control.ts",
    "apps/dashboard/src/server/connections/whatsapp.ts",
    "apps/dashboard/src/server/campaigns/meta-templates.ts",
    "apps/dashboard/src/server/campaigns/playbook-run.ts",
    "apps/dashboard/src/server/campaigns/reach-outs.ts",
  ]
    .map((p) => readCode(p))
    .join("\n");
  assert.equal(
    (service.match(/if \(!deployment\.providersLive\)/g) ?? []).length,
    11,
    "the whisper, the steer, the sign-up config, the number connection, the template sync, create and delete, the playbook run, the end and the hand-over of a call, and a reach-out's preview",
  );
  // The pause mirror was the eleventh, and is gone with the store it mirrored
  // into. The regression it carried is kept as a rule about the guard itself:
  // an unset VERCEL_ENV is a laptop, and a laptop is not production.
  assert.ok(
    !service.includes('process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"'),
    "REGRESSION: plain local dev reached the live providers",
  );
});
