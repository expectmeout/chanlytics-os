/**
 * The phone receptionist reads the same fields as the chat one — and knows
 * what to DO with them.
 *
 * The composer stated facts and, on the phone, stopped there: no tool names,
 * no booking flow, no idea how to reach a person. The live salon agent was
 * therefore typed by hand in Retell, with the hours and a transfer number
 * baked into its prompt — and nothing in the product could correct them.
 *
 * These pin the pieces that make one profile safe to feed both agents: the new
 * fields parse and refuse what they should; the voice prompt names its tools
 * and never the WhatsApp token; the webhook omits a handoff it does not have;
 * the shell is one definition with the provisioning script pinned to it; and
 * the converger's plan is pure, complete and idempotent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSystemPrompt, parseTenantConfigResult, hasProfile } from "@chanlytics/contracts";
import {
  VOICE_SHELL_PROMPT, VOICE_SHELL_BEGIN, HANDOFF_VAR, FACTS_UNAVAILABLE,
  desiredVoiceShell, planVoiceConvergence, voiceShellDrift,
} from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

const brain = {
  business_name: "Melany's Beauty Salon",
  phone_display: "(646) 932-5775",
  booking_link: "https://booksy.com/en-us/1817434",
  system_prompt: "The hand-written prompt that is live right now. ".repeat(3),
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
const profile = {
  address: "2581 Pitkin Ave, Brooklyn",
  hours: { mon: { open: "09:30", close: "18:00" }, sun: {} },
  services: [{ name: "Silk press", duration_min: 210 }],
  languages: ["English", "Spanish"],
  escalate_when: ["They ask for Melany by name"],
  website: "https://melanysbeautysalon.com",
  notes: [{ title: "Chair rental", text: "Stylists can rent a chair by the week — ask for Melany." }],
};

/* ------------------------------- the fields ------------------------------- */

test("the new fields parse, and a handoff number that is not E.164 is refused by name", () => {
  const ok = parseTenantConfigResult({ brain: { ...brain, profile: { ...profile, handoff_number: "+16469325775", guardrails: { no_health_advice: true } } } });
  assert.equal(ok.ok, true);
  const bad = parseTenantConfigResult({ brain: { ...brain, profile: { ...profile, handoff_number: "646-932-5775" } } });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.startsWith("brain.profile.handoff_number")), bad.issues.join("; "));
  const many = parseTenantConfigResult({ brain: { ...brain, profile: { ...profile, notes: Array.from({ length: 11 }, (_, i) => ({ title: `n${i}`, text: "x" })) } } });
  assert.equal(many.ok, false);
  assert.ok(hasProfile({ website: "https://x.example" }), "a website is a fact worth composing from");
  assert.ok(!hasProfile({ handoff_number: "+16469325775" }), "a handoff line alone is mechanics, not a profile");
});

/* ------------------------------ the composer ------------------------------ */

test("on the phone the composer names its tools; on WhatsApp it keeps the token and never names them", () => {
  const voice = composeSystemPrompt(brain, { ...profile, handoff_number: "+16469325775" }, "voice");
  assert.ok(voice.includes("Use transfer_to_staff during opening hours"), "REGRESSION: the phone agent was told WHEN to fetch a person and never HOW");
  assert.ok(voice.includes("use send_booking_link"));
  assert.ok(voice.includes("do not ask them for a number"), "the link goes to the number they are calling from");
  assert.ok(voice.includes("use end_call"));
  assert.ok(!voice.includes("[[HUMAN]]"), "a model reading the token aloud is worse than no handoff");
  assert.ok(voice.includes("They ask for Melany by name"), "the owner's triggers still apply on the phone");
  const wa = composeSystemPrompt(brain, { ...profile, handoff_number: "+16469325775" }, "whatsapp");
  assert.ok(wa.includes("[[HUMAN]]"));
  for (const tool of ["transfer_to_staff", "send_booking_link", "end_call"]) assert.ok(!wa.includes(tool), `${tool} is a phone tool`);
});

test("with no handoff line the phone agent takes a message instead of dialling nothing", () => {
  const voice = composeSystemPrompt(brain, profile, "voice");
  assert.ok(voice.includes("There is no line to transfer to"));
  assert.ok(!voice.includes("transfer_to_staff"), "a tool with nowhere to dial is not offered");
});

test("website, notes and the language rule reach both receptionists", () => {
  for (const channel of ["whatsapp", "voice"]) {
    const text = composeSystemPrompt(brain, profile, channel);
    assert.ok(text.includes("Website: https://melanysbeautysalon.com"), `${channel}: website`);
    assert.ok(text.includes("Other things to know:\n- Chair rental: Stylists can rent a chair by the week"), `${channel}: notes`);
  }
  assert.ok(composeSystemPrompt(brain, profile, "voice").includes("switch if they do"), "a caller who changes language is followed");
  assert.ok(!composeSystemPrompt(brain, profile, "whatsapp").includes("switch if they do"));
});

test("the health-advice rule is opt-in and lands last with the other rules", () => {
  const off = composeSystemPrompt(brain, profile, "voice");
  assert.ok(!/health advice/i.test(off), "absent must not change every prompt already live");
  const on = composeSystemPrompt(brain, { ...profile, guardrails: { no_health_advice: true } }, "voice");
  assert.ok(on.includes("Never give medical or health advice"));
  assert.ok(on.indexOf("Never give medical or health advice") > on.indexOf("Rules you must follow"));
});

/* ------------------------------- the webhook ------------------------------ */

test("the webhook sends the handoff line only when the workspace has one", () => {
  const inbound = readCode("apps/edge/api/retell-inbound.ts");
  assert.ok(inbound.includes("handoff = rt.brain.profile?.handoff_number ?? null;"));
  assert.ok(inbound.includes("...(handoff ? { handoff_number: handoff } : {}),"), "omitted, never \"\": Retell's default then applies");
  assert.ok(inbound.includes("business_facts: facts || FACTS_UNAVAILABLE"), "the facts rule from voice-parity still holds");
  // The literal the webhook keeps and the shell's default are one sentence.
  const m = readRaw("apps/edge/api/retell-inbound.ts").match(/const FACTS_UNAVAILABLE\s*=\s*\n?\s*"([^"]+)"/);
  assert.equal(m[1], FACTS_UNAVAILABLE, "the webhook's literal and the shell default drifted apart");
});

/* -------------------------------- the shell ------------------------------- */

test("the shell is only placeholders and tools, and the transfer dials the variable", () => {
  assert.ok(VOICE_SHELL_PROMPT.includes("{{business_facts}}") && VOICE_SHELL_PROMPT.includes("{{caller_context}}"));
  assert.equal(VOICE_SHELL_BEGIN, "{{greeting}}");
  const d = desiredVoiceShell();
  assert.deepEqual(d.general_tools.map((t) => t.name), ["end_call", "transfer_to_staff", "send_booking_link"]);
  const transfer = d.general_tools[1];
  assert.equal(transfer.transfer_destination.number, HANDOFF_VAR, "an E.164 typed here is a fact kept in a second place");
  assert.equal(transfer.transfer_option.type, "warm_transfer");
  assert.deepEqual(Object.keys(d.default_dynamic_variables).sort(), ["business_facts", "caller_context", "greeting", "handoff_number"]);
  assert.equal(d.default_dynamic_variables.handoff_number, "", "nowhere to dial, by default");
  for (const v of Object.values(d.default_dynamic_variables)) assert.ok(!v.includes("{{"), "a default that is a placeholder is read aloud");
  // A test double for the provisioning script: the same prompt, the same variable.
  const py = readRaw("tooling/scripts/setup_voice.py");
  const prompt = py.match(/PROMPT = """([\s\S]*?)"""/)[1].replace(/\r\n/g, "\n");
  assert.equal(prompt, VOICE_SHELL_PROMPT, "setup_voice.py is a mirror of the shell — keep it equal");
  assert.ok(py.includes('"number": "{{handoff_number}}"'));
  assert.ok(!py.includes("VOICE_TRANSFER_TO"), "the transfer number is a per-call variable now, not an env fact");
});

test("the converger's plan is complete against the hand-typed agent, and idempotent once applied", () => {
  const live = {
    general_prompt: "You are the front desk for Melany's Beauty Salon at 2581 Pitkin Ave. Hours: Mon-Sat 9:30-18:00. Transfer complaints to staff.",
    begin_message: "Thank you for calling Melany's Beauty Salon! How can I help?",
    default_dynamic_variables: { unrelated: "kept" },
    general_tools: [
      { type: "end_call", name: "end_call", description: "End the call." },
      { type: "transfer_call", name: "transfer_to_staff", description: "x", transfer_destination: { type: "predefined", number: "+19175746416" }, transfer_option: { type: "warm_transfer" } },
      { type: "custom", name: "send_booking_link", description: "x", url: "https://chanlytics-messaging.vercel.app/api/retell-fn", method: "POST", headers: { "x-fn-secret": "sealed" }, parameters: { type: "object", properties: {}, required: [] } },
      { type: "custom", name: "check_weather", description: "somebody's experiment", url: "https://x" },
    ],
  };
  const desired = desiredVoiceShell(undefined, { "x-fn-secret": "sealed" });
  const plan = planVoiceConvergence(live, desired);
  assert.deepEqual(Object.keys(plan.llmPatch).sort(), ["begin_message", "default_dynamic_variables", "general_prompt", "general_tools"]);
  assert.ok(plan.drift.some((l) => l.includes("reads {{business_facts}}: false")), plan.drift.join("\n"));
  assert.ok(plan.drift.some((l) => l.includes("live destination: \"+19175746416\"")), "the plan says what number the live tool dials today");
  assert.deepEqual(plan.unknownTools, ["check_weather"], "a tool the shell does not define is named, never silently dropped");
  assert.equal(plan.llmPatch.default_dynamic_variables.unrelated, "kept", "extra defaults are merged, not deleted");
  assert.equal(plan.llmPatch.general_tools[2].headers["x-fn-secret"], "sealed", "the secret header rides along");
  assert.ok(!plan.drift.join("\n").includes("sealed"), "the printed plan never carries the secret");
  // Apply the patch the way Retell would, and plan again.
  const after = { ...live, ...plan.llmPatch };
  const again = planVoiceConvergence(after, desired);
  assert.equal(again.llmPatch, null);
  assert.deepEqual(again.drift, []);
  // The diagnostic reads the same rule, and flags a secret-less booking tool.
  assert.equal(voiceShellDrift(after).converged, true);
  const bare = { ...after, general_tools: after.general_tools.map((t) => (t.name === "send_booking_link" ? { ...t, headers: undefined } : t)) };
  assert.ok(voiceShellDrift(bare).drift.some((l) => l.includes("no x-fn-secret header")));
});

/* --------------------------- the settings form ---------------------------- */

test("Settings collects the handoff line, the website and the notes, and normalises the number", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(pane.includes('put("handoff_number", handoffNorm || undefined);'));
  assert.ok(pane.includes('put("website", site || undefined);'));
  assert.ok(pane.includes('put("notes", noteRows.length ? noteRows : undefined);'));
  assert.ok(pane.includes('"no_health_advice"'));
  assert.ok(pane.includes("no_health_advice: (p0.guardrails || {}).no_health_advice === true"), "opt-in, unlike the three rules that default on");
  assert.ok(pane.includes("The handoff number needs the country code"));
  assert.ok(pane.includes("Never the receptionist's own line"));
  const converge = readRaw("tooling/scripts/voice-converge.mjs");
  assert.ok(converge.includes('const apply = process.argv.includes("--apply");'));
  assert.ok(converge.indexOf("writeFileSync(") < converge.indexOf("if (!apply)"), "the backup is written before the dry run can exit");
  assert.ok(converge.includes("refusing --pin"), "pinning to latest_published while the latest is a draft would switch the line back");
});
