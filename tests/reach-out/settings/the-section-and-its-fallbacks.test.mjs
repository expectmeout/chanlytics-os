/**
 * How it reaches out's section of the config (decision 0113): what it keeps and refuses, and what each writer reads when
 * a field is absent, which is what it read before the page existed. Every claim here runs the contracts' own code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TenantConfigSchema,
  TenantConfigWriteSchema,
  REACH_OUT_LIMITS,
  SIGNED_BY_MAX,
  reachOutOfferOf,
  reachOutToneOf,
  reachOutSignedByOf,
  reachOutBackingOf,
  reachOutSignatureProblem,
  reachOutRuleLines,
  writesBackRows,
  replyModeHint,
} from "@chanlytics/contracts";

test("the section parses, leaves out a key it does not know, and holds its limits", () => {
  const parsed = TenantConfigSchema.parse({
    reach_out: { offer: "Evening cleaning", proof: ["We clean 40 clinics"], reply_offer: "call", stray: 1 },
  });
  assert.deepEqual(parsed.reach_out, {
    offer: "Evening cleaning",
    proof: ["We clean 40 clinics"],
    reply_offer: "call",
  });
  assert.throws(() => TenantConfigSchema.parse({ reach_out: { proof: Array(REACH_OUT_LIMITS.claims + 1).fill("x") } }));
  assert.throws(() => TenantConfigSchema.parse({ reach_out: { offer: "x".repeat(REACH_OUT_LIMITS.offer + 1) } }));
});

test("a reply offer a newer build wrote reads as none, never as a config that cannot be read", () => {
  const read = TenantConfigSchema.parse({ reach_out: { reply_offer: "fax", offer: "A" } }).reach_out;
  assert.equal(read.offer, "A");
  assert.equal(read.reply_offer, undefined);
});

test("a typo inside the section is refused on the way in, by name", () => {
  const r = TenantConfigWriteSchema.safeParse({ reach_out: { ofer: "A" } });
  assert.equal(r.success, false);
});

test("a sequence's sign-off and the page's are held to one number", () => {
  assert.equal(SIGNED_BY_MAX, REACH_OUT_LIMITS.signedBy);
});

test("the offer falls back: the section, then what the business does, then the goal", () => {
  assert.equal(reachOutOfferOf({ reach_out: { offer: " A " }, ask: { goal: "G" } }, "B"), "A");
  assert.equal(reachOutOfferOf({ reach_out: { offer: "  " }, ask: { goal: "G" } }, "B"), "B");
  assert.equal(reachOutOfferOf({ ask: { goal: "G" } }, null), "G");
  assert.equal(reachOutOfferOf(null, null), null);
});

test("the tone falls back to the receptionist's, and the sign-off to what the caller knew", () => {
  assert.equal(reachOutToneOf({ brain: { profile: { tone: "Warm" } } }), "Warm");
  assert.equal(reachOutToneOf({ reach_out: { tone: "Direct" }, brain: { profile: { tone: "Warm" } } }), "Direct");
  assert.equal(reachOutToneOf(null), null);
  assert.equal(reachOutSignedByOf({ reach_out: { signed_by: "Maya" } }, "Ruben"), "Maya");
  assert.equal(reachOutSignedByOf({}, "Ruben"), "Ruben");
  assert.equal(reachOutSignedByOf(null, null), null);
});

test("a signature is three lines at most, under its length, with no link", () => {
  assert.equal(reachOutSignatureProblem("Maya Ortiz\nOwner\nBrightline Cleaning"), null);
  assert.equal(reachOutSignatureProblem("a\nb\nc\nd"), "too_many_lines");
  assert.equal(reachOutSignatureProblem("Maya · brightlinecleaning.com"), "link");
  assert.equal(reachOutSignatureProblem("x".repeat(REACH_OUT_LIMITS.signature + 1)), "too_long");
  assert.equal(reachOutSignatureProblem(""), null);
});

test("what backs a number is the claims and the business's name", () => {
  assert.deepEqual(reachOutBackingOf({ reach_out: { proof: ["We clean 40 clinics"] } }, "Brightline 24"), [
    "We clean 40 clinics",
    "Brightline 24",
  ]);
  assert.deepEqual(reachOutBackingOf(null, null), []);
});

test("the rules the page states are the numbers the code keeps", () => {
  const rules = reachOutRuleLines();
  assert.equal(rules.length, 7);
  assert.equal(rules[3], "Under 120 words, no line in capitals. Ask keeps its own to 80, follow-ups to 50");
  assert.equal(rules[5], "A new mailbox sends 10 a day, then 20, 30 and 40, a week apart");
  assert.equal(rules[6], "Listens 30 days for a reply, and stops the moment one comes");
});

test("what a reply sets off: five rows, one of them the owner's to change", () => {
  const rows = writesBackRows("call");
  assert.deepEqual(
    rows.map((r) => [r.id, r.fixed]),
    [
      ["reply_offer", false],
      ["not_now", true],
      ["said_no", true],
      ["wrong_person", true],
      ["away", true],
    ],
  );
  assert.equal(
    rows[0].value,
    "Your sequence stops for them. An answer is drafted for you to send, offering a call with you",
  );
  assert.equal(writesBackRows(undefined)[0].value.endsWith("offering your booking link"), true);
  assert.equal(replyModeHint("never"), "Nothing is drafted while Autonomy › Replies stays quiet.");
  assert.equal(replyModeHint("ask"), "Drafts follow Autonomy › Replies: Asks you.");
});
