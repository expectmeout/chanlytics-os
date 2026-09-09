/**
 * Retiring the webhook's `?key=` on evidence, and a converger that agrees
 * with the provider about what "converged" means.
 *
 * Retell signs deliveries with ONE designated API key (the one it badges as
 * the webhook signer). Whether the key this deployment holds is that key can
 * only be proved by a real delivery — and the proof used to live in a log
 * line nothing here can read back. It is now a platform-scoped event row the
 * diagnostic lists beside a fingerprint of the held key.
 *
 * Separately: the first real apply reported a converged agent as drifting
 * forever, because the provider adds defaults on save (speak_after_execution,
 * a bridge audio cue inside transfer_option) and drops an empty `required`.
 * The comparison is a subset now: every field WE set must match; theirs do
 * not count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { desiredVoiceShell, planVoiceConvergence, voiceLlmCreateBody } from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

test("a freshly applied agent, with the provider's own defaults added, is converged", () => {
  const desired = desiredVoiceShell(undefined, { "x-fn-secret": "sealed" });
  // What get-retell-llm returned right after the apply.
  const live = {
    general_prompt: desired.general_prompt,
    begin_message: desired.begin_message,
    default_dynamic_variables: { ...desired.default_dynamic_variables },
    general_tools: desired.general_tools.map((t) => {
      const copy = JSON.parse(JSON.stringify(t));
      copy.speak_after_execution = true;
      if (copy.transfer_option) copy.transfer_option.enable_bridge_audio_cue = true;
      if (copy.parameters) delete copy.parameters.required;
      return copy;
    }),
  };
  const plan = planVoiceConvergence(live, desired);
  assert.deepEqual(plan.drift, [], "REGRESSION: the provider's defaults read as drift forever");
  assert.equal(plan.llmPatch, null);
  // A field WE set that differs still counts.
  const cold = { ...live, general_tools: live.general_tools.map((t) => (t.name === "transfer_to_staff" ? { ...t, transfer_option: { ...t.transfer_option, type: "cold_transfer" } } : t)) };
  assert.ok(planVoiceConvergence(cold, desired).drift.some((l) => l.includes("transfer_to_staff differs")));
  assert.ok(!JSON.stringify(desired.general_tools).includes('"required"'), "an empty required list is the provider's default and is dropped on save");
  assert.ok(!JSON.stringify(voiceLlmCreateBody({ fnSecret: "s" }).general_tools).includes('"required"'), "provisioning sends none either");
});

test("every delivery leaves a readable row saying which credential it passed; the fallback stays until a real one shows sig:true", () => {
  const hook = readCode("apps/edge/api/retell-webhook.ts");
  assert.ok(hook.includes("void recordWebhookAuth(sigOk, keyOk, { raw: sigRaw, restringified: sigRestringified });"));
  assert.ok(hook.includes('emitEvent(db, PLATFORM_TENANT, "webhook.auth", "ingest", null, null, {'));
  assert.ok(hook.includes('provider: "retell", sig, key, sig_raw: forms.raw, sig_restringified: forms.restringified,'), "which credential, and which body form, verified");
  assert.ok(hook.includes("if (!sigOk && !keyOk) {"), "the key still opens the door — retirement waits on the evidence");
  const diag = readCode("apps/edge/api/diag.ts");
  assert.ok(diag.includes("out.retellAuth = {"));
  assert.ok(diag.includes('createHash("sha256").update(process.env.RETELL_API_KEY).digest("hex").slice(0, 12)'), "a fingerprint, never the key");
  assert.ok(diag.includes('.eq("kind", "webhook.auth")'));
});

test("The transfer number is compared with the receptionist's own line, not the number customers are told", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  // The comparison moved into contracts with the field it guards. What the row
  // hands it is still the LINE -- the number customers are told is usually the
  // one a person answers, which is exactly where a transfer should go, so
  // comparing against that refused the very number the owner wanted.
  assert.ok(pane.includes("window.__whyNotAHandoff(typed, voiceLine)"));
  assert.ok(pane.includes('const voiceLine = ((((window.__FACTS || {}).facts || {}).voice_line) || {}).value || "";'), "the provisioned line, not phone_display");
  const phone = readCode("packages/contracts/src/phone.ts");
  assert.ok(phone.includes("normalizePhone(norm) === normalizePhone(ownLine)"));
  assert.ok(!/phone_?[Dd]isplay/.test(phone), "REGRESSION: the salon's own human line was refused as the receptionist's");
  assert.ok(pane.includes('"every phone call, composed when the call starts"'), "the phone tab is true now that the line runs the shell");
});
