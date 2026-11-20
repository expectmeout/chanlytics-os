/**
 * A deployment where connecting Google Drive is not offered (the footage sources plan, P5): asked to watch a folder, AI
 * is told so in words it says back, with the way that still works, and makes no card nobody could press
 * (apps/dashboard/src/server/ask/tools/act/files/bring-in.ts). Its own file: the server keeps the edge's word on
 * whether Drive is offered for minutes, so one process hears it one way.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { OWNER, T } from "../sources/_world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** The edge's sources door: Drive is not set up on this deployment. */
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/sources")) return realFetch(input, init);
  asked.push(JSON.parse(String(init?.body ?? "{}")).op);
  return new Response(JSON.stringify({ ok: true, drive: false, oauth: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

test("where Drive is not offered, AI says the way that still works and makes no card", async () => {
  const tables = {
    tenants: [rows.tenant({ id: T })],
    tenant_config: [rows.config({ tenant_id: T, config: { features: { video_preview: true } } })],
    memberships: [rows.membership({ tenant_id: T, user_id: OWNER, role: "owner" })],
    source_connections: [],
    media_sources: [],
    source_items: [],
  };
  const ctx = { supabase: fakeDb(tables, {}, {}), userId: OWNER, email: "ada@example.com", params: {} };
  for (const link of ["google drive", "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv"]) {
    const tc = {
      ...newToolContext(ctx, T, "owner", "UTC", new Date()),
      question: link,
      askedEarlier: [],
      language: "en",
    };
    const out = await buildProposal(tc, "propose_bring_in", { link });
    assert.ok(!out.proposal, link);
    assert.match(out.refusal, /can't watch a Google Drive folder in this workspace yet/, link);
    assert.match(out.refusal, /from their phone/, link);
  }
  assert.ok(!asked.includes("folder"), "no folder is asked of a Drive that is not offered");
});
