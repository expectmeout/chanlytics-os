/**
 * The gate that makes a green run mean something.
 *
 * 62 of this repo's tests talk to real Postgres and skip without service
 * credentials; 103 of the 127 browser specs skip without a session. ci.yml
 * holds no live secrets by policy, so those skips are correct there. The
 * nightly is the one job that MAY hold them — and it reported success four
 * mornings running while executing 24 of 127 specs, because a skip and a pass
 * look identical in an exit code.
 *
 * So the run that is SUPPOSED to have credentials says so, by setting
 * REQUIRE_SERVICE_CREDENTIALS, and this fails when it does not have them.
 * Deliberately not keyed on CI: GitHub sets CI=true for every workflow,
 * including the pull-request one that is meant to run credential-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const REQUIRED = process.env.REQUIRE_SERVICE_CREDENTIALS === "1";

test("a run that claims to cover Postgres actually can", { skip: REQUIRED ? false : "not a credentialed run" }, () => {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  assert.deepEqual(
    missing,
    [],
    `REQUIRE_SERVICE_CREDENTIALS=1 but ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} absent, ` +
    "so every integration suite would skip and this run would report success having touched no database at all",
  );
  // The disaster-recovery profile is configuration (DR_FALLBACK_BRAIN_JSON),
  // and control-plane.integration.test.mjs holds it against the stored row.
  // Without the variable that golden skips, and a credentialed run would once
  // again report success without the one check that catches a stale fallback.
  assert.ok(
    process.env.DR_FALLBACK_BRAIN_JSON,
    "REQUIRE_SERVICE_CREDENTIALS=1 but DR_FALLBACK_BRAIN_JSON is absent, so the disaster-recovery golden would skip: " +
    "set the nightly's secret to the same value the chanlytics-messaging project holds",
  );
});
