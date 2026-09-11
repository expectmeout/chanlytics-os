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
import { readCode } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { takeRate, resetRates, RATE } = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/rate-limit.ts")).href);

test("the limit is per person per bucket, refuses with 429 and a retry hint, and forgets after the window", async () => {
  resetRates();
  const t0 = 1_000_000;
  for (let i = 0; i < RATE.whisper.limit; i++) await takeRate("u1", "whisper", t0 + i);
  let refused = null;
  try { await takeRate("u1", "whisper", t0 + 100); } catch (e) { refused = e; }
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

test("the ceilings are ones a person never reaches and a script reaches at once", () => {
  assert.ok(RATE.invite.limit <= 20 && RATE.invite.windowMs >= 3_600_000, "invitations send real email");
  assert.ok(RATE.erase.limit <= 10 && RATE.erase.windowMs >= 3_600_000, "erasure is irreversible");
  assert.ok(RATE.reply.limit <= 60 && RATE.reply.windowMs <= 60_000, "a reply reaches a real person");
  assert.ok(RATE.aggregate.limit >= 240, "one load of Today spends four aggregate reads; the ceiling must clear sixty loads a minute, not fifteen");
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
    ["workspaces/create/route.ts", 'takeRate(ctx.userId, "create_workspace");'],
    ["contacts/[id]/receptionist/route.ts", 'rate: "person_mode",'],
  ];
  for (const [rel, call] of routes) {
    const src = readCode(`apps/dashboard/app/api/v1/${rel}`);
    // A route that declares its policy (route()) never imports the limiter itself: the wrapper takes the token.
    assert.ok(src.includes('from "@/server/rate-limit"') || src.includes('from "@/server/route"'), `${rel} imports the limiter, or declares its bucket to the wrapper that does`);
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
  const service = readCode("apps/dashboard/src/server/service.ts");
  assert.equal((service.match(/if \(!deployment\.providersLive\)/g) ?? []).length, 9, "the pause mirror, the whisper, the steer, the sign-up config, the number connection, the template sync, create and delete, the playbook run");
  assert.ok(!service.includes('process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"'), "REGRESSION: plain local dev mirrored pauses into the live store");
});
