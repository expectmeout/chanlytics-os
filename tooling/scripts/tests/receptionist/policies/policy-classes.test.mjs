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
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readCode, ROOT } from "../../_source.mjs";
import { withStanding } from "../_prompt-rules.mjs";

const { layerTwo } = await import(pathToFileURL(path.join(ROOT, "packages/core/src/inbound/steps.ts")).href);

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
  // Auto adds no Booking or FAQ line; the money row is locked and its line is said whatever the rows say.
  for (const [rows, channel] of [
    [{ booking: { mode: "auto" }, faq: { mode: "auto" } }, "whatsapp"],
    [null, "voice"],
  ]) {
    const only = policyRules(rows, channel);
    assert.equal(only.length, 1, channel);
    assert.ok(only[0].startsWith("Money:"), channel);
  }
  const wa = policyRules({ booking: { mode: "ask" }, faq: { mode: "ask" } }, "whatsapp");
  assert.equal(wa.length, 3);
  assert.ok(wa[2].startsWith("Money:") && wa[2].includes("set intent to money"));
  assert.ok(
    wa[0].startsWith("Booking:") &&
      wa[0].includes("do not send the booking link") &&
      wa[0].includes("set escalate to true"),
  );
  assert.ok(wa[1].startsWith("Service and pricing questions:") && wa[1].includes("do not answer them yourself"));
  const voice = policyRules({ booking: { mode: "ask" } }, "voice");
  assert.equal(voice.length, 2);
  assert.ok(
    voice[0].includes("call or text them to confirm") && !voice[0].includes("escalate"),
    "the phone has no escalate flag; it takes a name",
  );
  assert.ok(voice[1].startsWith("Money:") && !voice[1].includes("escalate"));
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
    withStanding("You are the receptionist."),
    "auto adds no Booking line: only the standing rules follow",
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
  const wa = readCode("packages/core/src/inbound/model-turn.ts");
  assert.ok(wa.includes('resolveSystemPrompt(brainCfg, "whatsapp", rt?.timezone, new Date(), rt?.policy, rt?.known)'));
  assert.ok(wa.includes("const two = layerTwo({"), "the turn asks layer two after generation");
  // Layer two, run: under "ask", a booking link the model sent anyway is taken back and the thread is a person's.
  const brainCfg = { business_name: "Marisa's", booking_link: "https://book.example.com/marisas" };
  const two = layerTwo({
    replyText: "Book here: https://book.example.com/marisas",
    escalate: false,
    escalationReason: "human_token",
    brainCfg,
    policy: { booking: { mode: "ask" } },
    intent: "booking",
  });
  assert.deepEqual(
    [two.askClass, two.complied, two.escalate, two.escalationReason],
    ["booking", false, true, "policy_ask"],
  );
  assert.ok(!two.replyText.includes("https://book.example.com"), "a link the model sent anyway is taken back");
  // The phone hears the same rules: run in call-start.test.mjs, where business_facts is this composer's text byte for byte.
  // The eval and the steer composing the same prompt, the Autonomy rows in it, are run in eval-door.test.mjs and steer-door.test.mjs.
  // The route refusing and the pane's dots, each by POLICY_CLASS_MODES, are run in policy-veto-option.test.mjs.
  const store = readCode("apps/dashboard/src/legacy-bridge/policy-store.ts");
  assert.ok(!store.includes("enforced: false"), "no row is stored-but-unenforced any more");
  const pane = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(
    pane.includes("r.modes && !r.modes.includes(m)") && pane.includes("(r.hints && r.hints[m]) || polMode(m).does"),
  );
  assert.ok(readCode("supabase/migrations/00056_policy_ask_reason.sql").includes("'policy_ask'"));
});
