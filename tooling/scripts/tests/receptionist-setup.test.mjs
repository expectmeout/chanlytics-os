/**
 * Setting up a receptionist without hand-writing SQL.
 *
 * Provisioning (migration 00017) inserts an EMPTY tenant_config row, and the
 * settings form only ever edited the profile ON an existing brain — it never
 * collected the business name, the phone line or the booking link. So a second
 * customer could not be onboarded through the product at all: their config had
 * to be written into the database by hand, which is exactly how the first
 * tenant's 5,027-character prompt got there.
 *
 * The same gap meant nobody could change their own booking link after setup.
 *
 * The defaults live in contracts, beside BrainConfigSchema, because a default
 * that drifts out of spec does not fail in review — it fails for the next
 * business that tries to set itself up, at the moment it tries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BrainConfigSchema,
  TenantConfigSchema,
  hasProfile,
  newReceptionistDefaults,
  resolveSystemPrompt,
  fallbackMessages,
} from "@chanlytics/contracts";

const NAME = "Aurora Nails & Spa";
const PHONE = "(646) 555-0134";
const LINK = "https://booksy.com/en-us/999999_aurora-nails";

/**
 * What the create fold PUTs for a workspace whose config is `{}` (pages/business-tab-create.jsx, the fold
 * business-tab-folds.jsx calls "receptionist"; business-tab-create.test.mjs presses it and reads what it sent).
 *
 * The form this replaced wrote a profile holding the three guardrails as well. hasProfile does not count them, so a
 * profile of guardrails alone composed exactly what no profile composes, and absent is the same three rules in force
 * (the page reads each as on unless an explicit false). Writing none is the same receptionist, said once.
 */
const freshConfig = () => ({
  brain: {
    business_name: NAME,
    phone_display: PHONE,
    booking_link: LINK,
    ...newReceptionistDefaults(NAME),
  },
});

test("a brand-new receptionist parses against the schema the EDGE uses", () => {
  // If this fails, setup produces a config that mutes the line it just created.
  const r = TenantConfigSchema.safeParse(freshConfig());
  assert.equal(r.success, true, r.success ? "" : JSON.stringify(r.error.issues, null, 1));
});

test("every field BrainConfigSchema demands is supplied", () => {
  const r = BrainConfigSchema.safeParse(freshConfig().brain);
  assert.equal(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  const d = newReceptionistDefaults(NAME, PHONE, LINK);
  assert.ok(d.system_prompt.length >= 40, "the schema's minimum is 40 characters");
  for (const k of ["greeting", "error", "non_text"]) {
    assert.ok(d.fallbacks[k]?.length, `${k} is what a customer reads when the model is unreachable`);
  }
});

test("the baseline prompt states NO facts — they belong to the profile", () => {
  // A baseline repeating the address or hours would be a second copy of each,
  // free to go stale the moment the owner edits a field. That is the bug this
  // whole area has had twice.
  const p = newReceptionistDefaults(NAME, PHONE, LINK).system_prompt;
  for (const fact of ["hours", "open", "address", "Monday", LINK, PHONE]) {
    assert.ok(!p.includes(fact), `the baseline must not state ${fact}`);
  }
  assert.ok(p.includes(NAME), "it may say who it works for");
});

test("the fallbacks name the owner's details, and a customer reads the owner's own, not invented ones (S5)", () => {
  // Copied in, they went stale: a workspace set up before its line existed told
  // customers "call us at .", and a new booking link never reached them.
  const f = newReceptionistDefaults(NAME).fallbacks;
  assert.ok(f.greeting.includes("{business}") && f.greeting.includes("{booking link}"), "named, so they follow the details");
  assert.ok(f.non_text.includes("{phone}"));
  const read = fallbackMessages(freshConfig().brain, null);
  assert.ok(read.greeting.includes(NAME) && read.greeting.includes(LINK), "and filled with the business's own as each goes out");
  assert.ok(read.non_text.includes(PHONE), "the urgent path is the number they gave");
  for (const v of [...Object.values(f), ...Object.values(read)]) {
    assert.ok(!/Melany|Booksy demo|example\.com/i.test(v), "no other business may appear");
  }
});

test("a fresh workspace answers from its fields as soon as it has any", () => {
  const cfg = freshConfig();
  assert.equal(hasProfile(cfg.brain.profile), false, "a new receptionist has no profile to answer from yet");
  assert.equal(hasProfile({ guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true } }), false, "guardrails alone are not a profile");
  const withHours = {
    ...cfg.brain,
    profile: { hours: { mon: { open: "10:00", close: "19:00" } } },
  };
  const prompt = resolveSystemPrompt(withHours, "whatsapp", "America/New_York");
  assert.ok(prompt.includes("Monday: 10:00–19:00"));
  assert.ok(prompt.includes(NAME));
  assert.ok(prompt.includes("Rules you must follow"), "guardrails compose in from the start");
});

/* --------------------- the fold that sets one up ------------------------- */

// The form is gone (Task 3.7), and with it the eleven source-text pins that were here. What set a receptionist up is
// a fold of the Business page -- the card pages/business-tab-create.jsx over the "receptionist" fold of
// pages/business-tab-folds.jsx -- and business-tab-create.test.mjs EXECUTES every claim they made, on the stub React:
//   the three boxes it collects, each named by its visible label, and that nothing else is asked for;
//   an empty name, number or link said under its own box, with nothing sent;
//   a booking link that is not a full web address, and a number that is not a number, said the same way;
//   choosing the line it answers on storing NO number, which is what makes the published number follow the line;
//   one request carrying the three facts with the product's own prompt and messages, and nothing else;
//   and a role that may not change the business told why, with nothing opening for it.
// business-tab-folds.test.mjs saves the same fold onto a brain that already has a prompt and messages, and holds that
// it keeps them. Which workspace reaches the card is surface-registry.test.mjs's.
