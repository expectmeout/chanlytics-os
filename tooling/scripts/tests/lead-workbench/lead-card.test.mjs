/**
 * The pile's card (canvas B v2's decide card, cm-lead-card), run: email 1 of the sequence its adds go to, filled by the
 * send's own fill with the opening left as the line still to come (leadCardEmailOf, leadCardPartsOf); when it goes, by
 * the sequence's own line; what Add would come to (a fallback said first, a slot with no value or no address turns it
 * off and says why); every email after it for the Emails tab (leadCardStepsOf); the reason up front (leadCardReasonOf)
 * and the marks it rests on (leadCardMarksOf).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_CARD_TABS,
  LEAD_CARD_WORDS,
  LEAD_CARD_MARKS_MAX,
  leadCardEmailOf,
  leadCardMarksOf,
  leadCardPartsOf,
  leadCardReasonOf,
  leadCardStepsOf,
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
  ...over,
});

const WS = { businessName: "Rae's Studio", bookingLink: "https://example.com/book" };

const text = (parts) =>
  parts.map((p) => (p.kind === "text" ? p.text : p.kind === "opening" ? "[opening]" : `[${p.label}]`)).join("");

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
});

test("no address, or one that bounced, turns Add off before any word is weighed", () => {
  const none = leadCardEmailOf({
    chain: chain(),
    lead: place({ to: null, emailState: "none" }),
    workspace: WS,
    nowMs: NOW,
    tz: TZ,
  });
  assert.equal(none.blocked, LEAD_CARD_WORDS.noAddress);
  assert.equal(none.to, null);
  const bad = leadCardEmailOf({
    chain: chain(),
    lead: place({ emailState: "invalid" }),
    workspace: WS,
    nowMs: NOW,
    tz: TZ,
  });
  assert.equal(bad.blocked, LEAD_CARD_WORDS.badAddress);
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

test("the sheet's five tabs, Why first", () => {
  assert.deepEqual(
    LEAD_CARD_TABS.map((t) => t.label),
    ["Why", "Reach", "Emails", "About", "Activity"],
  );
});
