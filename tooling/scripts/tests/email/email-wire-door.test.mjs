/**
 * The edge's one answer to "can this deployment send a campaign's email": POST /api/admin/email/wire, { op: "status" }. The
 * dashboard may never hold the provider's key, so it asks (apps/dashboard/src/server/connections/email-readiness.ts), and
 * the edge's own run reads the same function (lib/email/email.ts emailCanSend: a mail domain AND the key), so the page
 * never offers email that the run would then hold every person for.
 *
 * Executed here: the knock (a signed token for this door, once; the wrong door's token, a replay, no credential), the
 * answer for each of the four combinations of the two settings, an op nobody knows, and a body that is not an object.
 * Nothing leaves this process.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EMAIL_DOMAIN", "RESEND_API_KEY", "EMAIL_CAMPAIGNS_DOMAIN"])
  delete process.env[k];

const door = await importSrc("apps/edge/api/admin/email/wire.ts");
const { emailCanSend } = await importSrc("apps/edge/lib/email/email.ts");

const AUD = "/api/admin/email/wire";
/** A token for a door, bound to the body it carries: the edge lets one in once. */
const knock = (body, over = {}) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const token = signEdgeToken(process.env.EDGE_CALL_SECRET, over.aud ?? AUD, {
    workspace: null,
    user: null,
    body: raw,
  });
  return door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...("headers" in over ? over.headers : { "x-edge-token": token }),
      },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one back; `undefined` unsets. */
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

test("status says whether this deployment can send email: a mail domain AND the provider's key, both or it is not ready", async () => {
  const cases = [
    [{ EMAIL_DOMAIN: "mail.example.com", RESEND_API_KEY: "re_test_only" }, true],
    [{ EMAIL_DOMAIN: "mail.example.com", RESEND_API_KEY: undefined }, false],
    [{ EMAIL_DOMAIN: undefined, RESEND_API_KEY: "re_test_only" }, false],
    [{ EMAIL_DOMAIN: undefined, RESEND_API_KEY: undefined }, false],
    // Blank is unset, as every edge variable.
    [{ EMAIL_DOMAIN: "mail.example.com", RESEND_API_KEY: "  " }, false],
  ];
  for (const [vars, ready] of cases) {
    await withEnv(vars, async () => {
      // No campaigns domain is named in any of them: offers by email are not on, whatever email can do.
      assert.deepEqual(
        await answer(await knock({ op: "status" })),
        [200, { ok: true, ready, offers: false }],
        JSON.stringify(vars),
      );
      assert.equal(emailCanSend(), ready, "and it is the answer the edge's own run reads");
    });
  }
});

test("the door answers with its request's name, and never cached: a key set a minute ago is read the next time", async () => {
  const res = await knock({ op: "status" }, {});
  assert.ok(res.headers.get("x-request-id"), "a door names its request");
  await withEnv({ EMAIL_DOMAIN: "mail.example.com", RESEND_API_KEY: "re_test_only" }, async () => {
    assert.equal((await (await knock({ op: "status" })).json()).ready, true);
  });
  assert.equal((await (await knock({ op: "status" })).json()).ready, false, "unset again: not ready again");
});

test("an op nobody knows is refused by its code; so is a body that is not an object or not JSON, as an empty body", async () => {
  assert.deepEqual(await answer(await knock({ op: "teleport" })), [400, { ok: false, error: "unknown_op" }]);
  assert.deepEqual(await answer(await knock({})), [400, { ok: false, error: "unknown_op" }]);
  const first = await answer(await knock("not json"));
  assert.equal(first[0], 400);
  for (const raw of ["null", "[]", "5", '"x"', "true"])
    assert.deepEqual(await answer(await knock(raw)), first, `${raw}: the same answer, never a throw`);
});

test("the knock: a token for this door and no other, once; no credential and a wrong secret are refused before anything is read", async () => {
  const body = JSON.stringify({ op: "status" });
  const mint = (o = {}) =>
    signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: null, user: null, body });
  const send = (headers) =>
    door.POST(
      new Request(`http://edge${AUD}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body,
      }),
    );
  assert.equal((await send({})).status, 403, "no credential");
  assert.equal(
    (await send({ "x-edge-token": mint({ aud: "/api/admin/google" }) })).status,
    403,
    "another door's token",
  );
  assert.equal(
    (await send({ "x-edge-token": mint({ secret: "not-the-secret" }) })).status,
    403,
    "a token signed by another secret",
  );
  const once = mint();
  assert.equal((await send({ "x-edge-token": once })).status, 200, "the right token, once");
  const replay = await send({ "x-edge-token": once });
  assert.deepEqual(await answer(replay), [403, { ok: false, error: "token_replayed" }], "and never again");
  // The platform's key opens nothing here: a dashboard that signs is the only caller, and a key alone is refused.
  await withEnv({ DIAG_KEY: "diag-key-for-this-file" }, async () => {
    assert.equal((await send({ "x-diag-key": "diag-key-for-this-file" })).status, 403);
  });
});
