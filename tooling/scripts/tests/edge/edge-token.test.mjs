/**
 * The token a dashboard call carries to an edge door: minted for one door,
 * one workspace and one person, valid for a minute, signed with a secret kept
 * for nothing else. The dashboard signs and the edge verifies; this test does
 * both, so the two runtimes cannot drift apart without it going red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken, verifyEdgeToken, EDGE_TOKEN_TTL_MS } from "@chanlytics/channels";

const S = "a-secret-kept-for-nothing-else";
const T0 = 1_760_000_000_000;

test("a token opens the door it was minted for, and names the workspace and the person", () => {
  const t = signEdgeToken(S, "/api/admin/lines", { workspace: "ws1", user: "u1" }, T0);
  const v = verifyEdgeToken(S, t, "/api/admin/lines", T0 + 1_000);
  assert.equal(v.ok, true);
  assert.equal(v.claims.ws, "ws1");
  assert.equal(v.claims.user, "u1");
  assert.equal(v.claims.aud, "/api/admin/lines");
});

test("another door, another minute, another secret, a forged signature, nonsense: each refused for its own reason", () => {
  const t = signEdgeToken(S, "/api/admin/lines", { workspace: "ws1", user: "u1" }, T0);
  assert.deepEqual(verifyEdgeToken(S, t, "/api/admin/billing", T0 + 1_000), { ok: false, reason: "audience" });
  assert.deepEqual(verifyEdgeToken(S, t, "/api/admin/lines", T0 + EDGE_TOKEN_TTL_MS + 1), {
    ok: false,
    reason: "expired",
  });
  assert.deepEqual(verifyEdgeToken("another-secret", t, "/api/admin/lines", T0), { ok: false, reason: "signature" });
  const [payload] = t.split(".");
  assert.deepEqual(
    verifyEdgeToken(S, `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, "/api/admin/lines", T0),
    { ok: false, reason: "signature" },
  );
  assert.deepEqual(verifyEdgeToken(S, "nonsense", "/api/admin/lines", T0), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyEdgeToken(S, "", "/api/admin/lines", T0), { ok: false, reason: "malformed" });
});

test("a token about no workspace says so, and a token from too far in the future is not honoured", () => {
  const t = signEdgeToken(S, "/api/admin/llm", {}, T0);
  const v = verifyEdgeToken(S, t, "/api/admin/llm", T0);
  assert.equal(v.ok, true);
  assert.equal(v.claims.ws, null);
  assert.equal(v.claims.user, null);
  const future = signEdgeToken(S, "/api/admin/llm", {}, T0 + 10 * EDGE_TOKEN_TTL_MS);
  assert.deepEqual(verifyEdgeToken(S, future, "/api/admin/llm", T0), { ok: false, reason: "expired" });
});

test("two tokens for the same call differ: a nonce, so a captured one is not the next one", () => {
  const a = signEdgeToken(S, "/api/admin/lines", { workspace: "ws1" }, T0);
  const b = signEdgeToken(S, "/api/admin/lines", { workspace: "ws1" }, T0);
  assert.notEqual(a, b);
});
