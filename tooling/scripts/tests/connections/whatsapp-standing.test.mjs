/**
 * What Meta holds about a connected WhatsApp number, in the owner's words (contracts lines/number-standing.ts): the kept
 * answer read back from a channel's config without trusting it, the WhatsApp row for a number Meta will not let send, one
 * it limits and one it has said nothing about, whether the account has a payment method and what that means (said from what the
 * account holds, else from what Meta's problems name, with the way to add one), how to try a number nobody has written to yet from a
 * phone (and the digits a wa.me link takes), what WhatsApp costs, said last under every connected row, the owner's alert, and when
 * a page that opens should ask Meta again. Run on the real functions, over the shape the edge keeps
 * (apps/edge/lib/whatsapp/meta-graph.ts numberStanding writes it; the database door channel_keep_standing keeps it whole). The
 * Activity log's words for a change are held in workspace/activity.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRows,
  standingAlertWords,
  standingFromConfig,
  standingNeedsRead,
  toChannelVM,
  waMeDigits,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const ago = (ms) => new Date(NOW - ms).toISOString();

/** What WhatsApp costs, said last under every connected row: Meta bills it, to the card on the WhatsApp account. */
const COST = [
  "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill.",
  "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours.",
  "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer.",
  "Prices depend on the customer's country.",
];
const PRICES = {
  label: "Meta's current prices",
  href: "https://business.whatsapp.com/products/platform-pricing#rates",
};
/** The same, as the row's notes: the last carries the link to Meta's rates (no rate is written in Chanlytics). */
const COST_NOTES = COST.map((text, at) => (at === COST.length - 1 ? { text, link: PRICES } : { text }));
/** What a row says beyond what WhatsApp costs: its notes' words, one to a note. */
const said = (r) => r.notes.slice(0, -COST.length).map((n) => n.text);

/** What a payment method is for: Meta delivers replies to a customer who wrote first without one, and not the messages the business starts. */
const PAYMENT_NOTE =
  "Without a payment method, Meta still delivers replies to customers who write first; it does not deliver the messages your business starts, like reminders and campaigns.";
/** What a number whose account has no payment method says: replies go out, what the business starts does not. */
const NO_PAYMENT =
  "No payment method on your WhatsApp account yet: replies still go out, but reminders and campaigns will not be delivered.";
/** The business that owns the WhatsApp account and the account (made up), and the page Meta opens to add a payment method to it. */
const BUSINESS = "410540000000001";
const ACCOUNT = "205540000000001";
const ADD_ONE = {
  label: "Add one in Meta",
  href: `https://business.facebook.com/billing_hub/accounts/details/?business_id=${BUSINESS}&asset_id=${ACCOUNT}&wizard_name=ADD_PM&account_type=whatsapp-business-account`,
};
const VERIFIED_2K = "Your business is verified with Meta: you can start conversations with up to 2,000 people a day.";

/** What the edge keeps for a number Meta reports BLOCKED: the account's missing payment method, in Meta's words, and the app's own trouble. */
const BLOCKED = {
  can_send: "BLOCKED",
  problems: [
    {
      entity: "WABA",
      code: 141006,
      said: "A payment method is required to send messages",
      fix: "Add a payment method in WhatsApp Manager",
    },
    { entity: "APP", code: 131000, said: "The app is in development mode", fix: null },
  ],
  notes: [],
  name: "Harbor Moving",
  name_status: "APPROVED",
  verification: "not_verified",
  limit: "TIER_250",
  has_payment_method: null,
  owner_business_id: null,
  waba_id: null,
};
/** A number Meta lets send, with its display name still in review and the business verified at a tier, a payment method on file. */
const LIMITED = {
  can_send: "LIMITED",
  problems: [],
  notes: ["Your display name has not been approved yet. Messages are limited until it is."],
  name: "Harbor Moving",
  name_status: "PENDING_REVIEW",
  verification: "verified",
  limit: "TIER_2K",
  has_payment_method: true,
  owner_business_id: BUSINESS,
  waba_id: ACCOUNT,
};
/** A number with nothing in the way and nothing to say about its name: what a row says of it is the account's and the business's. */
const AVAILABLE = { ...LIMITED, can_send: "AVAILABLE", notes: [], name_status: "APPROVED" };

const channel = (standing, over = {}) =>
  toChannelVM(
    {
      id: "ch-wa",
      kind: "whatsapp",
      number_e164: "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * 60 * MIN),
      last_inbound_at: ago(120 * MIN),
      standing,
      standing_read_at: ago(5 * MIN),
      ...over,
    },
    new Date(NOW),
  );
const base = () => ({
  channels: [],
  whatsapp: null,
  lines: { rows: [], ready: false },
  lineRequestedAt: null,
  google: null,
  calendar: null,
});
const whatsappRow = (ch) => connectionRows({ ...base(), channels: [ch] }, NOW).find((r) => r.kind === "whatsapp");

test("a number Meta will not let send needs attention, says Meta's first problem in Meta's words, and gives the fix and the rest as notes", () => {
  const r = whatsappRow(channel(BLOCKED));
  assert.deepEqual([r.state, r.stateWords, r.group], ["attention", "Needs attention", "connected"]);
  assert.equal(r.sentence, "Meta: A payment method is required to send messages.");
  assert.deepEqual(said(r), [
    "Add a payment method in WhatsApp Manager.",
    "The app is in development mode.",
    PAYMENT_NOTE,
    "Your business isn't verified with Meta: you can start conversations with up to 250 people a day. Replies to customers who write first are not limited.",
  ]);
  assert.deepEqual(r.verb, { label: "Library", to: "messages", who: "operator" }, "the row's own verb stays");
});

test("a number Meta blocks without saying why says that much and nothing it did not say", () => {
  const r = whatsappRow(channel({ ...BLOCKED, problems: [], verification: null, limit: null }));
  assert.equal(r.state, "attention");
  assert.equal(r.sentence, "Meta says WhatsApp cannot send from this number right now.");
  assert.deepEqual(said(r), [], "no problem, no note, no verification read: nothing is invented");
});

test("a number Meta limits stays On with what Meta said, the name's review and the tier, each as a note", () => {
  const plain = whatsappRow(channel(null));
  const r = whatsappRow(channel(LIMITED));
  assert.deepEqual([r.state, r.stateWords], ["connected", "On"]);
  assert.equal(r.sentence, plain.sentence, "the sentence is the row's own: receiving, and its rating");
  assert.deepEqual(said(r), [
    "Your display name has not been approved yet. Messages are limited until it is.",
    "Meta is reviewing the display name “Harbor Moving”; until then customers see the number.",
    VERIFIED_2K,
  ]);
});

test("a declined name and a business with no daily limit are said; a name Meta approved, and a number it has said nothing about, say nothing of themselves", () => {
  const declined = whatsappRow(channel({ ...AVAILABLE, name_status: "DECLINED", limit: "TIER_UNLIMITED" }));
  assert.deepEqual(said(declined), [
    "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager.",
    "Your business is verified with Meta and has no daily limit on starting conversations.",
  ]);
  assert.equal(declined.state, "connected");
  const expired = whatsappRow(channel({ ...AVAILABLE, name: null, name_status: "EXPIRED", verification: null }));
  assert.deepEqual(said(expired), ["The request for your display name expired — submit it again in WhatsApp Manager."]);
  assert.deepEqual(said(whatsappRow(channel(AVAILABLE))), [VERIFIED_2K]);
  const unread = whatsappRow(channel(null));
  assert.deepEqual(said(unread), [], "nothing read yet: as it was, its quality and its last message");
  assert.match(unread.sentence, /^Receiving · last message 2h ago/);
});

test("an unverified business is said at the tier Meta gave, else at the start Meta gives a new business; a pending one is unverified too", () => {
  const at = (over) => said(whatsappRow(channel({ ...AVAILABLE, ...over })));
  assert.deepEqual(at({ verification: "pending", limit: "TIER_50" }), [
    "Your business isn't verified with Meta: you can start conversations with up to 50 people a day. Replies to customers who write first are not limited.",
  ]);
  assert.deepEqual(at({ verification: "not_verified", limit: "UNTIERED" }), [
    "Your business isn't verified with Meta: you can start conversations with up to 250 people a day. Replies to customers who write first are not limited.",
  ]);
  assert.deepEqual(
    at({ verification: "not_verified", limit: null }),
    at({ verification: "rejected", limit: "UNTIERED" }),
  );
  assert.deepEqual(at({ verification: "verified", limit: "UNTIERED" }), ["Your business is verified with Meta."]);
});

test("a word of Meta's that is not one of the three is kept and not guessed: the row neither flags it nor calls it fine", () => {
  const r = whatsappRow(channel({ ...BLOCKED, can_send: "RESTRICTED", problems: [], verification: null, limit: null }));
  assert.deepEqual([r.state, r.stateWords], ["connected", "On"]);
  assert.equal(r.sentence, whatsappRow(channel(null)).sentence);
});

test("a switched-off number says nothing of what Meta holds or of what WhatsApp costs, and a flagged one is still flagged", () => {
  const off = whatsappRow(channel(BLOCKED, { status: "disabled" }));
  assert.deepEqual([off.state, off.stateWords, off.notes], ["off", "Off", []]);
  const flagged = whatsappRow(channel(LIMITED, { quality: "RED", quality_event: "FLAGGED" }));
  assert.equal(flagged.state, "attention", "Meta's rating still counts");
  assert.match(flagged.sentence, /WhatsApp flagged this number's quality/);
});

test("the kept answer is read back as it is held and no looser: a word and an object, else nothing; a malformed problem or note is dropped, never mended", () => {
  assert.deepEqual(standingFromConfig(BLOCKED), BLOCKED);
  assert.deepEqual(standingFromConfig(LIMITED), LIMITED);
  assert.deepEqual(
    standingFromConfig({
      can_send: " AVAILABLE ",
      problems: [
        null,
        "x",
        { entity: "APP", code: "141006", said: "  Too many  ", fix: 7 },
        { entity: 4, code: 1, said: "" },
        { said: "Kept", fix: "Fix it" },
      ],
      notes: ["  one ", 3, "", null, "two"],
      name: "",
      name_status: "APPROVED",
      verification: 5,
      limit: undefined,
      has_payment_method: "yes",
      owner_business_id: " 410540000000001 ",
      waba_id: 205540000000001,
    }),
    {
      can_send: "AVAILABLE",
      problems: [
        { entity: "APP", code: null, said: "Too many", fix: null },
        { entity: "UNKNOWN", code: null, said: "Kept", fix: "Fix it" },
      ],
      notes: ["one", "two"],
      name: null,
      name_status: "APPROVED",
      verification: null,
      limit: null,
      has_payment_method: null,
      owner_business_id: "410540000000001",
      waba_id: null,
    },
  );
  for (const held of [true, false])
    assert.equal(standingFromConfig({ can_send: "AVAILABLE", has_payment_method: held }).has_payment_method, held);
  for (const bad of [undefined, null, "AVAILABLE", 7, [], {}, { can_send: "" }, { can_send: 3 }, { problems: [] }])
    assert.equal(standingFromConfig(bad), null, JSON.stringify(bad));
});

test("a page that opens asks Meta again when nothing was kept, or when what was kept is not AVAILABLE and ten minutes old; an AVAILABLE number is the clock's to renew", () => {
  const held = (standing, readAgo) => ({ standing, standingReadAt: readAgo === null ? null : ago(readAgo) });
  assert.equal(standingNeedsRead(held(null, null), NOW), true, "never read");
  assert.equal(standingNeedsRead(held(null, 1 * MIN), NOW), true, "a stamp without an answer is nothing read");
  assert.equal(standingNeedsRead(held({ ...BLOCKED, can_send: "AVAILABLE" }, 3 * 24 * 60 * MIN), NOW), false);
  assert.equal(
    standingNeedsRead(held(BLOCKED, 9 * MIN), NOW),
    false,
    "a payment method fixed a minute ago is asked about at ten",
  );
  assert.equal(standingNeedsRead(held(BLOCKED, 10 * MIN), NOW), false, "ten minutes exactly is not more than ten");
  assert.equal(standingNeedsRead(held(BLOCKED, 10 * MIN + 1), NOW), true);
  assert.equal(standingNeedsRead(held(LIMITED, 11 * MIN), NOW), true);
  assert.equal(standingNeedsRead(held(BLOCKED, null), NOW), true, "no stamp: asked");
  assert.equal(
    standingNeedsRead({ standing: BLOCKED, standingReadAt: "last tuesday" }, NOW),
    true,
    "a stamp that is no time is no stamp",
  );
});

test("the owner's alert says which number, Meta's first problem and Meta's fix, in Meta's words", () => {
  assert.deepEqual(standingAlertWords("+13055550188", BLOCKED), {
    subject: "WhatsApp can't send from your number",
    body: "WhatsApp can't send from +1 (305) 555-0188: A payment method is required to send messages. Add a payment method in WhatsApp Manager.",
  });
  assert.equal(
    standingAlertWords("+13055550188", {
      ...BLOCKED,
      problems: [{ entity: "WABA", code: null, said: "Account restricted.", fix: null }],
    }).body,
    "WhatsApp can't send from +1 (305) 555-0188: Account restricted.",
  );
  assert.equal(
    standingAlertWords(null, { ...BLOCKED, problems: [] }).body,
    "WhatsApp can't send from your number. Meta did not say why; open Connections to read what it holds.",
  );
});

test("whether the account has a payment method is said where it matters, with the way to add one; where it could not be read, what a payment method is for is said wherever Meta's own problem names one", () => {
  const notes = (over) => whatsappRow(channel({ ...AVAILABLE, ...over })).notes.slice(0, -COST.length);
  const named = { entity: "WABA", code: 141006, said: "A payment method is required to send messages", fix: null };
  const NAMED = { text: "A payment method is required to send messages." };
  // None on file: said plainly, with the page Meta opens to add one for this business and this account.
  assert.deepEqual(notes({ has_payment_method: false }), [{ text: NO_PAYMENT, link: ADD_ONE }, { text: VERIFIED_2K }]);
  // The business, or the account, not known (or an id that is not digits): no link that would open on nothing; Business Suite instead.
  const SUITE = { text: `${NO_PAYMENT} Add one in Meta Business Suite › Billing.` };
  assert.deepEqual(notes({ has_payment_method: false, owner_business_id: null }), [SUITE, { text: VERIFIED_2K }]);
  assert.deepEqual(notes({ has_payment_method: false, waba_id: null }), [SUITE, { text: VERIFIED_2K }]);
  assert.deepEqual(notes({ has_payment_method: false, owner_business_id: "41054 x&y=1" }), [
    SUITE,
    { text: VERIFIED_2K },
  ]);
  // One on file: nothing of it, even where Meta's own problem names a payment.
  assert.deepEqual(notes({ has_payment_method: true }), [{ text: VERIFIED_2K }]);
  assert.deepEqual(notes({ has_payment_method: true, problems: [named] }), [NAMED, { text: VERIFIED_2K }]);
  // None on file and Meta's problem names it too: the account's own word says it once, after Meta's.
  assert.deepEqual(notes({ has_payment_method: false, problems: [named] }), [
    NAMED,
    { text: NO_PAYMENT, link: ADD_ONE },
    { text: VERIFIED_2K },
  ]);
  // Not read: Meta's problem is what there is to go on, and a payment method's use is said once, however many problems name a payment.
  assert.deepEqual(notes({ has_payment_method: null, problems: [named] }), [
    NAMED,
    { text: PAYMENT_NOTE },
    { text: VERIFIED_2K },
  ]);
  const twice = [named, { entity: "BUSINESS", code: null, said: "The payment method on file was declined", fix: null }];
  assert.equal(notes({ has_payment_method: null, problems: twice }).filter((n) => n.text === PAYMENT_NOTE).length, 1);
  assert.deepEqual(
    notes({ has_payment_method: null, problems: [{ ...named, said: "The app is in development mode" }] }),
    [{ text: "The app is in development mode." }, { text: VERIFIED_2K }],
  );
  assert.deepEqual(
    notes({ has_payment_method: null }),
    [{ text: VERIFIED_2K }],
    "nothing named, nothing known: nothing said",
  );
});

test("every connected WhatsApp row says what WhatsApp costs, last: who bills it, what is free, what is charged, and Meta's own page for the prices; a switched-off number and every other row say none of it", () => {
  for (const ch of [
    channel(null),
    channel(LIMITED),
    channel(BLOCKED),
    channel(null, { quality: "RED", quality_event: "FLAGGED" }),
  ]) {
    const r = whatsappRow(ch);
    assert.deepEqual(r.notes.slice(-COST.length), COST_NOTES, `${r.state}: the four lines, the last with its link`);
  }
  assert.deepEqual(whatsappRow(channel(null, { status: "disabled" })).notes, []);
  const rows = connectionRows({ ...base(), channels: [channel(null)] }, NOW);
  for (const r of rows.filter((x) => x.kind !== "whatsapp")) assert.deepEqual(r.notes, [], r.kind);
});

test("a connected number nobody has written to yet says how to try it from a phone, built from its number; once a message has arrived, or when the row is off, needs attention or has no number, it says nothing of the kind", () => {
  const TRY = {
    text: "Try it from your phone: wa.me/13055550188 — if WhatsApp says the number isn't on WhatsApp yet, open this link instead of searching your contacts.",
  };
  const unwritten = { last_inbound_at: null };
  assert.deepEqual(whatsappRow(channel(null, unwritten)).notes, [TRY, ...COST_NOTES]);
  assert.deepEqual(
    whatsappRow(channel(AVAILABLE, unwritten)).notes,
    [TRY, { text: VERIFIED_2K }, ...COST_NOTES],
    "the way to try it first, then what Meta holds, then what it costs",
  );
  assert.deepEqual(whatsappRow(channel(null)).notes, COST_NOTES, "a message has arrived");
  assert.deepEqual(whatsappRow(channel(null, { ...unwritten, status: "disabled" })).notes, [], "off");
  assert.ok(
    !whatsappRow(channel(BLOCKED, unwritten)).notes.some((n) => n.text === TRY.text),
    "needing attention: Meta's words come first",
  );
  assert.deepEqual(
    whatsappRow(channel(null, { ...unwritten, quality: "RED", quality_event: "FLAGGED" })).notes,
    COST_NOTES,
    "flagged: needs attention too",
  );
  assert.deepEqual(
    whatsappRow(channel(null, { ...unwritten, number_e164: null })).notes,
    COST_NOTES,
    "no number, no link",
  );
  assert.match(
    whatsappRow(channel(null, { ...unwritten, number_e164: "+442079460958" })).notes[0].text,
    /^Try it from your phone: wa\.me\/442079460958 — /,
    "any country's number, digits only",
  );
});

test("a wa.me link takes a number's digits, no plus, spaces or brackets, from the number as E.164 or as it is shown; too few digits is no link", () => {
  assert.equal(waMeDigits("+13055550188"), "13055550188");
  assert.equal(waMeDigits("+1 (305) 555-0188"), "13055550188");
  for (const none of [null, undefined, "", "12", "+1 305", "abc"]) assert.equal(waMeDigits(none), null, String(none));
});
