/**
 * Send me a test's mail (contracts stepTestMail, the parity review's W5): a customer step's message as the member who
 * pressed it reads it, filled for the example person every preview fills for, each channel the step goes by in its own
 * words through the one fill a send makes, an email with the foot the sender adds, a text with its STOP line. A channel
 * the message lacks, or an offer by email with no postal address for its foot, is refused in words: never another
 * channel's words under its name. A lead's step's test (contracts leadStepTestMail) is one line saying whose email it is
 * over the email the send makes for that lead, word for word, with the opening it goes with (contracts leadOpeningOf, read
 * by db leadStepOpeningOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmailRequest } from "@chanlytics/channels";
import { leadStepOpeningOf } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import {
  OFFERS_BY_EMAIL_WORDS,
  SEQUENCE_TEST_LIMITS,
  customerEmailFoot,
  leadFactOf,
  leadOpeningOf,
  leadStepTestMail,
  noVersionWords,
  reachOutExampleLead,
  renderOwnVersion,
  smsStopLine,
  stepTestMail,
} from "@chanlytics/contracts";

const WHATSAPP = {
  body: "Hi {{1}}, see you {{2}} at {{3}}.",
  components: [
    { type: "HEADER", format: "TEXT", text: "Your visit, {{1}}" },
    { type: "BODY", text: "Hi {{1}}, see you {{2}} at {{3}}." },
    { type: "FOOTER", text: "Harbor Dental" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Book now", url: "https://example.com/book" }] },
  ],
};
const VERSIONS = {
  email: { subject: "A note, {{1}}", body: "Hi {{1}}, we'll see you {{2}} at {{3}}." },
  sms: { subject: null, body: "Hi {{1}}, see you {{2}}." },
};
const PARAMS = [{ kind: "first_name" }, { kind: "visit_when" }, { kind: "business_name" }];
const step = (over = {}) => ({
  sequence: "Reminders",
  place: 2,
  business: "Harbor Dental",
  address: null,
  bookingLink: null,
  channels: ["whatsapp", "email", "sms"],
  params: PARAMS,
  policyClass: "booking",
  message: { whatsapp: WHATSAPP, versions: VERSIONS, language: "en_US", category: "utility" },
  ...over,
});

test("a step by WhatsApp, email and text: one line, then each channel under its label in its own words, filled for Dani, the email's subject the test's", () => {
  const mail = stepTestMail(step());
  assert.ok(!("missing" in mail), JSON.stringify(mail));
  assert.equal(mail.subject, "Test: A note, Dani");
  const t = mail.text;
  assert.ok(t.startsWith("Test of step 2, as an example person, Dani, would get it. Only you got this.\n\n—\n\n"), t);
  // WhatsApp's heading, words, the line under them and its button, in that order.
  const wa = t.indexOf("On WhatsApp");
  assert.ok(wa > 0, t);
  for (const [i, said] of [
    "Your visit, Dani",
    "Hi Dani, see you tomorrow at 2:00 PM at Harbor Dental.",
    "Harbor Dental",
    "[Book now]",
  ].entries())
    assert.ok(t.indexOf(said, wa) > wa, `${i}: ${said}`);
  assert.ok(t.includes("Hi Dani, we'll see you tomorrow at 2:00 PM at Harbor Dental."), t);
  assert.ok(t.includes(`Hi Dani, see you tomorrow at 2:00 PM.`) && t.includes(smsStopLine("en_US")), t);
  // In the page's channel order: WhatsApp, text, email, each its own block.
  assert.ok(t.indexOf("On WhatsApp") < t.indexOf("By text") && t.indexOf("By text") < t.indexOf("By email"), t);
  assert.equal(t.split("\n\n—\n\n").length, 4, "the line, then three messages");
  // Its subject is the test's own: never said again in its words, and no line of the test's own under the message.
  assert.ok(!t.includes("Subject:"), t);
  assert.ok(!t.includes("You got this"), t);
});

test("a step by email alone is the line over the email the send makes for that person: its words, the foot their row's facts say, as the wire lays it out", () => {
  const proposal = {
    params: [{ kind: "first_name" }, { kind: "proposal_link" }, { kind: "booking_link" }],
    channels: ["email"],
    policyClass: "follow_up",
    address: "1 Dock St, Harbor, ME 04000",
    bookingLink: "https://book.example.com/harbor",
    message: {
      whatsapp: null,
      versions: {
        email: { subject: "The link from our call", body: "Hi {{1}},\n\nHere it is: {{2}}\n\nOr book a time: {{3}}" },
      },
      language: "en_US",
      category: "utility",
    },
  };
  const mail = stepTestMail(step(proposal));
  assert.ok(!("missing" in mail), JSON.stringify(mail));
  assert.equal(mail.subject, "Test: The link from our call");
  // What the send writes for a person whose row kept their proposal's link: the one fill, the foot the send chooses.
  const values = ["Dani", "[their proposal's link]", "https://book.example.com/harbor"];
  const said = renderOwnVersion("email", proposal.message.versions.email, values, "en_US");
  const foot = customerEmailFoot({
    business: "Harbor Dental",
    address: proposal.address,
    language: "en_US",
    offer: null,
    facts: { proposal_link: "[their proposal's link]" },
  });
  const sent = buildEmailRequest({
    identity: { fromName: "Harbor Dental", fromAddress: "harbor@mail.example.com", replyTo: "r+tok@mail.example.com" },
    to: "dani@example.com",
    parent: null,
    subject: said.subject,
    body: said.body,
    // A message about their own visit or proposal carries its foot where a signature goes (jobs emailRequestPort).
    signature: foot.footer,
    actor: "ai",
    messageId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(
    mail.text,
    `Test of step 2, as an example person, Dani, would get it. Only you got this.\n\n—\n\n${sent.text}`,
    "one line, then the email as it leaves",
  );
  assert.equal(`Test: ${sent.subject}`, mail.subject);
  assert.match(
    sent.text,
    /You're getting this about your proposal from Harbor Dental\./,
    "the foot says why, as theirs",
  );
  assert.match(sent.text, /Here it is: \[their proposal's link\]/, "a link only a real person has, said as a stand-in");
  assert.match(sent.text, /Or book a time: https:\/\/book\.example\.com\/harbor/, "the workspace's own link, as set");
});

test("an email about the person's own visit carries a visit's foot; the business's news carries an offer's, and owes its address", () => {
  const visit = stepTestMail(step({ channels: ["email"] }));
  assert.ok(!("missing" in visit));
  assert.ok(!visit.text.includes("(their own unsubscribe link)"), visit.text);
  // A win-back is the business's news: an offer by email, whose foot names the address and where the way out goes.
  const news = { policyClass: "reengage", channels: ["email"] };
  assert.deepEqual(stepTestMail(step(news)), { missing: "email", why: OFFERS_BY_EMAIL_WORDS.noAddress });
  const offer = stepTestMail(step({ ...news, address: "1 Dock St, Harbor, ME 04000" }));
  assert.ok(!("missing" in offer));
  assert.ok(offer.text.includes("1 Dock St, Harbor, ME 04000"), offer.text);
  assert.ok(offer.text.includes("(their own unsubscribe link)"), offer.text);
});

test("a channel the step goes by and the message lacks is refused in its words, never drawn in another's", () => {
  const noWhatsApp = step({ message: { ...step().message, whatsapp: null } });
  assert.deepEqual(stepTestMail(noWhatsApp), { missing: "whatsapp", why: noVersionWords("whatsapp") });
  const noText = step({ message: { ...step().message, versions: { email: VERSIONS.email } } });
  assert.deepEqual(stepTestMail(noText), { missing: "sms", why: noVersionWords("sms") });
});

test("a step that names no channel shows every version its message holds; a subject past its bound is cut", () => {
  const mail = stepTestMail(step({ channels: [], message: { ...step().message, versions: { sms: VERSIONS.sms } } }));
  assert.ok(!("missing" in mail));
  assert.ok(mail.text.includes("On WhatsApp") && mail.text.includes("By text") && !mail.text.includes("By email"));
  // No email, no subject of its own: the step is named instead.
  assert.equal(mail.subject, "Test: Reminders, step 2");
  const long = stepTestMail(step({ channels: ["whatsapp"], sequence: "x".repeat(400) }));
  assert.equal(long.subject.length, SEQUENCE_TEST_LIMITS.subject);
});

test("a lead's test mail says the name the business is called by, in its words and where its opening will be", () => {
  const mail = leadStepTestMail({
    sequence: "Movers",
    place: 1,
    business: "Harbor Studio",
    address: "1200 Main St, Springfield, IL",
    words: { subject: "For {{business}}", body: "{{opening}} Hi {{business}}." },
    thread: null,
    lead: { business_name: "R&T Mechanical | Springfield IL | Water Heater Installation", city: "Springfield" },
    example: false,
    opening: null,
    workspace: { businessName: "Harbor Studio" },
    signsWith: "name",
    signature: null,
  });
  assert.ok("text" in mail, mail.why);
  assert.match(mail.subject, /For R&T Mechanical/);
  assert.ok(mail.text.startsWith("Test of step 1, as R&T Mechanical gets it. Only you got this."), mail.text);
  assert.ok(
    mail.text.includes(
      "[A line about R&T Mechanical, written for them when their email is planned] Hi R&T Mechanical.",
    ),
    mail.text,
  );
  assert.ok(!mail.text.includes("|"), mail.text);
});

/* ---------------------------------------------------- a lead's test is the email the send makes (3 Nov 2026) -- */

const { reachOutRequest } = await import("@chanlytics/channels");

const COLD = {
  business: "Harbor Studio",
  address: "1200 Main St, Springfield, IL 62701",
  words: {
    subject: "missed calls",
    body: "{{opening}}\n\nWhen a call goes unanswered, most people ring the next business. Want me to set one up?",
  },
  lead: {
    business_name: "R&T Mechanical | Springfield IL | Water Heater Installation",
    city: "Springfield",
    source: "local_businesses",
  },
  opening: "R&T Mechanical is open 24 hours, seven days a week.",
};

test("a lead's test mail is the email the send makes for them, word for word: the opening it goes with, its subject once, its ending and its foot", () => {
  const mail = leadStepTestMail({
    sequence: "Local",
    place: 1,
    business: COLD.business,
    address: COLD.address,
    words: COLD.words,
    thread: null,
    lead: COLD.lead,
    example: false,
    opening: COLD.opening,
    workspace: { businessName: COLD.business, yourName: "Sam", bookingLink: null },
    signsWith: "name",
    signature: null,
  });
  assert.ok("text" in mail, mail.why);
  const sent = reachOutRequest({
    tenantId: "22222222-2222-4222-8222-222222222222",
    messageId: "11111111-1111-4111-8111-111111111111",
    contactId: "33333333-3333-4333-8333-333333333333",
    to: "owner@rt-mechanical.example",
    words: COLD.words,
    lead: COLD.lead,
    workspace: { businessName: COLD.business, yourName: "Sam", bookingLink: null, address: COLD.address },
    opening: COLD.opening,
    signsWith: "name",
    from: { address: "sam@harbor.example", from_name: "Sam", signature: null },
    unsubscribe: { secret: "a-secret-only-this-file-holds", origin: "https://app.chanlytics.com" },
    parent: null,
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(mail.subject, `Test: ${sent.request.subject}`, "its subject, marked as a test, and said nowhere else");
  assert.equal(
    mail.text,
    `Test of step 1, as R&T Mechanical gets it. Only you got this.\n\n—\n\n${sent.request.text}`,
    "one line over the email, then the email as it leaves",
  );
  assert.ok(sent.request.text.startsWith(`${COLD.opening}\n\nWhen a call goes unanswered`), sent.request.text);
  assert.ok(!mail.text.includes("Subject:"), "its subject is not said again in its words");
  assert.ok(!mail.text.includes("[A line about"), "an opening written is said, never the line to come");
});

test("a nudge's test is the nudge the send makes: under 'Re:' the first email's subject once, signed with the mailbox's signature as the send signs it", () => {
  const words = { subject: null, body: "{{opening}}\n\nJust checking this reached you." };
  const signature = "Sam Rivera\nHarbor Studio\nhttps://harbor.example";
  const mail = leadStepTestMail({
    sequence: "Local",
    place: 2,
    business: COLD.business,
    address: COLD.address,
    words,
    thread: "Re: RE: missed calls",
    lead: COLD.lead,
    example: false,
    opening: COLD.opening,
    workspace: { businessName: COLD.business, yourName: "Sam", bookingLink: null },
    signsWith: "mailbox",
    signature,
  });
  assert.ok("text" in mail, mail.why);
  const sent = reachOutRequest({
    tenantId: "22222222-2222-4222-8222-222222222222",
    messageId: "11111111-1111-4111-8111-111111111112",
    contactId: "33333333-3333-4333-8333-333333333333",
    to: "owner@rt-mechanical.example",
    words,
    lead: COLD.lead,
    workspace: { businessName: COLD.business, yourName: "Sam", bookingLink: null, address: COLD.address },
    opening: COLD.opening,
    signsWith: "mailbox",
    from: { address: "sam@harbor.example", from_name: "Sam", signature },
    unsubscribe: { secret: "a-secret-only-this-file-holds", origin: "https://app.chanlytics.com" },
    parent: {
      messageId: "44444444-4444-4444-8444-444444444444",
      rfcMessageId: "<first@harbor.example>",
      references: [],
      subject: "Re: RE: missed calls",
    },
  });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(sent.request.subject, "Re: missed calls");
  assert.equal(mail.subject, `Test: ${sent.request.subject}`, "'Re:' once, as the wire says it");
  assert.equal(
    mail.text,
    `Test of step 2, as R&T Mechanical gets it. Only you got this.\n\n—\n\n${sent.request.text}`,
    "the nudge as it leaves, its signature and all",
  );
  assert.match(sent.request.text, /\n\nSam Rivera\nHarbor Studio\n/, "signed with the mailbox's signature");
});

test("the example business's test says it is one, and its opening is the line still to come", () => {
  const mail = leadStepTestMail({
    sequence: "Local",
    place: 2,
    business: COLD.business,
    address: COLD.address,
    words: { subject: null, body: "{{opening}}\n\nJust checking in." },
    thread: "missed calls",
    lead: reachOutExampleLead(),
    example: true,
    opening: null,
    workspace: { businessName: COLD.business },
    signsWith: "name",
    signature: null,
  });
  assert.ok("text" in mail, mail.why);
  const name = reachOutExampleLead().business_name;
  assert.equal(mail.subject, "Test: Re: missed calls", "a later step answers under the first's subject");
  assert.ok(mail.text.startsWith(`Test of step 2, as an example business, ${name}, would get it.`), mail.text);
  assert.ok(mail.text.includes(`[A line about ${name}, written for them when their email is planned]`), mail.text);
});

test("the opening a lead's email goes with: the one written for it, else the one its listing says, else none yet", () => {
  const listing = {
    business_name: "R&T Mechanical | Springfield IL",
    city: "Springfield",
    hours: [],
    rating: 4.7,
    reviews: 120,
  };
  assert.equal(leadOpeningOf("  Their shop opens at six.  ", listing), "Their shop opens at six.", "the written one");
  assert.equal(leadOpeningOf(null, listing), "R&T Mechanical has a 4.7 rating across 120 reviews.");
  assert.equal(leadOpeningOf("   ", listing), leadFactOf(listing).opening, "a blank one is none written");
  assert.equal(leadOpeningOf(null, { ...listing, rating: null }), null, "a listing that says nothing code can say");
  assert.equal(leadOpeningOf(null, null), null);
});

test("what a lead's test reads of the database: the opening of their latest email at that step that still goes, and their listing", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER_T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const STEP = "11111111-1111-4111-8111-111111111111";
  const LATER_STEP = "11111111-1111-4111-8111-111111111112";
  const LEAD = "22222222-2222-4222-8222-222222222221";
  const NOBODY_YET = "22222222-2222-4222-8222-222222222222";
  const send = (id, over) => ({
    id,
    tenant_id: T,
    sequence_id: STEP,
    step_id: STEP,
    batch_id: "33333333-3333-4333-8333-333333333333",
    lead_id: LEAD,
    contact_id: null,
    state: "planned",
    opening: null,
    created_at: "2026-11-03T14:00:00Z",
    ...over,
  });
  const db = fakeDb({
    sequence_sends: [
      send("44444444-4444-4444-8444-444444444441", {
        opening: "The one that goes.",
        created_at: "2026-11-03T14:00:00Z",
      }),
      // Newer, but skipped (moved, taken out): it goes to nobody, so it says nothing of what they get.
      send("44444444-4444-4444-8444-444444444442", {
        state: "skipped",
        opening: "One that never went.",
        created_at: "2026-11-03T15:00:00Z",
      }),
      // Their email at another step, and another workspace's at this one: neither is this email.
      send("44444444-4444-4444-8444-444444444443", { step_id: LATER_STEP, opening: "A later step's." }),
      send("44444444-4444-4444-8444-444444444444", { tenant_id: OTHER_T, opening: "Another workspace's." }),
      send("44444444-4444-4444-8444-444444444445", { lead_id: NOBODY_YET, opening: null }),
    ],
    leads: [
      {
        id: LEAD,
        tenant_id: T,
        business_name: "R&T Mechanical | Springfield IL",
        city: "Springfield",
        hours: [],
        rating: 4.7,
        reviews: 120,
      },
      { id: NOBODY_YET, tenant_id: T, business_name: "Quiet Co", city: null, hours: [], rating: null, reviews: null },
    ],
  });
  const read = await leadStepOpeningOf(db, { tenantId: T, stepId: STEP, leadId: LEAD });
  assert.equal(read.written, "The one that goes.");
  assert.deepEqual(read.listing, {
    business_name: "R&T Mechanical | Springfield IL",
    city: "Springfield",
    hours: [],
    rating: 4.7,
    reviews: 120,
  });
  const none = await leadStepOpeningOf(db, { tenantId: T, stepId: STEP, leadId: NOBODY_YET });
  assert.equal(none.written, null, "its email is planned, its opening not written yet");
  assert.equal(leadOpeningOf(none.written, none.listing), null, "and its listing says nothing code can say");
  const theirs = await leadStepOpeningOf(db, { tenantId: OTHER_T, stepId: STEP, leadId: LEAD });
  assert.deepEqual(theirs, { written: "Another workspace's.", listing: null }, "a workspace reads its own alone");
});
