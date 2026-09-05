/**
 * Connect your WhatsApp number: Embedded Signup, end to end.
 *
 * Tech Provider approval makes it possible for a business to connect its
 * own number and have the receptionist answer on it; nothing in the product
 * did that. Now: a Vault write function the service role alone may call,
 * an edge endpoint that turns the sign-up code into the business's token
 * and registers the number, a dashboard route that proves the owner and
 * keeps the ledger, a browser flow around Meta's SDK, the account's own
 * webhooks routed by WABA onto the alert path, and a Settings row that says
 * exactly why it cannot start when it cannot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DECISION_SUBJECTS, DECISION_VERBS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the migration: one definer door writes a credential, service role only, named by the channel; the ledger learns the verb", () => {
  const m = readRaw("supabase/migrations/00042_channel_connect.sql");
  assert.ok(m.includes("create or replace function public.put_channel_credentials(p_channel_id uuid, p_secret jsonb)"));
  assert.ok(m.includes("security definer"));
  assert.ok(m.includes("v_name text := 'wa-creds-' || p_channel_id::text;"), "the secret is named by the channel, never by the tenant or the number");
  assert.ok(m.includes("perform vault.update_secret(v_id, p_secret::text);"), "a second connection updates, never duplicates");
  assert.ok(m.includes("revoke execute on function public.put_channel_credentials(uuid, jsonb) from public, anon, authenticated;"), "the session client cannot write a credential");
  assert.ok(m.includes("'connect_channel'") && m.includes("'channel'"));
  assert.ok(DECISION_VERBS.includes("connect_channel") && DECISION_SUBJECTS.includes("channel"), "the contract carries the same vocabulary");
});

test("the edge connect endpoint: diagnostic key, the four Graph calls in order, the token into Vault, a failed credential write disables the row", () => {
  const c = readCode("apps/edge/api/admin/whatsapp/connect.ts");
  assert.ok(c.includes('request.headers.get("x-diag-key") !== process.env.DIAG_KEY'));
  assert.ok(c.includes('if (!appId || !appSecret) return json(503, { ok: false, error: "no_app_credentials" });'));
  const order = ["exchangeCode(appId, appSecret, code)", "phoneNumber(token, phoneNumberId)", "subscribeWaba(token, wabaId)", "registerNumber(token, phoneNumberId, pin)", 'db.rpc("put_channel_credentials"'];
  let last = -1;
  for (const step of order) { const i = c.indexOf(step); assert.ok(i > last, step); last = i; }
  assert.ok(c.includes('error: "number_taken"'), "a number connected elsewhere is not connected twice");
  assert.ok(c.includes('const onCloud = num.data.platform_type === "CLOUD_API";') && c.includes("const pin = onCloud ? null : newPin();"), "a number already on Cloud API is left alone: registration belongs to the number, not the app");
  assert.ok(c.includes("if (reg && !reg.ok && !alreadyRegistered(reg)) {"), "a number already registered is done, not failed");
  assert.ok(c.includes('pinMismatch(reg) ? "pin_required" : "register_failed"'), "a two-step PIN in the way is named, not a generic failure");
  assert.ok(c.includes('await db.from("tenant_channels").update({ status: "disabled" }).eq("id", row.id);'), "a row without its own credentials would ride the environment token: disabled instead");
  assert.ok(c.includes('{ onConflict: "kind,external_id" }'), "the routing key is the unique key");
  assert.ok(!c.includes("WHATSAPP_ACCESS_TOKEN"), "the environment token plays no part in a connection");
  const g = readCode("apps/edge/lib/meta-graph.ts");
  assert.ok(g.includes('export const GRAPH_VERSION = "v25.0";'));
  assert.ok(g.includes("client_secret: appSecret") && !readCode("apps/dashboard/src/server/service.ts").includes("META_APP_SECRET"), "the app secret is spent on the edge and nowhere else");
  const s = readCode("apps/edge/api/admin/whatsapp/signup-config.ts");
  assert.ok(s.includes('const reason = !secret ? "no_app_secret" : !configId ? "no_config_id" : null;'), "the answer names what is missing");
  // One place knows which Meta app this deployment speaks for: the sign-up
  // and the token introspection can never disagree about it.
  assert.ok(g.includes('export const DEFAULT_META_APP_ID = "1823820738182125";'));
  for (const f of ["apps/edge/api/diag.ts", "apps/edge/api/admin/whatsapp/connect.ts", "apps/edge/api/admin/whatsapp/signup-config.ts"]) {
    const code = readCode(f);
    assert.ok(code.includes("metaAppId()") && !code.includes("1823820738182125") && !code.includes("process.env.META_APP_ID"), f);
  }
  assert.ok(readRaw("apps/edge/.env.example").includes("META_ES_CONFIG_ID="), "the new name is documented");
});

test("the graph helpers: E.164 out of Meta's display form, a six-digit PIN, the already-registered answer", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/meta-graph.ts")).href);
  assert.equal(mod.toE164("+1 555-123-4567"), "+15551234567");
  assert.equal(mod.toE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(mod.toE164(undefined), null);
  assert.equal(mod.toE164("12"), null);
  assert.match(mod.newPin(), /^\d{6}$/);
  assert.equal(mod.alreadyRegistered({ ok: false, error: "This phone number is already registered.", code: 133010, status: 400 }), true);
  assert.equal(mod.alreadyRegistered({ ok: false, error: "Invalid OAuth access token", code: 190, status: 401 }), false);
  assert.equal(mod.alreadyRegistered({ ok: true, data: {} }), false);
  assert.equal(mod.pinMismatch({ ok: false, error: "Two step verification PIN Mismatch", code: 133005, status: 400 }), true);
  assert.equal(mod.pinMismatch({ ok: false, error: "(#100) Invalid parameter", code: 100, status: 400 }), false);
  assert.equal(mod.pinMismatch({ ok: true, data: { success: true } }), false);
});

test("the dashboard route: owner only, the settings rate bucket, the sign-up ids validated, the ledger keeps the connection in the owner's words", () => {
  const r = readCode("apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts");
  assert.ok(r.includes('requireRole(member, "owner");'));
  assert.ok(r.includes('takeRate(ctx.userId, "settings");'));
  assert.ok(r.includes("if (!ID.test(phoneNumberId) || !ID.test(wabaId))"));
  assert.ok(r.includes('recordDecision(ctx, member.tenantId, "channel", r.channelId, "connect_channel", {'));
  assert.ok(r.includes('"upstream_meta"'), "Meta is the upstream that failed, not the model");
  assert.ok(r.includes("number_taken: \"That number is already connected to another workspace.\""));
  assert.ok(r.includes("pin_required:"), "the PIN wall has its own words");
  const svc = readCode("apps/dashboard/src/server/service.ts");
  assert.ok(svc.includes('if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };'), "a preview never connects a real number");
  assert.ok(svc.includes("`${EDGE_BASE}/api/admin/whatsapp/connect`") && svc.includes("`${EDGE_BASE}/api/admin/whatsapp/signup-config`"));
  const sr = readCode("apps/dashboard/app/api/v1/channels/whatsapp/signup/route.ts");
  assert.ok(sr.includes('canConnect: member.role === "owner" && cfg.ready'));
});

test("the browser flow: Meta's SDK loaded once, the ids read only from facebook.com, a cancel is a cancel, the code goes to the app's own route", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/whatsapp-connect.ts")).href);
  assert.deepEqual(mod.parseSignupMessage("https://www.facebook.com", JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { phone_number_id: "123456789", waba_id: "987654321" } })), { phone_number_id: "123456789", waba_id: "987654321" });
  assert.deepEqual(mod.parseSignupMessage("https://web.facebook.com", { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "BUSINESS_INFO" } }), { cancelled: true });
  assert.equal(mod.parseSignupMessage("https://evil.example", JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { phone_number_id: "1", waba_id: "2" } })), null, "only Meta's own origins are heard");
  assert.equal(mod.parseSignupMessage("https://www.facebook.com", "not json"), null);
  assert.equal(mod.parseSignupMessage("https://www.facebook.com", { type: "OTHER" }), null);
  const src = readCode("apps/dashboard/src/legacy-bridge/whatsapp-connect.ts");
  assert.ok(src.includes('const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";'));
  assert.ok(src.includes('response_type: "code", override_default_response_type: true'), "a code, never a user token, reaches this page");
  assert.ok(src.includes('scoped("/api/v1/channels/whatsapp/connect")'));
  assert.ok(!src.includes("access_token"), "no credential passes through the browser");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installWhatsAppConnect();"));
});

test("the account's own news: routed by WABA, kept as an event, alerted when it changes what the business can do", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/waba-events.ts")).href);
  assert.ok(mod.WABA_FIELDS.has("phone_number_quality_update") && mod.WABA_FIELDS.has("message_template_status_update") && mod.WABA_FIELDS.has("account_update"));
  const flagged = mod.describeWabaChange({ field: "phone_number_quality_update", value: { event: "FLAGGED", current_limit: "TIER_1K" } }, "+15551234567");
  assert.equal(flagged.alert, true);
  assert.ok(flagged.subject.includes("flagged") && flagged.body.includes("+15551234567"));
  const up = mod.describeWabaChange({ field: "phone_number_quality_update", value: { event: "UPGRADE", current_limit: "TIER_10K" } }, null);
  assert.equal(up.alert, false, "good news is kept, not alerted");
  assert.ok(up.body.includes("tier 10K"));
  const rejected = mod.describeWabaChange({ field: "message_template_status_update", value: { event: "REJECTED", message_template_name: "appointment_reminder", reason: "INVALID_FORMAT" } }, "+15551234567");
  assert.equal(rejected.alert, true);
  assert.ok(rejected.subject.includes("appointment_reminder") && rejected.body.includes("invalid format"));
  assert.equal(mod.describeWabaChange({ field: "account_update", value: { event: "PARTNER_REMOVED" } }, null).alert, true);
  assert.equal(mod.describeWabaChange({ field: "phone_number_quality_update", value: { event: "SOMETHING_ELSE" } }, null), null);
  const hook = readCode("apps/edge/api/whatsapp.ts");
  assert.ok(hook.includes("if (db && field && WABA_FIELDS.has(field)) {"), "the webhook branches on the account's fields before routing by number");
  assert.ok(hook.includes("entry?: Array<{ id?: string; changes?:"), "entry.id is the WABA");
});

test("the Integrations pane offers the connection to an owner or says exactly why it cannot start; the diag shows the gates", () => {
  const s = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(s.includes('data-testid="connect-whatsapp"') && s.includes('data-testid="connect-whatsapp-btn"'));
  assert.ok(s.includes('{!list.some((c) => c.kind === "whatsapp") && <ConnectWhatsAppRow />}'), "offered only when the workspace has no WhatsApp channel");
  assert.ok(s.includes("the Embedded Signup configuration is missing on the Chanlytics side"), "the missing piece is named, not hidden");
  assert.ok(!s.includes("A WhatsApp number or a phone line is connected by Chanlytics when your workspace is set up."), "the old by-hand line is gone");
  const d = readCode("apps/edge/api/diag.ts");
  assert.ok(d.includes("allowlist_numbers:") && d.includes("env_fallback_token:") && d.includes("signup_ready:"), "the gates that decide who is answered are visible");
});
