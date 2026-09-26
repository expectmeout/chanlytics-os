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
import { whyNotAHandoff } from "@chanlytics/contracts";

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
  const cold = {
    ...live,
    general_tools: live.general_tools.map((t) =>
      t.name === "transfer_to_staff" ? { ...t, transfer_option: { ...t.transfer_option, type: "cold_transfer" } } : t,
    ),
  };
  assert.ok(planVoiceConvergence(cold, desired).drift.some((l) => l.includes("transfer_to_staff differs")));
  assert.ok(
    !JSON.stringify(desired.general_tools).includes('"required"'),
    "an empty required list is the provider's default and is dropped on save",
  );
  assert.ok(
    !JSON.stringify(voiceLlmCreateBody({ fnSecret: "s" }).general_tools).includes('"required"'),
    "provisioning sends none either",
  );
});

// The diagnostic listing which credential each delivery passed, beside a
// fingerprint of the held key and never the key, is run in diag-door.test.mjs;
// the rows themselves are written by the webhook, run in retell-webhook-door.test.mjs.

test("The transfer number is compared with the receptionist's own line, not the number customers are told", () => {
  // The comparison moved into contracts with the field it guards. What the row
  // hands it is still the LINE -- the number customers are told is usually the
  // one a person answers, which is exactly where a transfer should go, so
  // comparing against that refused the very number the owner wanted.
  // Since Task 3.7 the transfer number is a row of the Business page, and its check is the page's one table of them
  // (business-tab-save.jsx CHECK_OF), asked with the PROVISIONED line the settings read resolved, never phone_display:
  // the Who you are card reads F.voice_line and asks the check with it, which business-tab-page.test.mjs presses.
  // Made-up numbers, in 555-01xx: the line the receptionist answers on; +1 212 555 0142 is the number customers are told.
  const LINE = "+13055550123";
  assert.equal(
    whyNotAHandoff("+1 212 555 0142", LINE),
    null,
    "REGRESSION: the salon's own human line was refused as the receptionist's",
  );
  assert.equal(whyNotAHandoff("+1 212 555 0142", LINE, null), null, "and nothing forwards it back");
  assert.match(whyNotAHandoff("+1 (305) 555-0123", LINE), /own line/, "the line itself would ring itself");
  // (The prompt card saying which channel reads it is settings-truth.test.mjs's F33.)
});
