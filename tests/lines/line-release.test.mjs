/**
 * When a number whose subscription ended goes back (contracts line-release.ts), run: the grace a deployment may set,
 * the moment a subscription stopped paying as each of Stripe's words records it, and a line's steps from paying to
 * released -- wait, warn once, a week, release -- including a grace set late and a workspace that resumed. The sweep
 * that acts on it runs in cron-doors-b.test.mjs. And a release whose credentials read fails, or that finds no token on
 * file, run over a database in memory (apps/edge/lib/lines/line-release.ts): each skipped the carrier and forgot a number
 * still billed. And one holding a token the carrier refuses, which never finished. And what a release leaves behind: its
 * subaccount closed last, and its token out of Vault before the row goes.
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

const { releaseLine, sweepEndedLines } = await import("../../apps/edge/lib/lines/line-release.ts");

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
    closeSubaccount: async (master, sid) => void calls.push(["closed", master.sid, master.token, sid]),
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
  const vault = { get_line_credentials: () => ({ auth_token: "sub-token" }), drop_line_credentials: () => true };
  const again = await releaseLine(fakeDb(tables, {}, vault), c.choice, null, A, tables.lines[0]);
  assert.deepEqual(again, {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
  });
  assert.deepEqual(c.calls, [
    ["number", SUB, "sub-token", "PN0001"],
    ["trunk", SUB, "sub-token", "TK0001"],
    ["closed", "ACmaster", "master-token", SUB],
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
const CLOSE = ["ACmaster", "master-token", "POST", READ_SUBACCOUNT];
const release = (tables, onFile, choice) =>
  releaseLine(
    fakeDb(tables, {}, { get_line_credentials: () => onFile, drop_line_credentials: () => true }),
    choice,
    null,
    A,
    tables.lines[0],
  );

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
        CLOSE,
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

const DONE = { status: 204, body: null };
const REFUSED = { status: 401, body: { code: 20003, message: "Authenticate" } };
const DEAD = { auth_token: "dead-token" };
const ON_FILE = { auth_token: "sub-token" };
const DELETE_CAMPAIGN = "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001";
const FILED = { messaging_service_sid: "MG0001", campaign_sid: "QE0001" };
/** Twilio answering each call by `answer(acct, method, url)`, every call kept with the account it was made as. */
const wire = (answer) => {
  const calls = [];
  const provider = twilioProvider(async (acct, method, url) => {
    calls.push([acct.sid, acct.token, method, url]);
    return answer(acct, method, url);
  });
  return { calls, choice: { name: "twilio", provider, master: MASTER } };
};
/** A delete is refused unless it carries the token the parent reads; a read hears `read`. */
const tokenOnFileIsDead = (read, refused = REFUSED) =>
  wire((acct, method) => {
    if (method !== "DELETE") return read;
    return acct.token === "read-by-parent" ? DONE : refused;
  });
const stands = (tables, why) => {
  assert.deepEqual(
    tables.lines.map((l) => l.id),
    [LINE],
    `${why}: the row stands`,
  );
  assert.equal(tables.tenant_channels[0].status, "active", `${why}: the voice row is left on`);
  assert.deepEqual(tables.events, [], `${why}: no line.released for a number nobody gave back`);
};

test("a token on file the carrier refuses: the parent reads it once, and the number and the trunk go back with that", async () => {
  for (const [why, refused] of [
    ["rotated in Twilio's console: 401", REFUSED],
    ["refused: 403", { status: 403, body: { code: 20003, message: "Forbidden" } }],
  ]) {
    const tables = boughtLine();
    const c = tokenOnFileIsDead(OPEN, refused);
    assert.deepEqual(
      await release(tables, DEAD, c.choice),
      {
        ok: true,
        released: { token_read_as_parent: true, number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
      },
      why,
    );
    assert.deepEqual(
      c.calls,
      [
        [SUB, "dead-token", "DELETE", DELETE_NUMBER],
        ["ACmaster", "master-token", "GET", READ_SUBACCOUNT],
        [SUB, "read-by-parent", "DELETE", DELETE_NUMBER],
        [SUB, "read-by-parent", "DELETE", DELETE_TRUNK],
        CLOSE,
      ],
      why,
    );
    assert.deepEqual(tables.lines, [], why);
    assert.doesNotMatch(JSON.stringify(tables.events), /read-by-parent|dead-token/, "the ledger never holds a token");
  }
});

test("a token on file the carrier refuses, and a subaccount closed or gone: the row goes, so closing it is a person's way out of any stuck line", async () => {
  for (const [why, read] of [
    ["closed", { status: 200, body: { sid: SUB, auth_token: "still-answered", status: "closed" } }],
    ["deleted", { status: 404, body: { code: 20404, message: "not found" } }],
  ]) {
    const tables = boughtLine(FILED);
    const c = tokenOnFileIsDead(read);
    assert.deepEqual(
      await release(tables, DEAD, c.choice),
      { ok: true, released: { subaccount_gone: true, channel_disabled: VOICE } },
      why,
    );
    assert.deepEqual(
      c.calls,
      [
        [SUB, "dead-token", "DELETE", DELETE_NUMBER],
        ["ACmaster", "master-token", "GET", READ_SUBACCOUNT],
      ],
      why,
    );
    assert.deepEqual(tables.lines, [], why);
  }
});

test("a token the carrier refuses even as the parent read it: one read and no loop, a refusal, and the row stays", async () => {
  const refuseEveryDelete = () => wire((_, method) => (method === "DELETE" ? REFUSED : OPEN));
  const onFile = boughtLine();
  const dead = refuseEveryDelete();
  assert.deepEqual(await release(onFile, DEAD, dead.choice), {
    ok: false,
    status: 502,
    error: "provider_refused",
    detail: "releasing at the provider: release number: Authenticate (Twilio 20003)",
    released: { token_read_as_parent: true },
  });
  assert.deepEqual(dead.calls, [
    [SUB, "dead-token", "DELETE", DELETE_NUMBER],
    ["ACmaster", "master-token", "GET", READ_SUBACCOUNT],
    [SUB, "read-by-parent", "DELETE", DELETE_NUMBER],
  ]);
  stands(onFile, "with a token on file");

  // None on file: the token it refuses is already the parent's, so there is nothing better to read.
  const none = boughtLine();
  const lost = refuseEveryDelete();
  assert.equal((await release(none, null, lost.choice)).error, "provider_refused");
  assert.deepEqual(lost.calls, [
    ["ACmaster", "master-token", "GET", READ_SUBACCOUNT],
    [SUB, "read-by-parent", "DELETE", DELETE_NUMBER],
  ]);
  stands(none, "with none on file");
});

test("a token on file refused and the parent's read failing: a refusal naming the read, and the row stays", async () => {
  const tables = boughtLine();
  const c = wire(() => REFUSED);
  assert.deepEqual(await release(tables, DEAD, c.choice), {
    ok: false,
    status: 502,
    error: "provider_refused",
    detail: "releasing at the provider: read subaccount: Authenticate (Twilio 20003)",
    released: {},
  });
  assert.deepEqual(c.calls, [
    [SUB, "dead-token", "DELETE", DELETE_NUMBER],
    ["ACmaster", "master-token", "GET", READ_SUBACCOUNT],
  ]);
  stands(tables, "the platform's own key refused");
});

test("a carrier's refusal that says nothing of the token is not read again: the parent is not asked, and the row stays", async () => {
  for (const status of [400, 409, 500, 0]) {
    const tables = boughtLine();
    const c = wire(() => ({ status, body: { code: 20500, message: "internal error" } }));
    assert.deepEqual(
      await release(tables, DEAD, c.choice),
      {
        ok: false,
        status: 502,
        error: "provider_refused",
        detail: "releasing at the provider: release number: internal error (Twilio 20500)",
        released: {},
      },
      `HTTP ${status}`,
    );
    assert.deepEqual(c.calls, [[SUB, "dead-token", "DELETE", DELETE_NUMBER]], `HTTP ${status}`);
    stands(tables, `HTTP ${status}`);
  }
});

test("a lost receipt and a dead token: the look for the number is refused too, the parent reads the token, and the look finds it", async () => {
  const tables = boughtLine({ number_sid: null, trunk_sid: null });
  const c = wire((acct, method, url) => {
    if (url === READ_SUBACCOUNT) return OPEN;
    if (acct.token === "dead-token") return REFUSED;
    return method === "DELETE"
      ? DONE
      : { status: 200, body: { incoming_phone_numbers: [{ sid: "PNlost", phone_number: NUMBER }] } };
  });
  assert.deepEqual(await release(tables, DEAD, c.choice), {
    ok: true,
    released: {
      token_read_as_parent: true,
      number: "PNlost",
      number_found_by_lookup: true,
      channel_disabled: VOICE,
    },
  });
  assert.deepEqual(tables.lines, []);
});

test("a campaign on the line comes off after the number and the trunk: its monthly fee runs until it is deleted, and the row is all that knows it", async () => {
  const tables = boughtLine(FILED);
  const c = twilio(OPEN);
  assert.deepEqual(await release(tables, ON_FILE, c.choice), {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", campaign: "QE0001", channel_disabled: VOICE },
  });
  assert.deepEqual(c.calls, [
    [SUB, "sub-token", "DELETE", DELETE_NUMBER],
    [SUB, "sub-token", "DELETE", DELETE_TRUNK],
    [SUB, "sub-token", "DELETE", DELETE_CAMPAIGN],
    CLOSE,
  ]);
  assert.deepEqual(tables.lines, []);
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data.campaign]),
    [["line.released", "QE0001"]],
  );
});

test("a Messaging Service with no campaign filed has nothing to delete: no call is made for it", async () => {
  const tables = boughtLine({ messaging_service_sid: "MG0001" });
  const c = twilio(OPEN);
  assert.deepEqual(await release(tables, ON_FILE, c.choice), {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
  });
  assert.deepEqual(c.calls, [
    [SUB, "sub-token", "DELETE", DELETE_NUMBER],
    [SUB, "sub-token", "DELETE", DELETE_TRUNK],
    CLOSE,
  ]);
});

test("a campaign the carrier will not delete, a suspended one say: a refusal naming what came off, the row stays as the only pointer to it, and the next try finishes", async () => {
  const tables = boughtLine(FILED);
  const c = wire((_, __, url) =>
    url === DELETE_CAMPAIGN ? { status: 400, body: { code: 20001, message: "campaign is suspended" } } : DONE,
  );
  assert.deepEqual(await release(tables, ON_FILE, c.choice), {
    ok: false,
    status: 502,
    error: "provider_refused",
    detail: "releasing at the provider: delete campaign: campaign is suspended (Twilio 20001)",
    released: { number: "PN0001", trunk: "TK0001" },
  });
  stands(tables, "the campaign refused");

  const again = twilio(OPEN);
  assert.deepEqual(await release(tables, ON_FILE, again.choice), {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", campaign: "QE0001", channel_disabled: VOICE },
  });
  assert.deepEqual(tables.lines, []);
});

test("a subaccount its parent cannot close: a refusal naming it and what came off, the row stays, and the next try finishes", async () => {
  const tables = boughtLine(FILED);
  const c = wire((_, method) => {
    if (method === "DELETE") return DONE;
    return method === "POST" ? { status: 500, body: { code: 20500, message: "internal error" } } : OPEN;
  });
  assert.deepEqual(await release(tables, ON_FILE, c.choice), {
    ok: false,
    status: 502,
    error: "provider_refused",
    detail: "releasing at the provider: close subaccount: internal error (Twilio 20500)",
    released: { number: "PN0001", trunk: "TK0001", campaign: "QE0001" },
  });
  stands(tables, "the subaccount would not close");

  assert.equal((await release(tables, ON_FILE, twilio(OPEN).choice)).ok, true);
  assert.deepEqual(tables.lines, []);
});

test("the line's token leaves Vault before the row goes: nothing is left to open a subaccount nobody points at", async () => {
  const tables = boughtLine();
  const asked = [];
  const vault = {
    get_line_credentials: () => ON_FILE,
    drop_line_credentials: (args) => {
      asked.push([args, tables.lines.length]);
      return true;
    },
  };
  const c = twilio(OPEN);
  const r = await releaseLine(fakeDb(tables, {}, vault), c.choice, null, A, tables.lines[0]);
  assert.equal(r.ok, true);
  assert.deepEqual(asked, [[{ p_line_id: LINE }, 1]], "for this line, with the row still there to find it by");
  assert.deepEqual(tables.lines, []);
});

test("Vault refusing to drop the token: a refusal and the row stays, and the next try reads the subaccount closed, and finishes", async () => {
  const tables = boughtLine();
  const vaultDown = {
    get_line_credentials: () => ON_FILE,
    drop_line_credentials: () => {
      throw new Error("vault unavailable");
    },
  };
  const c = twilio(OPEN);
  assert.deepEqual(await releaseLine(fakeDb(tables, {}, vaultDown), c.choice, null, A, tables.lines[0]), {
    ok: false,
    status: 503,
    error: "write_failed",
    detail: "dropping the line's token: vault unavailable",
    released: { number: "PN0001", trunk: "TK0001", channel_disabled: VOICE },
  });
  assert.deepEqual(
    tables.lines.map((l) => l.id),
    [LINE],
    "the row is what a token left in Vault would be found by",
  );
  assert.deepEqual(tables.events, [], "no line.released until it has all gone");

  // The first try closed it, so the token on file is refused and the parent says so.
  const closed = { status: 200, body: { sid: SUB, auth_token: "still-answered", status: "closed" } };
  const again = wire((_, method) => (method === "DELETE" ? REFUSED : closed));
  const finished = await release(tables, ON_FILE, again.choice);
  assert.equal(finished.ok, true);
  assert.equal(finished.released.subaccount_gone, true);
  assert.deepEqual(tables.lines, []);
});

/* -- the sweep, over releases that stop: sweepEndedLines itself, with what it reaches for as ports -- */

const QUARTER_HOUR = 15 * 60_000;
const LINES = [1, 2, 3].map((n) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`);
/** Three lines of one workspace whose subscription ended 40 days ago, each warned 8 days ago: all due, oldest first. */
const dueWorld = () => ({
  tenants: [{ id: A, slug: "harbor", status: "paused", timezone: "UTC" }],
  billing_accounts: [rows.billing({ tenant_id: A, ...bill({ current_period_end: iso(NOW - 40 * DAY) }) })],
  lines: LINES.map((id, n) =>
    rows.line({
      id,
      tenant_id: A,
      e164: `+1305555010${n}`,
      kind: "chanlytics",
      created_at: iso(NOW - (100 - n) * DAY),
      facts: { release_warning: { at: iso(NOW - 8 * DAY), ended_at: iso(NOW - 40 * DAY) } },
    }),
  ),
});
/** The quarter hour `at`: every release that `stuck` names stops, the rest go. What was tried, paged and alerted, in order. */
const tick = async (tables, stuck, at = NOW) => {
  const tried = [];
  const paged = [];
  const alerted = [];
  const out = await sweepEndedLines(
    fakeDb(tables),
    {
      release: async (_, row) => {
        tried.push(row.id);
        if (stuck.includes(row.id))
          return { ok: false, status: 502, error: "provider_refused", detail: "held at the carrier", released: {} };
        tables.lines = tables.lines.filter((l) => l.id !== row.id);
        return { ok: true, released: {} };
      },
      tell: async () => ({ told: true, reached: true }),
      alert: async (subject) => void alerted.push(subject),
      page: async (key, subject) => void paged.push([key, subject]),
      billingUrl: () => "https://app.example.com/b",
      now: () => at,
      log: { info() {}, warn() {}, error() {} },
    },
    30,
  );
  return { out, tried, paged, alerted };
};

test("a release that stays stuck never holds up the rest: it goes behind the lines not yet tried, so two of them cannot take both of a tick's places for ever", async () => {
  const tables = dueWorld();
  const [a, b, c] = LINES;

  const first = await tick(tables, [a, b]);
  assert.deepEqual(first.tried, [a, b], "oldest first, two a tick");
  assert.equal(first.out.failed, 2);

  const second = await tick(tables, [a, b], NOW + QUARTER_HOUR);
  assert.deepEqual(
    second.tried,
    [c, a],
    "REGRESSION when [a, b]: the two stuck lines held every place, and c never went",
  );
  assert.deepEqual(
    tables.lines.map((l) => l.id),
    [a, b],
    "c went back",
  );

  const third = await tick(tables, [a, b], NOW + 2 * QUARTER_HOUR);
  assert.deepEqual(third.tried, [b, a], "and the two left take turns, the longest since it was tried first");
});

test("a release that stays stuck pages the platform under the line's own key, which the pager tells once a window: it does not mail every quarter hour", async () => {
  const [a] = LINES;
  const { paged, alerted } = await tick(dueWorld(), [a]);
  assert.deepEqual(paged, [[`line_release_failed:${a}`, `A number could not be given back (workspace ${A})`]]);
  assert.deepEqual(alerted, [], "REGRESSION when not empty: a suspended campaign alone mails 96 times a day");
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

  const held = boughtLine({ provider: "dry", ...FILED });
  const heldBy = dry();
  assert.deepEqual(await release(held, { auth_token: "tok" }, heldBy), {
    ok: true,
    released: { number: "PN0001", trunk: "TK0001", campaign: "QE0001", channel_disabled: VOICE },
  });
  assert.deepEqual(held.lines, []);
  assert.deepEqual(heldBy.provider.calls.at(-1), { op: "closeSubaccount", args: ["ACdryrun", SUB] });

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
