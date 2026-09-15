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
} from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

const NAME = "Aurora Nails & Spa";
const PHONE = "(646) 555-0134";
const LINK = "https://booksy.com/en-us/999999_aurora-nails";

/** What the form PUTs for a workspace whose config is `{}`. */
const freshConfig = () => ({
  brain: {
    business_name: NAME,
    phone_display: PHONE,
    booking_link: LINK,
    ...newReceptionistDefaults(NAME, PHONE, LINK),
    profile: { guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true } },
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

test("the fallbacks carry the owner's own details, not invented ones", () => {
  const f = newReceptionistDefaults(NAME, PHONE, LINK).fallbacks;
  assert.ok(f.greeting.includes(NAME) && f.greeting.includes(LINK));
  assert.ok(f.non_text.includes(PHONE), "the urgent path is the number they gave");
  for (const v of Object.values(f)) {
    assert.ok(!/Melany|Booksy demo|example\.com/i.test(v), "no other business may appear");
  }
});

test("a fresh workspace answers from its fields as soon as it has any", () => {
  const cfg = freshConfig();
  assert.equal(hasProfile(cfg.brain.profile), false, "guardrails alone are not a profile");
  const withHours = {
    ...cfg.brain,
    profile: { ...cfg.brain.profile, hours: { mon: { open: "10:00", close: "19:00" } } },
  };
  const prompt = resolveSystemPrompt(withHours, "whatsapp", "America/New_York");
  assert.ok(prompt.includes("Monday: 10:00–19:00"));
  assert.ok(prompt.includes(NAME));
  assert.ok(prompt.includes("Rules you must follow"), "guardrails compose in from the start");
});

/* --------------------------- the form itself ----------------------------- */

const pane = readCode("apps/dashboard/src/legacy/pages/settings.jsx");

test("the form collects the three things a receptionist cannot exist without", () => {
  for (const field of ["setBizName", "setPhoneDisplay", "setBookingLink"]) {
    assert.ok(pane.includes(field), `${field} must be editable`);
  }
  assert.ok(pane.includes("business_name: name,"));
  // Written as undefined, never "". Absent is the schema's way of saying "use
  // the line the receptionist answers", and it is the default: a required
  // free-text copy of a provisioned number is how the first live salon came
  // to publish the number it transfers to.
  assert.ok(pane.includes("phone_display: phone || undefined,"));
  assert.ok(pane.includes('if (!phone && !voiceLine) found.phone = needs("a phone number")'), "and only a workspace with no line AND nothing typed is missing one");
  assert.ok(pane.includes("booking_link: link,"));
});

test("an existing workspace's own words are never overwritten by a default", () => {
  // These are what a customer reads when the model is unreachable. Replacing
  // them because somebody opened a form would substitute our words for theirs.
  assert.ok(pane.includes("system_prompt: brain.system_prompt || defaults.system_prompt,"));
  assert.ok(pane.includes("fallbacks: brain.fallbacks || defaults.fallbacks,"));
});

test("the workspace that most needs this form is the one that can open it", () => {
  assert.ok(pane.includes("if (connected && editing) {"), "an unconfigured workspace must reach the editor");
  assert.ok(pane.includes("Set up the receptionist"), "and the empty state must offer the way in");
});

test("a bad booking link is caught before a round trip, and names itself", () => {
  // The API surfaces only the first issue's message with no path: "Config
  // rejected: Invalid url" names no field at all.
  assert.ok(pane.includes("The receptionist needs {missing} before it can answer anyone."));
  assert.ok(pane.includes("That booking link needs to be a full web address"));
});

test("the setup form does not show one customer another customer's details", () => {
  // The placeholders were the live salon's real name and real phone number.
  // A different business setting itself up would have been shown them as its
  // example — someone else's working line, in their form.
  const ident = pane.slice(pane.indexOf("set-ident"), pane.indexOf("Where you are"));
  for (const leak of ["Melany", "932-5775", "booksy.com", "1817434"]) {
    assert.ok(!ident.includes(leak), `a real business's ${leak} must not be a placeholder`);
  }
  assert.ok(ident.includes("(555) 010-1234"), "555-01xx is the reserved fictional range");
});
