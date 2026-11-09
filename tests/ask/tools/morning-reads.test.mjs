/**
 * What the morning reads before its first round (server/ask/cross-page.ts crossPagePlan). The table reads a person's
 * words; the morning's are Ask's own, and name "call briefs", "calls back" and "your drafts" to say what to leave alone,
 * which read the calls every morning, and the held drafts on a morning after edits, for a turn told to make no card
 * about them (noticed 2 Nov 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_MORNING_EDITED_QUESTION, ASK_MORNING_QUESTION } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { crossPagePlan } = await import(at("apps/dashboard/src/server/ask/cross-page.ts"));
const { calledName } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

const reads = (text, surface) => crossPagePlan(text, surface).map((r) => calledName(r.name, r.input));

test("the morning reads nothing its own words name: they say what to leave alone", () => {
  for (const question of [ASK_MORNING_QUESTION, ASK_MORNING_EDITED_QUESTION]) {
    assert.deepEqual(reads(question, null), []);
    assert.deepEqual(reads(question, "today"), ["today"], "on Today the day's own read still rides in");
  }
});

test("a person's words about calls still read them", () => {
  assert.deepEqual(reads("who called back this week?", "leads"), ["calls.list", "leads.searches"]);
  assert.deepEqual(reads("any missed calls?", "today"), ["calls.list", "today"]);
});
