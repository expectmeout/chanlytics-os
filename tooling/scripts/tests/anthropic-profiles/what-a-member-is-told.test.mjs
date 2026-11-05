/**
 * What a member is told while Anthropic has paused them (decision 0097): the edge's refusal reaches the dashboard as its own
 * kind, Ask says it in the person's language, and a draft waits in its own words. Plain, with no reason: that is the platform's
 * to say to them. An edge from before this never says it, and a dashboard from before reads it as a refused request, so either
 * can deploy first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_PAUSED_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const { streamModel, GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));
const { refusalSaid } = await import(at("apps/dashboard/src/server/ask/refusals.ts"));
const { askForJson } = await import(at("apps/dashboard/src/server/model-json.ts"));
const { workspaceModelStanding } = await import(at("packages/db/src/anthropic-profiles.ts"));

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const said = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const PAUSED = { ok: false, error: "model_paused", detail: "The model is paused for this account." };

async function refusalOf(answer) {
  const was = globalThis.fetch;
  globalThis.fetch = async () => answer();
  try {
    for await (const _ of streamModel({
      tenantId: T,
      userId: "u1",
      request: { max_tokens: 10, system: [], messages: [] },
    }))
      void _;
    return null;
  } catch (e) {
    assert.ok(e instanceof GatewayRefused, String(e));
    return e.refusal;
  } finally {
    globalThis.fetch = was;
  }
}

test("the edge's refusal is its own kind, and any other 403 stays what it was", async () => {
  assert.deepEqual(await refusalOf(() => said(403, PAUSED)), { kind: "model_paused" });
  const other = await refusalOf(() => said(403, { ok: false, error: "forbidden" }));
  assert.equal(other.kind, "bad_request");
});

test("Ask says it in the person's language, with no reason in it", () => {
  const at = { tenant_id: T, round: 1 };
  assert.equal(refusalSaid({ kind: "model_paused" }, false, at), MODEL_PAUSED_WORDS.ask.en);
  assert.equal(refusalSaid({ kind: "model_paused" }, true, at), MODEL_PAUSED_WORDS.ask.es);
  for (const words of [MODEL_PAUSED_WORDS.ask.en, MODEL_PAUSED_WORDS.ask.es]) {
    assert.ok(!/anthropic|safety|violation|fraud|banned/i.test(words), words);
    assert.ok(/support|soporte/i.test(words), "and where to go");
  }
  // The billing pause keeps its own words and its own way out: Billing mends nothing here.
  assert.match(refusalSaid({ kind: "paused" }, false, at), /Settings › Billing/);
  assert.ok(!/Billing/.test(MODEL_PAUSED_WORDS.ask.en));
});

test("a draft waits in its own words, and is no billing pause's", async () => {
  const was = globalThis.fetch;
  globalThis.fetch = async () => said(403, PAUSED);
  try {
    await assert.rejects(
      () =>
        askForJson(
          {
            tenantId: T,
            userId: "u1",
            purpose: "lead_draft",
            request: { max_tokens: 10, system: [], messages: [], schema: {} },
          },
          { safeParse: (v) => ({ success: true, data: v }) },
          "draft",
        ),
      (e) => e.code === "payment_required" && e.message === "The draft waits while Ask is paused on your account.",
    );
  } finally {
    globalThis.fetch = was;
  }
});

test("a workspace's standing is read off its own row: none says nothing, and only its own counts", async () => {
  const other = "aaaaaaaa-0000-4000-8000-000000000002";
  const row = (tenant_id, enforcement_status) => ({
    kind: "workspace",
    tenant_id,
    user_id: null,
    reference_id: `workspace:${tenant_id}`,
    enforcement_status,
  });
  assert.equal(await workspaceModelStanding(fakeDb({ anthropic_profiles: [] }), T), null);
  assert.equal(await workspaceModelStanding(fakeDb({ anthropic_profiles: [row(other, "banned")] }), T), null);
  for (const [status, standing] of [
    ["unrestricted", null],
    ["pending", "limited"],
    ["restricted", "limited"],
    ["banned", "paused"],
  ])
    assert.equal(await workspaceModelStanding(fakeDb({ anthropic_profiles: [row(T, status)] }), T), standing, status);
});
