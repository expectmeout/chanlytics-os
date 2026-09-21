/**
 * The Business tab's view models, as the bridge publishes them.
 *
 * The page is untyped JSX that reads everything through `window`, so it has the
 * tab's sentences only if the bridge publishes them, and a fold's footer says what
 * the receptionist will be told only if the bridge composes it with the function
 * the edge runs. Run, never read: the bridge is installed over a bare window and
 * asked, and each answer is held against contracts' own -- by what it says, since
 * the runner loads the bridge's copy of contracts apart from this file's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  standingLine, abilityRows, cannotRows, bookingHeld, bookingTemplate, ruleStrength, GUARDRAIL_KEYS,
  promptBlocks, composeSystemPrompt, PROMPT_OPENINGS,
} from "@chanlytics/contracts";

globalThis.window = {};
const { installInboxVerbs } = await import("../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
installInboxVerbs();
const tab = globalThis.window.__businessTab;

const brain = { business_name: "Melany's Beauty Salon", booking_link: "https://booksy.com/en-us/1817434" };
/** Melany's record, as a fold holds it. */
const profile = {
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  address: "2581 Pitkin Ave, Brooklyn, NY 11208",
  hours: { mon: { open: "09:30", close: "18:00" }, sat: { open: "09:30", close: "19:00" } },
  services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
  escalate_when: ["They ask for Melany"],
  booking_rules: { lead_hours: 2, slot_min: 30, party_max: 4, consult_first: ["Color correction", "Extensions"] },
  guardrails: { never_quote_prices: true },
};
const TZ = "America/New_York";

test("the bridge publishes the tab's view models, and each says what contracts says", () => {
  assert.deepEqual(Object.keys(tab).sort(), [
    "GUARDRAIL_KEYS", "abilityRows", "bookingHeld", "bookingTemplate", "cannotRows", "consequenceOf", "promptBlocks", "ruleStrength", "standingLine",
  ]);
  const stored = { ...brain, profile };
  assert.deepEqual(tab.standingLine(stored), standingLine(stored));
  const inputs = {
    voiceLive: true, whatsappLive: true, hasCalendarFeed: true, hasBookingLink: true, hasBookingTemplate: true,
    hasHandoffNumber: true, hasEscalateWhen: true, pauseHours: null, visionOn: false, bookingHeld: false,
  };
  assert.deepEqual(tab.abilityRows(inputs), abilityRows(inputs));
  for (const smsLive of [false, true]) assert.deepEqual(tab.cannotRows({ smsLive }), cannotRows({ smsLive }));
  const policies = [null, { booking: { mode: "auto" } }, { booking: { mode: "ask" } }];
  assert.deepEqual(policies.map((p) => tab.bookingHeld(p)), policies.map((p) => bookingHeld(p)));
  assert.equal(tab.bookingHeld({ booking: { mode: "ask" } }), true, "a held booking is said to be held");
  const starter = { name: "booking_link", language: "en_US", meta_status: "approved", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] };
  assert.equal(tab.bookingTemplate([starter]), bookingTemplate([starter]));
  assert.equal(tab.bookingTemplate([starter]), starter, "the approved starter is the one a call sends the link with");
  assert.deepEqual(tab.GUARDRAIL_KEYS, GUARDRAIL_KEYS);
  for (const key of GUARDRAIL_KEYS) assert.deepEqual(tab.ruleStrength(key), ruleStrength(key), key);
  const text = composeSystemPrompt(brain, profile, "whatsapp", TZ);
  assert.deepEqual(tab.promptBlocks(text, "whatsapp", { profile }), promptBlocks(text, "whatsapp", { profile }));
});

test("a fold shows the block the composer writes for it, from the draft it holds", () => {
  const block = tab.consequenceOf("booking_rules", { brain, profile });
  const composed = composeSystemPrompt(brain, profile, "whatsapp", null);
  assert.deepEqual(block, promptBlocks(composed, "whatsapp", { profile }).find((b) => b.row === "booking_rules"), "the block contracts cuts from the composer's prompt, whole");
  assert.ok(block.text.startsWith(PROMPT_OPENINGS.bookingRules), block.text);
  assert.ok(composed.includes(block.text), "in the composer's own words, never the page's");
  assert.match(block.text, /^- At least 2 hours' notice for any appointment\.$/m, "a typed 2 is the notice it states");

  // The page passes the stored brain, which carries its own profile and prompt. Neither is read: the block follows the fold.
  const saved = { ...brain, system_prompt: "You are the WhatsApp assistant for Melany's Beauty Salon. Always end with [[HUMAN]] if unsure.", profile };
  const retyped = tab.consequenceOf("booking_rules", { brain: saved, profile: { ...profile, booking_rules: { lead_hours: 0 } } });
  assert.match(retyped.text, /^- Same-day bookings are fine, right up to the time\.$/m);
  assert.doesNotMatch(retyped.text, /notice|consultation|per booking|HUMAN/);
});

test("folds that share a block find the same one, and the channel and the zone reach the composer", () => {
  const draft = { brain, profile };
  const who = tab.consequenceOf("tone", draft);
  assert.equal(who.row, "identity");
  assert.match(who.text, /^Tone: Warm and unhurried\.$/m, "the voice is a line of Who you are");
  assert.deepEqual(tab.consequenceOf("languages", draft), who, "and so are the languages: one block, whichever fold asks");

  const chat = tab.consequenceOf("escalate_when", draft);
  const call = tab.consequenceOf("escalate_when", draft, "voice");
  assert.ok(chat.text.startsWith(PROMPT_OPENINGS.handoffChat), chat.text);
  assert.ok(call.text.startsWith(PROMPT_OPENINGS.handoffCall), call.text);
  for (const block of [chat, call]) assert.match(block.text, /^- They ask for Melany$/m, "the owner's reason, under the hand-off on either channel");

  assert.match(tab.consequenceOf("hours", draft, "whatsapp", TZ).text, /^Opening hours \(all times America\/New_York\):$/m);
  assert.doesNotMatch(tab.consequenceOf("hours", draft).text, /all times/, "and with no zone given, none is claimed");
});

test("a fold the prompt never reads, or one the composer writes nothing for, draws no block", () => {
  const draft = { brain, profile };
  assert.equal(tab.consequenceOf("fallbacks", draft), null, "sent when the model cannot be reached, never part of the prompt");
  assert.equal(tab.consequenceOf("not_a_fold", draft), null);
  assert.equal(tab.consequenceOf("notes", draft), null, "no notes, no block");
  assert.equal(tab.consequenceOf("booking_rules", { brain, profile: { ...profile, booking_rules: {} } }), null, "a rule with no lines");
  assert.equal(tab.consequenceOf("services", { brain, profile: { ...profile, services: [] } }), null, "an empty list");
  assert.equal(tab.consequenceOf("extra_instructions", draft), null, "no words of the owner's, so none are shown as theirs");

  // Each has its block the moment the fold holds something to say.
  const notes = tab.consequenceOf("notes", { brain, profile: { ...profile, notes: [{ title: "Walk-ins", text: "Walk-ins are welcome." }] } });
  assert.ok(notes.text.startsWith(PROMPT_OPENINGS.notes), notes.text);
  const own = tab.consequenceOf("extra_instructions", { brain, profile: { ...profile, extra_instructions: "Never discuss competitors." } });
  assert.equal(own.row, "extra_instructions");
  assert.ok(own.text.endsWith("\nNever discuss competitors."), "the owner's words, found as theirs");
});
