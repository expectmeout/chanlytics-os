/**
 * The day's numbers at 6 PM (Reach out Part 6: H12) and each reach-out's own totals, executed (contracts
 * reach-out-report.ts): the bell's line says what happened and nothing it did not count; a chain's totals are checked, not
 * cast, and carry the businesses a share of an outcome is of (00398). The report's own fold, in businesses, is the
 * Campaigns lens's (tooling/scripts/tests/reports/campaigns/reach-out-lens.test.mjs); the first fold of it, whose cases
 * stood here, went on 11 Oct 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainTotalsFromReport, chainTotalsOf, reachOutDayWords } from "@chanlytics/contracts";

const counts = (over = {}) => ({
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
  ...over,
});

test("the day's line at 6 PM says what happened, and nothing it did not count", () => {
  assert.deepEqual(reachOutDayWords({ written: 18, wrote_back: 2, interested: 1, said_no: 1, bounced: 0, held: 3 }), {
    title: "Today's reach-outs",
    body: "18 written · 2 wrote back, 1 interested · 1 said no · 3 wait for your say.",
  });
  assert.equal(
    reachOutDayWords({ written: 0, wrote_back: 1, interested: 0, said_no: 0, bounced: 2, held: 1 }).body,
    "1 wrote back · 2 bounced · 1 waits for your say.",
  );
  assert.equal(
    reachOutDayWords({ written: 0, wrote_back: 0, interested: 0, said_no: 0, bounced: 0, held: 0 }).body,
    "Nothing happened today.",
  );
});

test("a chain's own totals: every chain counted by the function, each by its root; a report's twenty are not every chain", () => {
  const ROOT_A = "11111111-1111-4111-8111-111111111111";
  const ROOT_B = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(
    chainTotalsOf({
      [ROOT_A]: { written: 40, wrote_back: 6, last_at: "2026-09-28T15:00:00Z" },
      [ROOT_B]: { written: 0, wrote_back: 0, last_at: null },
    }),
    { complete: true, by_root: { [ROOT_A]: { written: 40, wrote_back: 6 }, [ROOT_B]: { written: 0, wrote_back: 0 } } },
  );
  assert.deepEqual(chainTotalsOf({}), { complete: true, by_root: {} }, "a workspace with no chain");
  for (const bad of [null, "x", [], { [ROOT_A]: { written: "40" } }, { [ROOT_A]: null }])
    assert.equal(chainTotalsOf(bad), null, `${JSON.stringify(bad)} is no answer of the function`);
  // A database before the function: the report's own chains, its steps summed, and not every chain.
  const step = (written, wrote_back, businesses) => ({
    ...counts({ written, wrote_back }),
    ...(businesses === undefined ? {} : { businesses }),
    id: "s",
    n: 1,
    hand: null,
  });
  const chain = (steps) => ({
    root_id: ROOT_A,
    name: "A",
    state: "running",
    search: null,
    last_at: null,
    runs: 2,
    steps,
  });
  const fromReport = chainTotalsFromReport({ chains: [chain([step(30, 4), step(10, 2)])] });
  assert.deepEqual(fromReport, { complete: false, by_root: { [ROOT_A]: { written: 40, wrote_back: 6 } } });
});

test("a chain's businesses (00398): a reach-out is counted in the businesses it wrote to, each once at its last email; absent on a database before it, refused where it is no count", () => {
  const ROOT_A = "11111111-1111-4111-8111-111111111111";
  const ROOT_B = "22222222-2222-4222-8222-222222222222";
  // Nine emails to four businesses, two of whom wrote back: the share of a business is of businesses, never of emails.
  assert.deepEqual(chainTotalsOf({ r1: { written: 9, businesses: 4, wrote_back: 2, last_at: null } }), {
    complete: true,
    by_root: { r1: { written: 9, businesses: 4, wrote_back: 2 } },
  });
  // A chain that wrote nothing is zeros, and a zero is a count.
  assert.deepEqual(chainTotalsOf({ r0: { written: 0, businesses: 0, wrote_back: 0, last_at: null } })?.by_root.r0, {
    written: 0,
    businesses: 0,
    wrote_back: 0,
  });
  // A database before 00398 answers without it: the key stays absent (not undefined, not zero).
  const before = chainTotalsOf({ r1: { written: 9, wrote_back: 2 } });
  assert.deepEqual(before, { complete: true, by_root: { r1: { written: 9, wrote_back: 2 } } });
  assert.equal("businesses" in (before?.by_root.r1 ?? {}), false, "absent, so the Home says its old line");
  // Present and no count: no answer of the function.
  for (const bad of ["4", null, -1, 1.5, {}, [], true])
    assert.equal(
      chainTotalsOf({ r1: { written: 9, businesses: bad, wrote_back: 2 } }),
      null,
      `businesses ${JSON.stringify(bad)} is no count`,
    );
  // One root of two with a bad count refuses the whole answer, as a bad written does.
  assert.equal(
    chainTotalsOf({
      r1: { written: 9, businesses: 4, wrote_back: 2 },
      r2: { written: 3, businesses: "1", wrote_back: 0 },
    }),
    null,
  );

  // The report's own chains stand in on a database without the function: their steps' businesses summed, but only
  // where every step carries it (a step without it, an older report, would make a sum that is not the chain's).
  const step = (businesses, over = {}) => ({
    ...counts({ written: 5, wrote_back: 1 }),
    ...(businesses === undefined ? {} : { businesses }),
    id: "s",
    n: 1,
    hand: null,
    ...over,
  });
  const chain = (root_id, steps) => ({
    root_id,
    name: root_id,
    state: "running",
    search: null,
    last_at: null,
    runs: 1,
    steps,
  });
  assert.deepEqual(chainTotalsFromReport({ chains: [chain(ROOT_A, [step(2), step(2)])] }), {
    complete: false,
    by_root: { [ROOT_A]: { written: 10, businesses: 4, wrote_back: 2 } },
  });
  assert.deepEqual(
    chainTotalsFromReport({ chains: [chain(ROOT_A, [step(), step()])] }).by_root[ROOT_A],
    { written: 10, wrote_back: 2 },
    "steps without it leave it absent",
  );
  assert.deepEqual(
    chainTotalsFromReport({ chains: [chain(ROOT_A, [step(2), step()])] }).by_root[ROOT_A],
    { written: 10, wrote_back: 2 },
    "one step without it leaves it absent: half a sum is no count",
  );
  assert.deepEqual(
    chainTotalsFromReport({ chains: [chain(ROOT_A, [step(0), step(0)]), chain(ROOT_B, [step(3, { hand: "call" })])] })
      .by_root,
    {
      [ROOT_A]: { written: 10, businesses: 0, wrote_back: 2 },
      [ROOT_B]: { written: 5, businesses: 3, wrote_back: 1 },
    },
    "a zero is summed as a count, and each chain is its own",
  );
});
