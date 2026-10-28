/**
 * A website's sign-up, confirmed by its person (00489), in its pure parts: the link's token (channels confirm-token.ts,
 * sealed as the unsubscribe link is, under a label of its own), the address a program made up, the address as the limits
 * count it, whether a sign-up is asked (signupAskRefusal), the email's words, the page's words, and what the person's
 * page says while an ask waits (signupAskOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIRM_PATH,
  confirmUrl,
  signConfirmToken,
  signUnsubscribeToken,
  verifyConfirmToken,
  verifyUnsubscribeToken,
} from "@chanlytics/channels";
import {
  confirmPageWords,
  looksMadeUp,
  maskAddress,
  SIGNUP_ASK_LIMITS,
  SIGNUP_CONFIRM_MS,
  signupAddressKey,
  signupAskLine,
  signupAskOf,
  signupAskRefusal,
  signupConfirmEmail,
  toPersonVM,
  DAY_MS,
} from "@chanlytics/contracts";
import { personDto } from "../../consent/_person-row.mjs";

const SECRET = "a-secret-only-this-file-holds";
const CLAIMS = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  contactId: "33333333-3333-4333-8333-333333333333",
  messageId: "11111111-1111-4111-8111-111111111111",
};

test("the link seals the workspace, the person and the email, and opens as nothing but a confirmation", () => {
  const t = signConfirmToken(SECRET, CLAIMS);
  assert.match(t, /^[A-Za-z0-9_-]{87}$/);
  assert.deepEqual(verifyConfirmToken([SECRET], t), CLAIMS);
  assert.deepEqual(
    verifyConfirmToken(["the-one-after", SECRET], t),
    CLAIMS,
    "the secret before a rotation still opens it",
  );
  assert.equal(verifyConfirmToken(["another"], t), null);
  assert.equal(verifyConfirmToken([SECRET], t.slice(0, -1)), null);
  assert.equal(verifyConfirmToken(null, t), null, "no list: refused, never a throw");
  // The same claims under the same secret seal two different links: neither kind opens as the other.
  const stop = signUnsubscribeToken(SECRET, CLAIMS);
  assert.notEqual(stop, t);
  assert.equal(verifyConfirmToken([SECRET], stop), null, "an unsubscribe link is no yes");
  assert.equal(verifyUnsubscribeToken([SECRET], t), null, "and a confirmation is no stop");
  assert.throws(() => signConfirmToken("", CLAIMS), /no secret/);
  assert.throws(() => signConfirmToken(SECRET, { ...CLAIMS, messageId: "m1" }), /uuids/);
  assert.equal(CONFIRM_PATH, "/c/");
  assert.match(confirmUrl("https://app.example.com/", t), /^https:\/\/app\.example\.com\/c\/[A-Za-z0-9_-]{87}$/);
});

test("an address a program made up: a Gmail name of three dots or more, and nothing else", () => {
  assert.equal(looksMadeUp("j.o.h.n@gmail.com"), true);
  assert.equal(looksMadeUp("A.B.C.D@GoogleMail.com"), true);
  assert.equal(looksMadeUp("ana.ruiz.m@gmail.com"), false, "two dots is a person's");
  assert.equal(looksMadeUp("a.b.c.d@example.com"), false, "another domain reads its dots");
  assert.equal(looksMadeUp("nope"), false);
});

test("the limits count one Gmail inbox once, whatever its dots and its tag", () => {
  assert.equal(signupAddressKey("Ana.Ruiz+news@googlemail.com"), "anaruiz@gmail.com");
  assert.equal(signupAddressKey("anaruiz@gmail.com"), "anaruiz@gmail.com");
  assert.equal(
    signupAddressKey(" Ana.Ruiz+news@Example.com "),
    "ana.ruiz+news@example.com",
    "any other address is itself",
  );
});

const FACTS = {
  person: { email: "ana@example.com", stopped: false, suppressed: false, emailOffers: "unknown" },
  mailbox: true,
  open: false,
  addressAsks: 0,
  workspaceToday: 0,
  failedToday: 0,
};

test("a sign-up is asked at its person's own address, from a mailbox, within the limits; each refusal by name", () => {
  const L = SIGNUP_ASK_LIMITS;
  assert.equal(signupAskRefusal("Ana@Example.com", FACTS), null, "the address as one");
  const cases = [
    ["a.b.c.d@gmail.com", FACTS, "made_up"],
    ["ana@example.com", { ...FACTS, person: null }, "gone"],
    ["ana@other.example", FACTS, "not_their_address"],
    ["ana@example.com", { ...FACTS, person: { ...FACTS.person, email: null } }, "not_their_address"],
    ["ana@example.com", { ...FACTS, person: { ...FACTS.person, emailOffers: "opted_in" } }, "already"],
    ["ana@example.com", { ...FACTS, person: { ...FACTS.person, stopped: true } }, "stopped"],
    ["ana@example.com", { ...FACTS, person: { ...FACTS.person, suppressed: true } }, "suppressed"],
    ["ana@example.com", { ...FACTS, mailbox: false }, "no_mailbox"],
    ["ana@example.com", { ...FACTS, open: true }, "open"],
    ["ana@example.com", { ...FACTS, addressAsks: L.perAddress }, "address_limit"],
    ["ana@example.com", { ...FACTS, workspaceToday: L.perWorkspaceDay }, "workspace_limit"],
    ["ana@example.com", { ...FACTS, failedToday: L.failedStop }, "failing"],
  ];
  for (const [typed, f, why] of cases) {
    assert.equal(signupAskRefusal(typed, f), why, why);
    // A person gone between the form and the ask (erased, merged) is nobody to tell the owner about.
    if (why === "gone") assert.equal(signupAskLine(why), null);
    else assert.ok(signupAskLine(why), `the owner is told why: ${why}`);
  }
  assert.equal(signupAskRefusal("ana@example.com", { ...FACTS, addressAsks: L.perAddress - 1 }), null);
  assert.equal(
    signupAskRefusal("ana@example.com", { ...FACTS, person: { ...FACTS.person, emailOffers: "opted_out" } }),
    null,
    "someone who unsubscribed and signs up again is asked: their press is their newest word",
  );
  assert.match(signupAskLine("asked"), /^We emailed them to confirm\./);
  assert.equal(signupAskLine(null), null);
});

test("the email names the business and carries the link, and sells nothing", () => {
  const w = signupConfirmEmail({ business: "Harbor Studio", link: "https://app.example.com/c/abc" });
  assert.equal(w.subject, "Confirm your sign-up with Harbor Studio");
  assert.match(w.body, /^You signed up on Harbor Studio's website for offers and news\./);
  assert.match(w.body, /\nhttps:\/\/app\.example\.com\/c\/abc\n/);
  assert.match(w.body, /If this wasn't you, ignore this email\./);
  assert.equal(signupConfirmEmail({ business: " ", link: "x" }).subject, "Confirm your sign-up with us");
});

test("the page's words: one question with one button, and every other view without one", () => {
  const p = { business: "Harbor Studio", address: "ana.ruiz@example.com" };
  assert.equal(maskAddress(p.address), "a•••@example.com");
  const ask = confirmPageWords("ask", p);
  assert.deepEqual(ask.lines, ["Get offers and news from Harbor Studio by email at a•••@example.com?"]);
  assert.equal(ask.button, "Yes, send me offers");
  for (const view of ["done", "expired", "address_changed", "stopped", "gone", "unavailable"]) {
    const w = confirmPageWords(view, p);
    assert.equal(w.button, null, view);
    assert.ok(w.title && w.lines.length, view);
    assert.ok(!w.lines.join(" ").includes("ana.ruiz@"), `${view}: the whole address is never shown`);
  }
  assert.match(confirmPageWords("done", p).lines[0], /^Harbor Studio will send offers and news to a•••@example\.com\./);
  assert.match(
    confirmPageWords("ask", { business: null, address: null }).lines[0],
    /^Get offers and news from This business by email at your address\?/,
  );
});

const NOW = Date.parse("2026-10-28T15:00:00Z");
const TZ = "America/New_York";
const ask = (over = {}) => ({
  direction: "outbound",
  channel: "email",
  status: "sent",
  created_at: new Date(NOW - DAY_MS).toISOString(),
  meta: { source: "signup_confirm" },
  ...over,
});

test("the person's page: asked and until when, then did not confirm, or not delivered; nothing once they said yes", () => {
  assert.deepEqual(signupAskOf([ask()], "unknown", TZ, NOW), {
    label: "Asked to confirm",
    sub: "asked Oct 27 · the link works until Nov 3",
  });
  const old = ask({ created_at: new Date(NOW - SIGNUP_CONFIRM_MS - 1).toISOString() });
  assert.equal(signupAskOf([old], "unknown", TZ, NOW).label, "Did not confirm");
  assert.equal(signupAskOf([ask({ status: "failed" })], "unknown", TZ, NOW).label, "Confirmation not delivered");
  assert.equal(signupAskOf([ask()], "opted_in", TZ, NOW), null, "a yes says itself");
  assert.equal(signupAskOf([ask({ status: "canceled" })], "unknown", TZ, NOW), null);
  assert.equal(
    signupAskOf([ask({ meta: { source: "reach_out" } }), ask({ direction: "inbound" })], "unknown", TZ, NOW),
    null,
  );
  // The newest ask is the one said.
  const both = [old, ask({ created_at: new Date(NOW - 60_000).toISOString() })];
  assert.equal(signupAskOf(both, "opted_out", TZ, NOW).label, "Asked to confirm");
});

test("the person's page reads it off the messages it already holds: the email offers row's own state", () => {
  const detail = (messages, over = {}) => ({
    row: personDto({ email: "ana@example.com", email_marketing: "unknown", ...over }),
    identities: [],
    conversations: [{ id: "cv1", state: "open", contact: { id: "p1" }, messages }],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
  });
  const sent = { id: "m1", conversation_id: "cv1", type: "text", body: "x", sender: "system", ...ask() };
  assert.deepEqual(toPersonVM(detail([sent]), TZ, new Date(NOW)).signupAsk, {
    label: "Asked to confirm",
    sub: "asked Oct 27 · the link works until Nov 3",
  });
  assert.equal(toPersonVM(detail([]), TZ, new Date(NOW)).signupAsk, null, "nobody asked");
  const yes = detail([sent], { email_marketing: "opted_in", email_marketing_source: "confirmed_signup" });
  const vm = toPersonVM(yes, TZ, new Date(NOW));
  assert.equal(vm.signupAsk, null, "their yes says itself");
  assert.match(vm.consent.emailOffersSub, /^Confirmed their sign-up by email · /);
});
