/**
 * The agent's own settings, planned like the shell.
 *
 * Three agent-level fields decide what the call pipeline can do: the
 * transcript_updated event (the live transcript), a webhook budget the
 * recording copy fits in, and signed recording links (review F10: with them
 * off, every recording URL the provider hands out is public and permanent).
 * They were flipped by hand in the provider's dashboard; now the converger
 * plans them, the diagnostic reports drift, and the provisioning script
 * mirrors them. Retention is applied only when asked — a product decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planAgentSettings, agentSettingsDrift, VOICE_WEBHOOK_EVENTS, VOICE_WEBHOOK_TIMEOUT_MS, CALL_ANALYSIS_FIELDS, voiceAgentCreateBody } from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

test("a fresh agent (provider defaults) is planned onto the pipeline's settings", () => {
  const plan = planAgentSettings({ webhook_events: null, webhook_timeout_ms: null, opt_in_signed_url: null, data_storage_retention_days: null });
  assert.deepEqual(Object.keys(plan.agentPatch).sort(), ["opt_in_signed_url", "post_call_analysis_data", "webhook_events", "webhook_timeout_ms"]);
  assert.deepEqual(plan.agentPatch.post_call_analysis_data.map((f) => f.name), CALL_ANALYSIS_FIELDS.map((f) => f.name), "an agent with no analysis gets ours");
  assert.deepEqual([...plan.agentPatch.webhook_events].sort(), [...VOICE_WEBHOOK_EVENTS].sort(), "the provider's default trio plus the live transcript");
  assert.equal(plan.agentPatch.webhook_timeout_ms, VOICE_WEBHOOK_TIMEOUT_MS);
  assert.equal(plan.agentPatch.opt_in_signed_url, true);
  assert.ok(plan.drift.some((l) => l.includes("public and permanent")), "the drift says what the setting costs");
  assert.ok(!("data_storage_retention_days" in plan.agentPatch), "retention is not drift");
});

test("a converged agent plans nothing, and extra events are kept", () => {
  const live = { webhook_events: [...VOICE_WEBHOOK_EVENTS, "transfer_started"], webhook_timeout_ms: 20000, opt_in_signed_url: true, data_storage_retention_days: null, post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })) };
  const plan = planAgentSettings(live);
  assert.equal(plan.agentPatch, null);
  assert.deepEqual(plan.drift, []);
  assert.equal(agentSettingsDrift(live).converged, true);
  const longer = planAgentSettings({ ...live, webhook_timeout_ms: 30000 });
  assert.equal(longer.agentPatch, null, "a longer budget than we need is not drift");
});

test("retention is planned only when asked, and refused outside the provider's range", () => {
  const live = { webhook_events: [...VOICE_WEBHOOK_EVENTS], webhook_timeout_ms: 20000, opt_in_signed_url: true, data_storage_retention_days: null, post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })) };
  const asked = planAgentSettings(live, { retentionDays: 365 });
  assert.deepEqual(asked.agentPatch, { data_storage_retention_days: 365 });
  assert.ok(asked.drift[0].includes("unset (kept forever)"));
  const same = planAgentSettings({ ...live, data_storage_retention_days: 365 }, { retentionDays: 365 });
  assert.equal(same.agentPatch, null);
  const bad = planAgentSettings(live, { retentionDays: 1000 });
  assert.equal(bad.agentPatch, null);
  assert.ok(bad.drift[0].includes("1 to 730"));
});

test("the converger, the diagnostic and the provisioning script all read the same plan", () => {
  const converge = readRaw("tooling/scripts/voice-converge.mjs");
  assert.ok(converge.includes("planAgentSettings(agent, retentionDays !== undefined ? { retentionDays } : {})"));
  assert.ok(converge.includes("/update-agent/${agent.agent_id}"));
  assert.ok(converge.includes('"--retention-days"'));
  assert.ok(converge.indexOf("if (!apply)") < converge.indexOf('await call("PATCH", `/update-agent/'), "the dry run exits before any agent write");
  // A published version cannot change (422 "Cannot update published agent
  // other than version title", met on the first retention apply): the patches
  // go on a new draft, and only --publish makes a pinned line pick them up.
  const draftAt = converge.indexOf("/create-agent-version/${agent.agent_id}");
  assert.ok(draftAt > 0 && draftAt < converge.indexOf('await call("PATCH", `/update-retell-llm/'), "the draft is made BEFORE any patch lands");
  assert.ok(converge.includes("(plan.llmPatch || agentPlan.agentPatch) && agent.is_published"), "only when the latest version is published, and only when there is something to change");
  assert.ok(converge.includes('const publish = process.argv.includes("--publish");'));
  assert.ok(converge.includes("is a DRAFT: a pinned line stays on"), "without --publish the script says the line did not change");
  // The diagnostic's agent-settings drift is run in diag-door.test.mjs.
  const adapter = readCode("packages/channels/src/voice-retell.ts");
  assert.ok(adapter.includes('data_storage_retention_days: num("data_storage_retention_days")'));
  // Provisioning creates the agent with the same settings the converger keeps.
  const created = voiceAgentCreateBody({ llmId: "llm_x", llmVersion: 0, agentName: "x" }, { fnSecret: "s" });
  assert.deepEqual(created.webhook_events, ["call_started", "call_ended", "call_analyzed", "transcript_updated"]);
  assert.equal(created.webhook_timeout_ms, 20000);
  assert.equal(created.opt_in_signed_url, true);
});
