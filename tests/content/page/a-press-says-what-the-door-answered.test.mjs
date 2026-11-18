/**
 * The bring-in card's press, as the dashboard's route answers it (apps/dashboard/src/server/content/bring-in.ts; 00643): the
 * edge's door says a read began, or that the account was read inside the day (when, and what came), or that a day's reads
 * are used (until when); the route passes it on with each moment as a gap by its own clock, and the card's receipt
 * (contracts content/bring-in.ts) says it in words. An answer that names no fate is the one thing said as a failure.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bringInSpec } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** The edge's door, answering what the test says; every body it was sent is kept. */
let doorSays = { status: 200, body: { ok: true, fate: "instagram" } };
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.endsWith("/api/admin/files/bring-in")) return realFetch(input, init);
  sent.push(JSON.parse(String(init.body)));
  return new Response(JSON.stringify(doorSays.body), {
    status: doorSays.status,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { bringInFor } = await import(at("apps/dashboard/src/server/content/bring-in.ts"));

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const HOUR = 3_600_000;
const press = (link = "instagram.com/harborsalon") => bringInFor({ userId: U }, { tenantId: T }, { link });
const receipt = (answer) => bringInSpec.receipt({ payload: { link: "instagram.com/harborsalon" } }, answer);

test("a read that began is answered as it was, and the door is sent the workspace and the link", async () => {
  doorSays = { status: 200, body: { ok: true, fate: "instagram" } };
  assert.deepEqual(await press(), { fate: "instagram" });
  assert.deepEqual(sent.at(-1), { tenant_id: T, link: "instagram.com/harborsalon" });
});

test("ACCEPTANCE 32: an account read inside the day is answered with how long ago and what came, and the card says it", async () => {
  doorSays = {
    status: 200,
    body: {
      ok: true,
      fate: "read_lately",
      read_at: new Date(Date.now() - 3 * HOUR).toISOString(),
      reading: false,
      photos: 12,
      videos: 4,
    },
  };
  const answer = await press();
  const { read_ms_ago: ago, ...rest } = answer;
  assert.deepEqual(rest, { fate: "read_lately", reading: false, photos: 12, videos: 4 });
  assert.ok(ago >= 3 * HOUR && ago < 3 * HOUR + 60_000, `${ago} ms ago`);
  assert.equal(
    receipt(answer),
    "AI read this account 3h ago and brought in 12 photos and 4 videos. It reads an account once a day.",
  );
});

test("a day's reads used is answered with how long until the next, and is no failure", async () => {
  doorSays = {
    status: 200,
    body: { ok: true, fate: "wait", binds: "workspace_reads", until: new Date(Date.now() + 5 * HOUR).toISOString() },
  };
  const answer = await press();
  assert.equal(answer.binds, "workspace_reads");
  assert.ok(answer.wait_ms > 5 * HOUR - 60_000 && answer.wait_ms <= 5 * HOUR, `${answer.wait_ms} ms to wait`);
  assert.equal(receipt(answer), "AI has read Instagram as often as it can for you today. Paste the link again in 5h.");
});

test("a link nothing reads is refused in words before the edge is asked, and a door that names no fate is said as a failure", async () => {
  const before = sent.length;
  await assert.rejects(press("https://youtu.be/x"), /YouTube or Vimeo/);
  assert.equal(sent.length, before, "the edge is never asked");
  doorSays = { status: 503, body: { error: "no_database" } };
  await assert.rejects(press(), /couldn't start bringing them in just now/);
});
