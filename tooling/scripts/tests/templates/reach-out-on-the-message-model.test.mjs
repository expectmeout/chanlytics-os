/**
 * The reach-out's emails on the message model (One message, every channel, step 5), at the contract: a reach-out's email
 * is an email like any other, so one validator checks it and a campaign message's alike, over the rules of their kind;
 * one fill puts a business's values in it and one person's in a campaign's, over the slots of their kind; the name a
 * reach-out's email is filed under says its step; and what was stored before keeps reading as it was written.
 *
 * - One validator: the shared checks (a subject, a body, each within its length, the slots a message has and no others,
 *   a brace left with no pair) are one function, `emailIssues`, and the two kinds are its options: how many characters,
 *   which slots, whether there is a subject, what else is asked, and the sentences. What only a cold email is asked (a
 *   subject that poses as a reply, one link, no line in capitals) never reaches a campaign message's.
 * - One fill: `renderOwnVersion` over a slot set, whichever the set; the edge's send, the sheet's preview and the
 *   approval's first email fill the six by it, and the Templates page's preview with examples.
 * - Existing data: stored words keep their named slots, and are read back as they were written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  REACH_OUT_BODY_MAX,
  REACH_OUT_SLOTS,
  REACH_OUT_SLOT_SET,
  REACH_OUT_SUBJECT_MAX,
  campaignEmailRules,
  emailIssues,
  fillSlots,
  isReachOutRow,
  reachOutEmailOf,
  reachOutExampleValues,
  reachOutRowName,
  reachOutRules,
  reachOutStepOf,
  renderOwnVersion,
  validateEmailVersion,
  validateReachOutWords,
  versionWords,
  versionsOf,
  wordsIssueWords,
} from "@chanlytics/contracts";
import { emailWordsFrom } from "@chanlytics/db";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { reachOutRequest } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/reach-out/request.ts")).href);

const problems = (issues) => issues.map((i) => `${i.field}:${i.problem}${i.slot ? `:${i.slot}` : ""}`);
const campaign = campaignEmailRules(2);
const coldFirst = reachOutRules(true);

/* ---------------------------------- one validator ---------------------------------- */

test("the shared checks are one function: a missing half and a slot the message has none for are the same problems at the same field in either kind", () => {
  for (const [words, want] of [
    [{ subject: "", body: "Hi" }, ["subject:subject_missing"]],
    [{ subject: "Hi", body: "" }, ["body:body_missing"]],
  ]) {
    assert.deepEqual(problems(emailIssues(words, campaign)), want, `a campaign message's: ${JSON.stringify(words)}`);
    assert.deepEqual(problems(emailIssues(words, coldFirst)), want, `a reach-out's: ${JSON.stringify(words)}`);
  }
  // A slot the message does not have: a number past a campaign message's two, a name outside a reach-out's six. The
  // same problem, the same field, and the slot as it was written.
  assert.deepEqual(problems(emailIssues({ subject: "Hi {{3}}", body: "Hi" }, campaign)), ["subject:unknown_slot:3"]);
  assert.deepEqual(problems(emailIssues({ subject: "Hi {{nope}}", body: "Hi" }, coldFirst)), [
    "subject:unknown_slot:nope",
  ]);
  // The two kinds differ in the slots they have, not in how a slot is checked: {{1}} is a campaign's and not a reach-out's.
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body: "Hi {{1}}" }, campaign)), []);
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body: "Hi {{1}}" }, coldFirst)), ["body:unknown_slot:1"]);
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body: "Hi {{business}}" }, coldFirst)), []);
  // A numbered set reads {{digits}} alone and leaves other braces as words; a named set reads every {{…}} as a slot, and
  // refuses a brace with no pair, which a business may never read.
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body: "Hi {{{" }, coldFirst)), ["body:stray_brace"]);
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body: "Hi {{{" }, campaign)), []);
});

test("how long a subject and a body may be is an option of the kind: the same words pass one and fail the other", () => {
  assert.equal(EMAIL_SUBJECT_MAX < REACH_OUT_SUBJECT_MAX, true);
  assert.equal(REACH_OUT_BODY_MAX < EMAIL_BODY_MAX, true);
  const subject = "x".repeat(EMAIL_SUBJECT_MAX + 1);
  assert.deepEqual(problems(emailIssues({ subject, body: "Hi" }, campaign)), ["subject:subject_too_long"]);
  assert.deepEqual(problems(emailIssues({ subject, body: "Hi" }, coldFirst)), []);
  const body = "x".repeat(REACH_OUT_BODY_MAX + 1);
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body }, campaign)), []);
  assert.deepEqual(problems(emailIssues({ subject: "Hi", body }, coldFirst)).slice(0, 1), ["body:body_too_long"]);
});

test("what only a cold email is asked is the reach-out's own option, composed with the shared checks, never a second copy of them", () => {
  const words = {
    subject: "Re: your {{opening}}",
    body: "{{nickname}}, SEE THIS NOW\nhttps://a.example https://b.example {{opening}} {{opening}}",
  };
  // A campaign message's email is asked none of it (the slots it names are its own business, here none are in its two).
  assert.deepEqual(
    problems(
      emailIssues({ subject: "Re: your offer", body: "SEE THIS NOW https://a.example https://b.example" }, campaign),
    ),
    [],
  );
  assert.deepEqual(problems(emailIssues(words, coldFirst)).sort(), [
    "body:opening_twice",
    "body:shouting",
    "body:too_many_links",
    "body:unknown_slot:nickname",
    "subject:opening_in_subject",
    "subject:subject_poses_as_reply",
  ]);
  // The reach-out's own function is the one check over its rules, and says what it said before.
  assert.deepEqual(validateReachOutWords(words, true), emailIssues(words, coldFirst));
  assert.deepEqual(validateReachOutWords({ subject: "  ", body: " Hi " }, true), [
    { field: "subject", problem: "subject_missing" },
  ]);
  assert.equal(
    coldFirst.say({ field: "body", problem: "shouting" }),
    wordsIssueWords({ field: "body", problem: "shouting" }),
  );
});

test("a later step has no subject of its own: its rules read none, and the check reads only its words", () => {
  const later = reachOutRules(false);
  assert.equal(later.subject, false);
  assert.deepEqual(
    problems(emailIssues({ subject: "Re: anything", body: "Bumping this. {{booking link}}" }, later)),
    [],
  );
  assert.deepEqual(problems(emailIssues({ subject: null, body: "" }, later)), ["body:body_missing"]);
  // Handed words by a person, the version check cleans them and keeps no subject.
  const check = validateEmailVersion({ subject: "ignored", body: "Bumping this." }, later);
  assert.deepEqual(check, { ok: true, value: { subject: null, body: "Bumping this." }, warnings: [] });
});

test("a person's words are checked by the same version check either way: the first thing wrong, said in the kind's own sentence", () => {
  assert.deepEqual(validateEmailVersion({ subject: "", body: "Hi" }, 2), {
    ok: false,
    error: "Give the email a subject.",
  });
  assert.deepEqual(validateEmailVersion({ subject: "", body: "Hi" }, coldFirst), {
    ok: false,
    error: "Give your email a subject.",
  });
  assert.deepEqual(validateEmailVersion({ subject: "Hi", body: "Hi {{3}}" }, campaign), {
    ok: false,
    error: "{{3}} is not one of this message's values: it has {{1}} to {{2}}.",
  });
  assert.deepEqual(validateEmailVersion({ subject: "Hi", body: "Hi {{3}}" }, coldFirst), {
    ok: false,
    error: wordsIssueWords({ field: "body", problem: "unknown_slot", slot: "3" }),
  });
  // What is fine in one is fine through the other's check, and its own warnings read the same (a subject of one slot).
  const ok = validateEmailVersion({ subject: "{{business}}", body: "Hi\r\n\r\n\r\n\r\nthere" }, coldFirst);
  assert.deepEqual(ok, {
    ok: true,
    value: { subject: "{{business}}", body: "Hi\n\n\n\nthere" },
    warnings: [
      "A subject that is only a value reads as empty to anyone it misses.",
      "More than one blank line in a row reads as a gap in most inboxes.",
    ],
  });
  assert.equal(coldFirst.foot.includes("footer"), true, "and says what the sender adds, in its own sentence");
  assert.notEqual(coldFirst.foot, campaign.foot, "a cold email's foot is its own sentence");
});

/* ---------------------------------- one fill ---------------------------------- */

const WORDS = {
  subject: "A quick one for {{business}}",
  body: "{{opening}}\n\nI run {{ Your Business }} in {{city}}. Fifteen minutes? {{booking link}}\n\n{{your name}}",
};
const LEAD = { business_name: "Fixture Movers", city: "Austin" };
const WORKSPACE = { businessName: "Harbor Moving Co", yourName: "Sam", bookingLink: "https://example.com/book" };
const OPENING = "Your reviews say people find you.";

test("the one fill serves both kinds of slots: a number's place, or a name's place in its set; a hole stays as it is written", () => {
  assert.equal(fillSlots("Hi {{1}}, {{2}}", ["Dani", "Luna"]), "Hi Dani, Luna");
  assert.equal(
    fillSlots("Hi {{business}}, {{ Your Name }}", ["", "Fixture", "", "Sam"], REACH_OUT_SLOT_SET),
    "Hi Fixture, Sam",
  );
  assert.equal(
    fillSlots("Hi {{city}}, {{nickname}}", [undefined, undefined, "Austin"], REACH_OUT_SLOT_SET),
    "Hi Austin, {{nickname}}",
  );
  assert.equal(fillSlots("{{business}}", [null, undefined], REACH_OUT_SLOT_SET), "{{business}}", "no value: a hole");
  // A value is put in as it is: never read as a slot or a replacement pattern.
  assert.equal(fillSlots("Hi {{business}}", [undefined, "$& {{city}}"], REACH_OUT_SLOT_SET), "Hi $& {{city}}");
});

test("a reach-out's email for one business is renderOwnVersion over the six, and the edge's send builds the very same words", () => {
  const email = reachOutEmailOf(WORDS, LEAD, WORKSPACE, OPENING);
  assert.equal(email.ok, true);
  assert.deepEqual(
    { subject: email.subject, body: email.body },
    renderOwnVersion(
      "email",
      WORDS,
      // The six in the set's order: the opening, the business, its city, the name signed, the workspace's, its link.
      [OPENING, LEAD.business_name, LEAD.city, WORKSPACE.yourName, WORKSPACE.businessName, WORKSPACE.bookingLink],
      "en",
      REACH_OUT_SLOT_SET,
    ),
  );
  assert.equal(email.subject, "A quick one for Fixture Movers");
  assert.equal(
    email.body,
    "Your reviews say people find you.\n\nI run Harbor Moving Co in Austin. Fifteen minutes? https://example.com/book\n\nSam",
  );
  // The send: the frozen request carries the same subject and the same words, with the foot after them and no more.
  const sent = reachOutRequest({
    tenantId: "22222222-2222-4222-8222-222222222222",
    messageId: "11111111-1111-4111-8111-111111111111",
    contactId: "33333333-3333-4333-8333-333333333333",
    to: "owner@fixture-movers.example",
    words: WORDS,
    lead: LEAD,
    workspace: { ...WORKSPACE, address: "100 Example St, Austin, TX 78701" },
    opening: OPENING,
    from: { address: "sam@getharbor.example", from_name: "Sam at Harbor", signature: null },
    unsubscribe: { secret: "a-secret-only-this-file-holds", origin: "https://app.chanlytics.com" },
    parent: null,
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.subject, email.subject);
  assert.equal(sent.body, email.body);
});

test("an email that leaves a hole is held, and a later step has no subject to fill", () => {
  assert.deepEqual(reachOutEmailOf(WORDS, { business_name: "Fixture Movers", city: null }, WORKSPACE, OPENING), {
    ok: false,
    reason: "missing_value",
  });
  assert.deepEqual(
    reachOutEmailOf(WORDS, LEAD, WORKSPACE, null),
    { ok: false, reason: "missing_value" },
    "no opening yet",
  );
  assert.deepEqual(reachOutEmailOf({ subject: null, body: "Bumping this: {{booking link}}" }, LEAD, WORKSPACE), {
    ok: true,
    subject: null,
    body: "Bumping this: https://example.com/book",
  });
  for (const body of ["Hi {{nickname}}", "Hi {{business", "Hi }} there"])
    assert.equal(reachOutEmailOf({ subject: null, body }, LEAD, WORKSPACE).ok, false, body);
});

test("the Templates page's preview fills the six with examples by the same fill: made up for a business, the workspace's own for the rest", () => {
  const values = reachOutExampleValues({
    businessName: "Harbor Moving Co",
    yourName: "Sam",
    bookingLink: "https://example.com/book",
  });
  assert.equal(values.length, REACH_OUT_SLOTS.length);
  const at = (slot) => values[REACH_OUT_SLOT_SET.keys.indexOf(slot)];
  assert.equal(at("your business"), "Harbor Moving Co");
  assert.equal(at("your name"), "Sam");
  assert.equal(at("booking link"), "https://example.com/book");
  const seen = renderOwnVersion("email", WORDS, values, "en", REACH_OUT_SLOT_SET);
  // The same email the edge builds for a business with these very values: the preview is that email, nothing else.
  const built = reachOutEmailOf(
    WORDS,
    { business_name: at("business"), city: at("city") },
    { businessName: at("your business"), yourName: at("your name"), bookingLink: at("booking link") },
    at("opening"),
  );
  assert.deepEqual({ subject: built.subject, body: built.body }, seen);
  // What the workspace has not said is a hole, said by its name where the page draws it, and holds a real send.
  const bare = reachOutExampleValues({ businessName: null });
  assert.equal(bare[REACH_OUT_SLOT_SET.keys.indexOf("your name")], undefined);
  assert.equal(renderOwnVersion("email", WORDS, bare, "en", REACH_OUT_SLOT_SET).body.includes("{{your name}}"), true);
});

/* ---------------------------------- the name and what was stored ---------------------------------- */

test("a reach-out's email is filed under its step's name, and the step is read back from the name", () => {
  const step = "0f1e2d3c-4b5a-4968-8776-655443322110";
  assert.equal(reachOutRowName(step), "reach_out_0f1e2d3c4b5a49688776655443322110");
  assert.equal(reachOutStepOf(reachOutRowName(step)), step);
  assert.equal(isReachOutRow({ name: reachOutRowName(step) }), true);
  for (const name of [
    "reach_out_abc",
    "reach_out_0F1E2D3C4B5A49688776655443322110",
    "visit_reminder",
    "",
    "reach_out_",
  ])
    assert.equal(reachOutStepOf(name), null, JSON.stringify(name));
  // And it is no campaign message's version: a message of that name has none to list.
  const rows = [{ name: reachOutRowName(step), channel: "email", language: "en" }];
  assert.deepEqual(versionsOf(rows, reachOutRowName(step)), { whatsapp: [], email: [], sms: [] });
});

test("words stored before keep their named slots: read back from the row as written, the one reader every version goes through", () => {
  const components = [
    { type: "HEADER", format: "TEXT", text: "Quick one for {{business}}" },
    { type: "BODY", text: "{{opening}}\n\nI run {{your business}}.\n\n{{your name}}" },
  ];
  const stored = {
    subject: "Quick one for {{business}}",
    body: "{{opening}}\n\nI run {{your business}}.\n\n{{your name}}",
  };
  assert.deepEqual(versionWords({ channel: "email", components }), stored);
  assert.deepEqual(
    emailWordsFrom({ components, body_preview: "{{opening}}" }),
    stored,
    "the sender reads it the same way",
  );
  // A step after the first has a body only, and a row with a blank part says nothing of it: its preview, or nothing.
  assert.deepEqual(emailWordsFrom({ components: [{ type: "BODY", text: "Just checking in." }], body_preview: "" }), {
    subject: null,
    body: "Just checking in.",
  });
  assert.deepEqual(emailWordsFrom({ components: [{ type: "BODY", text: "  " }], body_preview: "Preview words" }), {
    subject: null,
    body: "Preview words",
  });
  assert.equal(emailWordsFrom({ components: null, body_preview: null }), null);
  // Stored as the validator saves it, the words come back unchanged: the check passes what was stored.
  assert.deepEqual(validateEmailVersion(stored, coldFirst), { ok: true, value: stored, warnings: [] });
});
