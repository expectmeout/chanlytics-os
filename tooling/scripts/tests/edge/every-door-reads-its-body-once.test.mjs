/**
 * Every admin door reads its body through admin-door.ts's reader (review C:0). #1254 made `readBody` read a body that
 * is JSON but not an object as an empty one, but only the lines, Google and billing doors used it (edge/admin-door
 * .test.mjs); fourteen more parsed by hand into `let body = {}`, kept a JSON `null`, and threw on its first `body.x`:
 * the platform's 500 where the door's own validation answers a bad body. `sending-domains` reads the body before it
 * asks who is knocking (the platform's lift of a hold is decided by the body), so an anonymous `null` threw there
 * before any credential was looked at.
 *
 * Table-driven, as that file does it: each door is knocked with a body that is not JSON, whose answer is the door's
 * own for an empty body, and then with each body that is JSON and not an object; every answer is the first one.
 * Nothing leaves this process: no provider keys, no database but a fake, and a fetch that refuses.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

// Each test file is its own process: this is the whole environment. The secret verifies the tokens below. Each key a
// door asks for before it reads its body is set to a value that opens no account (a door that answers 503 for a missing
// key would never reach the body, and the test would pass on a door that still throws); a fetch that refuses, below,
// keeps anything a key could reach in this process.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["VERCEL_ENV", "DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
for (const k of [
  "ANTHROPIC_API_KEY",
  "RETELL_API_KEY",
  "RETELL_FN_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "RESEND_API_KEY",
  "RESEND_COLD_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_APP_ID",
])
  process.env[k] = "not-a-real-credential";
process.env.LEAD_TO = "owner@example.com";
process.env.LEAD_FROM = "hello@example.com";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  throw new Error(`no network in this test: ${String(url)}`);
};

const { setPg } = await importSrc("apps/edge/lib/pg.ts");
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOORS = [
  "eval",
  "hand-over",
  "handover-invite",
  "llm",
  "playbooks-run",
  "reach-out-preview",
  "sending-domains",
  "setup-request",
  "signup-notify",
  "steer",
  "stop-call",
  "voice-converge",
  "voice-provision",
  "whisper",
  "you-are-live",
  "whatsapp/connect",
  "whatsapp/templates-create",
  "whatsapp/templates-delete",
  "whatsapp/templates-sync",
];
const NOT_OBJECTS = ["null", "[]", "5", '"x"', "true"];

/** A door knocked with a raw body, answered as the platform answers it: a throw is the runtime's 500. */
async function knock(door, aud, raw, headers) {
  try {
    const res = await door.POST(
      new Request(`http://edge${aud}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: raw,
      }),
    );
    return [res.status, await res.text()];
  } catch (e) {
    return [500, `threw ${e?.name}: ${e?.message}`];
  }
}

for (const name of DOORS) {
  test(`REGRESSION: the ${name} door answers a JSON body that is not an object as it answers a body that is not JSON, never a throw`, async () => {
    const aud = `/api/admin/${name}`;
    const door = await importSrc(`apps/edge${aud}.ts`);
    setPg(
      fakeDb({
        tenants: [
          { id: A, name: "Harbor Moving", slug: "harbor-moving", timezone: "America/New_York", status: "active" },
        ],
      }),
    );
    const token = { "x-edge-token": signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace: A, user: "u1" }) };
    const notJson = await knock(door, aud, "not json", token);
    assert.ok(
      notJson[0] < 500,
      `${name}: a body that is not JSON is the door's own answer, not a fault: ${notJson[1]}`,
    );
    for (const raw of NOT_OBJECTS) {
      assert.deepEqual(await knock(door, aud, raw, token), notJson, `${name}, ${raw}: the same answer`);
    }
  });
}

test("REGRESSION: an anonymous null at sending-domains is refused as a stranger, before anything is read", async () => {
  const door = await importSrc("apps/edge/api/admin/sending-domains.ts");
  const [status, text] = await knock(door, "/api/admin/sending-domains", "null", {});
  assert.equal(status, 403, text);
  assert.deepEqual(await knock(door, "/api/admin/sending-domains", "not json", {}), [status, text]);
});
