/**
 * Autonomy truth: the Booking and FAQ rows are consulted.
 *
 * In the prompt, on both channels, in the same words; after generation on
 * WhatsApp, so the check does not depend on the model having listened; and
 * the matrix offers only the modes each class can honour. A switch nothing
 * enforces is a switch that lies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POLICY_CLASS_MODES,
  POLICY_CLASSES,
  policyAskClass,
  policyClassOfIntent,
  policyRules,
  resolveSystemPrompt,
  ESCALATION_REASONS,
} from "@chanlytics/contracts";
import { readCode } from "../../_source.mjs";

test("each class offers only the modes the runtime honours", () => {
  for (const c of POLICY_CLASSES) assert.ok(POLICY_CLASS_MODES[c].length > 0, c);
  assert.deepEqual(POLICY_CLASS_MODES.booking, ["auto", "ask"]);
  assert.deepEqual(POLICY_CLASS_MODES.faq, ["auto", "ask"]);
  assert.deepEqual(POLICY_CLASS_MODES.reply, ["auto", "veto", "ask", "never"]);
  assert.deepEqual(POLICY_CLASS_MODES.money, ["never"]);
  assert.deepEqual(POLICY_CLASS_MODES.reviews, ["auto", "ask", "never"]);
});

test("an intent falls under a class; ask is the only mode that changes anything; an unknown mode is treated as ask", () => {
  assert.equal(policyClassOfIntent("booking"), "booking");
  assert.equal(policyClassOfIntent("pricing"), "faq");
  assert.equal(policyClassOfIntent("services"), "faq");
  assert.equal(policyClassOfIntent("hours"), null);
  assert.equal(policyClassOfIntent(null), null);
  assert.equal(policyAskClass({ booking: { mode: "ask" } }, "booking"), "booking");
  assert.equal(policyAskClass({ booking: { mode: "auto" } }, "booking"), null);
  assert.equal(policyAskClass({}, "booking"), null, "no row is auto");
  assert.equal(policyAskClass({ faq: { mode: "weird" } }, "pricing"), "faq", "fail safe");
  assert.equal(policyAskClass({ faq: { mode: "ask" } }, "smalltalk"), null);
});

test("the rules, per channel: auto says nothing; ask hands the matter to a person in words the customer can hear or read", () => {
  assert.deepEqual(policyRules({ booking: { mode: "auto" }, faq: { mode: "auto" } }, "whatsapp"), []);
  assert.deepEqual(policyRules(null, "voice"), []);
  const wa = policyRules({ booking: { mode: "ask" }, faq: { mode: "ask" } }, "whatsapp");
  assert.equal(wa.length, 2);
  assert.ok(
    wa[0].startsWith("Booking:") &&
      wa[0].includes("do not send the booking link") &&
      wa[0].includes("set escalate to true"),
  );
  assert.ok(wa[1].startsWith("Service and pricing questions:") && wa[1].includes("do not answer them yourself"));
  const voice = policyRules({ booking: { mode: "ask" } }, "voice");
  assert.equal(voice.length, 1);
  assert.ok(
    voice[0].includes("call or text them to confirm") && !voice[0].includes("escalate"),
    "the phone has no escalate flag; it takes a name",
  );
});

test("the prompt carries the rows on both channels — a composed profile and a hand-written prompt alike", () => {
  const brain = {
    business_name: "Marisa's",
    phone_display: "+1 (305) 555-0100",
    booking_link: "https://book.example.com/marisas",
    system_prompt: "You are the receptionist.",
    fallbacks: { greeting: "hi", error: "sorry" },
    profile: null,
  };
  const plain = resolveSystemPrompt(brain, "whatsapp", "America/New_York", new Date(), { booking: { mode: "ask" } });
  assert.ok(
    plain.includes("You are the receptionist.") &&
      plain.includes("Rules you must follow:") &&
      plain.includes("Booking: when someone wants to book"),
  );
  assert.equal(
    resolveSystemPrompt(brain, "whatsapp", "America/New_York", new Date(), { booking: { mode: "auto" } }),
    "You are the receptionist.",
    "auto adds nothing",
  );
  const withProfile = {
    ...brain,
    profile: { hours: { mon: { open: "09:00", close: "18:00" } }, services: [{ name: "Cut" }] },
  };
  const composed = resolveSystemPrompt(withProfile, "voice", "America/New_York", new Date(), { faq: { mode: "ask" } });
  assert.ok(
    composed.includes("Service and pricing questions: do not answer them yourself") &&
      composed.includes("call them back with the details"),
  );
  assert.ok(ESCALATION_REASONS.includes("policy_ask"));
});

test("the wiring: the edge passes the rows to both prompts and checks after generation; the API refuses what a class cannot honour; the pane says so", () => {
  const wa = readCode("packages/core/src/inbound/answer.ts");
  const steps = readCode("packages/core/src/inbound/steps.ts");
  assert.ok(wa.includes('resolveSystemPrompt(brainCfg, "whatsapp", rt?.timezone, new Date(), rt?.policy, rt?.known)'));
  assert.ok(
    steps.includes("const askClass = policyAskClass(x.policy, x.intent);") &&
      steps.includes('escalationReason = "policy_ask";') &&
      wa.includes("const two = layerTwo({"),
    "after generation, not only in the prompt",
  );
  assert.ok(
    steps.includes("const carriesLink = !!x.brainCfg.booking_link && replyText.includes(x.brainCfg.booking_link);"),
    "a link the model sent anyway is taken back",
  );
  // The phone hears the same rules: run in call-start.test.mjs, where business_facts is this composer's text byte for byte.
  // The eval and the steer composing the same prompt, the Autonomy rows in it, are run in eval-door.test.mjs and steer-door.test.mjs.
  const route = readCode("apps/dashboard/app/api/v1/policies/route.ts");
  assert.ok(route.includes("if (!POLICY_CLASS_MODES[cls as PolicyClass].includes(mode as PolicyMode))"));
  const store = readCode("apps/dashboard/src/legacy-bridge/policy-store.ts");
  assert.ok(!store.includes("enforced: false"), "no row is stored-but-unenforced any more");
  assert.ok(store.includes('modes: ["Auto", "Ask"]'));
  const pane = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(
    pane.includes("r.modes && !r.modes.includes(m)") && pane.includes("(r.hints && r.hints[m]) || polMode(m).does"),
  );
  assert.ok(readCode("supabase/migrations/00056_policy_ask_reason.sql").includes("'policy_ask'"));
});
