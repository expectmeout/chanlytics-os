/**
 * The call's limits and the shared secret, as provisioning and convergence hold them (decision 0092, packages/channels
 * voice-shell.ts CALL_LIMITS, voice-provision.ts):
 *   - a call may run twenty minutes, a silent line is ended after thirty seconds, and the provider keeps a call a week:
 *     a new agent is made with them, and a live agent without them is drift the converger patches;
 *   - the shared secret follows the switch: while the voice doors read it, a booking tool with no header is the drift;
 *     once the signature alone opens them, a header still carrying it is, and nothing new is provisioned with one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_LIMITS,
  desiredVoiceShell,
  planAgentSettings,
  planVoiceConvergence,
  VOICE_AGENT_DEFAULTS,
  voiceLlmCreateBody,
  voiceShellDrift,
  withKey,
} from "@chanlytics/channels";

const FN_URL = "https://edge.example.com/api/retell-fn";

test("the limits are twenty minutes a call, thirty seconds of silence and a week at the provider, and a new agent has them", () => {
  assert.deepEqual(CALL_LIMITS, {
    max_call_duration_ms: 20 * 60_000,
    end_call_after_silence_ms: 30_000,
    data_storage_retention_days: 7,
  });
  assert.equal(VOICE_AGENT_DEFAULTS.max_call_duration_ms, CALL_LIMITS.max_call_duration_ms);
  assert.equal(VOICE_AGENT_DEFAULTS.end_call_after_silence_ms, CALL_LIMITS.end_call_after_silence_ms);
  assert.equal(VOICE_AGENT_DEFAULTS.data_storage_retention_days, CALL_LIMITS.data_storage_retention_days);
});

test("a live agent on the provider's hour, ten minutes of silence and ninety days is drift, patched to the limits", () => {
  const plan = planAgentSettings({
    max_call_duration_ms: 3_600_000,
    end_call_after_silence_ms: 600_000,
    data_storage_retention_days: 90,
  });
  assert.equal(plan.agentPatch?.max_call_duration_ms, CALL_LIMITS.max_call_duration_ms);
  assert.equal(plan.agentPatch?.end_call_after_silence_ms, CALL_LIMITS.end_call_after_silence_ms);
  assert.equal(plan.agentPatch?.data_storage_retention_days, 7);
  assert.ok(plan.drift.some((d) => d.startsWith("max_call_duration_ms is 3600000")));
  const held = planAgentSettings({ ...CALL_LIMITS });
  for (const k of Object.keys(CALL_LIMITS))
    assert.equal(held.agentPatch?.[k], undefined, `${k} held: nothing to patch`);
  assert.equal(
    planAgentSettings({ data_storage_retention_days: 30 }, { retentionDays: 30 }).agentPatch
      ?.data_storage_retention_days,
    undefined,
    "a number the converger is told is kept",
  );
});

test("while the doors read the secret, a booking tool without its header is the drift; once retired, a header that carries it is", () => {
  const keyed = desiredVoiceShell(FN_URL, { "x-fn-secret": "sealed" });
  const bare = desiredVoiceShell(FN_URL, null);
  assert.equal(voiceShellDrift(keyed, FN_URL).converged, true);
  assert.ok(voiceShellDrift(bare, FN_URL).drift.some((d) => d.includes("has no x-fn-secret header")));
  assert.equal(voiceShellDrift(bare, FN_URL, true).converged, true, "the signature alone: a bare tool is the shell");
  assert.ok(
    voiceShellDrift(keyed, FN_URL, true).drift.some((d) => d.includes("a header the shell does not set (x-fn-secret)")),
  );
  assert.deepEqual(
    planVoiceConvergence(keyed, desiredVoiceShell(FN_URL, null)).llmPatch,
    { general_tools: bare.general_tools },
    "the apply that retires the secret sends the tools without it",
  );
});

test("nothing new is provisioned with the secret once the doors open for the signature alone", () => {
  const llm = voiceLlmCreateBody({ fnSecret: null }, FN_URL);
  const booking = llm.general_tools.find((t) => t.name === "send_booking_link");
  assert.equal(booking.headers, undefined, "no header on the tools");
  assert.equal(
    withKey("https://edge.example.com/api/retell-inbound", null),
    "https://edge.example.com/api/retell-inbound",
  );
  assert.equal(
    withKey("https://edge.example.com/api/retell-inbound", "s 1"),
    "https://edge.example.com/api/retell-inbound?key=s%201",
  );
  const keyed = voiceLlmCreateBody({ fnSecret: "sealed" }, FN_URL);
  assert.deepEqual(keyed.general_tools.find((t) => t.name === "send_booking_link").headers, {
    "x-fn-secret": "sealed",
  });
});
