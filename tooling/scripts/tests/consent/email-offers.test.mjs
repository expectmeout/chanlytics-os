/**
 * Offers by email (One message, every channel, step 4; the campaigns-on-every-channel spec, 4.1, 4.5, 4.6 and the decisions
 * 2, 11 and 12): the rule for every cell of the email row of the consent table, when a workspace may send an offer and the
 * reason it may not, the gates that pause offers, the foot and the page words a customer reads, and the facts a person's
 * page and Setup say. Pure: the door, the wire, the unsubscribe page and the database each have their own file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_WORDS,
  OFFERS_BY_EMAIL_WORDS,
  OFFERS_PAUSED_WORDS,
  OFFER_GATES,
  PURPOSE_REFUSALS,
  HELD_REASONS,
  MARKETING_LINE,
  channelChoices,
  channelNeverCarries,
  channelRefuses,
  channelsReady,
  consentChangeWords,
  consentChangeOf,
  emailFoot,
  emailFootHtml,
  emailOffersOpen,
  heldWords,
  mayMessageFor,
  offerGate,
  offerPauseOf,
  offerUnsubscribeWords,
  offersPausedLine,
  personReachOf,
  previewOn,
  reachFor,
  reachSplit,
  relationshipOnRecord,
  setupSteps,
  whyNotReceive,
  EMAIL_STOP_PATTERN,
  EMAIL_UNSUBSCRIBE_PATTERN,
  OPT_OUT_PATTERN,
} from "@chanlytics/contracts";
import { personRow, ROW_NOW, daysAgo } from "./_person-row.mjs";

/** A person's consent as their row says it: People's builder over a people_list row (consentOf), nobody looking. */
const consentOf = (dto) => personRow(dto).consent;

const OPEN = { campaigns: true, address: true, paused: null };
const ready = (offers) =>
  channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: true, domain: true, ...(offers ? { offers } : {}) },
  });

/* ------------------------------------------------------- the rule, cell by cell -- */

test("the email row of the consent table: a message about a visit needs no yes, an offer needs not-unsubscribed and a relationship or their own yes", () => {
  const ask = (c, purpose, proactive = true) => mayMessageFor(c, purpose, { proactive, channel: "email" });
  const yes = { ok: true, reason: null };
  // Conversational, proactive or not: an address is all it asks (the door finds it unsuppressed). No yes, no relationship.
  for (const proactive of [true, false])
    assert.deepEqual(ask({ consent: "unknown", email_marketing: "unknown" }, "conversational", proactive), yes);
  // Marketing, over every answer and every relationship fact. The rows of the spec's table, in the order it states them.
  const cell = (email_marketing, has_relationship) =>
    ask({ consent: "opted_in", email_marketing, has_relationship }, "marketing");
  assert.deepEqual(cell("opted_in", false), yes, "asked for offers by email themselves: no relationship needed");
  assert.deepEqual(cell("opted_in", true), yes);
  assert.deepEqual(cell("unknown", true), yes, "a relationship on record, and nobody has said no");
  assert.deepEqual(
    cell("unknown", false),
    { ok: false, reason: "no_marketing_consent" },
    "an address alone is not enough",
  );
  assert.deepEqual(cell("unknown", undefined), { ok: false, reason: "no_marketing_consent" });
  assert.deepEqual(cell("unknown", null), { ok: false, reason: "no_marketing_consent" });
  assert.deepEqual(
    cell("opted_out", true),
    { ok: false, reason: "unsubscribed" },
    "an unsubscribe outranks any relationship",
  );
  assert.deepEqual(cell("opted_out", false), { ok: false, reason: "unsubscribed" });
  // A row read without the answer cannot tell whether they unsubscribed: it fails closed, relationship or not.
  assert.deepEqual(cell(undefined, true), { ok: false, reason: "no_marketing_consent" });
  assert.deepEqual(cell(null, true), { ok: false, reason: "no_marketing_consent" });
  // DECISION (3 Oct 2026): a recorded no to offers elsewhere (on WhatsApp) bars an offer by email, whatever email's own
  // answer and the relationship say, even a yes to offers by email. Their unsubscribe is still the reason said first.
  const declined = (email_marketing, has_relationship) =>
    ask({ consent: "opted_in", marketing_consent: "opted_out", email_marketing, has_relationship }, "marketing");
  const noOffers = { ok: false, reason: "no_marketing_consent" };
  assert.deepEqual(declined("unknown", true), noOffers, "a customer who said no to offers on WhatsApp");
  assert.deepEqual(
    declined("opted_in", true),
    noOffers,
    "even one who asked for them by email: the no wins until it is reset",
  );
  assert.deepEqual(declined("opted_in", false), noOffers);
  assert.deepEqual(
    declined("opted_out", true),
    { ok: false, reason: "unsubscribed" },
    "their unsubscribe is said first",
  );
  // Only a no bars it: not having been asked about offers elsewhere ('unknown'), or a yes there, leaves the cell as it was.
  for (const marketing_consent of ["unknown", "opted_in", undefined, null])
    assert.deepEqual(
      ask({ consent: "opted_in", marketing_consent, email_marketing: "unknown", has_relationship: true }, "marketing"),
      yes,
      `marketing_consent ${marketing_consent}`,
    );
  // And a message about a visit is not an offer: declining offers is not a request to stop hearing about your visit.
  assert.deepEqual(ask({ consent: "unknown", marketing_consent: "opted_out" }, "conversational"), yes);
  // STOP and do-not-contact stay all-channel, whatever else the row says.
  for (const stopped of [{ consent: "opted_out" }, { dnc: true }])
    for (const purpose of ["conversational", "marketing"])
      assert.deepEqual(
        ask({ email_marketing: "opted_in", has_relationship: true, ...stopped }, purpose),
        { ok: false, reason: "opted_out" },
        `${JSON.stringify(stopped)} ${purpose}`,
      );
  // The other channels' cells do not move: a WhatsApp offer asks marketing_consent, a text carries none.
  assert.deepEqual(
    mayMessageFor({ marketing_consent: "opted_in", email_marketing: "opted_out" }, "marketing", {
      proactive: true,
      channel: "whatsapp",
    }),
    yes,
    "an unsubscribe from email is no answer to a WhatsApp offer",
  );
});

test("a relationship on record is what the row holds: they wrote in their own words, they called, or they have a deal", () => {
  assert.equal(relationshipOnRecord({ lastWroteAt: "2026-09-01T10:00:00Z" }), true);
  assert.equal(relationshipOnRecord({ lastInboundCallAt: "2026-09-01T10:00:00Z" }), true);
  assert.equal(relationshipOnRecord({ hasDeal: true }), true);
  assert.equal(relationshipOnRecord({}), false);
  assert.equal(relationshipOnRecord({ lastWroteAt: null, lastInboundCallAt: null, hasDeal: false }), false);
  // A person's row says it in the columns people_list returns: a deal's id is any deal, a call they placed is a call.
  const of = (over) => consentOf({ last_inbound_at: null, last_wrote_at: null, ...over }).relationship;
  assert.equal(of({}), false, "someone the finder found, or an address typed in");
  assert.equal(of({ last_wrote_at: daysAgo(3), last_inbound_at: daysAgo(3) }), true);
  assert.equal(of({ last_inbound_call_at: daysAgo(3) }), true);
  assert.equal(of({ deal_id: "d1" }), true);
  // What they last SENT is not what they last WROTE: an out-of-office or a list's mail from their address is a program, not
  // them dealing with the business. last_inbound_at carries it (the thread shows it); last_wrote_at does not.
  assert.equal(
    of({ last_inbound_at: daysAgo(3), last_wrote_at: null }),
    false,
    "an automatic reply alone is no relationship on record",
  );
  assert.equal(
    of({ last_inbound_at: daysAgo(3) }),
    false,
    "a row read before 00288 has no last_wrote_at: none on record",
  );
});

test("why a person is not reached by email: no address, a dead address, a stop, their unsubscribe, no yes", () => {
  const row = (consent = {}, over = {}) => ({
    phone: null,
    email: "dani@example.com",
    emailSuppressed: false,
    consent: {
      state: "unknown",
      dnc: false,
      marketing: "unknown",
      channels: null,
      marketingChannels: null,
      ...consent,
    },
    ...over,
  });
  const offers = (consent, over) => whyNotReceive(row(consent, over), "marketing", "email");
  assert.equal(offers({ emailMarketing: "unknown", relationship: true }), null);
  assert.equal(offers({ emailMarketing: "opted_in", relationship: false }), null);
  assert.equal(offers({ emailMarketing: "unknown", relationship: false }), "no_yes");
  assert.equal(
    offers({ emailMarketing: "opted_out", relationship: true }),
    "unsubscribed",
    "their own no to email is its own reason",
  );
  assert.equal(offers({ emailMarketing: null, relationship: true }), "no_yes", "a row without the answer fails closed");
  assert.equal(offers({ state: "opted_out", emailMarketing: "opted_in", relationship: true }), "stopped");
  assert.equal(offers({ dnc: true, emailMarketing: "opted_in", relationship: true }), "stopped");
  assert.equal(offers({ emailMarketing: "opted_in" }, { email: null }), "no_address");
  assert.equal(
    offers({ emailMarketing: "opted_in" }, { emailSuppressed: true }),
    "no_address",
    "a bounced address is no address",
  );
  // A message about a visit goes to an unsubscribed address: unsubscribe is not STOP (decision 12).
  assert.equal(whyNotReceive(row({ emailMarketing: "opted_out" }), "conversational", "email"), null);
});

test("an unsubscribe is the strictest reason after a stop; the words for every place that says it", () => {
  const how = { channels: ["email"], ready: ready(OPEN) };
  const person = (consent) => ({
    phone: null,
    email: "dani@example.com",
    lastChannel: null,
    consent: {
      state: "opted_in",
      dnc: false,
      marketing: "unknown",
      channels: null,
      marketingChannels: null,
      ...consent,
    },
  });
  assert.deepEqual(reachFor(person({ emailMarketing: "opted_out", relationship: true }), "marketing", how), {
    channel: null,
    held: "unsubscribed",
  });
  assert.deepEqual(reachFor(person({ emailMarketing: "unknown", relationship: true }), "marketing", how), {
    channel: "email",
    held: null,
  });
  // Among several channels' reasons, a stop outranks an unsubscribe, and an unsubscribe a missing yes or number.
  const all = { channels: ["whatsapp", "email"], ready: ready(OPEN) };
  assert.equal(
    reachFor({ ...person({ emailMarketing: "opted_out", relationship: true }), phone: "+15550100" }, "marketing", all)
      .held,
    "unsubscribed",
  );
  assert.equal(
    reachFor({ ...person({ state: "opted_out", emailMarketing: "opted_out" }), phone: "+15550100" }, "marketing", all)
      .held,
    "stopped",
  );
  const split = reachSplit(
    [person({ emailMarketing: "opted_out", relationship: true }), person({ emailMarketing: "opted_in" })],
    "marketing",
    how,
  );
  assert.deepEqual([split.byChannel.email, split.heldBy], [1, { unsubscribed: 1 }]);
  // The owner's words: the composer's held-back line, the run's report, and the door's reason on a thread.
  assert.match(heldWords("unsubscribed", "marketing"), /unsubscribed from offers by email.*still reach them/);
  assert.equal(HELD_REASONS.unsubscribed, "unsubscribed");
  assert.match(PURPOSE_REFUSALS.unsubscribed, /replies and messages about their visits still can/);
  for (const reason of ["email_offers_paused", "email_marketing_disabled", "outreach_without_unsubscribe"]) {
    assert.ok(PURPOSE_REFUSALS[reason] && HELD_REASONS[reason], `${reason} has words in both places`);
  }
  assert.ok(HELD_REASONS.no_business_address, "a run holds a person for want of the address");
});

/* ---------------------------------------- when a workspace may send an offer -- */

test("offers by email go only where the campaigns domain is verified, the business has its address, and nothing is paused: each with the reason that is true, in the order a person can act on", () => {
  const paused = { at: "2026-10-01T10:00:00Z", reason: "complaints" };
  const verdict = (o) => emailOffersOpen(o, CHANNEL_WORDS.unchecked);
  assert.deepEqual(verdict(OPEN), { ok: true, why: null, paused: null });
  assert.equal(
    verdict({ ...OPEN, campaigns: false }).why,
    "Offers by email start once the campaigns domain is set up.",
  );
  assert.equal(verdict({ ...OPEN, address: false }).why, "Add your business's address to send offers by email.");
  assert.equal(verdict({ ...OPEN, paused }).why, OFFERS_BY_EMAIL_WORDS.paused);
  assert.equal(
    verdict({ ...OPEN, campaigns: null }).why,
    CHANNEL_WORDS.unchecked,
    "an edge that could not be asked is not an answer",
  );
  assert.equal(
    verdict({ campaigns: false, address: false, paused }).why,
    OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
    "the deployment's first",
  );
  assert.equal(
    verdict({ campaigns: true, address: false, paused }).why,
    OFFERS_BY_EMAIL_WORDS.noAddress,
    "then the business's own",
  );
  assert.deepEqual(verdict({ ...OPEN, paused }).paused, paused);

  // What a tick and a route read: channelRefuses says why, for offers only, and never for a message about a visit.
  assert.equal(channelRefuses("email", "marketing", ready(OPEN)), null);
  assert.equal(
    channelRefuses("email", "marketing", ready({ ...OPEN, campaigns: false })),
    OFFERS_BY_EMAIL_WORDS.noCampaignsDomain,
  );
  assert.equal(
    channelRefuses("email", "marketing", ready({ ...OPEN, address: false })),
    OFFERS_BY_EMAIL_WORDS.noAddress,
  );
  assert.equal(
    channelRefuses("email", "marketing", ready()),
    CHANNEL_WORDS.noOffersByEmailYet,
    "no facts: closed, as a deployment without the domain",
  );
  assert.equal(
    channelRefuses("email", "conversational", ready({ ...OPEN, campaigns: false })),
    null,
    "reminders and replies are never held by it",
  );
  assert.equal(
    channelRefuses("sms", "marketing", ready(OPEN)),
    CHANNEL_WORDS.noOffersByText,
    "texts carry no offers, whatever else is true",
  );
  assert.equal(channelNeverCarries("email", "marketing"), null);
  assert.deepEqual(
    channelChoices(ready(OPEN), "marketing").map((c) => [c.channel, c.ok]),
    [
      ["whatsapp", true],
      ["sms", false],
      ["email", true],
    ],
  );
  assert.deepEqual(
    channelChoices(ready({ ...OPEN, paused }), "marketing").find((c) => c.channel === "email"),
    { channel: "email", ok: false, why: OFFERS_BY_EMAIL_WORDS.paused },
  );
  // Email itself not ready (no mailbox): the offer's reason is the first the page says only while the deployment cannot send.
  const noMailbox = channelsReady({
    whatsapp: null,
    textLine: null,
    email: { mailbox: false, domain: true, offers: OPEN },
  });
  assert.equal(channelRefuses("email", "marketing", noMailbox), null, "the offer's own rule is open");
  assert.equal(
    channelChoices(noMailbox, "marketing").find((c) => c.channel === "email").ok,
    false,
    "but the mailbox is not there",
  );
});

test("the person is picked for email when offers can go, and held with the reason when they cannot", () => {
  const person = (consent = {}) => ({
    phone: "+15550100",
    email: "dani@example.com",
    lastChannel: "email",
    consent: {
      state: "opted_in",
      dnc: false,
      marketing: "unknown",
      channels: ["whatsapp"],
      marketingChannels: null,
      emailMarketing: "unknown",
      relationship: true,
      ...consent,
    },
  });
  const how = (r) => ({ channels: ["whatsapp", "email"], ready: ready(r) });
  assert.deepEqual(
    reachFor(person(), "marketing", how(OPEN)),
    { channel: "email", held: null },
    "they last wrote by email",
  );
  assert.deepEqual(
    reachFor(person(), "marketing", how({ ...OPEN, campaigns: false })),
    { channel: null, held: "no_yes" },
    "WhatsApp offers need their yes there",
  );
  assert.deepEqual(
    reachFor(
      person({ marketing: "opted_in", marketingChannels: ["whatsapp"] }),
      "marketing",
      how({ ...OPEN, campaigns: false }),
    ),
    { channel: "whatsapp", held: null },
    "the offer is held to WhatsApp where the domain is not set: nothing changes for them",
  );
  // The reach any page counts: one answer, over every channel the workspace can send on now.
  const reach = (consent, r) => personReachOf(person(consent), r);
  assert.equal(reach({}, ready(OPEN)).canReceive.offers, true);
  assert.equal(reach({}, ready({ ...OPEN, address: false })).canReceive.offers, false);
  assert.equal(reach({ emailMarketing: "opted_out" }, ready(OPEN)).whyNot.offers, "unsubscribed");
  assert.equal(reach({}, null).canReceive.offers, false, "a read that could not be made counts WhatsApp alone");
});

/* ------------------------------------------------------------------ the gates -- */

test("the gates on offers by email: complaints above 0.1% of the last 1,000 (judged over at least 200), hard bounces above 2% of the last 500 (over at least 100)", () => {
  assert.deepEqual(OFFER_GATES, {
    complaints: { window: 1000, above: 0.001, minimum: 200 },
    bounces: { window: 500, above: 0.02, minimum: 100 },
  });
  const gate = (c) => offerGate({ complaintSample: 0, complaints: 0, bounceSample: 0, bounces: 0, ...c });
  assert.equal(gate({}), null, "a workspace that has sent none");
  // 1 in 1,000 is exactly 0.1%: not above. 2 in 1,000 is.
  assert.equal(gate({ complaintSample: 1000, complaints: 1 }), null);
  assert.equal(gate({ complaintSample: 1000, complaints: 2 }), "complaints");
  // The minimum sample: a rate over a handful of offers is noise, so a gate says nothing below it. One complaint among
  // thirty is 3%, and no gate (it was one, before the minimum; a workspace's first offers paused it at once).
  assert.equal(
    gate({ complaintSample: 30, complaints: 1 }),
    null,
    "too few offers for a complaint rate to mean anything",
  );
  assert.equal(gate({ complaintSample: 199, complaints: 5 }), null, "one short of the minimum");
  assert.equal(gate({ complaintSample: 200, complaints: 1 }), "complaints", "at the minimum one complaint is 0.5%");
  // 10 in 500 is exactly 2%: not above. 11 is.
  assert.equal(gate({ bounceSample: 500, bounces: 10 }), null);
  assert.equal(gate({ bounceSample: 500, bounces: 11 }), "bounces");
  assert.equal(gate({ bounceSample: 40, bounces: 10 }), null, "ten of forty is 25%, over too few to judge");
  assert.equal(gate({ bounceSample: 99, bounces: 50 }), null, "one short of the minimum");
  assert.equal(gate({ bounceSample: 100, bounces: 2 }), null, "two in a hundred is exactly 2%: not above");
  assert.equal(gate({ bounceSample: 100, bounces: 3 }), "bounces");
  assert.equal(
    gate({ complaintSample: 1000, complaints: 5, bounceSample: 500, bounces: 50 }),
    "complaints",
    "complaints are the worse signal",
  );
  assert.equal(gate({ complaintSample: 1000, complaints: 1, bounceSample: 500, bounces: 11 }), "bounces");
  // Each gate has its own minimum: enough bounces to judge, too few complaints to.
  assert.equal(gate({ complaintSample: 150, complaints: 3, bounceSample: 150, bounces: 6 }), "bounces");
});

test("the pause as the mailbox keeps it, and what the Campaigns head and the tick say of it", () => {
  assert.equal(offerPauseOf(null, null), null);
  assert.equal(offerPauseOf(undefined, "complaints"), null, "no moment, no pause");
  assert.deepEqual(offerPauseOf("2026-10-01T10:00:00Z", "bounces"), { at: "2026-10-01T10:00:00Z", reason: "bounces" });
  assert.deepEqual(offerPauseOf("2026-10-01T10:00:00Z", "something else"), {
    at: "2026-10-01T10:00:00Z",
    reason: null,
  });
  assert.equal(offersPausedLine(null), null, "a quiet page says nothing");
  assert.equal(offersPausedLine(emailOffersOpen(OPEN, "")), null);
  const paused = emailOffersOpen({ ...OPEN, paused: offerPauseOf("2026-10-01T10:00:00Z", "complaints") }, "");
  assert.equal(
    offersPausedLine(paused),
    "Offers by email are paused: too many people marked offers as spam. Appointment messages and replies still go by email.",
  );
  assert.match(OFFERS_PAUSED_WORDS.head("bounces"), /did not accept them/);
  assert.match(OFFERS_PAUSED_WORDS.head(null), /complaints and bounces need a look/);
  // The channels say it too: the head can read it off the readiness it already holds.
  assert.deepEqual(
    ready({ ...OPEN, paused: offerPauseOf("2026-10-01T10:00:00Z", "complaints") }).email.offers.paused.reason,
    "complaints",
  );
});

/* ------------------------------------------------- what a customer reads -- */

test("the one foot builder, by kind: an offer says why they get it, who and where, and the Unsubscribe link; a visit's is as it was; a cold email's is the reach-out's", () => {
  const url = "https://app.example.com/u/abc_DEF-123";
  const offer = (why, address = "12 Main St, Springfield") =>
    emailFoot("Northside Studio", address, { kind: "offer", why, unsubscribeUrl: url });
  assert.equal(
    offer("customer"),
    `You're a customer of Northside Studio.\nNorthside Studio · 12 Main St, Springfield\nUnsubscribe: ${url}`,
  );
  assert.equal(
    offer("asked"),
    `You asked for offers from Northside Studio.\nNorthside Studio · 12 Main St, Springfield\nUnsubscribe: ${url}`,
  );
  // An offer's foot owes the postal address and a way out, and is never built without them, as a cold foot never is (the
  // sender holds the person before it comes to that, and the composers' preview says it instead of drawing one).
  for (const address of [null, "", "   "]) {
    assert.throws(() => offer("customer", address), /an offer foot names where and how to stop/, `${address}`);
    assert.throws(
      () => emailFootHtml("Northside Studio", address, { kind: "offer", why: "customer", unsubscribeUrl: url }),
      /an offer foot names where and how to stop/,
      `${address} (HTML)`,
    );
  }
  assert.throws(
    () => emailFoot("Northside Studio", undefined, { kind: "offer", why: "asked", unsubscribeUrl: url }),
    /an offer foot names where and how to stop/,
    "an address left out altogether",
  );
  assert.throws(
    () => emailFoot("Northside Studio", "12 Main St", { kind: "offer", why: "asked", unsubscribeUrl: "  " }),
    /an offer foot names where and how to stop/,
    "and not without the link",
  );
  // The visit's foot: its reason, STOP as the way out, no link.
  assert.equal(
    emailFoot("Northside Studio", "12 Main St", { kind: "visit", facts: { visit_when: "tomorrow at 2:00 PM" } }),
    "You're getting this because of your visit with Northside Studio.\nReply STOP to stop these emails.\nNorthside Studio · 12 Main St",
  );
  assert.match(
    emailFoot("Northside Studio", null, { kind: "visit", facts: { proposal_link: "https://x.example/p" } }),
    /^You're getting this about your proposal from Northside Studio\.\nReply STOP/,
  );
  // A cold email's foot (the reach-out's): the finder's reason, that it is marketing, who and where, both ways to say no.
  const cold = { kind: "cold", why: "I found your business on Google Maps.", unsubscribeUrl: url };
  assert.equal(
    emailFoot("Northside Studio", "12 Main St, Springfield", cold),
    [
      "I found your business on Google Maps.",
      MARKETING_LINE,
      "Northside Studio · 12 Main St, Springfield",
      'Not interested? Reply "no thanks" and I won\'t write again.',
      `Unsubscribe: ${url}`,
    ].join("\n"),
  );
  assert.equal(MARKETING_LINE, "This is a marketing email.");
  // A cold foot is never built with a part missing: the law asks for each; a visit's foot, which carries no link, does not refuse.
  for (const [what, args] of [
    ["address", ["Northside Studio", "  ", cold]],
    ["business", ["  ", "12 Main St", cold]],
    ["reason", ["Northside Studio", "12 Main St", { ...cold, why: " " }]],
    ["link", ["Northside Studio", "12 Main St", { ...cold, unsubscribeUrl: "" }]],
  ]) {
    assert.throws(() => emailFoot(...args), /why, who, where and how to stop/, what);
    assert.throws(() => emailFootHtml(...args), /why, who, where and how to stop/, `${what} (HTML)`);
  }
  assert.equal(
    emailFootHtml("Northside Studio", "12 Main St", cold),
    `<p>I found your business on Google Maps.<br>This is a marketing email.<br>Northside Studio · 12 Main St<br>Not interested? Reply &quot;no thanks&quot; and I won&#39;t write again · <a href="${url}">Unsubscribe</a></p>`,
  );
  // The HTML twin of an offer: the same lines, the link reading Unsubscribe, everything escaped.
  const html = emailFootHtml("Tom & Jerry's <Spa>", "12 Main St", {
    kind: "offer",
    why: "customer",
    unsubscribeUrl: `${url}?a=1&b="2"`,
  });
  assert.equal(
    html,
    `<p>You&#39;re a customer of Tom &amp; Jerry&#39;s &lt;Spa&gt;.<br>Tom &amp; Jerry&#39;s &lt;Spa&gt; · 12 Main St<br><a href="${url}?a=1&amp;b=&quot;2&quot;">Unsubscribe</a></p>`,
  );
  // The composer's preview draws the offer's foot, with a stand-in for each person's own link.
  const versions = { email: { subject: "October", body: "Hi {{1}}" } };
  const preview = previewOn("email", {
    versions,
    language: "en",
    business: "Northside Studio",
    address: "12 Main St",
    offer: "customer",
  });
  assert.equal(preview.foot.split("\n")[0], "You're a customer of Northside Studio.");
  assert.match(preview.foot, /Unsubscribe: \(their own unsubscribe link\)$/);
  // An offer with no postal address on file has no foot to draw (the send would hold everyone): the preview says why, and
  // does not throw. A message about a visit needs no address and draws as it did.
  for (const address of [null, undefined, "  "]) {
    const none = previewOn("email", {
      versions,
      language: "en",
      business: "Northside Studio",
      address,
      offer: "asked",
    });
    assert.deepEqual(
      [none.version, none.foot, none.missing],
      [null, null, OFFERS_BY_EMAIL_WORDS.noAddress],
      `${address}`,
    );
  }
  assert.match(
    previewOn("email", { versions, language: "en", business: "Northside Studio", address: null }).foot,
    /Reply STOP to stop these emails\./,
  );
  assert.match(
    previewOn("email", { versions, language: "en", business: "Northside Studio", address: "12 Main St" }).foot,
    /Reply STOP to stop these emails\./,
  );
});

test("the unsubscribe page says to a customer what the spec says, and offers the second, confirmed act", () => {
  const ask = offerUnsubscribeWords({ kind: "ask", business: "Northside Studio" });
  assert.equal(ask.lead, "Stop offers from Northside Studio?");
  assert.deepEqual(ask.buttons, [
    { label: "Unsubscribe from offers", name: "unsubscribe", value: "yes", quiet: false },
  ]);
  assert.match(ask.body, /won't send you offers by email again\. You'll still get messages about your visits\./);
  const done = offerUnsubscribeWords({ kind: "done", business: "Northside Studio" });
  assert.equal(done.lead, "You're unsubscribed from offers from Northside Studio.");
  assert.equal(done.body, "You'll still get messages about your visits.");
  assert.deepEqual(
    done.buttons,
    [{ label: "Stop all messages", name: "stop_all", value: "ask", quiet: true }],
    "a quiet second act, not the page's main one",
  );
  const confirm = offerUnsubscribeWords({ kind: "stop_ask", business: "Northside Studio" });
  assert.equal(confirm.lead, "Stop every message from Northside Studio?");
  assert.match(confirm.body, /reminders and confirmations about your visits/);
  assert.deepEqual(
    confirm.buttons.map((b) => [b.name, b.value]),
    [["stop_all", "yes"]],
  );
  const stopped = offerUnsubscribeWords({ kind: "stopped", business: null });
  assert.equal(stopped.lead, "You won't get any more messages from this business.");
  assert.deepEqual(stopped.buttons, []);
});

test("what an email's words are read as: STOP stops everything; UNSUBSCRIBE and YES OFFERS are about offers", () => {
  for (const stop of ["STOP", "baja", "ALTO", " stop. "]) assert.equal(EMAIL_STOP_PATTERN.test(stop), true, stop);
  assert.equal(EMAIL_STOP_PATTERN.test("unsubscribe"), false, "an unsubscribe is not a STOP");
  assert.equal(OPT_OUT_PATTERN.test("unsubscribe"), true, "a WhatsApp message keeps reading it so");
  for (const u of ["unsubscribe", "Unsubscribe.", "please unsubscribe me", "desuscribirme", "desuscribir"])
    assert.equal(EMAIL_UNSUBSCRIBE_PATTERN.test(u), true, u);
  for (const not of ["unsubscribe me from the weekly one", "stop", "I want to unsubscribe", ""])
    assert.equal(EMAIL_UNSUBSCRIBE_PATTERN.test(not), false, not);
});

/* ------------------------------------------------- the person's page, Setup -- */

test("a person's page says their answer about offers by email, quietly: Yes, Unsubscribed, Not asked, or nothing where the row has none", () => {
  const of = (over) => consentOf({ last_inbound_at: null, last_wrote_at: null, ...over });
  const yes = of({
    email_marketing: "opted_in",
    email_marketing_source: "customer_message",
    email_marketing_updated_at: daysAgo(2),
  });
  assert.deepEqual([yes.emailOffersLabel, yes.emailMarketing], ["Yes", "opted_in"]);
  assert.match(yes.emailOffersSub, /^Their own message · /);
  const no = of({
    email_marketing: "opted_out",
    email_marketing_source: "unsubscribe",
    email_marketing_updated_at: daysAgo(1),
  });
  assert.equal(no.emailOffersLabel, "Unsubscribed");
  assert.match(no.emailOffersSub, /^Pressed Unsubscribe · /);
  assert.match(
    of({ email_marketing: "opted_out", email_marketing_source: "complaint" }).emailOffersSub,
    /^Marked an email as spam/,
  );
  const quiet = of({ email_marketing: "unknown" });
  assert.equal(quiet.emailOffersLabel, "Not asked");
  assert.equal(quiet.emailOffersSub, "no offers by email until they ask for them");
  assert.match(
    of({ email_marketing: "unknown", last_inbound_at: daysAgo(3), last_wrote_at: daysAgo(3) }).emailOffersSub,
    /they have dealt with you/,
  );
  assert.equal(
    of({ email_marketing: "unknown", last_inbound_at: daysAgo(3) }).emailOffersSub,
    "no offers by email until they ask for them",
    "mail that came from them but was a program's (an automatic reply) is no dealing with you",
  );
  const unread = of({});
  assert.deepEqual(
    [unread.emailMarketing, unread.emailOffersLabel, unread.emailOffersSub],
    [null, null, ""],
    "a row read before the column says nothing",
  );
  // And it is what the rule reads: the same row, judged.
  const judged = (over) =>
    whyNotReceive({ consent: of(over), phone: null, email: "d@example.com" }, "marketing", "email");
  assert.equal(judged({ email_marketing: "unknown", last_wrote_at: daysAgo(3) }), null);
  assert.equal(judged({ email_marketing: "unknown", last_wrote_at: null }), "no_yes");
  assert.equal(
    judged({ email_marketing: "unknown", last_inbound_at: daysAgo(3) }),
    "no_yes",
    "an automatic reply alone",
  );
  assert.equal(judged({ email_marketing: "opted_out", last_wrote_at: daysAgo(3) }), "unsubscribed");
  // A recorded no to offers on WhatsApp bars the offer by email too (the decision in mayMessageFor), said as no yes.
  assert.equal(judged({ email_marketing: "opted_in", marketing_consent: "opted_out" }), "no_yes");
  assert.equal(
    judged({ email_marketing: "unknown", last_wrote_at: daysAgo(3), marketing_consent: "opted_out" }),
    "no_yes",
  );
  assert.equal(judged({}), "no_yes", "no answer read: closed");
});

test("the timeline says each road of the email yes and no: their own message, the link, a reply", () => {
  const change = (data) =>
    consentChangeWords(
      consentChangeOf({
        id: "e1",
        subject_id: "p1",
        created_at: "2026-10-01T10:00:00Z",
        data: { purpose: "email_marketing", ...data },
      }),
    );
  assert.deepEqual(change({ consent: "opted_in", source: "customer_message", channel: "email", words: "YES OFFERS" }), {
    who: "Email",
    text: "Asked for offers by email",
    sub: "In their own words by email: “YES OFFERS”",
  });
  assert.deepEqual(change({ consent: "opted_out", source: "unsubscribe", channel: "email" }), {
    who: "Email",
    text: "Unsubscribed from your emails",
    sub: "Pressed Unsubscribe in an email",
  });
  assert.equal(
    change({ consent: "opted_out", source: "unsubscribe", channel: "email", words: "Unsubscribe" }).sub,
    "Wrote “Unsubscribe” in reply to an email",
  );
  assert.equal(change({ consent: "opted_in", source: "reply_undone" }).text, "Marketing email: back to yes");
});

test("Setup's yes row counts offers by email as their own arm, only where they can go: a count that is not a yes they gave", () => {
  const dto = (consent) => ({
    business: {
      name: "Harbor Moving",
      hours: true,
      services: 0,
      bookingLink: false,
      address: true,
      handoff: null,
      broken: false,
      receptionist: "set",
    },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0, offers: 0, offersSaidYes: 0, ...consent },
    requests: { line: null },
    google: { ready: false, places: false, listing: null, connected: false, unsure: [], type: null },
    later: [],
  });
  const yesRow = (consent) => setupSteps(dto(consent), ROW_NOW).rows.find((r) => r.id === "yes");
  // No arm: as it always read.
  assert.equal(yesRow({}).state, "not_started");
  assert.equal(yesRow({ offers: 3, offersSaidYes: 3 }).sentence, "3 people said yes to offers.");
  assert.deepEqual(yesRow({ offers: 3, offersSaidYes: 3 }).details, [], "an absent arm adds nothing");
  // Only email: nobody said yes, and an offer by email reaches people the rule allows. It says so, and not that they said yes.
  const emailOnly = yesRow({ offers_by_email: 12 });
  assert.equal(emailOnly.state, "ready");
  assert.equal(emailOnly.sentence, "12 people can be sent an offer by email.");
  assert.equal(yesRow({ offers_by_email: 1 }).sentence, "1 person can be sent an offer by email.");
  // Both: the yes first, the email arm beside it.
  const both = yesRow({ offers: 2, offersSaidYes: 2, offers_by_email: 12 });
  assert.equal(both.sentence, "2 people said yes to offers.");
  assert.deepEqual(both.details, ["12 people can be sent an offer by email"]);
  // An arm counted as none (the rule leaves everyone out) is none: the row falls back to what it says without it.
  assert.equal(yesRow({ offers_by_email: 0 }).state, "not_started");
});
