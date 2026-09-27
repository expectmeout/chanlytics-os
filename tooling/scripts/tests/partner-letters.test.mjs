/**
 * A partner hears what changed, once a day (decision 0014): the letter's words (contracts partnerLetter), and the
 * sender the partner clock runs after its sweep (edge lib/partners/letters.ts) over a database in memory, the mail
 * faked. Which partners have news, and what it is, is the database's (00209 partner_letters_due, proved against the
 * stack in partner.db.test.mjs); this proves what is said, and that only a letter that went moves the mark.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARTNER_WORDS, partnerLetter, partnerPaneUrl } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, vault, withEnv } from "./_cron-doors-world.mjs";

const { sendPartnerLetters, LETTERS_BUDGET_MS } = await import(at("apps/edge/lib/partners/letters.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const clock = await import(at("apps/edge/api/cron/partners.ts"));

const NOW = new Date("2036-03-10T07:17:00Z");
const ORIGIN = "https://app.example.com";
const empty = () => ({
  written: [],
  matured: [],
  voided: [],
  paid: [],
  standing: [],
  brought: [],
  status: null,
  balance: [],
});
const letter = (news) =>
  partnerLetter({ ...empty(), ...news }, { origin: ORIGIN, since: "2036-03-09T07:17:00Z", nowMs: NOW.getTime() });

/* ------------------------------------------------------------------ the words */

test("a share earned: the subject says it, the body says it, and where the partner stands in the pane's sentences", () => {
  const l = letter({
    written: [{ kind: "share", currency: "usd", count: 2, cents: 5000 }],
    brought: ["Glow Studio"],
    balance: [{ currency: "usd", held: 5000, payable: 0, paid: 0, next_payable_at: "2036-04-09T00:00:00Z" }],
  });
  assert.equal(l.subject, "You earned $50.00");
  assert.equal(
    l.body,
    [
      "Since Mar 9:",
      "",
      "- You earned $50.00 from 2 payments, held 30 days.",
      "- Glow Studio signed up through your link.",
      "",
      "Where you stand:",
      "- $50.00 held, the first of it payable from Apr 9 at the earliest.",
      "- $0.00 payable.",
      "- $0.00 paid to date.",
      "",
      `See it all: ${ORIGIN}/#/admin/partner`,
      "",
      "You get this email when something changes, at most once a day. To stop it, turn it off in Settings › Partner.",
    ].join("\n"),
  );
});

test("what matters most names the subject: closed, paused, paid, not eligible, under review, earned, else what changed", () => {
  const paid = { paid: [{ currency: "usd", cents: 2500, reference: "BANK-123", sent_at: "2036-03-09T12:00:00Z" }] };
  const review = { standing: [{ workspace: "Bright Dental", standing: "review", why: null }] };
  const out = {
    standing: [{ workspace: "Bright Dental", standing: "disqualified", why: "Its owner is the partner." }],
  };
  assert.equal(
    letter({ ...paid, status: { status: "closed", why: null } }).subject,
    "Your Chanlytics partner account is closed",
  );
  assert.equal(
    letter({ ...paid, status: { status: "paused", why: "x" } }).subject,
    "Your Chanlytics partner account is paused",
  );
  assert.equal(letter({ ...paid, ...review }).subject, "Chanlytics paid you $25.00");
  assert.equal(letter({ ...out }).subject, "A workspace you brought is not eligible for a share");
  assert.equal(letter({ ...review }).subject, "A workspace you brought is under review");
  assert.equal(letter({ matured: [{ currency: "usd", cents: 2500 }] }).subject, "What changed in your partner account");
  assert.match(letter(paid).body, /- Paid: \$25\.00 on Mar 9, reference BANK-123\./);
});

test("reversals, maturing, voids, standing and status: one line each, a person's why said, the sweep's never", () => {
  const body = letter({
    written: [
      { kind: "refund", currency: "usd", count: 1, cents: -500 },
      { kind: "dispute", currency: "usd", count: 2, cents: -1000 },
      { kind: "dispute_won", currency: "usd", count: 1, cents: 500 },
    ],
    matured: [{ currency: "usd", cents: 2500 }],
    voided: [{ currency: "eur", cents: 1200 }],
    standing: [
      { workspace: "Bright Dental", standing: "review", why: null },
      { workspace: "Glow Studio", standing: "qualified", why: "Checked with the owner." },
      { workspace: null, standing: "disqualified", why: "" },
    ],
    status: { status: "paused", why: "Checking a payout." },
  }).body;
  for (const line of [
    "- Your partner account is paused. Why: Checking a payout. On the teams you joined you can read, not change, until it is restored.",
    "- A refund took back $5.00.",
    "- 2 disputes took back $10.00 while they are settled.",
    "- A dispute settled in the business's favor gave back $5.00.",
    "- $25.00 became payable.",
    "- €12.00 held will not be paid: its workspace is not eligible.",
    "- Bright Dental is under review: a person at Chanlytics looks at it before its share is paid.",
    "- Glow Studio qualified: its shares are paid as each one's hold ends. Why: Checked with the owner.",
    "- A workspace you brought is not eligible for a share.",
  ])
    assert.ok(body.includes(line), line);
  assert.ok(body.includes(`- ${PARTNER_WORDS.noneYet}`), "an empty ledger is said once, not as three zeros");
  assert.equal(
    letter({ status: { status: "active", why: null } }).body.split("\n")[2],
    "- Your partner account is active again.",
  );
  assert.equal(partnerPaneUrl("https://app.example.com/"), "https://app.example.com/#/admin/partner");
});

/* ------------------------------------------------------------------ the sender */

const due = (id, email, news = {}) => ({
  partner_id: id,
  email,
  code: `code-${id}`,
  status: "active",
  since: "2036-03-09T07:17:00Z",
  through: NOW.toISOString(),
  news: { ...empty(), written: [{ kind: "share", currency: "usd", count: 1, cents: 2500 }], ...news },
});

function world(rows) {
  const marked = [];
  const asked = [];
  const db = fakeDb(
    {},
    {},
    {
      partner_letters_due: (a) => (asked.push(a), rows),
      partner_letter_written: (a) => (marked.push(a), true),
    },
  );
  return { db, marked, asked };
}

test("each partner with news is written to from the platform's address; only a letter that went moves the mark", async () => {
  const { db, marked, asked } = world([due("p1", "ada@example.com"), due("p2", "bo@example.com")]);
  const sent = [];
  const out = await sendPartnerLetters(db, NOW, {
    from: "Chanlytics <hello@example.com>",
    origin: ORIGIN,
    send: async (from, to, subject, body) => (sent.push({ from, to, subject, body }), to[0] !== "bo@example.com"),
  });
  assert.deepEqual(out, { due: 2, sent: 1, failed: 1, deferred: 0 });
  assert.deepEqual(asked, [{ p_now: NOW.toISOString() }]);
  assert.deepEqual(
    sent.map((s) => [s.from, s.to, s.subject]),
    [
      ["Chanlytics <hello@example.com>", ["ada@example.com"], "You earned $25.00"],
      ["Chanlytics <hello@example.com>", ["bo@example.com"], "You earned $25.00"],
    ],
  );
  assert.deepEqual(marked, [{ p_partner: "p1", p_through: NOW.toISOString() }], "bo's letter failed: tomorrow's");
});

test("no sender address: nothing is sent and nothing is marked; every letter waits", async () => {
  const { db, marked } = world([due("p1", "ada@example.com")]);
  const out = await sendPartnerLetters(db, NOW, { from: null, send: async () => assert.fail("nothing is sent") });
  assert.deepEqual(out, { due: 1, sent: 0, failed: 0, deferred: 1 });
  assert.deepEqual(marked, []);
});

test("the budget: a letter that could not finish inside it waits for tomorrow, unmarked", async () => {
  const { db, marked } = world([due("p1", "ada@example.com"), due("p2", "bo@example.com")]);
  let t = 0;
  const out = await sendPartnerLetters(db, NOW, {
    from: "hello@example.com",
    nowMs: () => t,
    send: async () => ((t += LETTERS_BUDGET_MS), true),
  });
  assert.deepEqual(out, { due: 2, sent: 1, failed: 0, deferred: 1 });
  assert.deepEqual(
    marked.map((m) => m.p_partner),
    ["p1"],
  );
});

test("a database without the letters, or one that fails: nothing is sent, and the sender never throws", async () => {
  const older = fakeDb(
    {},
    {},
    {
      partner_letters_due: () => {
        throw Object.assign(new Error("function partner_letters_due does not exist"), { code: "42883" });
      },
    },
  );
  const failed = fakeDb(
    {},
    {},
    {
      partner_letters_due: () => {
        throw new Error("statement timeout");
      },
    },
  );
  const none = { due: 0, sent: 0, failed: 0, deferred: 0 };
  assert.deepEqual(
    await sendPartnerLetters(older, NOW, { from: "x@example.com", send: async () => assert.fail() }),
    none,
  );
  assert.deepEqual(
    await sendPartnerLetters(failed, NOW, { from: "x@example.com", send: async () => assert.fail() }),
    none,
  );
});

test("the clock writes after its sweep; a letter the provider refuses is the tick's count, never its failure", async () => {
  const order = [];
  setPg(
    fakeDb(
      {},
      {},
      {
        ...vault,
        partner_earnings_sweep: () => (order.push("sweep"), { judged: 0, review: 0, payable: 1, void: 0 }),
        partner_letters_due: () => (order.push("letters"), [due("p1", "ada@example.com")]),
        partner_letter_written: () => assert.fail("no mail went, so no mark moves"),
      },
    ),
  );
  // No provider key: post() refuses, as it does for every mail the edge sends without one.
  const [status, body] = await withEnv({ RESEND_API_KEY: undefined, LEAD_FROM: "hello@example.com" }, async () =>
    answer(await knock(clock.POST, "partners")),
  );
  assert.equal(status, 200);
  assert.deepEqual(body.letters, { due: 1, sent: 0, failed: 1, deferred: 0 });
  assert.deepEqual(order, ["sweep", "letters"]);
});
