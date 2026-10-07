/**
 * Native sign-in's pure rules (src/shell/sign-in.ts): the door's form, Google's ids and scheme, and when the lock
 * stands in front of the pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { doorForm, googleIds, reversedClientId, mayLock, shouldLock, LOCK_GRACE_MS } from "../src/shell/sign-in.ts";

test("the door's form carries the provider, the token, Apple's raw nonce, and lands on the home", () => {
  assert.equal(
    doorForm({ provider: "apple", token: "eyJ.a.b", nonce: "n-1" }),
    "provider=apple&token=eyJ.a.b&nonce=n-1&next=%2F",
  );
  assert.equal(doorForm({ provider: "google", token: "t k" }), "provider=google&token=t+k&next=%2F");
});

test("Google needs both ids; its iOS scheme is the client id reversed", () => {
  assert.deepEqual(googleIds({ ios: " a.apps.googleusercontent.com ", web: "w" }), {
    ios: "a.apps.googleusercontent.com",
    web: "w",
  });
  assert.equal(googleIds({ ios: "a", web: "" }), null);
  assert.equal(googleIds({}), null);
  assert.equal(reversedClientId("123-abc.apps.googleusercontent.com"), "com.googleusercontent.apps.123-abc");
  assert.equal(reversedClientId("not an id"), null);
});

test("the lock: on by default where the phone can lock, at launch and after two minutes away, off when chosen", () => {
  const now = 10 * LOCK_GRACE_MS;
  assert.ok(
    shouldLock({ enabled: null, canLock: true, backgroundedAt: null, now, launch: true }),
    "default on, at launch",
  );
  assert.ok(
    !shouldLock({ enabled: null, canLock: false, backgroundedAt: null, now, launch: true }),
    "nothing to lock with",
  );
  assert.ok(!shouldLock({ enabled: false, canLock: true, backgroundedAt: null, now, launch: true }), "turned off");
  assert.ok(!shouldLock({ enabled: true, canLock: true, backgroundedAt: null, now, launch: false }), "never left");
  assert.ok(
    !shouldLock({ enabled: true, canLock: true, backgroundedAt: now - LOCK_GRACE_MS + 1, now, launch: false }),
    "a moment away",
  );
  assert.ok(
    shouldLock({ enabled: true, canLock: true, backgroundedAt: now - LOCK_GRACE_MS, now, launch: false }),
    "two minutes away",
  );
  // What the cover follows as the app leaves the screen: the same rule, with no clock in it.
  assert.ok(mayLock({ enabled: null, canLock: true }), "a phone that can lock covers the app as it leaves");
  assert.ok(!mayLock({ enabled: false, canLock: true }), "turned off: nothing to cover");
  assert.ok(!mayLock({ enabled: true, canLock: false }), "nothing to lock with: nothing to cover");
});
