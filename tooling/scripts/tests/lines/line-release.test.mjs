/**
 * When a number whose subscription ended goes back (contracts line-release.ts), run: the grace a deployment may set,
 * the moment a subscription stopped paying as each of Stripe's words records it, and a line's steps from paying to
 * released -- wait, warn once, a week, release -- including a grace set late and a workspace that resumed. The sweep
 * that acts on it runs in cron-doors-b.test.mjs. And a release whose credentials read fails, run over a database in
 * memory (apps/edge/lib/lines/line-release.ts): that read skipped the carrier and forgot a number still billed.
 */
import "../fixtures/pin-utc.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingEndedAt,
  lineReleaseAfterDays,
  lineReleaseDay,
  lineReleaseStep,
  lineReleaseWarning,
  lineReleasedWords,
  LINE_RELEASE_MIN_DAYS,
  LINE_RELEASE_WARN_DAYS,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

const { releaseLine } = await import("../../../../apps/edge/lib/lines/line-release.ts");

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const bill = (over = {}) => ({
  mode: "stripe",
  status: "canceled",
  trial_end: null,
  current_period_end: null,
  cancel_at: null,
  last_payment_failed_at: null,
  updated_at: iso(NOW - 50 * DAY),
  ...over,
});

test("the grace a deployment sets: whole days, never under the least, and anything else only reports", () => {
  assert.equal(LINE_RELEASE_MIN_DAYS, 14);
  for (const raw of [undefined, null, "", "3", "13", "thirty", "30.5", "-30"])
    assert.equal(lineReleaseAfterDays(raw), null, raw);
  assert.equal(lineReleaseAfterDays("14"), 14);
  assert.equal(lineReleaseAfterDays(" 30 "), 30);
});

test("when a subscription stopped paying: the latest its row says, per Stripe's word; never while it pays, never on a direct arrangement", () => {
  for (const status of ["trialing", "active", "past_due", "incomplete", "none"])
    assert.equal(billingEndedAt(bill({ status, current_period_end: iso(NOW - 40 * DAY) })), null, status);
  assert.equal(billingEndedAt(bill({ mode: "direct", current_period_end: iso(NOW - 40 * DAY) })), null);
  assert.equal(billingEndedAt(null), null);
  // A trial that ended without a card: from the trial's end.
  assert.equal(billingEndedAt(bill({ status: "paused", trial_end: iso(NOW - 20 * DAY) })), NOW - 20 * DAY);
  // Cancelled today mid-period: kept to the end of the period it paid for.
  assert.equal(
    billingEndedAt(
      bill({ cancel_at: iso(NOW), current_period_end: iso(NOW + 12 * DAY), trial_end: iso(NOW - 90 * DAY) }),
    ),
    NOW + 12 * DAY,
  );
  // Unpaid: Stripe keeps opening periods, so the period is left out; the last failed payment counts.
  assert.equal(
    billingEndedAt(
      bill({ status: "unpaid", current_period_end: iso(NOW + 20 * DAY), last_payment_failed_at: iso(NOW - 15 * DAY) }),
    ),
    NOW - 15 * DAY,
  );
  assert.equal(
    billingEndedAt(bill({ status: "unpaid", trial_end: iso(NOW - 400 * DAY), updated_at: iso(NOW - 3 * DAY) })),
    NOW - 3 * DAY,
    "no failure on record: from the reading that made it unpaid, never a trial's end a year ago",
  );
  // Nothing dated at all: the reading that ended it.
  assert.equal(billingEndedAt(bill({ status: "incomplete_expired" })), NOW - 50 * DAY);
});

test("a line's steps: wait, warn once a week before, wait the week, release; a grace set late warns first and releases a week on", () => {
  const ended = bill({ current_period_end: iso(NOW - 40 * DAY) });
  const endedAt = NOW - 40 * DAY;
  // A 60-day grace: 20 days to go, the warning 13 days off.
  assert.deepEqual(lineReleaseStep(ended, 60, null, NOW), { step: "wait", endedAt, releaseAt: endedAt + 60 * DAY });
  const warnAt = endedAt + (60 - LINE_RELEASE_WARN_DAYS) * DAY;
  assert.equal(lineReleaseStep(ended, 60, null, warnAt - 1).step, "wait");
  assert.deepEqual(lineReleaseStep(ended, 60, null, warnAt), { step: "warn", endedAt, releaseAt: endedAt + 60 * DAY });
  assert.equal(lineReleaseDay(endedAt + 60 * DAY, warnAt), endedAt + 60 * DAY, "the warning names the day it goes");
  const warned = { at: iso(warnAt), ended_at: iso(endedAt) };
  assert.equal(lineReleaseStep(ended, 60, warned, warnAt + DAY).step, "wait", "warned once, then the week");
  assert.deepEqual(lineReleaseStep(ended, 60, warned, endedAt + 60 * DAY), {
    step: "release",
    endedAt,
    releaseAt: endedAt + 60 * DAY,
  });

  // A 30-day grace set 40 days after it ended: warned now, and released a week after the warning, never at once.
  const late = lineReleaseStep(ended, 30, null, NOW);
  assert.equal(late.step, "warn");
  assert.equal(lineReleaseDay(late.releaseAt, NOW), NOW + 7 * DAY, "the warning names a week from now");
  const lateWarned = { at: iso(NOW), ended_at: iso(endedAt) };
  assert.equal(lineReleaseStep(ended, 30, lateWarned, NOW + 6 * DAY).step, "wait");
  assert.deepEqual(lineReleaseStep(ended, 30, lateWarned, NOW + 7 * DAY), {
    step: "release",
    endedAt,
    releaseAt: NOW + 7 * DAY,
  });

  // It resumed: kept, whatever was warned.
  assert.deepEqual(lineReleaseStep(bill({ status: "active" }), 30, lateWarned, NOW + 30 * DAY), { step: "keep" });
  // It resumed and ended again: the old warning was about another end, so it is warned again.
  const again = bill({ current_period_end: iso(NOW + 20 * DAY) });
  assert.equal(lineReleaseStep(again, 30, lateWarned, NOW + 45 * DAY).step, "warn");
});

test("the owner's words: the number, the day, the office phone to switch off, where to resume; and after", () => {
  const on = Date.parse("2026-10-27T15:00:00.000Z");
  assert.deepEqual(lineReleaseWarning({ number: "+13055550100", on, forwardedFrom: null, billingUrl: null }), {
    subject: "Your number +1 (305) 555-0100 goes back on Oct 27",
    body:
      "Your subscription ended, so your receptionist's number, +1 (305) 555-0100, goes back to the phone company on Oct 27. After that it can't be got back, and callers to it reach nobody.\n\n" +
      "To keep the number, resume from Billing.\n",
  });
  assert.match(
    lineReleaseWarning({
      number: "+13055550100",
      on,
      forwardedFrom: "+13055550111",
      billingUrl: "https://app.example.com/b",
    }).body,
    /\+1 \(305\) 555-0111 forwards its calls to it\. Switch that forwarding off before Oct 27[\s\S]*resume from Billing: https:\/\/app\.example\.com\/b/,
  );
  assert.deepEqual(lineReleasedWords({ number: "+13055550100", forwardedFrom: null, billingUrl: null }), {
    subject: "Your number +1 (305) 555-0100 was released",
    body:
      "+1 (305) 555-0100 went back to the phone company, as we wrote a week ago. Your receptionist no longer answers on it.\n\n" +
      "If you resume, Setup picks a new number with you.\n",
  });
});

/* -------------------------------- a release whose credentials read fails -- */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "11111111-1111-4111-8111-111111111111";
const VOICE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUB = "ACsub0000000000000000000000000000";
const NUMBER = "+13055550100";

/** A number we bought, and the voice row it answers on: what a release gives back and switches off. */
const boughtLine = (facts = {}) => ({
  lines: [
    rows.line({
      id: LINE,
      tenant_id: A,
      e164: NUMBER,
      kind: "chanlytics",
      provider: "twilio",
      subaccount_sid: SUB,
      number_sid: "PN0001",
      trunk_sid: "TK0001",
      facts: { channel_id: VOICE, ...facts },
    }),
  ],
  tenant_channels: [rows.channel({ id: VOICE, tenant_id: A, kind: "voice", status: "active", number_e164: NUMBER })],
  events: [],
});
/** The carrier, each call kept with the account it was made as. The row knows its number, so none is looked up. */
const carrier = () => {
  const calls = [];
  const provider = {
    ownedNumber: async () => assert.fail("the row holds the number's SID: nothing to look up"),
    releaseNumber: async (acct, sid) => void calls.push(["number", acct.sid, acct.token, sid]),
    deleteTrunk: async (acct, sid) => void calls.push(["trunk", acct.sid, acct.token, sid]),
  };
  return { calls, choice: { name: "twilio", provider, master: { sid: "ACmaster", token: "master-token" } } };
};
const vaultDown = {
  get_line_credentials: () => {
    throw new Error("vault unavailable");
  },
};

test("a credentials read that fails is a refusal: the carrier is not skipped past, the row and its routing stay, no ledger says it went, and the next try gives it all back", async () => {
  const tables = boughtLine();
  const c = carrier();
  const stopped = await releaseLine(fakeDb(tables, {}, vaultDown), c.choice, null, A, tables.lines[0]);
  assert.deepEqual(stopped, {
    ok: false,
    status: 503,
    error: "read_failed",
    detail: "reading the line's credentials: vault unavailable",
    released: {},
  });
  assert.deepEqual(
    tables.lines.map((l) => l.id),
    [LINE],
    "REGRESSION: the row went with the number still bought, so we paid for it every month with nothing pointing at it",
  );
  assert.equal(tables.tenant_channels[0].status, "active", "the voice row is left on");
  assert.deepEqual(tables.events, [], "no line.released for a number nobody gave back");
  assert.deepEqual(c.calls, [], "and no carrier call without the account's token");

  // The vault answers again: the row it left is what the next try works from.
  const vault = { get_line_credentials: () => ({ auth_token: "sub-token" }) };
  const again = await releaseLine(fakeDb(tables, {}, vault), c.choice, null, A, tables.lines[0]);
  assert.deepEqual(again, {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
  });
  assert.deepEqual(c.calls, [
    ["number", SUB, "sub-token", "PN0001"],
    ["trunk", SUB, "sub-token", "TK0001"],
  ]);
  assert.deepEqual(tables.lines, []);
});

test("a refused credentials read says what already came off: Retell's copy goes first, and the refusal names it", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  const tables = boughtLine({ retell_imported: true });
  const r = await releaseLine(fakeDb(tables, {}, vaultDown), carrier().choice, { apiKey: "k" }, A, tables.lines[0]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.released, { retell_number: NUMBER });
  assert.equal(tables.lines.length, 1);
});
