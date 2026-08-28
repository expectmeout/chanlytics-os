/**
 * The tenant config schema has to survive the two apps deploying separately.
 *
 * apps/edge and apps/dashboard are different Vercel projects and ship
 * independently, so there is always a window where one is newer. With a
 * `.strict()` TOP LEVEL, the first dashboard deploy to write a new section
 * would be rejected in its entirety by the older edge running beside it: the
 * receptionist goes completely silent on a live line, and the log says "no
 * brain profile configured" — a total mute that reads as a configuration
 * absence, pointing whoever investigates at the wrong thing.
 *
 * So: unknown TOP-LEVEL sections are stripped, and each SECTION stays strict
 * (a typo inside `brain` is a real mistake and must still fail).
 *
 * This must hold before any new config section is added, which is why it is
 * pinned here rather than left to reviewer memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTenantConfig, parseTenantConfigResult, TenantConfigSchema } from "@chanlytics/contracts";

const brain = {
  business_name: "Test Salon",
  phone_display: "(555) 123-4567",
  booking_link: "https://example.com/book",
  system_prompt: "x".repeat(60),
  fallbacks: { greeting: "hi", error: "sorry", non_text: "got it" },
};

test("a section the running code has never heard of is IGNORED, not fatal", () => {
  // The forward-compatibility case: a newer dashboard wrote `guardrails`.
  const r = parseTenantConfigResult({ brain, guardrails: { no_prices: true } });
  assert.equal(r.ok, true, "an unknown top-level section broke the whole config");
  assert.equal(r.config.brain?.business_name, "Test Salon", "the persona must survive intact");
  assert.equal("guardrails" in r.config, false, "unknown keys are stripped, not carried");
});

test("the receptionist keeps speaking across a split deploy", () => {
  // The consequence, stated as the thing that actually matters.
  const parsed = parseTenantConfig({ brain, some_future_section: { anything: 1 } });
  assert.ok(parsed?.brain, "a split deploy muted the live line");
});

test("a typo INSIDE a known section still fails loudly", () => {
  // Strictness is kept where it catches real mistakes: a misspelled field is
  // one the runtime would silently never apply.
  const r = parseTenantConfigResult({ brain: { ...brain, buisness_name: "typo" } });
  assert.equal(r.ok, false, "an unknown field inside brain was accepted");
  assert.ok(r.issues.some((i) => /brain/.test(i)), `issues should name the section: ${r.issues.join("; ")}`);
});

test("a malformed section reports WHERE, not just that it failed", () => {
  // "no brain profile configured" while a good persona sits behind one bad
  // field is the message that wastes an operator's afternoon.
  const r = parseTenantConfigResult({ brain: { ...brain, booking_link: "not-a-url" } });
  assert.equal(r.ok, false);
  assert.ok(
    r.issues.some((i) => i.includes("booking_link")),
    `the offending path must be named: ${r.issues.join("; ")}`,
  );
});

test("an absent config is valid and empty — not an error", () => {
  for (const empty of [undefined, null, {}]) {
    const r = parseTenantConfigResult(empty);
    assert.equal(r.ok, true, `${JSON.stringify(empty)} should parse`);
    assert.equal(r.config.brain, undefined);
  }
});

test("the top level is not strict, and the sections are", () => {
  // Asserted structurally too: this is the property a future edit is most
  // likely to reverse by reflex, since `.strict()` reads as the safer choice.
  assert.equal(
    TenantConfigSchema.safeParse({ unknown_section: 1 }).success,
    true,
    "top level must tolerate unknown sections",
  );
  assert.equal(
    TenantConfigSchema.safeParse({ notifications: { from: "a@b.c", escalation_emails: ["x@y.z"], extra: 1 } }).success,
    false,
    "sections must reject unknown fields",
  );
});
