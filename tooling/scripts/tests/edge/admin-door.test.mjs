/**
 * What every admin door does with the body it is sent (apps/edge/lib/admin-door.ts readBody), run: the reader alone,
 * and the lines, Google and billing doors knocked with a body that is JSON but not an object.
 *
 * The reader kept whatever JSON.parse gave. A body of JSON `null` reached `body.op` and threw; a number, a string or
 * a boolean got past it and threw where the door writes the workspace back onto the body -- so each door answered 500
 * (the platform's answer to a handler that throws) where its own validation answers 400 to any other bad body, such
 * as one that is not JSON at all. The reader now keeps only a JSON object: anything else is an empty body, which the
 * door validates like any other.
 *
 * The world here is the least that lets a door reach its validation: a token about a workspace that exists, the dry
 * line provider and the receptionist's keys for the lines door. What each door then decides is its own test's
 * (billing/billing-door, google/google-door, lines/lines-door).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

// Each test file is its own process: this is the whole environment. The secret verifies the tokens below; the dry
// provider and the receptionist's two keys let the lines door past its readiness to its validation. No Supabase
// credentials, so the only database is the fake handed to setPg.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.LINES_DRY_RUN = "1";
process.env.RETELL_API_KEY = "retell-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
for (const k of [
  "VERCEL_ENV",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "DIAG_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

const { readBody } = await importSrc("apps/edge/lib/admin-door.ts");
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const { UNKNOWN_LINE_OP } = await importSrc("apps/edge/lib/lines/line-ops.ts");
const { UNKNOWN_GOOGLE_OP } = await importSrc("apps/edge/lib/google/google-ops.ts");
const { UNKNOWN_BILLING_OP } = await importSrc("apps/edge/lib/billing/billing-ops.ts");
after(() => setPg(null));

/** Harbor Moving: the workspace every token below is about. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** The three doors that read their body through readBody, each with the answer its validation gives a bad body. */
const DOORS = [
  {
    name: "lines",
    aud: "/api/admin/lines",
    door: await importSrc("apps/edge/api/admin/lines.ts"),
    bad: UNKNOWN_LINE_OP,
  },
  {
    name: "google",
    aud: "/api/admin/google",
    door: await importSrc("apps/edge/api/admin/google.ts"),
    bad: UNKNOWN_GOOGLE_OP,
  },
  {
    name: "billing",
    aud: "/api/admin/billing",
    door: await importSrc("apps/edge/api/admin/billing.ts"),
    bad: UNKNOWN_BILLING_OP,
  },
];

/** Bodies that are JSON and not an object, as the wire carries them. */
const NOT_OBJECTS = ["null", "[]", "5", '"x"', "true"];

/** A request with a raw body, the way the wire delivers it. */
const request = (raw, url = "http://edge/api/admin/any", headers = {}) =>
  new Request(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: raw });

/**
 * A door knocked with a token about A and a raw body, answered as the platform answers it: the door's response, or a
 * 500 when the handler throws (what the runtime answers for a function that throws), with the throw's words kept so a
 * failure says where.
 */
async function knock({ door, aud }, raw) {
  const token = signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace: A, user: "u1" });
  try {
    const res = await door.POST(request(raw, `http://edge${aud}`, { "x-edge-token": token }));
    return [res.status, await res.json()];
  } catch (e) {
    return [500, { threw: `${e?.name}: ${e?.message}` }];
  }
}

/** The workspace on record, and nothing else: every door reads it before it validates the op. */
const world = () => ({
  tenants: [{ id: A, name: "Harbor Moving", slug: "harbor-moving", timezone: "America/New_York", status: "active" }],
});

/* --------------------------------------------------------------- the reader */

test("readBody keeps a JSON object as sent, and reads anything else -- not JSON, or JSON that is not an object -- as an empty body", async () => {
  assert.deepEqual(await readBody(request('{"op":"buy","tenant_id":"t1","n":{"deep":[1,2]}}')), {
    op: "buy",
    tenant_id: "t1",
    n: { deep: [1, 2] },
  });
  assert.deepEqual(await readBody(request("{}")), {});
  for (const raw of [...NOT_OBJECTS, "[1,2]", '[{"op":"status"}]', "false", "0", '""', "not json", ""]) {
    const body = await readBody(request(raw));
    assert.deepEqual(body, {}, `${JSON.stringify(raw)} is an empty body`);
    assert.equal(Array.isArray(body), false, `${JSON.stringify(raw)} is not kept as an array`);
  }
  // A door writes the workspace back onto the body it read, so each empty body is its own.
  const one = await readBody(request("null"));
  const two = await readBody(request("null"));
  one.tenant_id = A;
  assert.deepEqual(two, {}, "one knock's body is never another's");
});

/* ---------------------------------------------------------------- the doors */

for (const d of DOORS) {
  test(`REGRESSION: the ${d.name} door answers a body that is JSON but not an object (null, [], 5, "x", true) with the 400 its validation gives any other bad body, never a 500`, async () => {
    setPg(fakeDb(world()));
    const notJson = await knock(d, "not json");
    assert.deepEqual(notJson, [d.bad.status, d.bad.body], "a body that is not JSON: the door's own refusal");
    assert.equal(d.bad.status, 400);
    for (const raw of NOT_OBJECTS) {
      assert.deepEqual(await knock(d, raw), notJson, `${raw}: the same 400 as a body that is not JSON`);
    }
  });
}
