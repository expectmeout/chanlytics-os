/**
 * Who may open an admin door (apps/edge/lib/admin-auth.ts), run as a unit: the token, the key, and what an edge that
 * holds EDGE_CALL_SECRET does with the key alone.
 *
 * The dashboard carried DIAG_KEY beside its token on every call, and the key alone opened every door on an edge that
 * could have verified a token -- so the token bought nothing while the key rode with it, and a key that leaked opened
 * twenty-two doors for any workspace. On an edge with the secret the key now opens only a door that names the
 * platform's key as its credential (the diagnostic and the eval harness, which nothing mints a token for, and the
 * sending-domains lift the runbook reserves for the platform), and every key-only knock on such an edge logs
 * admin_door_key_only, so what still relies on the key can be read off the log. An edge without the secret (a
 * preview) still lets the key decide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "./_source.mjs";

const SECRET = "edge-secret-for-this-file";
const KEY = "diag-key-for-this-file";
const AUD = "/api/admin/lines";
process.env.EDGE_CALL_SECRET = SECRET;
process.env.DIAG_KEY = KEY;

const { authorizeAdmin } = await importSrc("apps/edge/lib/admin-auth.ts");

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

/** A token as the dashboard mints one; a null workspace or user is meant, so `in` rather than `??`. */
const token = (o = {}) =>
  signEdgeToken(o.secret ?? SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : "ws-1",
    user: "user" in o ? o.user : "u-1",
  });
const knock = (headers = {}, aud = AUD, opts = undefined) =>
  authorizeAdmin(new Request(`https://edge.test${aud}`, { headers }), aud, opts);
/** A refusal, as the caller reads it. */
const refused = async (auth) => {
  assert.equal(auth.ok, false);
  return [auth.response.status, await auth.response.json()];
};

/** The admin_door_key_only lines written while `fn` ran, as fields. */
async function logged(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...args) => {
    for (const a of args) {
      try {
        const o = JSON.parse(String(a));
        if (o.event === "admin_door_key_only") lines.push(o);
      } catch {
        /* not a log line */
      }
    }
  };
  try {
    await fn();
  } finally {
    console.log = real;
  }
  return lines;
}

test("with the secret: a token minted for this door opens it and names the workspace and the person; nothing is logged", async () => {
  const lines = await logged(() => {
    assert.deepEqual(knock({ "x-edge-token": token() }), { ok: true, via: "token", workspace: "ws-1", user: "u-1" });
    assert.deepEqual(knock({ "x-edge-token": token({ workspace: null, user: null }) }), {
      ok: true,
      via: "token",
      workspace: null,
      user: null,
    });
  });
  assert.deepEqual(lines, []);
});

test("with the secret: the key alone opens nothing, and that knock is logged for the platform to see; a wrong key or no key is refused and not logged", async () => {
  const lines = await logged(async () => {
    assert.deepEqual(
      await refused(knock({ "x-diag-key": KEY })),
      [403, { ok: false, error: "token_required" }],
      "the right key, alone, on an edge that could have verified a token",
    );
    assert.deepEqual(await refused(knock({ "x-diag-key": "not-the-key" })), [403, { ok: false }]);
    assert.deepEqual(await refused(knock({ "x-diag-key": `${KEY}-but-longer` })), [403, { ok: false }]);
    assert.deepEqual(await refused(knock({ "x-diag-key": "" })), [403, { ok: false }]);
    assert.deepEqual(await refused(knock({})), [403, { ok: false }]);
  });
  assert.deepEqual(
    lines.map((l) => [l.door, l.ok]),
    [[AUD, false]],
    "one line, for the knock the old rule would have let in",
  );
});

test("with the secret: a bad signature is refused whatever rides beside it; there is no falling back from a token to the key", async () => {
  const lines = await logged(async () => {
    assert.deepEqual(await refused(knock({ "x-edge-token": token({ secret: "not-the-secret" }), "x-diag-key": KEY })), [
      403,
      { ok: false, error: "token_signature" },
    ]);
    assert.deepEqual(
      await refused(knock({ "x-edge-token": token({ aud: "/api/admin/whisper" }), "x-diag-key": KEY })),
      [403, { ok: false, error: "token_audience" }],
    );
    assert.deepEqual(await refused(knock({ "x-edge-token": "garbage", "x-diag-key": KEY })), [
      403,
      { ok: false, error: "token_malformed" },
    ]);
  });
  assert.deepEqual(lines, [], "a token was presented, so the key was never the credential");
});

test("without the secret (a preview): the key decides and a token is ignored; nothing is logged, there being nothing yet to move to", async () => {
  await withEnv({ EDGE_CALL_SECRET: undefined }, async () => {
    const lines = await logged(async () => {
      assert.deepEqual(knock({ "x-diag-key": KEY }), { ok: true, via: "key", workspace: null, user: null });
      assert.deepEqual(knock({ "x-edge-token": token(), "x-diag-key": KEY }), {
        ok: true,
        via: "key",
        workspace: null,
        user: null,
      });
      // A dashboard that signs and sends no key, against an edge that cannot read a token: refused. The two projects
      // hold the secret together or not at all.
      assert.deepEqual(await refused(knock({ "x-edge-token": token() })), [403, { ok: false }]);
      assert.deepEqual(await refused(knock({ "x-diag-key": "not-the-key" })), [403, { ok: false }]);
    });
    assert.deepEqual(lines, []);
  });
  // An unset key matches nothing, an empty knock included.
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: undefined }, async () => {
    assert.deepEqual(await refused(knock({ "x-diag-key": "" })), [403, { ok: false }]);
    assert.deepEqual(await refused(knock({ "x-diag-key": "anything" })), [403, { ok: false }]);
  });
});

test("a door that names the platform's key as its credential: the key still opens it on an edge with the secret, logged as such; a token does too; a wrong key does not", async () => {
  const lines = await logged(async () => {
    assert.deepEqual(knock({ "x-diag-key": KEY }, "/api/diag", { platformKey: true }), {
      ok: true,
      via: "key",
      workspace: null,
      user: null,
    });
    assert.deepEqual(
      knock({ "x-edge-token": token({ aud: "/api/diag", workspace: null }) }, "/api/diag", { platformKey: true }),
      {
        ok: true,
        via: "token",
        workspace: null,
        user: "u-1",
      },
    );
    assert.deepEqual(await refused(knock({ "x-diag-key": "not-the-key" }, "/api/diag", { platformKey: true })), [
      403,
      { ok: false },
    ]);
    assert.deepEqual(
      await refused(knock({ "x-edge-token": "garbage", "x-diag-key": KEY }, "/api/diag", { platformKey: true })),
      [403, { ok: false, error: "token_malformed" }],
      "a bad token is not fallen back from here either",
    );
    // Saying no is the same as saying nothing.
    assert.deepEqual(await refused(knock({ "x-diag-key": KEY }, "/api/diag", { platformKey: false })), [
      403,
      { ok: false, error: "token_required" },
    ]);
  });
  assert.deepEqual(
    lines.map((l) => [l.door, l.ok]),
    [
      ["/api/diag", true],
      ["/api/diag", false],
    ],
    "each key-only knock on an edge with the secret, and whether it came in",
  );
});
