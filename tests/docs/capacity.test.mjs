/**
 * docs/capacity.md is what tooling/scripts/gen/capacity.mjs writes from the constants and the migrations' schedules
 * (decision 0115): a limit raised in the code changes the page, and a new clock arrives with its row.
 *
 * And a number is read as what it is (the review of 11 November 2026). The page was fresh and wrong for two rows: it
 * judged the emails a mailbox sends by the cap on drafts an owner sends, and the ledger by its slots times its ticks. A
 * test that the page is what the script writes cannot see that, so the script's three checks are run here against tables
 * written wrong on purpose, each the mistake that was made or its neighbour.
 *
 *   corepack pnpm gen:capacity
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REACH_OUT_DRAFTS_PER_DAY, REACH_OUT_MONTH_EMAILS, SEND_DAY_FRAME } from "@chanlytics/contracts";
import { ROOT } from "../_source.mjs";
import { CLOCKS } from "../clocks/_clocks.mjs";
import {
  CAPACITY,
  KINDS,
  LIMIT_SHAPED,
  OUT,
  WEEKDAYS_A_MONTH,
  WORKING_FIGURE,
  assertReadsRight,
  backlogPollSeconds,
  constantOf,
  generate,
  handedTo,
  outreachAtFull,
  rowsOf,
  schedulesOf,
  ticksAnHour,
} from "../../tooling/scripts/gen/capacity.mjs";

const LANES = "apps/edge/lib/campaigns/reach-out/sender/lanes.ts";
const SENDER = "apps/edge/lib/campaigns/reach-out/sender/sender.ts";
const LEDGER = "packages/jobs/src/runner/ledger.ts";

test("the page is what the script writes", () => {
  const page = fs.readFileSync(path.join(ROOT, OUT), "utf8").split("\r\n").join("\n");
  const next = generate();
  if (page === next) return;
  const a = page.split("\n");
  const b = next.split("\n");
  let i = 0;
  while (a[i] === b[i]) i++;
  assert.fail(
    `${OUT} is stale at line ${i + 1}:\n  page       ${a[i] ?? "(end)"}\n  generated  ${b[i] ?? "(end)"}\n` +
      "Run `corepack pnpm gen:capacity`, and commit it.",
  );
});

test("every clock that does work has a row, and every row is a clock of the register", () => {
  const working = Object.entries(CLOCKS)
    .filter(([, c]) => !["keep", "roll"].includes(c.kind))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(Object.keys(CAPACITY).sort(), working, "add the clock's row in tooling/scripts/gen/capacity.mjs");
  assert.deepEqual([...new Set(rowsOf().map((r) => r.clock))].sort(), working, "a clock's lanes are its rows");
});

test("each row says what bounds a tick, and what that comes to at the working figure", () => {
  const schedules = schedulesOf();
  for (const row of rowsOf()) {
    assert.ok(schedules.has(row.job), `${row.name}: pg_cron holds no job ${row.job}`);
    assert.ok(row.atFull, `${row.name}: says nothing of a full platform`);
    assert.notEqual(
      Boolean(row.kind),
      Boolean(row.bound),
      `${row.name}: a kind with its constant, or words, one of them`,
    );
    if (!row.kind) continue;
    assert.ok(row.kind in KINDS, `${row.name}: ${row.kind} is a kind of limit`);
    assert.ok(constantOf(...row[KINDS[row.kind].field]) > 0, `${row.name}: its constant`);
    const words = typeof row.atFull === "function" ? row.atFull({ root: ROOT, ticks: 60 }) : row.atFull;
    assert.ok(words.length > 10 && !/NaN|undefined|Infinity/.test(words), `${row.name}: ${words}`);
  }
});

test("the hand-out clocks have no ceiling of their own, and what bounds them is the ledger", () => {
  for (const clock of ["playbooks", "calendar", "google"]) assert.equal(CAPACITY[clock].kind, undefined, clock);
  assert.match(
    generate(),
    /\| jobs \| `\d+ seconds?` \| `CLAIM_SLOTS` = \d+ side by side, each claiming for `CLAIM_FOR_MS` = /,
  );
});

/** The table with one clock's row replaced, read against the real tree. */
const withRow = (clock, row) => ({ ...CAPACITY, [clock]: row });

test("a number is read as the kind of limit it is: the table as it stands passes, and each wrong reading is refused", () => {
  assert.doesNotThrow(() => assertReadsRight());

  // The ledger's slots times its ticks (5,400 an hour, as the page said): slots are not a count a tick takes.
  assert.throws(
    () => assertReadsRight(withRow("jobs", { ...CAPACITY.jobs, kind: "each_tick" })),
    /jobs: CLAIM_SLOTS is read as a count a tick takes, and is not named as one/,
  );
  assert.throws(
    () => generate(ROOT, withRow("jobs", { ...CAPACITY.jobs, kind: "each_tick" })),
    /CLAIM_SLOTS/,
    "and no page is written",
  );

  // Outreach as one row under the drafts' cap (28,800 emails a day, as the page said): the mailboxes' limits go unsaid.
  const oneRow = { job: "reach-out-sweep", kind: "each_tick", cap: [LANES, "DRAFTS_PER_TICK"], atFull: "Holds." };
  assert.throws(
    () => assertReadsRight(withRow("reach_out", oneRow)),
    (e) =>
      /reach_out: .*lanes\.ts also holds /.test(e.message) &&
      ["CLAIM_PER_MAILBOX_PER_TICK", "DUE_MAILBOXES_PAGE", "DUE_PAGES", "CLAIM_YIELD_AT_MS"].every((n) =>
        e.message.includes(n),
      ),
  );

  // The same, with the mailboxes' limits named beside the drafts' cap: still one number for two kinds of work, and the
  // row cannot say which call it limits for both.
  const lanes = CAPACITY.reach_out.lanes;
  const [drafts, mailboxes] = ["drafts an owner sends", "emails a mailbox sends"];
  const swapped = {
    ...CAPACITY.reach_out,
    lanes: {
      [drafts]: { ...lanes[drafts], limits: [SENDER, "claimSends"] },
      [mailboxes]: lanes[mailboxes],
    },
  };
  assert.throws(
    () => assertReadsRight(withRow("reach_out", swapped)),
    /reach_out: drafts an owner sends: .*sender\.ts hands DRAFTS_PER_TICK to no call of claimSends/,
  );
  const untied = {
    ...CAPACITY.reach_out,
    lanes: { [drafts]: { ...lanes[drafts], limits: undefined }, [mailboxes]: lanes[mailboxes] },
  };
  assert.throws(
    () => assertReadsRight(withRow("reach_out", untied)),
    /feeds 2 rows, so each says the call its number limits/,
  );

  // A moment read as a count, a row with a number and words both, a constant its file does not declare.
  assert.throws(
    () =>
      assertReadsRight(
        withRow("previews", { ...CAPACITY.previews, cap: [CAPACITY.previews.cap[0], "PREVIEWS_YIELD_AT_MS"] }),
      ),
    /PREVIEWS_YIELD_AT_MS is read as a count a tick takes/,
  );
  assert.throws(() => assertReadsRight(withRow("lines", { ...CAPACITY.lines, bound: "None." })), /one of them/);
  assert.throws(
    () => assertReadsRight(withRow("lines", { ...CAPACITY.lines, also: ["LINES_A_DAY"] })),
    /declares no LINES_A_DAY/,
  );
});

test("the page judges a mailbox's emails by time and the ledger by its runners, never by a count times the ticks", () => {
  const page = generate();
  const row = (name) => page.split("\n").find((l) => l.startsWith(`| ${name} |`)) ?? assert.fail(`no row ${name}`);
  const [, , limit, hour, atFull] = row("reach_out: emails a mailbox sends").split(" | ");
  assert.match(limit, /^Time: one at a time until `CLAIM_YIELD_AT_MS` = 40,000 ms; beside it /);
  assert.ok(!limit.includes("DRAFTS_PER_TICK"), "the drafts' cap is not the mailboxes'");
  assert.equal(hour, "2,400 s of work, in turn");
  assert.match(atFull, /^NOT TIMED/);
  assert.match(
    row("reach_out: drafts an owner sends"),
    /\| `DRAFTS_PER_TICK` = 60 \| 3,600 \| TIGHT: only reach-outs whose owner sends/,
  );
  const jobs = row("jobs").split(" | ");
  assert.equal(
    jobs[3],
    "21,600 s of work on a backlog",
    "a tick every ten seconds, three runners, twenty seconds each",
  );
  assert.match(jobs[4], /^The limit under every handed-out row, and it is time, not a count\./);
});

test("what a full platform asks of outreach is worked out from the product's own limits", () => {
  const full = outreachAtFull();
  assert.equal(full.month, REACH_OUT_MONTH_EMAILS, "the month a workspace may spend, as contracts holds it");
  assert.deepEqual(
    [full.from * 60, full.to * 60],
    [SEND_DAY_FRAME.from, SEND_DAY_FRAME.to],
    "the day's frame, as the timetable plans in",
  );
  assert.equal(full.aDay, (WORKING_FIGURE * REACH_OUT_MONTH_EMAILS) / WEEKDAYS_A_MONTH);
  assert.equal(full.aMinute, full.aDay / full.hours / 60);
  assert.equal(
    constantOf("packages/contracts/src/campaigns/reach-out/rules.ts", "REACH_OUT_DRAFTS_PER_DAY"),
    REACH_OUT_DRAFTS_PER_DAY,
  );
});

test("the script's readers: a backlog's pace, a call a constant is handed to, a limit by its name", () => {
  assert.equal(backlogPollSeconds(), 10, "trigger_jobs_tick asks for a backlog every ten seconds (00526)");
  assert.equal(handedTo(SENDER, "claimDrafts", "DRAFTS_PER_TICK"), true);
  assert.equal(handedTo(SENDER, "claimSends", "CLAIM_PER_MAILBOX_PER_TICK"), true);
  assert.equal(handedTo(SENDER, "claimSends", "DRAFTS_PER_TICK"), false);
  assert.equal(handedTo(SENDER, "listDueMailboxes", "DUE_MAILBOXES_PAGE"), true);
  assert.equal(constantOf(LEDGER, "CLAIM_FOR_MS"), 20_000, "a literal with its underscores");
  assert.throws(() => constantOf(LEDGER, "LEAD_YIELD_AT_MS"), /declares no number/, "a sum is not a literal");
  for (const name of [
    "CALLS_PER_TICK",
    "DRAFTS_A_TICK",
    "MAX_DUE",
    "AT_ONCE",
    "CHECK_AT_ONCE",
    "CLAIM_SLOTS",
    "DUE_PAGES",
    "REWRITE_PAGE",
  ])
    assert.match(name, LIMIT_SHAPED, name);
  for (const name of [
    "YIELD_AT_MS",
    "CLAIM_YIELD_AT_MS",
    "READS_UNTIL_MS",
    "SWEEP_DEADLINE_MS",
    "CLAIM_FOR_MS",
    "RELAY_LIMIT",
  ])
    assert.match(name, LIMIT_SHAPED, name);
  for (const name of [
    "LEASE_SECONDS",
    "MAX_ATTEMPTS",
    "REPLY_LATE_PAGE_MS",
    "CHECK_AHEAD_MS",
    "HOLD_MS",
    "REWRITE_AFTER_MS",
  ])
    assert.doesNotMatch(name, LIMIT_SHAPED, name);
});

test("a schedule's ticks an hour", () => {
  assert.equal(ticksAnHour("5 * * * *"), 1);
  assert.equal(ticksAnHour("*/5 * * * *"), 12);
  assert.equal(ticksAnHour("2-59/5 * * * *"), 12);
  assert.equal(ticksAnHour("8,23,38,53 * * * *"), 4);
  assert.equal(ticksAnHour("* * * * *"), 60);
  assert.equal(ticksAnHour("41 */6 * * *"), 1 / 6);
  assert.equal(ticksAnHour("23 6 * * *"), 1 / 24);
  assert.equal(ticksAnHour("2 seconds"), 1800);
  assert.throws(() => ticksAnHour("0 12 25 * *"), /by the day/);
});
