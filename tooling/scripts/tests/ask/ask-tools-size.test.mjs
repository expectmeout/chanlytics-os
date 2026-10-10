/**
 * The size of Ask's tools block, per role: what the model is sent beside every question, in characters of
 * `JSON.stringify(toApiTools(role, true))`, the examples in. The owner's, the largest, was 50,153 on 27 September and
 * 57,761 on 10 October 2026; a change that adds actions states the growth in its pull request from the lines this
 * prints, and every role is held under contracts' ASK_TOOLS_CHARS_CEILING. The real registry is built, as
 * ask-registry.test.mjs builds it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { ASK_TOOLS_CHARS_CEILING } = await import("@chanlytics/contracts");

const ROLES = ["viewer", "operator", "partner", "owner"];

test("each role's tools block is measured, and none is over the ceiling the owner's is held to", (t) => {
  for (const role of ROLES) {
    const chars = JSON.stringify(toApiTools(role, true)).length;
    t.diagnostic(`tools-block role=${role} chars=${chars}`);
    assert.ok(chars <= ASK_TOOLS_CHARS_CEILING, `${role}: ${chars} characters, over ${ASK_TOOLS_CHARS_CEILING}`);
  }
});
