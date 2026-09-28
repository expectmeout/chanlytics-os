/**
 * The keys an erasure looks for, spelled every way the copies spell them.
 *
 * The finished jobs are matched by `identifiers` (the digits of the number and of every identity, then the address as
 * stored), which this change keeps exactly. The Ask scrub is handed `needles`, and it used to be handed the same list:
 * the digits never match the number as the pages and the assistant write it, `+1 (555) 010-0123`, nor as a person
 * types it, `(555) 010-0123`, so a turn quoting either kept it after the erasure. The display form is contracts'
 * formatPhoneDisplay, never a second implementation; the national forms are read off it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatPhoneDisplay } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { erasureKeys } = await import(at("apps/dashboard/src/server/people/erasure.ts"));

const NATIONAL = ["5550100123", "(555) 010-0123", "555-010-0123", "555.010.0123", "555 010 0123"];

test("a North American number: its digits, the display form the pages write, and the national forms a sentence uses", () => {
  const { identifiers, needles } = erasureKeys({ phone_e164: "+15550100123", email: null }, []);
  assert.deepEqual(identifiers, ["15550100123"]);
  assert.deepEqual(needles, ["15550100123", formatPhoneDisplay("+15550100123"), ...NATIONAL]);
  assert.equal(needles[1], "+1 (555) 010-0123", "contracts' display form, as the pages and the assistant write it");
});

test("the WhatsApp id that is the same number is one set of spellings; a second number is its own", () => {
  const { identifiers, needles } = erasureKeys({ phone_e164: "+15550100123", email: null }, [
    "15550100123",
    "15550100145",
  ]);
  assert.deepEqual(identifiers, ["15550100123", "15550100145"]);
  assert.deepEqual(needles, [
    "15550100123",
    "15550100145",
    "+1 (555) 010-0123",
    ...NATIONAL,
    "+1 (555) 010-0145",
    "5550100145",
    "(555) 010-0145",
    "555-010-0145",
    "555.010.0145",
    "555 010 0145",
  ]);
});

test("the address as stored is an identifier; the needles add it lower-cased, and every email identity's address", () => {
  const { identifiers, needles } = erasureKeys({ phone_e164: null, email: "Rosa.Diaz@Example.com" }, [
    "Rosa.D@Example.com",
  ]);
  // The identifiers are what they always were: an identity gives its digits (an address, none), the address last.
  assert.deepEqual(identifiers, ["Rosa.Diaz@Example.com"]);
  assert.deepEqual(needles, ["Rosa.Diaz@Example.com", "rosa.diaz@example.com", "rosa.d@example.com"]);
});

test("an address that carries digits is never read as a number: no display form is made of them", () => {
  const { identifiers, needles } = erasureKeys({ phone_e164: "+15550100123", email: "ana2@example.com" }, [
    "ana2@example.com",
  ]);
  // Today's identifiers, kept to the character: the identity's digits ("2") ride along, as they did inline.
  assert.deepEqual(identifiers, ["15550100123", "2", "ana2@example.com"]);
  assert.ok(!needles.includes("+2"), "the digits of an address are not a phone number");
  assert.deepEqual(needles, ["15550100123", "2", "ana2@example.com", "+1 (555) 010-0123", ...NATIONAL]);
});

test("a number outside North America has its display form and no national forms", () => {
  const { needles } = erasureKeys({ phone_e164: "+447700900123", email: null }, []);
  assert.deepEqual(needles, ["447700900123", formatPhoneDisplay("+447700900123")]);
  assert.equal(needles[1], "+447 700 900 123");
});

test("nothing to go on is nothing to look for; a missing identity is skipped", () => {
  assert.deepEqual(erasureKeys({ phone_e164: null, email: null }, []), { identifiers: [], needles: [] });
  assert.deepEqual(erasureKeys({ phone_e164: null, email: null }, [null, ""]), { identifiers: [], needles: [] });
});

test("no needle is empty or said twice", () => {
  const { needles } = erasureKeys({ phone_e164: "+15550100123", email: "rosa@example.com" }, [
    "15550100123",
    "+1 555 010 0123",
    "rosa@example.com",
    null,
  ]);
  assert.equal(new Set(needles).size, needles.length);
  assert.ok(needles.every((n) => typeof n === "string" && n.length > 0));
});
