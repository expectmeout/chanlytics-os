/**
 * Sign-off's Signature and Phone rows (decision 0113) reach every cold email Chanlytics sends: under the name the
 * sequence signs with, through the one ending rule (contracts coldEndingOf) the send, the preview, Send me a test and
 * the lead's card all take. A mailbox's own signature stands in its place where the sequence signs with the mailbox and
 * something of it is left; an email the owner sends from their own mail app carries none, since that app adds theirs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coldEndingOf, leadStepTestMail, reachOutSignatureOf } from "@chanlytics/contracts";
import { reachOutDraft, reachOutRequest } from "@chanlytics/channels/email";

const OWN = "Maya Ortiz\nOwner";
const ending = (over = {}) =>
  coldEndingOf({
    signsWith: "name",
    signedBy: "Maya",
    signature: null,
    own: OWN,
    first: true,
    body: "Hi {{business}},\n\nWe clean clinics after hours.",
    address: "2201 E 6th St, Austin, TX 78702",
    ...over,
  });

test("the signature is the Signature row's lines with the phone as the last; none where both are empty", () => {
  assert.equal(
    reachOutSignatureOf({ reach_out: { signature: " Maya Ortiz\nOwner ", phone: "(512) 555-0142" } }),
    "Maya Ortiz\nOwner\n(512) 555-0142",
  );
  assert.equal(reachOutSignatureOf({ reach_out: { phone: "(512) 555-0142" } }), "(512) 555-0142");
  assert.equal(reachOutSignatureOf({ reach_out: { signature: " \n " } }), null);
  assert.equal(reachOutSignatureOf({}), null);
  assert.equal(reachOutSignatureOf(null), null);
});

test("signed by name, the email ends with the name and the page's signature under it; with none, the name alone", () => {
  assert.deepEqual(ending(), { signOff: "Maya", signature: OWN });
  assert.deepEqual(ending({ own: null }), { signOff: "Maya", signature: null });
  // The foot says the address: a line of the signature that says it again goes, as a mailbox's would.
  assert.deepEqual(ending({ own: `${OWN}\n2201 E 6th St, Austin, TX 78702` }), { signOff: "Maya", signature: OWN });
});

test("signed with the mailbox, the mailbox's signature stands; where it has none, the name and the page's", () => {
  const mailbox = "Sam Rivera\nHarbor Moving Co";
  assert.deepEqual(ending({ signsWith: "mailbox", signature: mailbox }), { signOff: null, signature: mailbox });
  assert.deepEqual(ending({ signsWith: "mailbox", signature: null }), { signOff: "Maya", signature: OWN });
});

const T = "22222222-2222-4222-8222-222222222222";
const request = (over = {}) => ({
  tenantId: T,
  messageId: "11111111-1111-4111-8111-111111111111",
  contactId: "33333333-3333-4333-8333-333333333333",
  to: "owner@fixture-movers.example",
  words: { subject: "A quote for {{business}}", body: "Hi {{business}},\n\nMovers in {{city}} ask us for this." },
  lead: { business_name: "Fixture Movers", city: "Austin" },
  workspace: {
    businessName: "Harbor Moving Co",
    address: "100 Example St, Austin, TX 78701",
    yourName: "Sam",
    bookingLink: null,
  },
  opening: null,
  from: { address: "sam@getharbor.example", from_name: "Sam at Harbor", signature: null },
  signsWith: "name",
  own: OWN,
  unsubscribe: { secret: "a-secret-only-this-file-holds", origin: "https://app.chanlytics.com" },
  parent: null,
  ...over,
});

test("a send from the mailbox carries it between the name and the foot; the owner's own draft does not", () => {
  const sent = reachOutRequest(request());
  assert.equal(sent.ok, true);
  assert.equal(sent.body, "Hi Fixture Movers,\n\nMovers in Austin ask us for this.\n\nSam");
  assert.equal(sent.signature, OWN);
  assert.ok(sent.request.text.startsWith(`${sent.body}\n\n${OWN}\n\nI found`), sent.request.text);
  const drafted = reachOutDraft(request());
  assert.equal(drafted.ok, true);
  assert.ok(!drafted.text.includes(OWN), "their mail app adds their signature");
});

test("Send me a test ends as the send does: the name, then the page's signature", () => {
  const mail = leadStepTestMail({
    sequence: "Clinics",
    place: 1,
    business: "Harbor Moving Co",
    address: "100 Example St, Austin, TX 78701",
    words: { subject: "A quote for {{business}}", body: "Hi {{business}},\n\nMovers in {{city}} ask us for this." },
    thread: null,
    lead: { business_name: "Fixture Movers", city: "Austin" },
    example: false,
    opening: null,
    workspace: { businessName: "Harbor Moving Co", yourName: "Sam", bookingLink: null },
    signsWith: "name",
    signature: null,
    own: OWN,
  });
  assert.ok("text" in mail, JSON.stringify(mail));
  assert.ok(mail.text.includes(`\n\nSam\n\n${OWN}\n\n`), mail.text);
});
