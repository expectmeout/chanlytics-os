/**
 * A lead's own words at one step (decision 0096), run: the email as the box opens with it, what the box says as the words
 * to keep, its slots kept where that changes no character, the rules a step's words are held to, and the lead card reading
 * them in every email it draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const {
  LEAD_WORDS_BOX: W,
  coldEndingOf,
  leadCardEmailOf,
  leadCardStepsOf,
  leadOwnWordsOf,
  leadWordsFromBox,
  leadWordsInBox,
  leadWordsProblem,
  linkCount,
  reachOutEmailOf,
  slotCount,
  wordsNeedOpening,
} = contracts;

const company = (over = {}) => ({
  business_name: "Working Planet",
  city: "Austin",
  kind: "company",
  facts: { people: [{ name: "Vida Jakabhazy", first_name: "Vida", title: "Founder", role: "owner" }], addressee: 0 },
  source: "local_businesses",
  ...over,
});
const nobody = (over = {}) => company({ facts: { people: [] }, ...over });
const WS = { businessName: "Chanlytics", yourName: "Ruben", bookingLink: "https://book.example.com/ruben" };

const STEP = {
  subject: "A quick question about your phones, {{first name}}",
  body: "Hi {{first name}},\n\n{{opening}}\n\nI'm writing to a few owners in {{city}}.\n\n- {{your name}}",
};

const open = (over = {}) => leadWordsInBox({ words: STEP, lead: company(), workspace: WS, opening: null, ...over });
const kept = (typed, over = {}) => leadWordsFromBox({ typed, base: STEP, lead: company(), workspace: WS, ...over });

test("the box opens on the email as it reads: real values, and the line written for them", () => {
  const box = open({ opening: "You run a small team in Austin." });
  assert.equal(box.subject, "A quick question about your phones, Vida");
  assert.equal(
    box.body,
    "Hi Vida,\n\nYou run a small team in Austin.\n\nI'm writing to a few owners in Austin.\n\n- Ruben",
  );
});

test("a line not written yet is a mark in the box, and left alone stays the slot the check writes", () => {
  const box = open();
  assert.ok(box.body.includes(W.line));
  const words = kept(box);
  assert.equal(words.body, STEP.body, "nothing changed: the words as the step writes them");
  assert.equal(wordsNeedOpening(words), true, "the check still writes their line");
});

test("a line written and left in the box is kept as typed: the check writes nothing over it", () => {
  const line = "You run a small team in Austin.";
  const words = kept(open({ opening: line }));
  assert.ok(words.body.includes("You run a small team in"));
  assert.equal(wordsNeedOpening(words), false);
});

test("the mark overwritten or deleted is the member's", () => {
  const box = open();
  const mine = kept({ ...box, body: box.body.replace(W.line, "I loved your podcast.") });
  assert.ok(mine.body.includes("I loved your podcast."));
  assert.equal(wordsNeedOpening(mine), false);
  const none = kept({ ...box, body: box.body.replace(`${W.line}\n\n`, "") });
  assert.equal(wordsNeedOpening(none), false);
});

test("values go back to their slots, so a name put right still reaches the email", () => {
  const box = open();
  const words = kept({ subject: box.subject, body: box.body.replace("a few owners", "a handful of founders") });
  assert.equal(words.subject, STEP.subject);
  assert.equal(slotCount(words.body, "first name"), 1);
  assert.equal(slotCount(words.body, "city"), 1);
  const renamed = company({
    facts: { people: [{ name: "Sam Lee", first_name: "Sam", title: "Founder", role: "owner" }], addressee: 0 },
  });
  const filled = reachOutEmailOf(words, renamed, WS, "A line.");
  assert.ok(filled.ok);
  assert.ok(filled.body.startsWith("Hi Sam,"), filled.body);
  assert.ok(filled.body.includes("a handful of founders"));
});

test("whatever is kept reads back as exactly what was typed", () => {
  const texts = [
    "Hi Vida, Vida and Vidalia in Austin, Austinite.",
    "Over there, Working Planet.",
    "Plain words with nothing to swap.",
    "Austin\n\n\nVida.\n- Ruben",
  ];
  for (const body of texts) {
    const words = kept({ subject: "Vida", body });
    const back = leadWordsInBox({ words, lead: company(), workspace: WS, opening: null });
    assert.equal(back.body, body);
    assert.equal(back.subject, "Vida");
  }
});

test("a name is swapped where it stands alone: Vida is not in Vidalia", () => {
  const words = kept({ subject: "Hi", body: "Vida grows Vidalia onions." });
  assert.equal(words.body, "{{first name}} grows Vidalia onions.");
});

test("the fallback is never a slot: over there stays words where nobody is named", () => {
  const lead = nobody();
  const box = leadWordsInBox({ words: STEP, lead, workspace: WS, opening: "A line." });
  assert.ok(box.body.startsWith("Hi there,"));
  const words = leadWordsFromBox({
    typed: { subject: box.subject, body: "Hi there, over there." },
    base: STEP,
    lead,
    workspace: WS,
  });
  assert.equal(slotCount(words.body, "first name"), 0);
  assert.equal(words.body, "Hi there, over there.");
});

test("a slot their words never named stays words", () => {
  const base = { subject: "Hello", body: "Written to everyone alike." };
  const words = leadWordsFromBox({
    typed: { subject: "Hello", body: "Written to you in Austin, Vida." },
    base,
    lead: company(),
    workspace: WS,
  });
  assert.equal(words.body, "Written to you in Austin, Vida.");
});

test("a later step keeps no subject", () => {
  const base = { subject: null, body: "Following up, {{first name}}." };
  const box = leadWordsInBox({ words: base, lead: company(), workspace: WS, opening: null });
  assert.equal(box.subject, null);
  const words = leadWordsFromBox({
    typed: { subject: null, body: `${box.body} Thanks.` },
    base,
    lead: company(),
    workspace: WS,
  });
  assert.deepEqual(words, { subject: null, body: "Following up, {{first name}}. Thanks." });
});

test("a sign-off left as it was names the sender once: the send signs it no second time", () => {
  const words = kept(open());
  const ending = coldEndingOf({
    signsWith: "name",
    signedBy: "Ruben",
    signature: null,
    first: true,
    body: words.body,
    address: "1 Main St",
  });
  assert.equal(ending.signOff, null, "the words close on {{your name}} still");
});

test("their preview and the booking link stay slots: a link counted, a preview's days started", () => {
  const base = { subject: null, body: "See {{their preview}} or {{booking link}}." };
  const lead = company({ preview: { state: "open", url: "https://app.example.com/preview/abc" } });
  const box = leadWordsInBox({ words: base, lead, workspace: WS, opening: null });
  assert.equal(box.body, "See https://app.example.com/preview/abc or https://book.example.com/ruben.");
  const words = leadWordsFromBox({ typed: box, base, lead, workspace: WS });
  assert.equal(words.body, base.body);
  assert.equal(linkCount(words.body), 2);
  const building = company({ preview: { state: "building" } });
  const marked = leadWordsInBox({ words: base, lead: building, workspace: WS, opening: null });
  assert.ok(marked.body.includes("[Their preview]"));
  assert.ok(
    leadWordsFromBox({ typed: marked, base, lead: building, workspace: WS }).body.includes("{{their preview}}"),
  );
});

test("a value they lack is a mark that must be filled, and filled it goes", () => {
  const base = { subject: "Hello", body: "To the {{title}} at {{company}}." };
  const lead = nobody();
  const box = leadWordsInBox({ words: base, lead, workspace: WS, opening: null });
  assert.ok(box.body.includes("[Their title]"));
  const left = leadWordsFromBox({ typed: box, base, lead, workspace: WS });
  assert.equal(left.body, base.body);
  assert.equal(leadWordsProblem({ words: left, first: true, lead, workspace: WS }), W.fill(["their title"]));
  const filled = leadWordsFromBox({
    typed: { subject: "Hello", body: box.body.replace("[Their title]", "owner") },
    base,
    lead,
    workspace: WS,
  });
  assert.equal(leadWordsProblem({ words: filled, first: true, lead, workspace: WS }), null);
});

test("the rules a step's words are held to hold here", () => {
  const problem = (subject, body, first = true) =>
    leadWordsProblem({ words: { subject, body }, first, lead: company(), workspace: WS });
  assert.equal(problem("Hello", "A plain note."), null);
  assert.ok(problem("", "A plain note."), "a first email has a subject");
  assert.ok(problem("Hello", " "), "and words");
  assert.ok(problem("Re: hello", "A plain note."), "a first email is no reply");
  assert.ok(problem("Hello", "Read example.com today."), "a first email carries no link");
  assert.equal(problem(null, "Read example.com today.", false), null, "a later one may carry one");
  assert.ok(problem(null, "Read example.com and example.org.", false), "and one at most");
  assert.ok(problem("Hello", "word ".repeat(130)), "a hundred and twenty words at most");
  assert.ok(problem("Hello", "BUY THIS NOW TODAY"), "no line in capitals");
  assert.ok(problem("Hello", "See {{nothing}}."), "braces are slots");
});

test("Windows line ends and trailing blanks are not kept", () => {
  assert.equal(kept({ subject: " Hello ", body: "One\r\nTwo\r\n\r\n" }).body, "One\nTwo");
  assert.equal(kept({ subject: " Hello ", body: "One" }).subject, "Hello");
});

const chain = () => ({
  root_id: "s-1",
  name: "Agency owners",
  state: "running",
  fed_by: null,
  next: { run_hour: 9, last_run_for: null, waiting_run_id: null },
  owner_sends: false,
  mailboxes: [],
  gap_minutes: 12,
  signed_by: "Ruben",
  steps: [
    { id: "st-1", n: 0, subject: STEP.subject, body: STEP.body, after_days: null, hand: null },
    { id: "st-2", n: 1, subject: null, body: "Following up, {{first name}}.", after_days: 4, hand: null },
  ],
});
const cardLead = (over = {}) => ({
  ...company(),
  to: "vida@example.com",
  emailState: "ok",
  canCall: false,
  canChoose: false,
  ...over,
});
const textOf = (parts) => parts.map((p) => p.text ?? "").join("");

test("the card reads a lead's own words where they have some, and says whose they are", () => {
  const own = leadOwnWordsOf([
    { step_id: "st-1", subject: "Your own subject", body: "My words for {{first name}}.", at: "2026-11-05T00:00:00Z" },
  ]);
  const steps = leadCardStepsOf({ chain: chain(), lead: cardLead(), workspace: WS, own });
  assert.equal(steps[0].own, true);
  assert.equal(textOf(steps[0].subject), "Your own subject");
  assert.equal(textOf(steps[0].body), "My words for Vida.");
  assert.ok(!steps[0].body.some((p) => p.kind === "opening"), "their words hold no line to write");
  assert.deepEqual(steps[0].stepWritten, { subject: STEP.subject, body: STEP.body }, "the way back");
  assert.equal(steps[1].own, false);
  const none = leadCardStepsOf({ chain: chain(), lead: cardLead(), workspace: WS });
  assert.equal(none[0].own, false);
  assert.ok(none[0].body.some((p) => p.kind === "opening"));
});

test("a value typed in turns Add back on: the gap is the step's words, never the lead's own", () => {
  const gappy = chain();
  gappy.steps[0].body = "To the {{title}} here.";
  const args = { chain: gappy, lead: cardLead({ ...nobody() }), workspace: WS, nowMs: 0, tz: "UTC" };
  assert.ok(leadCardEmailOf(args).blocked, "the step's words need a title they lack");
  const own = leadOwnWordsOf([{ step_id: "st-1", subject: "Hello", body: "To the owner here.", at: "x" }]);
  assert.equal(leadCardEmailOf({ ...args, own }).blocked, null);
});
