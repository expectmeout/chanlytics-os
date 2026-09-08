import { test, expect } from "@playwright/test";
import { HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * The same gate, for the browser half.
 *
 * Without the four session variables 103 of these 127 specs skip and the run
 * still exits 0 — which is how the nightly certified nothing for four
 * mornings. A run that is supposed to be signed in says so by setting
 * REQUIRE_SERVICE_CREDENTIALS, and this turns the silence into a failure.
 */
test("the signed-in half of this suite actually runs", () => {
  test.skip(process.env.REQUIRE_SERVICE_CREDENTIALS !== "1", "not a credentialed run");
  expect(HAVE_SESSION, WHY_SKIPPED).toBe(true);
});
