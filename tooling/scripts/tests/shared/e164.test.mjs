/**
 * E.164, one pattern: contracts' E164 (a plus, then 7 to 15 digits, no leading zero) and isE164 beside it. The edge's
 * hand-over and voice-provision doors, Retell's call adapter, the lines adapter's predicate and the dashboard's buy
 * route each wrote the same regex for themselves; they read this one now. The rule's length is not changed here:
 * normalizePhone (8 to 15 digits) and the SQL copies disagree with it, and which length is right is a product call.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { E164, isE164 } from "@chanlytics/contracts";
import { normalizeCall, signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RETELL_API_KEY = "retell-key-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const hand = await import(at("apps/edge/api/admin/hand-over.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));

const WORKSPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALL = "call_abc123def456";
// The door proves the call is the token's workspace's before it speaks to the provider (live-call-door.ts).
setPg(fakeDb({ calls: [{ id: "row-1", tenant_id: WORKSPACE, retell_call_id: CALL }] }));
after(() => setPg(null));

/** A plus and n digits, the first a 1. */
const digits = (n) => `+1${"5".repeat(n - 1)}`;

const BOUNDARIES = [
  ["six digits", digits(6), false],
  ["seven digits", digits(7), true],
  ["fifteen digits", digits(15), true],
  ["sixteen digits", digits(16), false],
  ["a leading zero", "+05555550100", false],
  ["no plus", "15555550100", false],
  ["a space inside", "+1 5555550100", false],
];

test("E.164 is a plus and 7 to 15 digits, the first not a zero", () => {
  for (const [what, n, ok] of BOUNDARIES) {
    assert.equal(E164.test(n), ok, what);
    assert.equal(isE164(n), ok, `${what}, by the predicate`);
  }
  for (const v of [null, undefined, 15555550100, {}, ""]) assert.equal(isE164(v), false, JSON.stringify(v));
});

test("Retell's call adapter keeps a number only when it is E.164, and the raw caller either way", () => {
  for (const [what, n, ok] of BOUNDARIES) {
    const call = normalizeCall({ call_id: "c1", call_status: "ended", from_number: n, to_number: n });
    assert.deepEqual([call.fromE164, call.toE164], ok ? [n, n] : [null, null], what);
    assert.equal(call.fromRaw, n, `${what}: the raw number is kept`);
  }
  const none = normalizeCall({ call_id: "c1", call_status: "ended" });
  assert.deepEqual([none.fromE164, none.toE164], [null, null], "no number at all");
});

test("the hand-over door refuses a line one digit short of E.164, and puts through one at the shortest", async () => {
  const knock = (line) =>
    new Request("http://edge/api/admin/hand-over", {
      method: "POST",
      headers: {
        "x-edge-token": signEdgeToken(process.env.EDGE_CALL_SECRET, "/api/admin/hand-over", {
          workspace: WORKSPACE,
          user: "u1",
        }),
        "content-type": "application/json",
      },
      body: JSON.stringify({ call_id: CALL, line }),
    });
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  };
  try {
    for (const [what, n, ok] of BOUNDARIES) {
      const before = seen.length;
      const res = await hand.POST(knock(n));
      assert.equal(res.status, ok ? 200 : 400, what);
      assert.equal(seen.length - before, ok ? 1 : 0, `${what}: the provider is asked only for a number`);
      if (ok) assert.equal(seen.at(-1).body.fields_to_override.override_dynamic_variables.handoff_number, n);
    }
  } finally {
    globalThis.fetch = real;
  }
});
