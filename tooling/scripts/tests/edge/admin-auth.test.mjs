/**
 * Who may open an admin door (apps/edge/lib/admin-auth.ts), run as a unit: the token, the key, and what an edge that
 * holds EDGE_CALL_SECRET does with the key alone.
 *
 * The dashboard carried DIAG_KEY beside its token on every call, and the key alone opened every door on an edge that
 * could have verified a token -- so the token bought nothing while the key rode with it, and a key that leaked opened
 * twenty-two doors for any workspace. On an edge with the secret the key now opens only a knock the door names as
 * the platform's (the diagnostic, which nothing mints a token for, and the sending-domains lift the runbook reserves
 * for the platform), and every key-only knock on such an edge logs admin_door_key_only, so what still relies on the
 * key can be read off the log. An edge without the secret (a preview) still lets the key decide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";

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
const refused = async (pending) => {
  const auth = await pending;
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
  const lines = await logged(async () => {
    assert.deepEqual(await knock({ "x-edge-token": token() }), {
      ok: true,
      via: "token",
      workspace: "ws-1",
      user: "u-1",
    });
    assert.deepEqual(await knock({ "x-edge-token": token({ workspace: null, user: null }) }), {
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
      assert.deepEqual(await knock({ "x-diag-key": KEY }), { ok: true, via: "key", workspace: null, user: null });
      assert.deepEqual(await knock({ "x-edge-token": token(), "x-diag-key": KEY }), {
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
    assert.deepEqual(await knock({ "x-diag-key": KEY }, "/api/diag", { platformKey: true }), {
      ok: true,
      via: "key",
      workspace: null,
      user: null,
    });
    assert.deepEqual(
      await knock({ "x-edge-token": token({ aud: "/api/diag", workspace: null }) }, "/api/diag", { platformKey: true }),
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

test("a door names its request with the dashboard's id, so a click's lines in both apps are one search; a knock without a sane one gets a name of its own", async () => {
  const { logger } = await importSrc("apps/edge/lib/log.ts");
  const seen = [];
  const real = console.log;
  console.log = (text) => seen.push(JSON.parse(text));
  try {
    await (async () => {
      await knock({ "x-edge-token": token(), "x-request-id": "iad1::req-0123456789" });
      logger({ tenant: "ws-1" }).info("admin_whisper", { chars: 3 });
    })();
    await (async () => {
      await knock({ "x-edge-token": token(), "x-request-id": "not a name!" });
      logger().info("admin_whisper", {});
    })();
  } finally {
    console.log = real;
  }
  assert.deepEqual(seen[0], {
    level: "info",
    event: "admin_whisper",
    request_id: "iad1::req-0123456789",
    tenant: "ws-1",
    chars: 3,
  });
  assert.match(
    seen[1].request_id,
    /^[0-9a-f-]{36}$/,
    "a header that is no name is not taken: the door names it itself",
  );
});

/** The lines of one event written while `fn` ran, as fields. */
async function loggedEvent(event, fn) {
  const lines = [];
  const real = console.log;
  console.log = (...args) => {
    for (const a of args) {
      try {
        const o = JSON.parse(String(a));
        if (o.event === event) lines.push(o);
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

/** A POST to a door with a raw body; `headers` may carry a token minted for that body. */
const post = (headers, raw, aud = AUD, opts = undefined) =>
  authorizeAdmin(new Request(`https://edge.test${aud}`, { method: "POST", headers, body: raw }), aud, opts);
/** A token as the dashboard mints one for a call with a body. */
const bound = (raw, o = {}) =>
  signEdgeToken(SECRET, o.aud ?? AUD, {
    workspace: "ws-1",
    user: "u-1",
    ...(o.workspace === undefined ? {} : { workspace: o.workspace }),
    body: raw,
  });

test("a token opens a door once: the same token again is refused as replayed, and a fresh one opens it", async () => {
  const raw = JSON.stringify({ op: "status" });
  const t = bound(raw);
  assert.deepEqual(await post({ "x-edge-token": t }, raw), { ok: true, via: "token", workspace: "ws-1", user: "u-1" });
  assert.deepEqual(await refused(post({ "x-edge-token": t }, raw)), [403, { ok: false, error: "token_replayed" }]);
  assert.deepEqual(await refused(post({ "x-edge-token": t, "x-diag-key": KEY }, raw)), [
    403,
    { ok: false, error: "token_replayed" },
  ]);
  assert.equal((await post({ "x-edge-token": bound(raw) }, raw)).ok, true, "the next call carries its own token");
});

test("a token that is refused is not spent: a wrong body does not use up the nonce of the right one", async () => {
  const raw = JSON.stringify({ op: "status" });
  const t = bound(raw);
  assert.deepEqual(await refused(post({ "x-edge-token": t }, JSON.stringify({ op: "cancel" }))), [
    403,
    { ok: false, error: "token_body" },
  ]);
  assert.equal((await post({ "x-edge-token": t }, raw)).ok, true, "the caller's own body still opens the door once");
});

test("a token that names a body opens the door for that body only: another body, an appended byte and an empty one are refused", async () => {
  const raw = JSON.stringify({ tenant_id: "ws-1", op: "status" });
  const t = () => bound(raw);
  assert.equal((await post({ "x-edge-token": t() }, raw)).ok, true);
  for (const other of [JSON.stringify({ tenant_id: "ws-2", op: "status" }), `${raw} `, "", "{}"]) {
    assert.deepEqual(await refused(post({ "x-edge-token": t() }, other)), [403, { ok: false, error: "token_body" }]);
  }
  // A door that read its body before asking (sending-domains) hands the text over; the request is not read twice.
  const spent = new Request(`https://edge.test${AUD}`, { method: "POST", body: raw });
  await spent.text();
  assert.equal((await authorizeAdmin(spent, AUD, { body: raw })).ok, false, "no token, no key: nothing opens");
  const handed = new Request(`https://edge.test${AUD}`, {
    method: "POST",
    headers: { "x-edge-token": t() },
    body: raw,
  });
  await handed.text();
  assert.equal(
    (await authorizeAdmin(handed, AUD, { body: raw })).ok,
    true,
    "the text the door read is the text checked",
  );
});

test("a dashboard from before tokens named their body is let in and said, on a POST only; a body-bound token says nothing", async () => {
  const raw = JSON.stringify({ op: "status" });
  const old = () => signEdgeToken(SECRET, AUD, { workspace: "ws-1", user: "u-1" });
  const lines = await loggedEvent("edge_token_unbound", async () => {
    assert.equal((await post({ "x-edge-token": old() }, raw)).ok, true);
    assert.equal((await knock({ "x-edge-token": old() })).ok, true, "a GET has no body to name");
    assert.equal((await post({ "x-edge-token": bound(raw) }, raw)).ok, true);
  });
  assert.deepEqual(
    lines.map((l) => [l.door, l.missing]),
    [[AUD, "body"]],
    "one line, for the call that could have named its body and did not",
  );
});

test("a door that acts on one workspace's row reads the workspace from the token, and says when the token names none", async () => {
  const { tokenWorkspace } = await importSrc("apps/edge/lib/admin-auth.ts");
  const lines = await loggedEvent("edge_token_unbound", async () => {
    assert.equal(tokenWorkspace({ ok: true, via: "token", workspace: "ws-1", user: "u-1" }, AUD), "ws-1");
    assert.equal(tokenWorkspace({ ok: true, via: "token", workspace: null, user: null }, AUD), null);
    assert.equal(
      tokenWorkspace({ ok: true, via: "key", workspace: null, user: null }, AUD),
      null,
      "a preview's key names none, said nowhere",
    );
  });
  assert.deepEqual(
    lines.map((l) => [l.door, l.missing]),
    [[AUD, "workspace"]],
  );
});

test("the nonces an instance remembers are bounded: past the bound the oldest is forgotten, and a token still inside it is refused", async () => {
  const raw = "{}";
  const first = bound(raw);
  assert.equal((await post({ "x-edge-token": first }, raw)).ok, true);
  const recent = bound(raw);
  assert.equal((await post({ "x-edge-token": recent }, raw)).ok, true);
  for (let i = 0; i < 10_010; i++) assert.equal((await post({ "x-edge-token": bound(raw) }, raw)).ok, true);
  assert.equal((await post({ "x-edge-token": first }, raw)).ok, true, "the oldest was forgotten to make room");
  const last = bound(raw);
  assert.equal((await post({ "x-edge-token": last }, raw)).ok, true);
  assert.deepEqual(await refused(post({ "x-edge-token": last }, raw)), [403, { ok: false, error: "token_replayed" }]);
});

test("a door writes down the person the token names, not the one the body claims; the body's is used only where the token names none", async () => {
  const { personFor } = await importSrc("apps/edge/lib/admin-auth.ts");
  const ME = "11111111-1111-4111-8111-111111111111";
  const THEM = "22222222-2222-4222-8222-222222222222";
  const via = (user) => ({ ok: true, via: "token", workspace: "ws-1", user });
  assert.equal(personFor(via(ME), THEM), ME, "a token names its person: a body cannot write another's name");
  assert.equal(personFor(via(ME), undefined), ME);
  assert.equal(personFor(via(null), THEM), THEM, "a token that names none (from before they did) leaves the body's");
  assert.equal(personFor({ ok: true, via: "key", workspace: null, user: null }, ` ${THEM} `), THEM, "a preview's key");
  assert.equal(personFor(via(null), "not-a-person"), null, "nothing but a person's id is a person");
  assert.equal(personFor(via(null), 5), null);
});
