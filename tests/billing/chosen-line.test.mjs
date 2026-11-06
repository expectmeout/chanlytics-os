/**
 * Money taken starts the service (decision 0091): once Stripe starts a workspace's trial or plan, the number its first
 * run chose is started by the server, whether or not the tab that paid is still open, and the lines sweep asks again
 * while one is owed. What to start is planChosenLine's, over facts, run here in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.LINES_DRY_RUN = "1";
for (const k of ["VERCEL_ENV", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { planChosenLine } = await import(at("apps/edge/lib/lines/chosen-line.ts"));

const KEPT = "+13055550142";
const NEW = "+13055550187";
const paying = { mode: "stripe", status: "trialing" };
const plan = (over = {}) =>
  planChosenLine({
    want: { way: "new", number: NEW },
    noCalls: false,
    billing: paying,
    lines: [],
    asked: false,
    ...over,
  });

test("a new number picked is bought as picked, in its own area code", () => {
  assert.deepEqual(plan(), { kind: "buy", number: NEW, areaCode: 305 });
});

test("a number kept is forwarded to one the receptionist owns, searched for in the kept number's area code", () => {
  assert.deepEqual(plan({ want: { way: "keep", number: KEPT } }), { kind: "search", areaCode: 305 });
});

test("a trial is paying: the number starts on a trial as on a plan, and on nothing else", () => {
  assert.equal(plan({ billing: { mode: "stripe", status: "active" } }).kind, "buy");
  assert.equal(plan({ billing: { mode: "direct", status: "none" } }).kind, "buy", "invoiced by hand");
  for (const status of ["none", "incomplete", "past_due", "canceled", "paused"])
    assert.deepEqual(plan({ billing: { mode: "stripe", status } }), { kind: "none", why: "may_not_spend" }, status);
  assert.deepEqual(plan({ billing: null }), { kind: "none", why: "may_not_spend" }, "no billing row is not permission");
});

test("what starts nothing: no choice, Not by phone, a move, a person asked, and a line that stands or stopped", () => {
  assert.deepEqual(plan({ want: null }), { kind: "none", why: "no_choice" });
  assert.deepEqual(plan({ want: null, noCalls: true }), { kind: "none", why: "no_calls" });
  assert.deepEqual(plan({ want: { way: "move", number: KEPT } }), { kind: "none", why: "moving" });
  assert.deepEqual(plan({ asked: true }), { kind: "none", why: "moving" }, "a person was asked for the line");
  // One line a workspace: a second start, from the webhook and the sweep crossing or the owner's own tab, is the line
  // that stands, never a second purchase.
  for (const voice_state of ["provisioning", "answering", "failed"])
    assert.deepEqual(plan({ lines: [{ voice_state }] }), { kind: "stands" }, voice_state);
  assert.equal(plan({ lines: [{ voice_state: "released" }] }).kind, "buy", "a released line is none");
});
