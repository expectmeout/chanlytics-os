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
 * The first seconds of a call are planned the same way: a silent caller is
 * reminded after four seconds, twice, and an agent listens for the languages
 * its workspace speaks (the engine review's second pass, 11 Oct 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planAgentSettings,
  agentSettingsDrift,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  CALL_ANALYSIS_FIELDS,
  voiceAgentCreateBody,
  retellLocalesFor,
  unpublishedLatestNote,
  newDraftNote,
  planVoiceConvergence,
  desiredVoiceShell,
  CALL_FEEL,
  CALL_HANDBOOK,
} from "@chanlytics/channels";
import { RETELL_MODELS } from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

/** Where the voice tools post in these fixtures: the address an edge off production gives them (dashboard-origin.ts). */
const FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";

test("a fresh agent (provider defaults) is planned onto the pipeline's settings", () => {
  const plan = planAgentSettings({
    webhook_events: null,
    webhook_timeout_ms: null,
    opt_in_signed_url: null,
    data_storage_retention_days: null,
  });
  assert.deepEqual(Object.keys(plan.agentPatch).sort(), [
    "begin_message_delay_ms",
    "enable_backchannel",
    "handbook_config",
    "interruption_sensitivity",
    "opt_in_signed_url",
    "post_call_analysis_data",
    "reminder_max_count",
    "reminder_trigger_ms",
    "webhook_events",
    "webhook_timeout_ms",
  ]);
  assert.deepEqual(
    plan.agentPatch.post_call_analysis_data.map((f) => f.name),
    CALL_ANALYSIS_FIELDS.map((f) => f.name),
    "an agent with no analysis gets ours",
  );
  assert.deepEqual(
    [...plan.agentPatch.webhook_events].sort(),
    [...VOICE_WEBHOOK_EVENTS].sort(),
    "the provider's default trio plus the live transcript",
  );
  assert.equal(plan.agentPatch.webhook_timeout_ms, VOICE_WEBHOOK_TIMEOUT_MS);
  assert.equal(plan.agentPatch.opt_in_signed_url, true);
  assert.ok(
    plan.drift.some((l) => l.includes("public and permanent")),
    "the drift says what the setting costs",
  );
  assert.ok(!("data_storage_retention_days" in plan.agentPatch), "retention is not drift");
});

test("a converged agent plans nothing, and extra events are kept", () => {
  const live = {
    webhook_events: [...VOICE_WEBHOOK_EVENTS, "transfer_started"],
    webhook_timeout_ms: 20000,
    opt_in_signed_url: true,
    data_storage_retention_days: null,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
    reminder_trigger_ms: 4000,
    reminder_max_count: 2,
    ...CALL_FEEL,
    handbook_config: { ...CALL_HANDBOOK },
  };
  const plan = planAgentSettings(live);
  assert.equal(plan.agentPatch, null);
  assert.deepEqual(plan.drift, []);
  assert.equal(agentSettingsDrift(live).converged, true);
  const longer = planAgentSettings({ ...live, webhook_timeout_ms: 30000 });
  assert.equal(longer.agentPatch, null, "a longer budget than we need is not drift");
});

test("a leftover ?key= on the call webhook's URL is drift, planned away to the bare URL, in either form the agent is read", () => {
  const live = {
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: 20000,
    opt_in_signed_url: true,
    data_storage_retention_days: null,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
    reminder_trigger_ms: 4000,
    reminder_max_count: 2,
    ...CALL_FEEL,
    handbook_config: { ...CALL_HANDBOOK },
  };
  const bare = "https://chanlytics-messaging.vercel.app/api/retell-webhook";
  // Raw from the provider (the converger, the script): the query is still on the URL.
  const raw = planAgentSettings({ ...live, webhook_url: `${bare}?key=the-old-secret` });
  assert.deepEqual(raw.agentPatch, { webhook_url: bare });
  assert.equal(raw.drift.length, 1);
  assert.ok(
    raw.drift[0].includes("query-string key") && !raw.drift[0].includes("the-old-secret"),
    "the drift names the problem and never prints the secret",
  );
  // Parsed (the diagnostic): the query is gone and the flag says it was there.
  const parsed = planAgentSettings({ ...live, webhook_url: bare, webhook_url_keyed: true });
  assert.deepEqual(parsed.agentPatch, { webhook_url: bare });
  // Converged: the bare URL, flagged or unflagged, is not drift.
  assert.equal(planAgentSettings({ ...live, webhook_url: bare, webhook_url_keyed: false }).agentPatch, null);
  assert.equal(planAgentSettings({ ...live, webhook_url: bare }).agentPatch, null);
  assert.equal(
    planAgentSettings({ ...live, webhook_url: null }).agentPatch,
    null,
    "an agent with no webhook at all is someone else's drift",
  );
  // What provisioning creates plans nothing here.
  const created = voiceAgentCreateBody({ llmId: "llm_1", llmVersion: 0, agentName: "x" }, { fnSecret: "s" }, FN_URL);
  assert.equal(created.webhook_url, bare);
  assert.equal(planAgentSettings(created).agentPatch, null);
});

test("retention is planned only when asked, and refused outside the provider's range", () => {
  const live = {
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: 20000,
    opt_in_signed_url: true,
    data_storage_retention_days: null,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
    reminder_trigger_ms: 4000,
    reminder_max_count: 2,
    ...CALL_FEEL,
    handbook_config: { ...CALL_HANDBOOK },
  };
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
  const converge = readRaw("tooling/scripts/ops/voice/voice-converge.mjs");
  assert.ok(converge.includes("planAgentSettings(agent, {"));
  assert.ok(converge.includes("const spoken = languages?.length ? retellLocalesFor(languages) : null;"));
  assert.ok(
    converge.includes('...(spoken && "locales" in spoken ? { locales: spoken.locales } : {}),'),
    "unset, or naming a language with no locale, the language is kept",
  );
  assert.ok(converge.includes("/update-agent/${agent.agent_id}"));
  assert.ok(converge.includes('"--retention-days"'));
  assert.ok(
    converge.indexOf("if (!apply)") < converge.indexOf('await call("PATCH", `/update-agent/'),
    "the dry run exits before any agent write",
  );
  // A published version cannot change (422 "Cannot update published agent
  // other than version title", met on the first retention apply): the patches
  // go on a new draft, and only --publish makes a pinned line pick them up.
  const draftAt = converge.indexOf("/create-agent-version/${agent.agent_id}");
  assert.ok(
    draftAt > 0 && draftAt < converge.indexOf('await call("PATCH", `/update-retell-llm/'),
    "the draft is made BEFORE any patch lands",
  );
  assert.ok(
    converge.includes("(plan.llmPatch || agentPlan.agentPatch) && agent.is_published"),
    "only when the latest version is published, and only when there is something to change",
  );
  assert.ok(converge.includes('const publish = process.argv.includes("--publish");'));
  assert.ok(
    converge.includes("newDraftNote(working.version, agent.version)"),
    "without --publish the script says the line did not change",
  );
  assert.ok(
    converge.includes("if (!agent.is_published) console.log(") &&
      converge.indexOf("unpublishedLatestNote(agent.version)") < converge.indexOf("if (!apply)"),
    "a draft that was already the latest is named before the plan, dry run or not (11 Oct 2026: it was patched in silence)",
  );
  // The diagnostic's agent-settings drift is run in diag-door.test.mjs.
  const adapter = readCode("packages/channels/src/voice/voice-retell.ts");
  assert.ok(adapter.includes('data_storage_retention_days: num("data_storage_retention_days")'));
  // Provisioning creates the agent with the same settings the converger keeps.
  const created = voiceAgentCreateBody({ llmId: "llm_x", llmVersion: 0, agentName: "x" }, { fnSecret: "s" }, FN_URL);
  assert.deepEqual(created.webhook_events, ["call_started", "call_ended", "call_analyzed", "transcript_updated"]);
  assert.equal(created.webhook_timeout_ms, 20000);
  assert.equal(created.opt_in_signed_url, true);
  assert.deepEqual([created.reminder_trigger_ms, created.reminder_max_count], [4000, 2]);
});

const CONVERGED = {
  webhook_events: [...VOICE_WEBHOOK_EVENTS],
  webhook_timeout_ms: 20000,
  opt_in_signed_url: true,
  data_storage_retention_days: null,
  post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
  reminder_trigger_ms: 4000,
  reminder_max_count: 2,
  ...CALL_FEEL,
  handbook_config: { ...CALL_HANDBOOK },
};

test("a silent caller is reminded after four seconds, twice: the provider's ten-second single reminder is drift", () => {
  const unset = planAgentSettings({ ...CONVERGED, reminder_trigger_ms: null, reminder_max_count: null });
  assert.deepEqual(unset.agentPatch, { reminder_trigger_ms: 4000, reminder_max_count: 2 });
  assert.equal(unset.drift.length, 1);
  assert.ok(unset.drift[0].includes("10000 ms, 1 time(s)"), unset.drift[0]);
  // Either half alone is drift, and both are written, so the pair is never half set.
  const once = planAgentSettings({ ...CONVERGED, reminder_max_count: 1 });
  assert.deepEqual(once.agentPatch, { reminder_trigger_ms: 4000, reminder_max_count: 2 });
  const slow = planAgentSettings({ ...CONVERGED, reminder_trigger_ms: 6000 });
  assert.deepEqual(slow.agentPatch, { reminder_trigger_ms: 4000, reminder_max_count: 2 });
  assert.equal(agentSettingsDrift(CONVERGED).converged, true);
});

test("an agent listens for the languages its workspace speaks, in whatever form the provider stored them", () => {
  const multi = ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"];
  const salon = retellLocalesFor(["English", "Spanish"]).locales;
  assert.deepEqual(salon, ["en-US", "es-419"], "Spanish is Latin American: the form a US business's callers speak");
  // Provisioned with the ten locales, as a list or as the retired "multi": both narrow to the workspace's two.
  for (const language of [multi, "multi"]) {
    const plan = planAgentSettings({ ...CONVERGED, language }, { locales: salon });
    assert.deepEqual(plan.agentPatch, { language: ["en-US", "es-419"] });
    assert.ok(plan.drift[0].includes("the workspace speaks en-US, es-419"), plan.drift[0]);
  }
  // One language is written as one locale, the provider's single form.
  const english = planAgentSettings(
    { ...CONVERGED, language: multi },
    { locales: retellLocalesFor(["English"]).locales },
  );
  assert.deepEqual(english.agentPatch, { language: "en-US" });
  // Converged in any order, and unset is the provider's English.
  assert.equal(planAgentSettings({ ...CONVERGED, language: ["es-419", "en-US"] }, { locales: salon }).agentPatch, null);
  assert.equal(planAgentSettings({ ...CONVERGED, language: null }, { locales: ["en-US"] }).agentPatch, null);
  // A dialect the owner picked is a language the workspace speaks: en-GB is not overwritten with en-US.
  assert.equal(planAgentSettings({ ...CONVERGED, language: "en-GB" }, { locales: ["en-US"] }).agentPatch, null);
  assert.equal(planAgentSettings({ ...CONVERGED, language: ["en-GB", "es-ES"] }, { locales: salon }).agentPatch, null);
  // A language the workspace dropped is drift: one it added is too.
  assert.deepEqual(
    planAgentSettings({ ...CONVERGED, language: ["en-US", "es-419"] }, { locales: ["en-US"] }).agentPatch,
    { language: "en-US" },
  );
  // No workspace named, no language planned: the diagnostic never reports a line's languages as drift.
  assert.equal(planAgentSettings({ ...CONVERGED, language: multi }).agentPatch, null);
});

test("the workspace's language names become the provider's locales, English always among them; a name with none keeps the line", () => {
  assert.deepEqual(retellLocalesFor(["english", " Portuguese ", "Español"]), { locales: ["en-US", "pt-BR", "es-419"] });
  assert.deepEqual(
    retellLocalesFor(["Spanish", "español"]),
    { locales: ["en-US", "es-419"] },
    "two spellings of one language listen once, and the greeting's English is always heard",
  );
  // None named, or one named that no locale is known for: the line keeps what it listens for, never narrowed to the
  // rest (the review, 11 Oct 2026: "Spanish (Mexico)" beside English would have left English alone).
  for (const languages of [[], undefined, ["Haitian Creole"], ["English", "Spanish (Mexico)"], ["Français"]]) {
    const r = retellLocalesFor(languages);
    assert.ok("kept" in r && !("locales" in r), JSON.stringify(languages));
  }
  assert.ok(retellLocalesFor(["English", "Spanish (Mexico)"]).kept.includes("Spanish (Mexico)"), "the name is said");
});

test("a draft the converger did not make in this run is named, never published; one it made says where to publish it", () => {
  const found = unpublishedLatestNote(5);
  assert.ok(found.startsWith("v5, the agent's latest, is an unpublished draft"), found);
  assert.ok(found.includes("never publishes a draft it did not make") && found.includes("publish it there"));
  const made = newDraftNote(4, 3);
  assert.ok(made.startsWith("v4 is a draft: a pinned line stays on v3 until it is published"), made);
  assert.ok(made.includes("A second run finds it as a draft it did not make"), "a re-run is not the way to publish it");
});

test("the voice, the models and the temperature are reported when they differ, and never planned", () => {
  const owner = planAgentSettings({ ...CONVERGED, voice_id: "custom_voice_1", post_call_analysis_model: "gpt-5" });
  assert.equal(owner.agentPatch, null, "a voice or a model is never changed by the converger");
  assert.deepEqual(owner.drift, []);
  assert.equal(owner.notes.length, 2);
  assert.ok(owner.notes[0].includes("custom_voice_1") && owner.notes[0].includes("kept"));
  assert.ok(owner.notes[1].includes("gpt-5") && owner.notes[1].includes(RETELL_MODELS.analysis));
  const ours = planAgentSettings({
    ...CONVERGED,
    voice_id: "minimax-Tamsin",
    post_call_analysis_model: RETELL_MODELS.analysis,
  });
  assert.deepEqual(ours.notes, []);
});

test("the LLM's model and temperature are reported when they differ, and never planned", () => {
  const desired = desiredVoiceShell(FN_URL, { "x-fn-secret": "sealed" });
  const his = planVoiceConvergence({ ...desired, model: "claude-5.5-sonnet", model_temperature: 0.4 }, desired);
  assert.equal(his.llmPatch, null, "a model change goes through the gate, never the converger");
  assert.deepEqual(his.drift, []);
  assert.equal(his.notes.length, 2);
  assert.ok(his.notes[0].includes("claude-5.5-sonnet") && his.notes[0].includes(RETELL_MODELS.llm));
  assert.ok(his.notes[1].includes("0.4"));
  assert.deepEqual(
    planVoiceConvergence({ ...desired, model: RETELL_MODELS.llm, model_temperature: 0 }, desired).notes,
    [],
  );
});

test("how a call sounds is the product's on every line: a conversational persona that reads key details back, harder to cut off, a breath before the first word, listening sounds", () => {
  // The salon's line as it was read on 28 Oct 2026: the provider's defaults, no handbook presets set at all.
  const salon = planAgentSettings({
    ...CONVERGED,
    interruption_sensitivity: null,
    begin_message_delay_ms: null,
    enable_backchannel: null,
    handbook_config: null,
  });
  assert.deepEqual(salon.agentPatch, {
    interruption_sensitivity: 0.8,
    begin_message_delay_ms: 400,
    enable_backchannel: true,
    handbook_config: {
      default_personality: false,
      conversational_personality: true,
      natural_filler_words: true,
      echo_verification: true,
      speech_normalization: true,
    },
  });
  assert.equal(salon.drift.length, 4, "a line for each setting, and one for the handbook");
  assert.ok(salon.drift.some((d) => d.startsWith("interruption_sensitivity is unset; the product's is 0.8")));
  // A line set by hand (Ruben's, 28 Oct 2026): its values become the product's, and the presets the product does not
  // hold are kept as they are.
  const his = planAgentSettings({
    ...CONVERGED,
    interruption_sensitivity: 0.95,
    begin_message_delay_ms: 200,
    enable_backchannel: null,
    handbook_config: {
      ai_disclosure: false,
      conversational_personality: true,
      default_personality: false,
      echo_verification: false,
      high_empathy: false,
      natural_filler_words: true,
      speech_normalization: false,
    },
  });
  assert.deepEqual(his.agentPatch, {
    interruption_sensitivity: 0.8,
    begin_message_delay_ms: 400,
    enable_backchannel: true,
    handbook_config: {
      ai_disclosure: false,
      conversational_personality: true,
      default_personality: false,
      echo_verification: true,
      high_empathy: false,
      natural_filler_words: true,
      speech_normalization: true,
    },
  });
  assert.ok(
    his.drift.some((d) => d.includes("echo_verification, speech_normalization")),
    "the handbook's line names only what differs",
  );
  // A preset the product does not hold is the line's own: kept, and not drift.
  assert.equal(
    planAgentSettings({ ...CONVERGED, handbook_config: { ...CALL_HANDBOOK, high_empathy: true } }).agentPatch,
    null,
  );
  // A new line is created sounding the same, so the converger plans nothing against it.
  const created = voiceAgentCreateBody({ llmId: "llm_feel", llmVersion: 0, agentName: "x" }, { fnSecret: "s" }, FN_URL);
  for (const [key, value] of Object.entries(CALL_FEEL)) assert.equal(created[key], value, key);
  assert.deepEqual(created.handbook_config, CALL_HANDBOOK);
});
