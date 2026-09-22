/**
 * A receptionist with opening hours and no clock.
 *
 * "Are you open?" it could answer from the hours table. "Are you open RIGHT
 * NOW?" — the question customers actually ask — it was answering too, from
 * nothing at all: it had never been told the date, the time, or which zone the
 * stated hours were even in. A model given a table and no clock does not say
 * "I don't know what day it is"; it picks one.
 *
 * The timezone is `tenants.timezone`, the column the metrics RPCs and the Today
 * surface already read. Adding one to the business profile would have been the
 * second copy of a fact — the same mistake as keeping the hours in two places.
 *
 * The clock is deliberately NOT part of the composed prompt: that block is sent
 * with `cache_control`, and a value that changes every minute would evict the
 * whole business profile from the prompt cache on every single message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BusinessProfileSchema, composeSystemPrompt, describeNow, resolveSystemPrompt } from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

const brain = {
  business_name: "Melany's Beauty Salon",
  phone_display: "(646) 932-5775",
  booking_link: "https://example.com/book",
  system_prompt: "You are the assistant for the salon. " + "x".repeat(40),
  fallbacks: { greeting: "hi", error: "err", non_text: "nt" },
};
const profile = { hours: { mon: { open: "09:30", close: "18:00" } } };

/** 3:42 PM in New York, 12:42 PM in Los Angeles, on a Saturday. */
const INSTANT = new Date("2026-08-29T19:42:00Z");

/* -------------------------------- the clock -------------------------------- */

test("the receptionist is told the day, date and time in the business's own zone", () => {
  const s = describeNow("America/New_York", INSTANT);
  assert.ok(s.includes("Saturday"), s);
  assert.ok(s.includes("August 29, 2026"), s);
  assert.ok(s.includes("3:42 PM"), s);
  assert.ok(s.includes("America/New_York"), "the zone is named, not implied");
});

test("the SAME instant reads differently for a business on the other coast", () => {
  // The tenant's zone, not the server's. A Vercel lambda has no useful opinion
  // about what time it is where the salon is.
  const ny = describeNow("America/New_York", INSTANT);
  const la = describeNow("America/Los_Angeles", INSTANT);
  assert.ok(ny.includes("3:42 PM"));
  assert.ok(la.includes("12:42 PM"));
});

test("no zone means no clock, and saying so — never a guess", () => {
  for (const bad of [null, undefined, "", "Mars/Olympus_Mons"]) {
    const s = describeNow(bad, INSTANT);
    assert.ok(/do not know today's date/i.test(s), `${bad} produced: ${s}`);
    assert.ok(/never guess/i.test(s), "it must forbid picking a day");
    assert.ok(!s.includes("3:42"), "a wrong clock is worse than no clock");
  }
});

/* ------------------------- what stays in the cache ------------------------- */

test("the clock is NOT in the composed prompt — that block is cached", () => {
  const p = resolveSystemPrompt({ ...brain, profile }, "whatsapp", "America/New_York");
  assert.ok(!p.includes("Right now it is"), "a per-minute value must not sit in a cached block");
  assert.ok(!p.includes("August 29"));
});

test("the hours say WHICH clock they are on", () => {
  const withTz = composeSystemPrompt(brain, profile, "whatsapp", "America/New_York");
  assert.ok(withTz.includes("Opening hours (all times America/New_York):"));
  // Unknown zone: state the hours plainly rather than label them wrongly.
  const without = composeSystemPrompt(brain, profile, "whatsapp");
  assert.ok(without.includes("Opening hours:"));
  assert.ok(!without.includes("all times"));
});

test("the timezone has ONE home, and it is not the business profile", () => {
  // tenants.timezone is the column. A profile field would be a second copy,
  // free to drift from the one the dashboard's own "today" is computed with.
  const r = BusinessProfileSchema.safeParse({ timezone: "America/New_York" });
  assert.equal(r.success, false, "the profile must reject a timezone of its own");
});

/* ----------------------------- the call sites ------------------------------ */

test("the clock is sent as its OWN system block, uncached", () => {
  const brainSrc = readCode("apps/edge/lib/receptionist/brain.ts");
  const cached = brainSrc.indexOf("cache_control");
  const now = brainSrc.indexOf('nowNote ? [{ type: "text", text: nowNote }]');
  assert.ok(now > 0, "the now block must be sent");
  assert.ok(now > cached, "it belongs after the cached prompt, not inside it");
  assert.equal(
    brainSrc.split("cache_control").length - 1,
    1,
    "only the stable business profile may carry a cache breakpoint",
  );
});

test("both channels read the tenant's zone, and neither invents one", () => {
  const wa = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(wa.includes('resolveSystemPrompt(brainCfg, "whatsapp", rt?.timezone, new Date(), rt?.policy, rt?.known)'));
  // The clock also carries the closures, so it can state a shut day in the
  // block the model reads LAST — where the weekly grid cannot outrank it.
  assert.ok(wa.includes("describeNow(rt?.timezone, new Date(), brainCfg.profile?.closures)"));

  // The phone's composition -- the same composer, one clock, the closures in
  // the block the model reads last -- is run, byte for byte, in
  // call-start.test.mjs. The read here serves only the zone lint below.
  const voice = readCode("apps/edge/lib/voice/call-start.ts");

  const runtime = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(
    runtime.includes('db.from("tenants").select("name, timezone, status")'),
    "read from the tenants row, not from config",
  );
  for (const src of [wa, voice, runtime]) {
    assert.ok(!src.includes("America/New_York"), "no zone may be hard-coded on the message path");
  }
});
