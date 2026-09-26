/**
 * A reach-out step's words (packages/contracts reach-out-words.ts), run: the six slots, what a step may say to be
 * saved, and the chain the sheet saves. The first-email subject rule is the wire's own (posesAsReply).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  posesAsReply,
  REACH_OUT_SLOTS,
  slotsNamed,
  emailWordCount,
  linkCount,
  shoutingLine,
  validateReachOutWords,
  wordsIssueWords,
  ReachOutChainSchema,
  validateReachOutChain,
  chainIssueWords,
  linksIn,
  wordCount,
  reachOutSlots,
  customerDomainOf,
} from "@chanlytics/contracts";

test("a first email a program sends never poses as a reply or a forward, in any of the languages' prefixes", () => {
  for (const s of ["Re: your studio", "RE:hello", "Fwd: a note", "fw: x", "AW: Termin", "SV: tid", "Antw: vraag"])
    assert.equal(posesAsReply(s), true, s);
  for (const s of ["Regarding your studio", "Reviews like yours", "Forward thinking", "  The calls you miss"])
    assert.equal(posesAsReply(s), false, s);
});

const BODY =
  "{{opening}}\n\nI run Harbor Moving: we answer your phone while you're on a job.\n\nFifteen minutes this week: {{booking link}}\n\n{{your name}}";

test("the six slots, named in any case and spacing, and a brace without its pair", () => {
  assert.deepEqual([...REACH_OUT_SLOTS], ["opening", "business", "city", "your name", "your business", "booking link"]);
  assert.deepEqual(slotsNamed("Hi {{ Business }}, {{city}} and {{business}}"), {
    names: ["business", "city"],
    stray: false,
  });
  assert.equal(slotsNamed("Hi {{business").stray, true);
  assert.equal(slotsNamed("Hi business}}").stray, true);
});

test("a business reads the opening as forty words at most, and each other slot as one", () => {
  assert.equal(emailWordCount("{{opening}} two words"), 42);
  assert.equal(emailWordCount("Hi {{business}}, see you"), 4);
});

test("a link is one written out or a booking link; a line of eight capitals or more shouts", () => {
  assert.equal(linkCount("see https://example.com and www.example.org"), 2);
  assert.equal(linkCount("{{booking link}}"), 1);
  assert.equal(shoutingLine("FREE TRIAL TODAY\nthanks"), true);
  assert.equal(shoutingLine("Hi SBA folks, a 5.0 on Google"), false);
});

test("the first step's words: a subject that is the step's own, a body with known slots, short, one link, no shouting", () => {
  assert.deepEqual(validateReachOutWords({ subject: "The calls you miss mid-job", body: BODY }, true), []);
  const bad = validateReachOutWords(
    {
      subject: "Re: your {{opening}}",
      body: "{{first name}}, SEE THIS NOW\nhttps://a.example https://b.example {{opening}} {{opening}}",
    },
    true,
  ).map((i) => `${i.field}:${i.problem}${i.slot ? `:${i.slot}` : ""}`);
  assert.deepEqual(bad.sort(), [
    "body:opening_twice",
    "body:shouting",
    "body:too_many_links",
    "body:unknown_slot:first name",
    "subject:opening_in_subject",
    "subject:subject_poses_as_reply",
  ]);
  // The opening counts forty: forty and eighty-one more is one past the hundred and twenty.
  assert.deepEqual(
    validateReachOutWords({ subject: "Hi", body: `{{opening}} ${"word ".repeat(81)}` }, true).map((i) => i.problem),
    ["too_many_words"],
  );
});

test("a later step answers the one before: its subject is never read, whatever it says", () => {
  assert.deepEqual(
    validateReachOutWords({ subject: "Re: anything", body: "Bumping this. {{booking link}}" }, false),
    [],
  );
  assert.deepEqual(
    validateReachOutWords({ subject: null, body: "  " }, false).map((i) => i.problem),
    ["body_missing"],
  );
});

test("each problem is said in the owner's words", () => {
  assert.equal(
    wordsIssueWords({ field: "body", problem: "unknown_slot", slot: "first name" }),
    "{{first name}} isn't one of the slots. Use the chips below.",
  );
  assert.equal(
    wordsIssueWords({ field: "body", problem: "too_many_words" }),
    "Keep it under 120 words, counting the opening as 40.",
  );
});

const SEARCH = "00000000-0000-4000-8000-000000000001";
const chain = (over = {}) => ({
  name: "Reach out · Movers",
  search_id: SEARCH,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps: [
    { subject: "The calls you miss mid-job", body: BODY, after_days: null },
    { subject: null, body: "Bumping this in case it got buried: {{booking link}}\n\n{{your name}}", after_days: 4 },
  ],
  ...over,
});

test("a chain as the sheet saves it parses, and its bounds are the database's", () => {
  assert.equal(ReachOutChainSchema.safeParse(chain()).success, true);
  assert.equal(ReachOutChainSchema.safeParse(chain({ gap_minutes: 4 })).success, false);
  assert.equal(ReachOutChainSchema.safeParse(chain({ steps: [] })).success, false);
  assert.equal(ReachOutChainSchema.safeParse(chain({ steps: Array(6).fill(chain().steps[1]) })).success, false);
  assert.equal(ReachOutChainSchema.safeParse(chain({ domain_ids: Array(6).fill(SEARCH) })).success, false);
});

test("the first step goes on day one, each after it waits its days; a name to sign with and a booking link when named", () => {
  assert.deepEqual(validateReachOutChain(chain(), { bookingLink: true }), []);
  const issues = validateReachOutChain(
    chain({
      signed_by: " ",
      steps: [
        { subject: "Hi", body: "{{your name}} {{booking link}}", after_days: 3 },
        { subject: null, body: "Bumping this.", after_days: null },
      ],
    }),
    { bookingLink: false },
  ).map((i) => `${i.step}:${i.field}:${i.problem}`);
  assert.deepEqual(issues.sort(), [
    "0:after_days:first_has_a_delay",
    "1:after_days:step_needs_a_delay",
    "null:body:no_booking_link",
    "null:signed_by:no_name_to_sign",
  ]);
  assert.equal(
    chainIssueWords({ step: null, field: "body", problem: "no_booking_link" }),
    "Your words name {{booking link}}. Add your booking link in Settings › Business first.",
  );
});

test("one link rule: a bare web address is a link in the words and the subject, an email address is not", () => {
  assert.deepEqual(linksIn("see example.com and harbor.example/book"), ["example.com", "harbor.example/book"]);
  assert.deepEqual(linksIn("write to me@harbor.example, St.Louis, a 4.9"), []);
  assert.deepEqual(linksIn("HTTPS://Harbor.example/x and www.harbor.example"), [
    "HTTPS://Harbor.example/x",
    "www.harbor.example",
  ]);
  assert.equal(linkCount("see example.com, or {{booking link}}"), 2);
  const words = (subject, body) => validateReachOutWords({ subject, body }, true).map((i) => i.problem);
  assert.ok(words("Your calls", "see example.com, or {{booking link}}").includes("too_many_links"));
  assert.ok(words("see https://a.example", "Hello {{business}}.").includes("link_in_subject"));
});

test("a brace a business would read is refused at the save, and holds the send", () => {
  for (const body of ["Hi {business}.", "Hi {{{business}}}.", "Hi {{business}.", "Hi business}}."])
    assert.ok(
      validateReachOutWords({ subject: "x", body }, true).some((i) => i.problem === "stray_brace"),
      body,
    );
  const lead = { business_name: "Austin Movers", city: "Austin" };
  assert.deepEqual(reachOutSlots("Hi {{{business}}}.", lead, { businessName: "Harbor" }), {
    ok: false,
    reason: "missing_value",
  });
  assert.deepEqual(reachOutSlots("Hi {{ Business }} in {{city}}.", lead, { businessName: "Harbor" }), {
    ok: true,
    text: "Hi Austin Movers in Austin.",
  });
});

test("capitals shout across lines, and a line ending of any kind splits them", () => {
  assert.equal(shoutingLine("FREE\nTRIAL\nTODAY"), true);
  assert.equal(shoutingLine("FREE\n\nTRIAL"), false);
  assert.equal(shoutingLine("Hello\rCALL US RIGHT NOW"), true);
  assert.equal(wordCount("a — b , c"), 3);
});

test("a customer's domain is read from a real address", () => {
  assert.equal(customerDomainOf("Owner@HydePark.Example", true), "hydepark.example");
  assert.equal(customerDomainOf("a@b@c.example", true), null);
});
