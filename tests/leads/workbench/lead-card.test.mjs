/**
 * The pile's card (canvas B v2's decide card, cm-lead-card), run: email 1 of the sequence its adds go to, filled by the
 * send's own fill with the opening left as the line still to come (leadCardEmailOf, leadCardPartsOf); when it goes, by
 * the sequence's own line; what Add would come to (a fallback said first; the add door's own answer, or a slot with no
 * value, turns it off and says why, and where an address is what is missing, the door left: Call, or someone else);
 * every email after it for the Emails tab (leadCardStepsOf) and what fills their words (leadCardSlotsOf); Add them all's
 * buckets (leadCardBulkOf); the reason up front (leadCardReasonOf) and the marks it rests on (leadCardMarksOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_CARD_TABS,
  LEAD_CARD_WORDS,
  LEAD_CARD_MARKS_MAX,
  LEAD_PILE_WORDS,
  leadCardBulkOf,
  leadCardEmailOf,
  leadCardMarksOf,
  leadCardPartsOf,
  leadCardReasonOf,
  leadCardSlotsOf,
  leadCardStepsOf,
  leadPileRailOf,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
// Friday 16 October 2026, 10 AM in New York: today's batch already made (last_run_for below).
const NOW = Date.parse("2026-10-16T14:00:00Z");

const step = (n, words, over = {}) => ({
  id: `step-${n}`,
  n,
  after_days: n === 0 ? null : 4,
  subject: n === 0 ? words.subject : null,
  body: words.body,
  template_id: null,
  state: "running",
  hand: null,
  ...over,
});

const chain = (over = {}) => ({
  root_id: "root-1",
  name: "Salon owners · Queens",
  state: "running",
  fed_by: "list",
  owner_sends: true,
  mailboxes: [],
  gap_minutes: 20,
  signed_by: "Rae",
  next: { run_hour: 9, last_run_for: "2026-10-16", mode: "ask", may_spend: true, waiting_run_id: null },
  steps: [
    step(0, {
      subject: "{{business}} and the calls you miss",
      body: "Hi {{first name}},\n\n{{opening}}\n\nWe answer calls for salons in {{city}}.\n\n{{your name}}",
    }),
    step(1, { body: "Hi {{first name}}, a time that may suit: {{booking link}}\n\n{{your name}}" }),
    step(2, { body: "Last one from me.\n\n{{your name}}" }, { after_days: 5 }),
  ],
  ...over,
});

const place = (over = {}) => ({
  business_name: "Luxe Lane Salon",
  city: "Queens",
  kind: "place",
  facts: {},
  to: "hello@luxelane.example.com",
  emailState: "ok",
  canCall: true,
  canChoose: false,
  ...over,
});

const WS = { businessName: "Rae's Studio", bookingLink: "https://example.com/book" };

const text = (parts) =>
  parts
    .map((p) =>
      p.kind === "text" || p.kind === "value" ? p.text : p.kind === "opening" ? "[opening]" : `[${p.label}]`,
    )
    .join("");

test("email 1 is the sequence's own words with the lead's values, the opening left as the line still to come", () => {
  const e = leadCardEmailOf({ chain: chain(), lead: place(), workspace: WS, nowMs: NOW, tz: TZ });
  assert.equal(e.head, "Email 1 of 3 · from your own inbox");
  assert.equal(e.to, "hello@luxelane.example.com");
  assert.equal(text(e.subject), "Luxe Lane Salon and the calls you miss");
  // The blank lines round the opening are its room: it stands as a line of its own.
  assert.equal(text(e.body), "Hi there,[opening]We answer calls for salons in Queens.\n\nRae");
  assert.equal(e.body.filter((p) => p.kind === "opening").length, 1);
  assert.equal(e.blocked, null);
});

test("nobody named greets them as the fallback, said before Add; a company's addressee is greeted by name", () => {
  const e = leadCardEmailOf({ chain: chain(), lead: place(), workspace: WS, nowMs: NOW, tz: TZ });
  assert.equal(e.note, LEAD_CARD_WORDS.greets("there"));
  const company = place({
    business_name: "Brightline Studio",
    kind: "company",
    facts: {
      people: [
        {
          name: "Maya Ortiz",
          first_name: "Maya",
          title: "Founder",
          role: "founder",
          email: "maya@brightline.example.com",
          profile_url: null,
        },
      ],
      addressee: 0,
    },
    to: "maya@brightline.example.com",
  });
  const c = leadCardEmailOf({ chain: chain(), lead: company, workspace: WS, nowMs: NOW, tz: TZ });
  assert.equal(c.note, null);
  assert.match(text(c.body), /^Hi Maya,/);
});

test("when it goes is the batch, never a minute: today's made, so tomorrow's, after the owner's OK on a list", () => {
  const e = leadCardEmailOf({ chain: chain(), lead: place(), workspace: WS, nowMs: NOW, tz: TZ });
  assert.equal(e.when, "Goes tomorrow from 9:00 AM, after your OK");
  const waiting = chain({ next: { ...chain().next, waiting_run_id: "run-1" } });
  assert.equal(
    leadCardEmailOf({ chain: waiting, lead: place(), workspace: WS, nowMs: NOW, tz: TZ }).when,
    "Waits for your OK",
  );
});

test("a value the email needs and the lead lacks is a gap where it would stand, and Add is off, said why", () => {
  const e = leadCardEmailOf({ chain: chain(), lead: place({ city: null }), workspace: WS, nowMs: NOW, tz: TZ });
  const gaps = e.body.filter((p) => p.kind === "gap");
  assert.equal(gaps.length, 1);
  assert.equal(text(e.body), "Hi there,[opening]We answer calls for salons in [their city].\n\nRae");
  assert.equal(e.blocked, LEAD_CARD_WORDS.holes(["their city"]));
  // An email that would not go says no time it goes.
  assert.equal(e.when, null);
});

const emailWith = (lead, check) => leadCardEmailOf({ chain: chain(), lead, workspace: WS, nowMs: NOW, tz: TZ, check });

test("Add is off by the add door's own answer, said in the card's words; before it answers only a hole turns it off", () => {
  // The door said nothing yet: the card reads no address itself (the one predicate is the door's).
  const asking = emailWith(place({ to: null, emailState: "none" }), undefined);
  assert.equal(asking.blocked, null);
  assert.equal(asking.to, null);
  assert.equal(emailWith(place(), null).blocked, null);
  assert.equal(
    emailWith(place(), { why: "customer", chain_name: null }).blocked,
    "They're already a customer, so Add is off.",
  );
  assert.equal(
    emailWith(place(), { why: "invalid", chain_name: null }).blocked,
    "Their address bounced, so Add is off.",
  );
  assert.equal(
    emailWith(place(), { why: "elsewhere", chain_name: "Gyms · Astoria" }).blocked,
    LEAD_CARD_WORDS.elsewhere("Gyms · Astoria"),
  );
  // The door's answer wins over a hole: it is why the add would come to nothing.
  assert.equal(
    emailWith(place({ city: null }), { why: "written", chain_name: null }).blocked,
    "They were already written to, and a business is written to once, so Add is off.",
  );
});

test("where an address is what is missing, the card offers the door left: someone else at a company, else a call", () => {
  assert.equal(emailWith(place(), { why: "no_email", chain_name: null }).instead, "call");
  assert.equal(emailWith(place({ canCall: false }), { why: "invalid", chain_name: null }).instead, null);
  assert.equal(emailWith(place({ canChoose: true }), { why: "invalid", chain_name: null }).instead, "choose");
  // A reason that is no address offers nothing in Add's place.
  assert.equal(emailWith(place(), { why: "customer", chain_name: null }).instead, null);
  assert.equal(emailWith(place(), null).instead, null);
  // The rail's yes is then a call, in Add's place and on its key.
  const rail = leadPileRailOf({ cls: "qualified", target: "Salon owners · Queens", call: true });
  assert.deepEqual(
    rail.map((s) => [s.act, s.key]),
    [
      ["not_a_fit", "n"],
      ["later", "l"],
      ["call", "a"],
    ],
  );
  assert.equal(rail[2].label, LEAD_PILE_WORDS.call);
});

test("an address still being checked joins, and goes once it checks out", () => {
  const e = emailWith(place({ emailState: "checking" }), undefined);
  assert.equal(e.when, `Goes tomorrow from 9:00 AM, after your OK, ${LEAD_CARD_WORDS.checking}`);
  assert.equal(e.blocked, null);
});

test("what fills their words: each slot with its value and where it came from, a fallback and a hole said as such", () => {
  const slots = leadCardSlotsOf({ chain: chain(), lead: place({ city: null }), workspace: WS });
  const by = Object.fromEntries(slots.map((x) => [x.key, x]));
  assert.deepEqual(
    slots.map((x) => x.key),
    ["business", "first name", "opening", "city", "your name", "booking link"],
  );
  assert.equal(by.business.value, "Luxe Lane Salon");
  assert.equal(by.business.from, "From their listing");
  assert.equal(by["first name"].look, "fallback");
  assert.equal(by["first name"].value, "there");
  assert.equal(by.opening.look, "later");
  assert.equal(by.city.look, "gap");
  assert.equal(by.city.value, null);
  assert.equal(by["your name"].value, "Rae");
  assert.equal(by["your name"].from, "The name this sequence signs with");
  assert.equal(by["booking link"].value, "https://example.com/book");
});

test("Add them all: each lead in its bucket by the door's answer and the send's fill; the press adds those that go", () => {
  const named = place({
    business_name: "Brightline Studio",
    kind: "company",
    facts: {
      people: [
        {
          name: "Maya Ortiz",
          first_name: "Maya",
          title: null,
          role: null,
          email: "m@b.example.com",
          profile_url: null,
        },
      ],
      addressee: 0,
    },
  });
  const bulk = leadCardBulkOf({
    chain: chain(),
    workspace: WS,
    leads: [
      { id: "a", lead: named, check: null },
      { id: "b", lead: place(), check: null },
      { id: "c", lead: place({ emailState: "checking" }), check: null },
      { id: "d", lead: place(), check: { why: "elsewhere", chain_name: "Gyms" } },
      { id: "e", lead: place(), check: { why: "no_email", chain_name: null } },
      { id: "f", lead: place(), check: { why: "no_email", chain_name: null } },
      { id: "g", lead: place({ city: null }), check: null },
    ],
  });
  assert.deepEqual(bulk.ids, ["a", "b", "c"]);
  assert.deepEqual(
    bulk.buckets.map((b) => [b.key, b.n, b.goes]),
    [
      ["goes", 1, true],
      ["there", 1, true],
      ["checking", 1, true],
      ["elsewhere", 1, false],
      ["cant", 3, false],
    ],
  );
  assert.equal(bulk.buckets.find((b) => b.key === "elsewhere").note, "1 with “Gyms”");
  assert.equal(
    bulk.buckets.find((b) => b.key === "cant").note,
    "2 with no email address, 1 missing what its words need",
  );
  assert.equal(bulk.press, "Add the 3");
  assert.equal(bulk.title, "Add them to “Salon owners · Queens”");
  // A lead the door has not answered for holds the press.
  const waiting = leadCardBulkOf({
    chain: chain(),
    workspace: WS,
    leads: [{ id: "a", lead: place(), check: undefined }],
  });
  assert.equal(waiting.waiting, 1);
  assert.deepEqual(waiting.ids, []);
});

test("a sequence with no email step has no email 1; a mailbox it sends from is named in the head", () => {
  const hands = chain({ steps: [step(0, { subject: "", body: "" }, { hand: { kind: "call" } })] });
  assert.equal(leadCardEmailOf({ chain: hands, lead: place(), workspace: WS, nowMs: NOW, tz: TZ }), null);
  const boxed = chain({
    owner_sends: false,
    mailboxes: [{ address: "rae@studio.example.com", sent_days: 10, daily_cap: 20, customer_domain: false }],
  });
  assert.equal(
    leadCardEmailOf({ chain: boxed, lead: place(), workspace: WS, nowMs: NOW, tz: TZ }).head,
    "Email 1 of 3 · from rae@studio.example.com",
  );
});

test("the Emails tab: every email in order, the first with its subject, each after it its days, a gap marked", () => {
  const steps = leadCardStepsOf({
    chain: chain(),
    lead: place(),
    workspace: { businessName: "Rae's Studio", bookingLink: null },
  });
  assert.deepEqual(
    steps.map((s) => [s.label, s.after, s.subject ? text(s.subject) : null, s.gap]),
    [
      ["Email 1", null, "Luxe Lane Salon and the calls you miss", false],
      ["Email 2", LEAD_CARD_WORDS.after(4), null, true],
      ["Email 3", LEAD_CARD_WORDS.after(5), null, false],
    ],
  );
  assert.equal(text(steps[1].body), "Hi there, a time that may suit: [booking link]\n\nRae");
});

test("the parts keep the words as written where there is no opening", () => {
  assert.deepEqual(leadCardPartsOf("Just checking in.\n\nRae"), [{ kind: "text", text: "Just checking in.\n\nRae" }]);
  assert.deepEqual(leadCardPartsOf(""), []);
});

const peekish = (over = {}) => ({
  rated: { score: "3.9", count: "83", reviews: "83 reviews", low: "29% at 1–2 stars" },
  claimedNote: "Listing not claimed by the owner",
  fit: { word: "Strong fit", cls: "strong", sentence: "An independent salon, booking by phone" },
  company: null,
  groups: [],
  ...over,
});

test("the reason up front: the listing's own signals where it gave them, else the judge's reading", () => {
  const both = leadCardReasonOf(peekish());
  assert.equal(both.text, "29% of its reviews are 1 or 2 stars, and nobody has claimed its listing.");
  assert.equal(both.how, "seen");
  assert.equal(leadCardReasonOf(peekish({ claimedNote: null })).text, "29% of its reviews are 1 or 2 stars.");
  assert.equal(
    leadCardReasonOf(peekish({ rated: { score: "4.8", count: "140", reviews: "140 reviews", low: null } })).text,
    "Nobody has claimed its listing.",
  );
  const read = leadCardReasonOf(peekish({ rated: null, claimedNote: null }));
  assert.deepEqual([read.text, read.how], ["An independent salon, booking by phone", "read"]);
  // A company's line is what its source gave: seen, and its listing's claim mark is no company's.
  const company = leadCardReasonOf(
    peekish({
      rated: null,
      claimedNote: "x",
      company: { people: [] },
      fit: { word: "", cls: "", sentence: "Founder · 11 - 50 people" },
    }),
  );
  assert.deepEqual([company.text, company.how], ["Founder · 11 - 50 people", "seen"]);
  assert.equal(
    leadCardReasonOf(peekish({ rated: null, claimedNote: null, fit: { word: "", cls: "", sentence: "  " } })),
    null,
  );
});

test("the marks: couldn't-tell first, then seen, then read; a no is the verdict's; four at most", () => {
  const check = (key, answer) => ({ key, label: key, answer, source: `from ${key}`, reason: null });
  const marks = leadCardMarksOf({
    groups: [
      {
        how: "seen",
        checks: [check("on_maps", "yes"), check("in_area", "unknown"), check("mailbox", "no"), check("phone", "yes")],
      },
      { how: "read", checks: [check("independent", "yes"), check("kind", "yes")] },
    ],
  });
  assert.deepEqual(
    marks.map((m) => [m.key, m.how, m.answer]),
    [
      ["in_area", "seen", "unknown"],
      ["on_maps", "seen", "yes"],
      ["phone", "seen", "yes"],
      ["independent", "read", "yes"],
    ],
  );
  assert.equal(marks.length, LEAD_CARD_MARKS_MAX);
  assert.equal(marks[0].from, "from in_area");
});

test("the sheet's three tabs, Why first, in Sequences' words (the refined canvas)", () => {
  assert.deepEqual(
    LEAD_CARD_TABS.map((t) => t.label),
    ["Why", "Contact", "Sequence"],
  );
});
