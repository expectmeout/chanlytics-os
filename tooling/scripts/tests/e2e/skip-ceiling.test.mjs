/**
 * The e2e skip ceiling (e2e/skip-ceiling.ts), run with fake test ends: a skip behind a switch the run did not set
 * ("set E2E_...") is not counted; a skip for want of data or credentials is; the ceiling bites only on a run that
 * declares it holds credentials; and a run that trips it says which reasons were missing.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SkipCeiling, DELIBERATE } from "../../../../e2e/skip-ceiling.ts";

const skipped = (why) => [
  { annotations: why === undefined ? [] : [{ type: "skip", description: why }] },
  { status: "skipped" },
];
const passed = () => [{ annotations: [] }, { status: "passed" }];
const env = { ...process.env };
beforeEach(() => {
  process.env.REQUIRE_SERVICE_CREDENTIALS = "1";
  delete process.env.E2E_MAX_SKIPS;
});
afterEach(() => {
  process.env.REQUIRE_SERVICE_CREDENTIALS = env.REQUIRE_SERVICE_CREDENTIALS;
  process.env.E2E_MAX_SKIPS = env.E2E_MAX_SKIPS;
  if (env.REQUIRE_SERVICE_CREDENTIALS === undefined) delete process.env.REQUIRE_SERVICE_CREDENTIALS;
  if (env.E2E_MAX_SKIPS === undefined) delete process.env.E2E_MAX_SKIPS;
});
const run = (ends, quiet = true) => {
  const r = new SkipCeiling();
  for (const [t, res] of ends) r.onTestEnd(t, res);
  const said = [];
  const error = console.error;
  if (quiet) console.error = (m) => said.push(String(m));
  try {
    return r.onEnd({ status: "passed" }).then((v) => ({ verdict: v, said: said.join("\n") }));
  } finally {
    console.error = error;
  }
};

test("the reasons the suite's own gates give are the deliberate ones; a want of data or credentials is not", () => {
  for (const why of [
    "a real model turn costs money: set E2E_PAID_MODEL=1 to run it",
    "a real search spends on the source and the judge: set E2E_PAID_LEADS=1 to run it",
    "set E2E_SIGNUP_PROBE=1 with the service role to run the probe",
    "set E2E_SIGNUP_EMAIL to a real inbox, with {stamp} for a fresh address each run, to run the probe",
  ])
    assert.equal(DELIBERATE.test(why), true, why);
  for (const why of [
    "needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY and E2E_USER_EMAIL",
    "this workspace has nobody to open",
    "nothing approved to send in this workspace",
    "",
  ])
    assert.equal(DELIBERATE.test(why), false, why);
});

test("skips behind an unset switch do not count; the others do, against the ceiling", async () => {
  const paid = Array.from({ length: 20 }, () => skipped("set E2E_PAID_MODEL=1 to run it"));
  const data = Array.from({ length: 8 }, (_, i) => skipped(`this workspace has no ${i}`));
  assert.equal((await run([...paid, ...data, passed()])).verdict, undefined, "eight for want of data is the ceiling");
  const { verdict, said } = await run([...paid, ...data, skipped("nobody on this workspace"), skipped(undefined)]);
  assert.deepEqual(verdict, { status: "failed" });
  assert.match(said, /10 specs skipped for want of data or credentials, ceiling 8 \(20 more/);
  assert.match(said, /1 × nobody on this workspace/);
  assert.match(said, /1 × \(no reason given\)/);
});

test("the ceiling is the run's to set, and bites only on a run that declares credentials", async () => {
  const data = Array.from({ length: 12 }, () => skipped("this workspace has nobody to open"));
  process.env.E2E_MAX_SKIPS = "12";
  assert.equal((await run(data)).verdict, undefined);
  process.env.E2E_MAX_SKIPS = "11";
  assert.deepEqual((await run(data)).verdict, { status: "failed" });
  delete process.env.REQUIRE_SERVICE_CREDENTIALS;
  assert.equal((await run(data)).verdict, undefined, "a credential-free run is untouched");
});
