/**
 * What Meta holds about a connected WhatsApp number, in the owner's words (contracts lines/number-standing.ts): the kept
 * answer read back from a channel's config without trusting it; the WhatsApp row for a number whose account's payment method
 * is missing or failing ("Waiting on you", with Meta's billing page as the row's one act), for one Meta has stopped for
 * anything else ("Needs attention", Meta's first problem about messaging, WhatsApp Manager), for one it limits and for one it
 * has said nothing about; the two notes a row may carry (a declined or lapsed display name; an unverified business, with
 * Meta's page to verify on) and the silence on everything else (Meta's own notes, its calling problems, a verified business,
 * a name in review, what WhatsApp costs); how to try a number nobody has written to yet from a phone (and the digits a wa.me
 * link takes); the owner's alert; a campaign's readiness read from the same standing; and when a page that opens should ask
 * Meta again. Run on the real functions, over the shape the edge keeps (apps/edge/lib/whatsapp/meta-graph.ts numberStanding
 * writes it; the database door channel_keep_standing keeps it whole). The Activity log's words for a change are held in
 * workspace/activity.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRows,
  nameDecisionWords,
  numberHealth,
  numberHealthWithStanding,
  standingAfterNameDecision,
  standingAlertWords,
  standingFromConfig,
  standingNeedsRead,
  toChannelVM,
  tryItLink,
  waMeDigits,
  waMeLink,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const ago = (ms) => new Date(NOW - ms).toISOString();

/** What a row says under its sentence: its notes' words, one to a note. */
const said = (r) => r.notes.map((n) => n.text);

/** The business that owns the WhatsApp account and the account (made up), and Meta's pages for each. */
const BUSINESS = "410540000000001";
const ACCOUNT = "205540000000001";
const ADD_CARD = `https://business.facebook.com/billing_hub/accounts/details/?business_id=${BUSINESS}&asset_id=${ACCOUNT}&wizard_name=ADD_PM&account_type=whatsapp-business-account`;
const SECURITY_CENTER = `https://business.facebook.com/settings/security?business_id=${BUSINESS}`;
const SECURITY_CENTER_ANYWHERE = "https://business.facebook.com/settings/security";
const MANAGER = `https://business.facebook.com/wa/manage/phone-numbers/?business_id=${BUSINESS}&waba_id=${ACCOUNT}`;
const MANAGER_ANYWHERE = "https://business.facebook.com/wa/manage/";
/** The row's one act, a page of Meta's, as the verb carries it. */
const act = (label, href) => ({ label, to: href, href, who: "owner" });
const LIBRARY = { label: "Library", to: "messages", who: "operator" };

/** The row's sentences for the account's payment method: none on file, and one Meta reports a problem with. */
const NEEDS_CARD = "Meta needs a payment method on your WhatsApp account before it delivers reminders and campaigns.";
const CARD_FAILING =
  "Meta reports a problem with the payment method on your WhatsApp account: reminders and campaigns are not delivered until it is fixed.";
const REPLIES_STILL_GO = "Replies to customers who write first still go out.";
const IN_SUITE = "Add one in Meta Business Suite › Billing.";
const BLOCKED_SENTENCE = "Meta says WhatsApp cannot send from this number right now.";
/** The verification's note: not verified, the day's cap where the sentence does not say it, and Meta's page to verify on. */
const notVerified = (cap, href = SECURITY_CENTER) => ({
  text: `Not verified with Meta: customers see your number instead of your name${cap ? `, and you can start conversations with up to ${cap} people a day` : ""}. Verify when you need more.`,
  link: { label: "Verify in Meta", href },
});

/** Meta's problem for a card on file that fails, in its words (a live account, 6 October). */
const CARD_ERROR = {
  entity: "WABA",
  code: 141006,
  said: "There is an error with the payment method. This will block business initiated conversations.",
  fix: "Please add a new payment method to the account.",
};
/** Meta's problems about WhatsApp calling, as its health answers them on the phone and on the app (the same account; Meta's codes not kept). */
const SIP = [
  {
    entity: "PHONE_NUMBER",
    code: null,
    said: "WhatsApp Business calling cannot use SIP because it is not enabled",
    fix: "Configure SIP using {PHONE_NUMBER_ID}/settings API",
  },
  {
    entity: "APP",
    code: null,
    said: "This app cannot use SIP for WhatsApp Business calling because it has not configured a SIP server for this business phone number",
    fix: "Configure SIP server using {PHONE_NUMBER_ID}/settings API",
  },
];

/** What the edge keeps for a number Meta reports BLOCKED over the account's payment method (Meta's words), with the app's own trouble beside it. */
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
/** A number with nothing in the way and nothing to say about its name. */
const AVAILABLE = { ...LIMITED, can_send: "AVAILABLE", notes: [], name_status: "APPROVED" };
/** A number Meta has stopped for something that is not the payment method, with its calling problems in front. */
const RESTRICTED = {
  ...BLOCKED,
  has_payment_method: true,
  owner_business_id: BUSINESS,
  waba_id: ACCOUNT,
  problems: [
    ...SIP,
    { entity: "WABA", code: 131031, said: "Account has been restricted", fix: "Appeal in WhatsApp Manager" },
  ],
};

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

test("a number whose account's payment method Meta reports a problem with waits on the owner: the sentence says what Meta stops, and nothing of Meta's prose is repeated", () => {
  const r = whatsappRow(channel(BLOCKED));
  assert.deepEqual([r.state, r.stateWords, r.group], ["attention", "Waiting on you", "connected"]);
  assert.equal(
    r.sentence,
    `${CARD_FAILING} ${IN_SUITE}`,
    "BLOCKED: nothing of replies still going; no business or account known: Business Suite, and no page to open",
  );
  assert.equal(r.verb, null);
  assert.deepEqual(r.notes, [notVerified("250", SECURITY_CENTER_ANYWHERE)]);
  const drawn = JSON.stringify(r);
  assert.ok(!drawn.includes("development mode"), "Meta's other problem is not repeated");
  assert.ok(!drawn.includes("required to send") && !drawn.includes("WhatsApp Manager"), "nor its words, nor its fix");
});

test("the account's payment method: none on file is Add a card on Meta's own page for this business and this account; one Meta names a problem with is Fix the card; one on file and unnamed is nothing", () => {
  const none = whatsappRow(
    channel({
      ...BLOCKED,
      problems: [BLOCKED.problems[0]],
      has_payment_method: false,
      owner_business_id: BUSINESS,
      waba_id: ACCOUNT,
    }),
  );
  assert.deepEqual(
    [none.stateWords, none.sentence, none.verb],
    ["Waiting on you", NEEDS_CARD, act("Add a card", ADD_CARD)],
  );
  assert.deepEqual(none.notes, [notVerified("250")]);
  // A number Meta lets send with none on file: Meta's own word that it may send, so the replies are said to go.
  const open = whatsappRow(channel({ ...AVAILABLE, has_payment_method: false }));
  assert.deepEqual(
    [open.state, open.stateWords, open.sentence, open.verb],
    ["attention", "Waiting on you", `${NEEDS_CARD} ${REPLIES_STILL_GO}`, act("Add a card", ADD_CARD)],
  );
  assert.deepEqual(open.notes, [], "a verified business says nothing of itself");
  // The business, or the account, not known (or an id that is not digits): no page that would open on nothing; Business Suite instead.
  for (const over of [{ owner_business_id: null }, { waba_id: null }, { owner_business_id: "41054 x&y=1" }]) {
    const r = whatsappRow(channel({ ...AVAILABLE, has_payment_method: false, ...over }));
    assert.equal(r.sentence, `${NEEDS_CARD} ${REPLIES_STILL_GO} ${IN_SUITE}`, JSON.stringify(over));
    assert.equal(r.verb, null, JSON.stringify(over));
  }
  // One on file that Meta names a problem with (a declined card, no timezone or currency on the account): Fix the card.
  const failing = whatsappRow(channel({ ...AVAILABLE, has_payment_method: true, problems: [CARD_ERROR] }));
  assert.deepEqual(
    [failing.stateWords, failing.sentence, failing.verb],
    ["Waiting on you", `${CARD_FAILING} ${REPLIES_STILL_GO}`, act("Fix the card", ADD_CARD)],
  );
  // One on file and nothing named: nothing of it; a problem that is not about payment, on a number Meta lets send: nothing of it either.
  assert.equal(whatsappRow(channel({ ...AVAILABLE, has_payment_method: true })).stateWords, "On");
  const other = whatsappRow(channel({ ...AVAILABLE, has_payment_method: null, problems: [BLOCKED.problems[1]] }));
  assert.deepEqual([other.stateWords, other.verb, said(other)], ["On", LIBRARY, []]);
});

test("a number Meta has stopped for anything else needs attention: Meta's first problem about messaging, in its words, and WhatsApp Manager; its calling problems are never shown, and the payment method outranks the rest", () => {
  const r = whatsappRow(channel(RESTRICTED));
  assert.deepEqual([r.state, r.stateWords], ["attention", "Needs attention"]);
  assert.equal(r.sentence, "Meta has stopped this number from sending: Account has been restricted.");
  assert.deepEqual(r.verb, act("Open WhatsApp Manager", MANAGER));
  assert.deepEqual(r.notes, [notVerified("250")]);
  assert.ok(
    !JSON.stringify(r).includes("SIP"),
    "Chanlytics does not use WhatsApp calling: its problems are nobody's to fix here",
  );
  // Calling problems alone: Meta stopped it, and gave no reason the row can give.
  const quiet = whatsappRow(channel({ ...RESTRICTED, problems: SIP }));
  assert.equal(quiet.sentence, BLOCKED_SENTENCE);
  assert.ok(!JSON.stringify(quiet).includes("SIP"));
  // The live row of 6 October: two calling problems, then the payment method, then the verification. It led with SIP; it waits on the card.
  const live = whatsappRow(
    channel({
      ...RESTRICTED,
      problems: [
        ...SIP,
        CARD_ERROR,
        {
          entity: "BUSINESS",
          code: null,
          said: "The Business has not passed business verification.",
          fix: "Visit business settings and start or resolve the business verification request.",
        },
      ],
      notes: [
        "Your display name has not been approved yet. Your message limit will increase after the display name is approved.",
      ],
      name_status: "PENDING_REVIEW",
    }),
  );
  assert.deepEqual(
    [live.stateWords, live.sentence, live.verb],
    ["Waiting on you", CARD_FAILING, act("Fix the card", ADD_CARD)],
  );
  assert.deepEqual(
    live.notes,
    [notVerified("250")],
    "one line for the verification, with Meta's page; nothing of a name in review",
  );
  assert.ok(!JSON.stringify(live).includes("display name"), "Meta's own note is not repeated");
});

test("a number Meta blocks without saying why says that much and nothing it did not say", () => {
  const r = whatsappRow(channel({ ...BLOCKED, problems: [], verification: null, limit: null }));
  assert.deepEqual([r.state, r.stateWords, r.sentence], ["attention", "Needs attention", BLOCKED_SENTENCE]);
  assert.deepEqual(
    r.verb,
    act("Open WhatsApp Manager", MANAGER_ANYWHERE),
    "Meta's own page, on no account in particular",
  );
  assert.deepEqual(said(r), [], "no problem, no verification read: nothing is invented");
});

test("a number Meta limits stays On: Meta's own note, a name in review and a verified business say nothing, since none changes what the owner can do", () => {
  const plain = whatsappRow(channel(null));
  const r = whatsappRow(channel(LIMITED));
  assert.deepEqual([r.state, r.stateWords, r.verb], ["connected", "On", LIBRARY]);
  assert.equal(r.sentence, plain.sentence, "the sentence is the row's own: receiving, and its rating");
  assert.deepEqual(r.notes, []);
});

test("a declined or lapsed name is said, with where to change it; a name Meta approved, a business with no daily limit, and a number it has said nothing about say nothing of themselves", () => {
  const declined = whatsappRow(channel({ ...AVAILABLE, name_status: "DECLINED", limit: "TIER_UNLIMITED" }));
  assert.deepEqual(said(declined), ["Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager."]);
  assert.equal(declined.state, "connected");
  const expired = whatsappRow(channel({ ...AVAILABLE, name: null, name_status: "EXPIRED", verification: null }));
  assert.deepEqual(said(expired), ["The request for your display name expired — submit it again in WhatsApp Manager."]);
  assert.deepEqual(said(whatsappRow(channel(AVAILABLE))), []);
  const unread = whatsappRow(channel(null));
  assert.deepEqual(said(unread), [], "nothing read yet: as it was, its quality and its last message");
  assert.match(unread.sentence, /^Receiving · last message 2h ago/);
});

test("a row says one daily limit: in the sentence once the rating is known (the quality webhook's tier, else the standing's), and in the verification's note until then", () => {
  const unverified = { ...AVAILABLE, verification: "not_verified", limit: "TIER_250" };
  const before = whatsappRow(channel(unverified, { quality: "GREEN" }));
  assert.match(before.sentence, /up to 250 new conversations a day/, before.sentence);
  assert.deepEqual(before.notes, [notVerified(null)], "the note does not say the cap the sentence says");
  const moved = whatsappRow(channel(unverified, { quality: "GREEN", messaging_limit: "TIER_1K" }));
  assert.match(moved.sentence, /up to 1,000 new conversations a day/, moved.sentence);
  assert.ok(!JSON.stringify(moved).includes("250"), "never the older tier beside the newer one");
  const unknown = whatsappRow(channel(unverified));
  assert.doesNotMatch(unknown.sentence, /conversations a day/, "no rating yet: the sentence says nothing of a limit");
  assert.deepEqual(unknown.notes, [notVerified("250")], "so the note does");
  assert.deepEqual(whatsappRow(channel(unverified, { messaging_limit: "TIER_1K" })).notes, [notVerified("1,000")]);
});

test("an unverified business is said at the tier Meta gave, else at the start Meta gives a new business; one in Meta's review is said so; a verified one says nothing", () => {
  const at = (over) => whatsappRow(channel({ ...AVAILABLE, ...over })).notes;
  assert.deepEqual(at({ verification: "pending", limit: "TIER_50" }), [
    {
      text: "Meta is reviewing your business's verification: until then customers see your number instead of your name, and you can start conversations with up to 50 people a day.",
      link: { label: "See it in Meta", href: SECURITY_CENTER },
    },
  ]);
  assert.deepEqual(at({ verification: "not_verified", limit: "UNTIERED" }), [notVerified("250")]);
  assert.deepEqual(
    at({ verification: "not_verified", limit: null }),
    at({ verification: "rejected", limit: "UNTIERED" }),
  );
  assert.deepEqual(at({ verification: "verified", limit: "UNTIERED" }), []);
  assert.deepEqual(at({ verification: null }), [], "nothing read of the business: nothing said of it");
});

test("a word of Meta's that is not one of the three is kept and not guessed: the row neither flags it nor calls it fine", () => {
  const r = whatsappRow(channel({ ...BLOCKED, can_send: "RESTRICTED", problems: [], verification: null, limit: null }));
  assert.deepEqual([r.state, r.stateWords], ["connected", "On"]);
  assert.equal(r.sentence, whatsappRow(channel(null)).sentence);
});

test("a switched-off number says nothing of what Meta holds, and a flagged one is still flagged", () => {
  const off = whatsappRow(channel(BLOCKED, { status: "disabled" }));
  assert.deepEqual([off.state, off.stateWords, off.notes], ["off", "Off", []]);
  const flagged = whatsappRow(channel(LIMITED, { quality: "RED", quality_event: "FLAGGED" }));
  assert.deepEqual([flagged.state, flagged.stateWords], ["attention", "Needs attention"], "Meta's rating still counts");
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
  // A number with no payment method can stay AVAILABLE (its replies still go out): it is asked about again, as a number that
  // cannot send is, so a payment method added since shows as fixed at the next opening.
  const unpaid = { ...AVAILABLE, has_payment_method: false };
  assert.equal(
    standingNeedsRead(held(unpaid, 11 * MIN), NOW),
    true,
    "AVAILABLE with no payment method, eleven minutes on",
  );
  assert.equal(standingNeedsRead(held(unpaid, 9 * MIN), NOW), false, "and not before ten");
  assert.equal(
    standingNeedsRead(held({ ...AVAILABLE, has_payment_method: null }, 11 * MIN), NOW),
    false,
    "a payment method that could not be read is not one that is missing",
  );
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

test("the owner's alert: a payment method missing or failing says what Meta stops and where to mend it; anything else says Meta's first problem about messaging and its fix, never a calling problem", () => {
  assert.deepEqual(standingAlertWords("+13055550188", BLOCKED), {
    subject: "WhatsApp can't start conversations from your number",
    body: `WhatsApp can't start conversations from +1 (305) 555-0188: ${CARD_FAILING} Fix it in Meta Business Suite › Billing.`,
  });
  assert.equal(
    standingAlertWords("+13055550188", { ...BLOCKED, has_payment_method: false }).body,
    `WhatsApp can't start conversations from +1 (305) 555-0188: ${NEEDS_CARD} ${IN_SUITE}`,
  );
  assert.deepEqual(
    standingAlertWords("+13055550188", {
      ...RESTRICTED,
      problems: [...SIP, { entity: "WABA", code: null, said: "Account restricted.", fix: null }],
    }),
    {
      subject: "WhatsApp can't send from your number",
      body: "WhatsApp can't send from +1 (305) 555-0188: Account restricted.",
    },
  );
  assert.equal(
    standingAlertWords("+13055550188", RESTRICTED).body,
    "WhatsApp can't send from +1 (305) 555-0188: Account has been restricted. Appeal in WhatsApp Manager.",
  );
  assert.equal(
    standingAlertWords(null, { ...RESTRICTED, problems: [] }).body,
    "WhatsApp can't send from your number. Meta did not say why; open Connections to read what it holds.",
  );
});

test("a campaign's readiness reads the same standing as the row: a number whose row waits on the owner or needs attention carries no campaign, refused in the row's sentence; any other standing, or none, leaves the rating's reading", () => {
  const good = numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" });
  const unpaid = { ...AVAILABLE, has_payment_method: false };
  const held = numberHealthWithStanding(good, unpaid);
  assert.deepEqual([held.canSend, held.tone, held.refusal], [false, "danger", whatsappRow(channel(unpaid)).sentence]);
  assert.deepEqual([held.label, held.limitPerDay], [good.label, good.limitPerDay], "the rating's own words stay");
  assert.equal(numberHealthWithStanding(good, BLOCKED).refusal, whatsappRow(channel(BLOCKED)).sentence);
  assert.equal(numberHealthWithStanding(good, RESTRICTED).refusal, whatsappRow(channel(RESTRICTED)).sentence);
  assert.equal(numberHealthWithStanding(good, LIMITED), good, "limited: Meta lets it send, and the row is On");
  assert.equal(numberHealthWithStanding(good, null), good, "nothing read: nothing changes");
  assert.equal(
    numberHealthWithStanding(good, { ...RESTRICTED, can_send: "RESTRICTED", problems: [] }),
    good,
    "a word that is none of the three is not taken for BLOCKED",
  );
});

test("Meta's decision on a display name is said to the owner in the row's own words: approved is good news kept quiet, a decline says the way on and Meta's reason, and a decision that is in progress or none of Meta's four has no notice", () => {
  // The real shape (Meta, webhooks reference: phone_number_name_update): decision, requested_verified_name, rejection_reason.
  assert.deepEqual(nameDecisionWords("APPROVED", "Harbor Moving", null), {
    subject: "WhatsApp display name approved",
    body: "Meta approved the display name “Harbor Moving”.",
    alert: false,
  });
  assert.deepEqual(nameDecisionWords("REJECTED", "Harbor Moving", "NAME_FORMAT_UNACCEPTABLE"), {
    subject: "WhatsApp display name declined",
    body: "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager. Meta's reason: name format unacceptable.",
    alert: true,
  });
  for (const reason of [null, undefined, "UNKNOWN", "NONE", "", 7])
    assert.equal(
      nameDecisionWords("REJECTED", "Harbor Moving", reason).body,
      "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager.",
      `a reason Meta did not give is not said (${String(reason)})`,
    );
  assert.equal(
    nameDecisionWords("DECLINED", null, null).body,
    "Meta declined your display name — change it in WhatsApp Manager.",
    "the Graph's own word for the same decision, and a name the notice did not carry",
  );
  for (const quiet of ["PENDING", "DEFERRED", "approved", "MAYBE", "", null, undefined, 7])
    assert.equal(nameDecisionWords(quiet, "Harbor Moving", null), null, String(quiet));
  // The row says the decline in the same sentence the notice does: one fact, one set of words.
  const declined = standingAfterNameDecision({ ...LIMITED, notes: [] }, "REJECTED", "Harbor Moving & Sons");
  assert.equal(
    said(whatsappRow(channel(declined)))[0],
    nameDecisionWords("REJECTED", "Harbor Moving & Sons", null).body,
  );
});

test("a decision on the display name corrects the kept standing and nothing else of it: the name it was about and the Graph's word for its status; a decision that is none of Meta's four corrects nothing", () => {
  const was = { ...LIMITED, name: "Harbor Nails" };
  const after = (decision, name) => standingAfterNameDecision(was, decision, name);
  assert.deepEqual(after("APPROVED", "Harbor Moving"), { ...was, name: "Harbor Moving", name_status: "APPROVED" });
  assert.deepEqual(after("REJECTED", "Harbor Moving"), { ...was, name: "Harbor Moving", name_status: "DECLINED" });
  assert.equal(after("DECLINED", "Harbor Moving").name_status, "DECLINED", "the Graph's word is taken too");
  assert.equal(after("PENDING", "Harbor Moving").name_status, "PENDING_REVIEW");
  assert.equal(after("DEFERRED", "Harbor Moving").name_status, "PENDING_REVIEW");
  for (const name of [undefined, null, "", "   ", 7])
    assert.equal(
      after("APPROVED", name).name,
      "Harbor Nails",
      `no name in the notice keeps the name (${String(name)})`,
    );
  assert.equal(after("APPROVED", "  Harbor Moving  ").name, "Harbor Moving", "trimmed");
  for (const decision of ["MAYBE", "approved", "", null, undefined, 7, {}])
    assert.equal(after(decision, "Harbor Moving"), null, String(decision));
  assert.deepEqual(was, { ...LIMITED, name: "Harbor Nails" }, "the standing it was given is not changed");
  const kept = after("APPROVED", "Harbor Moving");
  assert.deepEqual(
    [kept.can_send, kept.problems, kept.notes, kept.verification, kept.limit],
    [was.can_send, was.problems, was.notes, was.verification, was.limit],
    "the rest is as it was",
  );
  assert.deepEqual(
    said(whatsappRow(channel({ ...kept, notes: [] }))),
    [],
    "an approved name leaves the row's review note: it says nothing of a name that is fine",
  );
});

test("a connected WhatsApp row says nothing of what WhatsApp costs (the Connect row and Billing do); every other row has no notes", () => {
  for (const ch of [
    channel(null),
    channel(LIMITED),
    channel(BLOCKED),
    channel(null, { quality: "RED", quality_event: "FLAGGED" }),
  ]) {
    const r = whatsappRow(ch);
    assert.ok(!said(r).some((n) => /bills|charged|free/.test(n)), `${r.stateWords}: a price stands in nobody's way`);
  }
  const rows = connectionRows({ ...base(), channels: [channel(null)] }, NOW);
  for (const r of rows.filter((x) => x.kind !== "whatsapp")) assert.deepEqual(r.notes, [], r.kind);
});

test("a connected number nobody has written to yet says how to try it from a phone, as a link to press built from its number; the row says it itself for the number's first day, and a number that waits on its owner's card says it too; once a message has arrived, or when the row is off, needs attention or has no number, it says nothing of the kind", () => {
  // 8 October 2026: an owner took a number that had just connected for one that had not, since WhatsApp on their phone still
  // said "invite". The note was plain words behind the row's press, and a new account (no card yet) did not say it at all.
  const TRY = {
    text: "Try it from your phone with this link, not by searching your contacts: it opens the chat even while WhatsApp there still says the number isn't on WhatsApp.",
    link: { label: "wa.me/13055550188", href: "https://wa.me/13055550188?text=Hi" },
  };
  const unwritten = { last_inbound_at: null };
  assert.deepEqual(whatsappRow(channel(null, unwritten)).notes, [TRY]);
  assert.deepEqual(whatsappRow(channel(AVAILABLE, unwritten)).notes, [TRY], "a verified business adds nothing");
  assert.deepEqual(
    whatsappRow(channel({ ...AVAILABLE, verification: "not_verified" }, unwritten)).notes,
    [TRY, notVerified("2,000")],
    "the way to try it first, then what Meta holds (the tier Meta gave, no rating read yet)",
  );
  // Its first day: the row says it without being asked. After it, and for a row whose clock reads ahead of ours, it is
  // explanation again, behind the press beside the row's name.
  const HOUR = 60 * MIN;
  const connected = (ms) => whatsappRow(channel(null, { ...unwritten, created_at: ago(ms) })).notes;
  assert.deepEqual(connected(2 * MIN), [{ ...TRY, live: true }], "a number that connected two minutes ago");
  assert.deepEqual(connected(23 * HOUR), [{ ...TRY, live: true }], "still its first day");
  assert.deepEqual(connected(25 * HOUR), [TRY], "the day after: there to be asked for, no longer said");
  assert.deepEqual(connected(-5 * MIN), [TRY], "a row made in the future is no new number");
  assert.deepEqual(whatsappRow(channel(null)).notes, [], "a message has arrived");
  assert.deepEqual(
    whatsappRow(channel(null, { ...unwritten, created_at: ago(2 * MIN), last_inbound_at: ago(MIN) })).notes,
    [],
  );
  assert.deepEqual(whatsappRow(channel(null, { ...unwritten, status: "disabled" })).notes, [], "off");
  // A new account has no card yet, so its row waits on its owner from the moment it connects: the way to try it is said
  // there too, first, since Meta lets the number answer a customer who writes first. A number Meta reports BLOCKED answers
  // nobody, whether over the card or anything else, so it is not one to try.
  const newAccount = { ...AVAILABLE, has_payment_method: false };
  const waiting = whatsappRow(channel(newAccount, { ...unwritten, created_at: ago(2 * MIN) }));
  assert.equal(waiting.stateWords, "Waiting on you");
  assert.deepEqual(waiting.notes[0], { ...TRY, live: true });
  for (const [standing, words] of [
    [BLOCKED, "Waiting on you"],
    [RESTRICTED, "Needs attention"],
  ]) {
    const stopped = whatsappRow(channel(standing, { ...unwritten, created_at: ago(2 * MIN) }));
    assert.equal(stopped.stateWords, words);
    assert.ok(
      !stopped.notes.some((n) => n.text === TRY.text),
      `${words}, BLOCKED: a number Meta has stopped is not one to try`,
    );
  }
  // A number connected again keeps its row, and with it the row's birth: its first day runs from the connection's own
  // stamp, and a row no connection has stamped falls back to its birth.
  const again = (connectedAgo) =>
    whatsappRow(channel(null, { ...unwritten, created_at: ago(30 * 24 * HOUR), connected_at: ago(connectedAgo) }))
      .notes;
  assert.deepEqual(again(2 * MIN), [{ ...TRY, live: true }], "connected again two minutes ago");
  assert.deepEqual(again(25 * HOUR), [TRY], "connected again yesterday");
  assert.deepEqual(
    whatsappRow(channel(null, { ...unwritten, quality: "RED", quality_event: "FLAGGED" })).notes,
    [],
    "flagged: needs attention",
  );
  assert.deepEqual(whatsappRow(channel(null, { ...unwritten, number_e164: null })).notes, [], "no number, no link");
  assert.deepEqual(
    whatsappRow(channel(null, { ...unwritten, number_e164: "+442079460958" })).notes[0].link,
    { label: "wa.me/442079460958", href: "https://wa.me/442079460958?text=Hi" },
    "any country's number, digits only",
  );
  // The toast a connection ends with opens the same link.
  assert.equal(tryItLink("+1 (305) 555-0188"), TRY.link.href);
  assert.equal(tryItLink(null), null);
});

test("a wa.me link takes a number's digits, no plus, spaces or brackets, from the number as E.164 or as it is shown; too few digits is no link", () => {
  assert.equal(waMeDigits("+13055550188"), "13055550188");
  assert.equal(waMeDigits("+1 (305) 555-0188"), "13055550188");
  for (const none of [null, undefined, "", "12", "+1 305", "abc"]) assert.equal(waMeDigits(none), null, String(none));
  // The link itself: the chat on that number, with words ready to send where there are any.
  assert.equal(waMeLink("+1 (305) 555-0188"), "https://wa.me/13055550188");
  assert.equal(waMeLink("+13055550188", "Hi there"), "https://wa.me/13055550188?text=Hi%20there");
  assert.equal(waMeLink("12", "Hi"), null);
});
