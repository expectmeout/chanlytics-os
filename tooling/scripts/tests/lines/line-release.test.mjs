/**
 * When a number whose subscription ended goes back (contracts line-release.ts), run: the grace a deployment may set,
 * the moment a subscription stopped paying as each of Stripe's words records it, and a line's steps from paying to
 * released -- wait, warn once, a week, release -- including a grace set late and a workspace that resumed. The sweep
 * that acts on it runs in cron-doors-b.test.mjs. And a release whose credentials read fails, or that finds no token on
 * file, run over a database in memory (apps/edge/lib/lines/line-release.ts): each skipped the carrier and forgot a number
 * still billed.
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
import { dryProvider, twilioProvider } from "@chanlytics/channels";
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

/* ------------------- a release whose credentials read fails, or finds no token -- */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "11111111-1111-4111-8111-111111111111";
const VOICE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUB = "ACsub0000000000000000000000000000";
const NUMBER = "+13055550100";
const MASTER = { sid: "ACmaster", token: "master-token" };

const READ_SUBACCOUNT = `https://api.twilio.com/2010-04-01/Accounts/${SUB}.json`;
const DELETE_NUMBER = `https://api.twilio.com/2010-04-01/Accounts/${SUB}/IncomingPhoneNumbers/PN0001.json`;
const DELETE_TRUNK = "https://trunking.twilio.com/v1/Trunks/TK0001";

/** A number we bought, and the voice row it answers on: what a release gives back and switches off. */
const boughtLine = (over = {}) => ({
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
      facts: { channel_id: VOICE },
      ...over,
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
  return { calls, choice: { name: "twilio", provider, master: MASTER } };
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
  const tables = boughtLine({ facts: { channel_id: VOICE, retell_imported: true } });
  const r = await releaseLine(fakeDb(tables, {}, vaultDown), carrier().choice, { apiKey: "k" }, A, tables.lines[0]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.released, { retell_number: NUMBER });
  assert.equal(tables.lines.length, 1);
});

/** Twilio's own provider over a scripted wire, each call kept with the account it was made as: a delete is done, a read hears `read`. */
const twilio = (read) => {
  const calls = [];
  const provider = twilioProvider(async (acct, method, url) => {
    calls.push([acct.sid, acct.token, method, url]);
    return method === "DELETE" ? { status: 204, body: null } : read;
  });
  return { calls, choice: { name: "twilio", provider, master: MASTER } };
};
const OPEN = { status: 200, body: { sid: SUB, auth_token: "read-by-parent", status: "active" } };
const release = (tables, onFile, choice) =>
  releaseLine(fakeDb(tables, {}, { get_line_credentials: () => onFile }), choice, null, A, tables.lines[0]);

test("no token on file: the parent reads it, and the number and the trunk go back as the subaccount before the row is forgotten", async () => {
  for (const [why, onFile] of [
    ["no credentials_ref, or no secret in Vault: the door answers null", null],
    ["a secret with no token in it", { sip_password: "x" }],
  ]) {
    const tables = boughtLine();
    const c = twilio(OPEN);
    assert.deepEqual(
      await release(tables, onFile, c.choice),
      {
        ok: true,
        released: { token_read_as_parent: true, number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
      },
      why,
    );
    assert.deepEqual(
      c.calls,
      [
        ["ACmaster", "master-token", "GET", READ_SUBACCOUNT],
        [SUB, "read-by-parent", "DELETE", DELETE_NUMBER],
        [SUB, "read-by-parent", "DELETE", DELETE_TRUNK],
      ],
      `${why}: REGRESSION when empty: the row went with the number still bought, so we paid for it every month with nothing pointing at it`,
    );
    assert.deepEqual(tables.lines, [], why);
    assert.equal(tables.tenant_channels[0].status, "disabled", why);
    assert.deepEqual(
      tables.events.map((e) => [e.kind, e.data.number, e.data.token_read_as_parent]),
      [["line.released", "PN0001", true]],
      why,
    );
    assert.doesNotMatch(JSON.stringify(tables.events), /read-by-parent/, "the ledger never holds the token");
  }
});

test("no token on file and the parent's read fails: a refusal, the row and its routing stay, no carrier call, no ledger line, and the next try gives it all back", async () => {
  for (const [why, read, detail] of [
    [
      "Twilio's error",
      { status: 500, body: { code: 20500, message: "internal error" } },
      "read subaccount: internal error (Twilio 20500)",
    ],
    [
      "the platform's own key refused",
      { status: 401, body: { code: 20003, message: "Authenticate" } },
      "read subaccount: Authenticate (Twilio 20003)",
    ],
    ["no answer", { status: 0, body: { error: "timed out" } }, "read subaccount: HTTP 0"],
    [
      "an open subaccount answered with no token",
      { status: 200, body: { sid: SUB, status: "active" } },
      "read subaccount answered without auth_token: HTTP 200",
    ],
  ]) {
    const tables = boughtLine();
    const c = twilio(read);
    assert.deepEqual(
      await release(tables, null, c.choice),
      {
        ok: false,
        status: 502,
        error: "provider_refused",
        detail: `releasing at the provider: ${detail}`,
        released: {},
      },
      why,
    );
    assert.deepEqual(c.calls, [["ACmaster", "master-token", "GET", READ_SUBACCOUNT]], why);
    assert.deepEqual(
      tables.lines.map((l) => l.id),
      [LINE],
      `${why}: the row stands until the parent answers`,
    );
    assert.equal(tables.tenant_channels[0].status, "active", `${why}: the voice row is left on`);
    assert.deepEqual(tables.events, [], `${why}: no line.released for a number nobody gave back`);

    const again = twilio(OPEN);
    assert.equal((await release(tables, null, again.choice)).ok, true, `${why}: the next try`);
    assert.deepEqual(tables.lines, [], `${why}: the next try`);
  }
});

test("no token on file and the parent says the subaccount is closed or gone: nothing is left to give back, so the row goes, no carrier call is made, and the ledger says why", async () => {
  for (const [why, read] of [
    // Twilio releases a subaccount's numbers when it closes. A person ending a stuck line closes it in the console.
    ["closed", { status: 200, body: { sid: SUB, auth_token: "still-answered", status: "closed" } }],
    // Twilio deletes a closed subaccount's data 30 days on, and then there is only this.
    ["deleted", { status: 404, body: { code: 20404, message: "not found" } }],
  ]) {
    const tables = boughtLine();
    const c = twilio(read);
    assert.deepEqual(
      await release(tables, null, c.choice),
      { ok: true, released: { subaccount_gone: true, channel_disabled: VOICE } },
      why,
    );
    assert.deepEqual(c.calls, [["ACmaster", "master-token", "GET", READ_SUBACCOUNT]], why);
    assert.deepEqual(tables.lines, [], why);
    assert.deepEqual(
      tables.events.map((e) => [e.kind, e.data.subaccount_gone]),
      [["line.released", true]],
      why,
    );
  }
});

test("a line that never got a subaccount has nothing at the carrier: nobody is asked, and nothing is said to be gone", async () => {
  const tables = boughtLine({ subaccount_sid: null, number_sid: null, trunk_sid: null });
  const c = twilio(OPEN);
  assert.deepEqual(await release(tables, null, c.choice), { ok: true, released: { channel_disabled: VOICE } });
  assert.deepEqual(c.calls, []);
  assert.deepEqual(tables.lines, []);
});

test("a dry-run line keeps releasing, with a token on file and with none, reaching no network", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("the dry provider never reaches the network"));
  const dry = () => ({ name: "dry", provider: dryProvider(1), master: { sid: "ACdryrun", token: "dry" } });

  const held = boughtLine({ provider: "dry" });
  assert.deepEqual(await release(held, { auth_token: "tok" }, dry()), {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
  });
  assert.deepEqual(held.lines, []);

  // A provider made for this request knows no subaccount of an earlier one, so it reads as gone, and the row still goes.
  const lost = boughtLine({ provider: "dry" });
  assert.deepEqual(await release(lost, null, dry()), {
    ok: true,
    released: { subaccount_gone: true, channel_disabled: VOICE },
  });
  assert.deepEqual(lost.lines, []);

  // One it did make, it reads back, as the carrier's parent account does.
  const { provider, master } = dry();
  const made = await provider.createSubaccount(master, "Harbor");
  assert.deepEqual(await provider.readSubaccount(master, made.sid), { sid: made.sid, token: made.token });
});
