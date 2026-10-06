/**
 * POST /api/admin/intake/replay (00334, decision 0030): a kept delivery knocks on its own door again, in-process,
 * with the url, the headers and the body as they came, and the door's answer is answered back. Run over a database in
 * memory with doors that record the knock: the replay itself, and every way the verb declines (no provider or id, a
 * provider the ledger does not keep, a delivery it no longer holds, a door it does not know, no database). The knock
 * on the admin door itself is authorizeAdmin's (mail-doors.test.mjs runs it); here it is run once without a token.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { replayProviderEvent } = await import(at("apps/edge/lib/intake/replay.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const hook = await import(at("apps/edge/api/admin/intake/replay.ts"));
after(() => setPg(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const kept = {
  provider: "twilio",
  provider_event_id: "SM0000000000000000000000000000000001",
  door: "/api/inbound-sms",
  url: "https://edge.example.com/api/inbound-sms",
  tenant_id: T,
  verified: true,
  headers: { "x-twilio-signature": "as-it-came" },
  body: "From=%2B15550100123&To=%2B15550100100&Body=hello",
  received_at: "2026-10-06T10:00:00.000Z",
};

/** Doors that record the knock and answer what they are told to. */
function doors(status = 200) {
  const knocks = [];
  return {
    knocks,
    map: {
      "/api/inbound-sms": async (request) => {
        knocks.push({
          url: request.url,
          signature: request.headers.get("x-twilio-signature"),
          body: await request.text(),
          method: request.method,
        });
        return new Response("<Response/>", { status, headers: { "content-type": "text/xml" } });
      },
    },
  };
}

const said = async (res) => [res.status, await res.json()];

test("a kept delivery knocks on its own door with the url, the headers and the body as they came, and the door's answer is answered back", async () => {
  const db = fakeDb({ provider_events: [kept] });
  const d = doors(200);
  const [status, body] = await said(
    await replayProviderEvent(db, { provider: "twilio", provider_event_id: kept.provider_event_id }, d.map),
  );
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, door: "/api/inbound-sms", received_at: kept.received_at, status: 200 });
  assert.deepEqual(d.knocks, [{ url: kept.url, signature: "as-it-came", body: kept.body, method: "POST" }]);

  const refused = doors(401);
  const [, told] = await said(
    await replayProviderEvent(db, { provider: "twilio", provider_event_id: kept.provider_event_id }, refused.map),
  );
  assert.equal(told.status, 401, "a signature whose window has passed is the door's own answer, told as it is");
});

test("the verb declines by name: no provider or id, a provider the ledger does not keep, a delivery it no longer holds, a door it does not know, no database", async () => {
  const db = fakeDb({ provider_events: [kept, { ...kept, provider_event_id: "SM-elsewhere", door: "/api/gone" }] });
  const d = doors();
  const code = async (res) => [res.status, (await res.json()).error];
  assert.deepEqual(await code(await replayProviderEvent(db, {}, d.map)), [400, "bad_request"]);
  assert.deepEqual(await code(await replayProviderEvent(db, { provider: "fax", provider_event_id: "x" }, d.map)), [
    400,
    "bad_request",
  ]);
  assert.deepEqual(
    await code(await replayProviderEvent(db, { provider: "twilio", provider_event_id: "SM-purged" }, d.map)),
    [404, "not_found"],
  );
  assert.deepEqual(
    await code(await replayProviderEvent(db, { provider: "twilio", provider_event_id: "SM-elsewhere" }, d.map)),
    [400, "bad_request"],
  );
  assert.deepEqual(
    await code(
      await replayProviderEvent(null, { provider: "twilio", provider_event_id: kept.provider_event_id }, d.map),
    ),
    [503, "no_database"],
  );
  assert.deepEqual(d.knocks, [], "no door was knocked on");
});

test("the admin door: a knock without the platform's token is refused before anything is read", async () => {
  const db = fakeDb({ provider_events: [kept] });
  setPg(db);
  const res = await hook.POST(
    new Request("https://edge.example.com/api/admin/intake/replay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "twilio", provider_event_id: kept.provider_event_id }),
    }),
  );
  assert.equal(res.status, 403, "the platform's key or token, or nothing: the admin door's own refusal");
  assert.ok(!db.seen.some((q) => q.table === "provider_events"), "the ledger was not read");
});
