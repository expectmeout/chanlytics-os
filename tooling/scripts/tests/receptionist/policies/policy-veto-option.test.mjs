/**
 * The veto option had to be REFUSED until it was real.
 *
 * The policies route rejected mode 'veto' on an explicit rule — no option
 * without an enforcer — because a mode nothing implemented is a switch that
 * lies, and this product's whole discipline is that a setting which renders
 * must apply. That refusal was correct for as long as it was true.
 *
 * The enforcer now exists: the receptionist writes its reply as a draft and a
 * scheduled job sends it. So the guard has stopped protecting anyone and
 * started standing in the way — and these tests pin the boundary conditions
 * that make the option safe to offer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPLY_DELAY_MIN_MS, REPLY_DELAY_MAX_MS, POLICY_MODES } from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../../../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");
const route = read("apps/dashboard/app/api/v1/policies/route.ts");
const repo = read("packages/db/src/repositories/control-plane.ts");

test("'veto' is a real mode in the shared enum", () => {
  assert.ok(POLICY_MODES.includes("veto"));
});

test("the blanket refusal is gone, but only replies may be vetoed", () => {
  // The other classes have no draft to hold, so offering it there would be the
  // same lie in a different place.
  assert.ok(
    !/mode === "veto"\s*\)\s*\{\s*\n?\s*throw/.test(route),
    "the unconditional refusal must be gone now that the enforcer exists",
  );
  assert.match(route, /mode === "veto" && cls !== "reply"/);
});

test("the delay is validated at the boundary, not only on read", () => {
  // A value that reaches the database out of range would be silently corrected
  // when read, and the workspace would see a number it never chose.
  assert.match(route, /REPLY_DELAY_MIN_MS/);
  assert.match(route, /REPLY_DELAY_MAX_MS/);
  assert.match(route, /Number\.isFinite\(d\)/);
});

test("a delay is refused on a class that cannot use it", () => {
  assert.match(route, /A reply delay only applies to the reply policy/);
});

test("setting one limit does not wipe the others", () => {
  // `limits` holds several unrelated settings for one class — a reply row
  // carries both max_replies_day and reply_delay_ms — so writing the whole
  // object would silently drop whichever one the caller did not know about.
  assert.match(repo, /\.\.\.\(\(current\?\.limits as Record<string, unknown>\) \?\? \{\}\), \.\.\.limits/);
});

test("the bounds are the same ones the reader clamps to", () => {
  // Two different ranges would mean the UI accepts a value the runtime silently
  // changes.
  assert.equal(REPLY_DELAY_MIN_MS, 5_000);
  assert.equal(REPLY_DELAY_MAX_MS, 600_000);
});

test("changing autonomy is still an operator action", () => {
  assert.match(route, /role: "operator",/);
});
