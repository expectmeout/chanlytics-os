import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outreachRefusalOf,
  OUTREACH_WAIT_REFUSALS,
  isWaitRefusal,
  coldEndingOf,
  coldSignedOff,
  leadCalledByOf,
  reachOutEmailOf,
  REACH_OUT_MONTH_EMAILS,
} from "@chanlytics/contracts";

// A step's body filled for one lead by the one fill every email takes: the words, or that this lead's email is held.
const reachOutSlots = (words, lead, workspace, opening = null) => {
  const r = reachOutEmailOf({ subject: null, body: words }, lead, workspace, opening);
  return r.ok ? { ok: true, text: r.body } : r;
};

const facts = (over = {}) => ({ leadStage: "ready", suppressed: false, wroteBack: false, ...over });

test("the lead's own facts, in the door's order: not a lead, closed, the never-again list, wrote back", () => {
  assert.equal(outreachRefusalOf(facts({ leadStage: null })), "outreach_not_a_lead");
  for (const stage of ["converted", "archived"])
    assert.equal(outreachRefusalOf(facts({ leadStage: stage })), "outreach_lead_closed");
  assert.equal(outreachRefusalOf(facts({ suppressed: true, wroteBack: true })), "outreach_suppressed");
  assert.equal(outreachRefusalOf(facts({ wroteBack: true })), "outreach_wrote_back");
  assert.equal(outreachRefusalOf(facts({ leadStage: "nurture" })), null);
});

test("a wait is the cap and a mailbox not sending: a send that meets one goes later, never nowhere", () => {
  assert.deepEqual(
    [...OUTREACH_WAIT_REFUSALS],
    ["sending_mailbox_at_cap", "sending_mailbox_not_ready", "outreach_needs_own_mailbox", "paused"],
    "the mailbox's day or state, a mailbox removed, a workspace paused: none is about the lead",
  );
  assert.equal(isWaitRefusal("human_has_it"), false, "a person has the thread: a conversation, not a wait");
  assert.equal(isWaitRefusal("sending_mailbox_at_cap"), true);
  assert.equal(isWaitRefusal("outreach_wrote_back"), false);
});

test("the slots Part 3 fills, and a slot with nothing to say holds the email", () => {
  const lead = { business_name: "Harbor Movers", city: "Austin" };
  assert.deepEqual(
    reachOutSlots("Hi {{business}} in {{city}}, from {{your business}}", lead, { businessName: "Best Movers" }),
    {
      ok: true,
      text: "Hi Harbor Movers in Austin, from Best Movers",
    },
  );
  assert.deepEqual(
    reachOutSlots("Hi {{business}} in {{city}}", { business_name: "Harbor", city: null }, { businessName: "Best" }),
    {
      ok: false,
      reason: "missing_value",
    },
  );
  assert.equal(REACH_OUT_MONTH_EMAILS, 2000);
});

test("a slot is named in any case or spacing; one this cannot fill, or no slot at all, holds the email", () => {
  const lead = { business_name: "Harbor Movers", city: "Austin" };
  const ws = { businessName: "Best Movers" };
  assert.deepEqual(reachOutSlots("{{ Business }} / {{YOUR   business}} / {{city}}", lead, ws), {
    ok: true,
    text: "Harbor Movers / Best Movers / Austin",
  });
  for (const words of [
    "Hi {{nickname}}",
    "Hi {{business_name}}",
    "Hi {{constructor}}",
    "Hi {{business",
    "Hi }} there",
  ]) {
    assert.deepEqual(reachOutSlots(words, lead, ws), { ok: false, reason: "missing_value" }, words);
  }
  // A value is put in as it is: never read as a slot or a replacement pattern.
  assert.deepEqual(reachOutSlots("Hi {{business}}", { business_name: "$& {{city}}", city: "Austin" }, ws), {
    ok: true,
    text: "Hi $& {{city}}",
  });
});

test("all six slots: the lead's two, the workspace's three, and the send's own opening", () => {
  const ws = { businessName: "Harbor Moving Co", yourName: "Sam", bookingLink: "https://example.com/book" };
  const r = reachOutSlots(
    "{{opening}} {{business}} in {{city}}: {{your business}}, {{booking link}}, {{ Your  Name }}",
    { business_name: "Austin Movers", city: "Austin" },
    ws,
    "Your 4.9 says people find you.",
  );
  assert.deepEqual(r, {
    ok: true,
    text: "Your 4.9 says people find you. Austin Movers in Austin: Harbor Moving Co, https://example.com/book, Sam",
  });
  // No opening yet, or none for this send: the email is held, never sent with its braces.
  assert.deepEqual(reachOutSlots("{{opening}} hi", { business_name: "A", city: "B" }, ws), {
    ok: false,
    reason: "missing_value",
  });
  assert.deepEqual(reachOutSlots("{{booking link}}", { business_name: "A", city: "B" }, { businessName: "H" }), {
    ok: false,
    reason: "missing_value",
  });
});

test("a cold email ends as its sequence says: its name, or its mailbox's signature, never a link in a first email (0077)", () => {
  const plain = "Sam Reyes\nHarbor Moving Co";
  const linked = "Sam Reyes\nHarbor Moving Co\nwww.example.com | 410 Baylor St";
  const ending = (o) =>
    coldEndingOf({ signsWith: "name", signedBy: "Sam", signature: plain, first: true, body: "Hi.", ...o });
  // The name, the default: the mailbox's signature is left off.
  assert.deepEqual(ending({}), { signOff: "Sam", signature: null });
  // The mailbox's signature, when chosen, and then no name of the sequence's own.
  assert.deepEqual(ending({ signsWith: "mailbox" }), { signOff: null, signature: plain });
  // A first email never carries a link, so a signature with one gives way to the name; a follow-up keeps it.
  assert.deepEqual(ending({ signsWith: "mailbox", signature: linked }), { signOff: "Sam", signature: null });
  assert.deepEqual(ending({ signsWith: "mailbox", signature: linked, first: false }), {
    signOff: null,
    signature: linked,
  });
  // A mailbox that signs with nothing ends with the name.
  assert.deepEqual(ending({ signsWith: "mailbox", signature: "  " }), { signOff: "Sam", signature: null });
  assert.deepEqual(ending({ signsWith: "mailbox", signature: null }), { signOff: "Sam", signature: null });
  // Words whose last line is the name already are not signed twice, in any case or spacing.
  assert.deepEqual(ending({ body: "Hi.\n\n{{ Your  Name }}\n" }), { signOff: null, signature: null });
  // Nor words that close on a line naming it with other words, or a sign-off of a few short lines that holds it (29 Oct
  // 2026: Ask closed a follow-up "- {{your name}}, {{your business}}", and the preview ended "- Ruben, Chanlytics", Ruben).
  const signed = { signOff: null, signature: null };
  assert.deepEqual(ending({ body: "Worth a look?\n\n- {{your name}}, {{your business}}" }), signed);
  assert.deepEqual(ending({ body: "Thanks, {{your name}}, for reading." }), signed);
  assert.deepEqual(ending({ body: "Worth a look?\n\nBest,\n{{your name}}\n{{your business}}" }), signed);
  // A sentence of the words that names it, or a name said further up, is not a sign-off: the name still goes under.
  assert.deepEqual(
    ending({
      body: "Worth a look?\n\nI'm {{your name}} with {{your business}}, and we help shops like yours answer every call.",
    }),
    { signOff: "Sam", signature: null },
  );
  assert.deepEqual(ending({ body: "I'm {{your name}}.\n\nWould it be worth a look?" }), {
    signOff: "Sam",
    signature: null,
  });
  // No name to sign with: nothing is added.
  assert.deepEqual(ending({ signedBy: "  " }), { signOff: null, signature: null });
  // The name goes under the words, a blank line between.
  assert.equal(coldSignedOff("Would it be worth a look?\n", "Sam"), "Would it be worth a look?\n\nSam");
  assert.equal(coldSignedOff("Would it be worth a look?", null), "Would it be worth a look?");
});

// The name a business is called by, from its listing's (30 Oct 2026: a cold email read "for shops like" a listing's
// whole title, its city and three services after bars). Made-up names in the shapes the live leads take.
const calledBy = (business_name, city = "Springfield") => leadCalledByOf({ business_name, city });

test("a listing's keyword tail is no part of the name a business is called by", () => {
  assert.equal(calledBy("R&T Mechanical | Springfield IL | Water Heater Installation | Plumbing"), "R&T Mechanical");
  assert.equal(
    calledBy("Harlan HVAC - Split Unit Air Conditioning Installation and Repair Service NYC"),
    "Harlan HVAC",
  );
  assert.equal(calledBy("K&M Performance – Mechanic Shop"), "K&M Performance");
  assert.equal(calledBy("Lakeside Movers: Local and Long Distance"), "Lakeside Movers");
  assert.equal(calledBy("Big River Installations; Plumbing & Heating"), "Big River Installations");
  assert.equal(calledBy("Delta Plumbing, Heating Cooling & Drain Cleaning"), "Delta Plumbing");
  // A hyphen inside a word, a list the name starts with, and a bar with nothing before it are no tail.
  assert.equal(calledBy("A-1 Movers"), "A-1 Movers");
  assert.equal(calledBy("Paint, Paper & Tile"), "Paint, Paper & Tile");
  assert.equal(calledBy("| Harbor Movers | Moving Company"), "Harbor Movers");
  assert.equal(calledBy("Springfield | Harbor Movers | Moving Company"), "Harbor Movers");
});

test("a city and state on the end, Inc and LLC are the listing's, not the name; nothing is cut to nothing", () => {
  assert.equal(calledBy("Harbor Movers Corp."), "Harbor Movers");
  assert.equal(calledBy("Linden Heating Mechanical, INC"), "Linden Heating Mechanical");
  assert.equal(calledBy("Ridge Air LLC"), "Ridge Air");
  // Co is as often the name's own word as a company's: kept.
  assert.equal(calledBy("Ridge Plumber Co"), "Ridge Plumber Co");
  assert.equal(calledBy("Harbor Movers-Springfield IL"), "Harbor Movers");
  assert.equal(calledBy("Harbor Movers Springfield, IL"), "Harbor Movers");
  assert.equal(calledBy("Harbor Movers Springfield IL"), "Harbor Movers");
  // A city the name ends on with no state after it may be the name's own: rules cannot tell, so it stays.
  assert.equal(calledBy("Emergency Movers Springfield"), "Emergency Movers Springfield");
  assert.equal(calledBy("LLC"), "LLC");
  assert.equal(calledBy("Springfield IL"), "Springfield IL");
  assert.equal(calledBy("  "), null);
  assert.equal(leadCalledByOf({ business_name: null, city: null }), null);
});

test("a name in capitals is said in a person's capitals, one in small letters too; a name's own styling is kept", () => {
  assert.equal(calledBy("AIRWAY HEATING AND COOLING INC"), "Airway Heating and Cooling");
  // Initials and the letters said one by one stay as they are written.
  assert.equal(calledBy("AP HVAC INC"), "AP HVAC");
  assert.equal(calledBy("NYC BBQ PIT"), "NYC BBQ Pit");
  assert.equal(calledBy("JOE'S MOVERS OF SPRINGFIELD"), "Joe's Movers of Springfield");
  assert.equal(calledBy("ZAY MOVERS-Springfield IL"), "Zay Movers");
  assert.equal(calledBy("Brothers auto Repairs"), "Brothers Auto Repairs");
  assert.equal(calledBy("harbor movers of the valley"), "Harbor Movers of the Valley");
  assert.equal(calledBy("fixit.co repairs"), "fixit.co Repairs");
  for (const own of ["iFix Movers", "NOVA Movers", "MovEasy", "24 HR Movers", "Movers & More"])
    assert.equal(calledBy(own), own);
  // A long word in capitals in a name otherwise in a person's is shouting, and a city's letters are said one by one (the
  // walk of 30 Oct 2026 read "Euro Nyc AUTOWORKS" in an opening).
  assert.equal(calledBy("Euro Nyc AUTOWORKS"), "Euro NYC Autoworks");
  assert.equal(calledBy("Euro Lab AUTOWORKS"), "Euro Lab Autoworks");
  assert.equal(calledBy("Smith CONSTRUCTION LLC"), "Smith Construction");
});

test("the send's fill says the name the business is called by, in the subject and the words alike", () => {
  const lead = { business_name: "R&T Mechanical | Springfield IL | Water Heater Installation", city: "Springfield" };
  const ws = { businessName: "Best Movers" };
  assert.deepEqual(reachOutSlots("For shops like {{business}}, {{ company }}.", lead, ws), {
    ok: true,
    text: "For shops like R&T Mechanical, R&T Mechanical.",
  });
  assert.deepEqual(reachOutEmailOf({ subject: "For {{business}}", body: "Hi {{business}}" }, lead, ws), {
    ok: true,
    subject: "For R&T Mechanical",
    body: "Hi R&T Mechanical",
  });
});
