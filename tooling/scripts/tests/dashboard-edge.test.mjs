/**
 * What a dashboard call to the edge carries (apps/dashboard/src/server/edge.ts), run: a token minted for the door
 * when EDGE_CALL_SECRET is set, and then no key beside it; the shared key only while there is no secret to sign with.
 *
 * The key rode beside the token on every call, so a token the edge verified bought nothing while a static key that
 * opened every door travelled with it. A deployment that can sign now signs and sends nothing else -- which is why
 * the edge must hold the same secret: without it, it reads no token (lib/admin-auth.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyEdgeToken } from "@chanlytics/channels";
import { importSrc } from "./_source.mjs";

const SECRET = "edge-secret-for-this-file";
const KEY = "diag-key-for-this-file";
const AUD = "/api/admin/lines";

const { edgeHeaders, edgeConfigured, edgeUrl } = await importSrc("apps/dashboard/src/server/edge.ts");

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("with the secret: the call carries a token for the door, the workspace and the person, and no key -- the key it also holds notwithstanding", async () => {
  await withEnv({ EDGE_CALL_SECRET: SECRET, DIAG_KEY: KEY }, () => {
    const h = edgeHeaders(AUD, { workspace: "ws-1", user: "u-1" });
    assert.deepEqual(Object.keys(h).sort(), ["content-type", "x-edge-token"]);
    const v = verifyEdgeToken(SECRET, h["x-edge-token"], AUD);
    assert.equal(v.ok, true);
    assert.deepEqual([v.claims.aud, v.claims.ws, v.claims.user], [AUD, "ws-1", "u-1"]);
    assert.equal(verifyEdgeToken(SECRET, h["x-edge-token"], "/api/admin/whisper").ok, false, "for this door only");
    // A call about no workspace, by nobody in particular.
    const bare = verifyEdgeToken(SECRET, edgeHeaders(AUD)["x-edge-token"], AUD);
    assert.deepEqual([bare.ok, bare.claims.ws, bare.claims.user], [true, null, null]);
    assert.equal(edgeConfigured(), true);
  });
});

test("without the secret: the shared key rides, as it always has; with neither, the call carries nothing and the edge is not configured", async () => {
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, () => {
    assert.deepEqual(edgeHeaders(AUD, { workspace: "ws-1" }), {
      "content-type": "application/json",
      "x-diag-key": KEY,
    });
    assert.equal(edgeConfigured(), true);
  });
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: undefined }, () => {
    assert.deepEqual(edgeHeaders(AUD), { "content-type": "application/json" });
    assert.equal(edgeConfigured(), false);
  });
  // Blank is not a secret: Vercel stores an emptied variable as "".
  await withEnv({ EDGE_CALL_SECRET: "", DIAG_KEY: KEY }, () => {
    assert.deepEqual(Object.keys(edgeHeaders(AUD)).sort(), ["content-type", "x-diag-key"]);
  });
});

test("where the edge is: the address the dashboard has always called unless EDGE_URL says otherwise, never with a trailing slash", async () => {
  await withEnv({ EDGE_URL: undefined }, () => assert.equal(edgeUrl(), "https://chanlytics-messaging.vercel.app"));
  await withEnv({ EDGE_URL: "https://edge-preview.example.com/" }, () =>
    assert.equal(edgeUrl(), "https://edge-preview.example.com"),
  );
});
