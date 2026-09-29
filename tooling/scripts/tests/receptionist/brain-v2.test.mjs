/**
 * The receptionist answers in a record, not a string.
 *
 * The brain returned text with a handoff token hidden in it and nothing
 * else: no reading of what the customer wanted, no sense of how sure it was,
 * no trace of which fact it leaned on. Now the API constrains its answer to
 * a schema, the parse here is the second door, the record rides on the
 * message row, the Inbox shows why, and under Auto a reply the model is not
 * sure enough about waits in the hold window for a person.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRAIN_OUTPUT_JSON_SCHEMA,
  BRAIN_INTENTS,
  BrainOutputSchema,
  parseBrainOutput,
  brainMetaOf,
  replyWhy,
  CONFIDENCE_STEPS,
  PolicyLimitsSchema,
  toInboxThreadVM,
  toConversationVM,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

test("the JSON schema uses only what the API constrains: no ranges, no lengths, closed objects", () => {
  const s = JSON.stringify(BRAIN_OUTPUT_JSON_SCHEMA);
  for (const banned of ["minimum", "maximum", "minLength", "maxLength", "maxItems", "oneOf", '"null"']) {
    assert.ok(!s.includes(banned), `${banned} is not supported by constrained decoding`);
  }
  assert.equal(BRAIN_OUTPUT_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    [...BRAIN_OUTPUT_JSON_SCHEMA.required].sort(),
    Object.keys(BRAIN_OUTPUT_JSON_SCHEMA.properties).sort(),
    "every property is required",
  );
  assert.deepEqual(BRAIN_OUTPUT_JSON_SCHEMA.properties.intent.enum, [...BRAIN_INTENTS]);
});

test("the parse is the second door: clamps, defaults, and refuses what cannot be sent", () => {
  const ok = parseBrainOutput(
    JSON.stringify({
      reply: "Hi Dani! We open at 10.",
      intent: "hours",
      escalate: false,
      reason: "",
      confidence: 0.92,
      facts_used: ["Tue–Sat 9:30–18:00"],
      language: "en",
    }),
  );
  assert.ok(ok.ok);
  assert.equal(ok.value.confidence, 0.92);
  assert.deepEqual(ok.value.facts_used, ["Tue–Sat 9:30–18:00"]);
  const clamped = parseBrainOutput(
    JSON.stringify({
      reply: "x",
      intent: "nonsense",
      escalate: "yes",
      reason: 7,
      confidence: 1.7,
      facts_used: [" a ", "", "b"],
      language: "fr",
    }),
  );
  assert.ok(clamped.ok, "a model's wobble is corrected, not refused");
  assert.equal(clamped.value.intent, "other");
  assert.equal(clamped.value.escalate, false);
  assert.equal(clamped.value.confidence, 1);
  assert.deepEqual(clamped.value.facts_used, ["a", "b"]);
  assert.equal(clamped.value.language, "other");
  assert.equal(clamped.value.reason, "");
  const cut = parseBrainOutput('{"reply": "We open at');
  assert.ok(!cut.ok && cut.error.startsWith("not JSON"), "a capped answer fails here and the holding reply goes out");
  const empty = parseBrainOutput(
    JSON.stringify({
      reply: "   ",
      intent: "other",
      escalate: false,
      reason: "",
      confidence: 0.5,
      facts_used: [],
      language: "en",
    }),
  );
  assert.ok(!empty.ok && empty.error === "empty reply");
  assert.ok(!parseBrainOutput("[]").ok);
  assert.equal(BrainOutputSchema.safeParse({ reply: 5 }).success, false, "the reply itself must be a string");
});

test("the record on the row is small and rounded; the rail reads it back", () => {
  const meta = brainMetaOf(
    {
      reply: "x",
      intent: "pricing",
      escalate: true,
      reason: "They asked for a price.",
      confidence: 0.6149,
      facts_used: ["Balayage ~180 min"],
      language: "es",
    },
    "claude-opus-5",
  );
  assert.deepEqual(meta, {
    intent: "pricing",
    confidence: 0.61,
    reason: "They asked for a price.",
    facts_used: ["Balayage ~180 min"],
    language: "es",
    model: "claude-opus-5",
  });
  const why = replyWhy({ source: "low_confidence", delay_ms: 30000, ...meta });
  assert.deepEqual(why, {
    intent: "pricing",
    intentLabel: "Pricing question",
    confidence: 61,
    reason: "They asked for a price.",
    facts: ["Balayage ~180 min"],
    heldFor: "low_confidence",
    summary: "Pricing question · 61% sure",
  });
  assert.equal(replyWhy({ source: "veto_window", delay_ms: 30000 }), null, "a row from before this remembers nothing");
  assert.equal(replyWhy(null), null);
  assert.equal(replyWhy({ intent: "hours" }).summary, "Hours", "no confidence, no percentage invented");
  assert.equal(replyWhy({ confidence: 0.3 }).heldFor, null);
});

test("the dial is a policy limit from 0 (off) to 1", () => {
  assert.ok(PolicyLimitsSchema.safeParse({ min_confidence: 0.75 }).success);
  assert.ok(PolicyLimitsSchema.safeParse({ min_confidence: 0 }).success);
  assert.ok(!PolicyLimitsSchema.safeParse({ min_confidence: 1.5 }).success);
  assert.ok(!PolicyLimitsSchema.safeParse({ min_confidence: -0.1 }).success);
  assert.deepEqual([...CONFIDENCE_STEPS], [0, 0.6, 0.75, 0.9]);
});

test("the Inbox and the viewer carry the why; a held draft says why it waits", () => {
  const now = new Date("2026-09-05T15:00:00Z");
  const contact = {
    id: "p1",
    display_name: "Dani",
    wa_profile_name: null,
    phone_e164: "+19175550100",
    consent: "opted_in",
    dnc: false,
  };
  const msg = (over) => ({
    id: "m",
    direction: "outbound",
    sender: "ai",
    type: "text",
    body: "hi",
    media: null,
    meta: null,
    status: "sent",
    created_at: "2026-09-05T14:59:00Z",
    channel_ts: null,
    ...over,
  });
  const meta = {
    intent: "hours",
    confidence: 0.88,
    reason: "",
    facts_used: ["Sat 9:30–18:00"],
    language: "en",
    model: "claude-opus-5",
  };
  const dto = {
    id: "c1",
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    last_wa_inbound_at: "2026-09-05T14:58:00Z",
    last_message_at: "2026-09-05T14:59:00Z",
    contact,
    messages: [
      msg({
        id: "in",
        direction: "inbound",
        sender: "customer",
        body: "open saturday?",
        created_at: "2026-09-05T14:58:00Z",
      }),
      msg({ id: "out", meta: { ...meta } }),
      msg({
        id: "held",
        status: "queued",
        body: "held words",
        meta: {
          source: "low_confidence",
          delay_ms: 60000,
          ...meta,
          confidence: 0.41,
          reason: "Not sure the Saturday hours are current.",
        },
        created_at: "2026-09-05T14:59:30Z",
      }),
    ],
  };
  const thread = toInboxThreadVM(dto, null, ZONE, now);
  const out = thread.timeline.find((e) => e.type === "msg" && e.messageId === "out");
  assert.equal(out.why.summary, "Hours · 88% sure");
  assert.deepEqual(out.why.facts, ["Sat 9:30–18:00"]);
  const customer = thread.timeline.find((e) => e.type === "msg" && e.from === "client");
  assert.equal(customer.why, undefined, "a customer's message has no why");
  assert.equal(thread.veto.why.heldFor, "low_confidence");
  assert.equal(thread.veto.why.confidence, 41);
  assert.equal(thread.veto.why.reason, "Not sure the Saturday hours are current.");
  const conv = toConversationVM(dto, ZONE, now);
  assert.equal(conv.messages.find((m) => m.text === "hi" && m.from === "agent").why.summary, "Hours · 88% sure");
});

test("the brain asks for the record, reads it through the parse, and keeps the old token as a handoff", () => {
  const b = readCode("apps/edge/lib/receptionist/brain.ts");
  assert.ok(
    b.includes('output_config: { effort: "low", format: { type: "json_schema", schema: BRAIN_OUTPUT_JSON_SCHEMA } }'),
  );
  assert.ok(b.includes("max_tokens: 900,"));
  assert.ok(
    b.includes('if (response.stop_reason === "max_tokens") {') &&
      b.includes('return { text: fallbackText, escalate: true, reason: "human_token", usage };'),
    "a capped answer is the holding reply plus a person",
  );
  assert.ok(b.includes("const parsed = parseBrainOutput(raw);"));
  assert.ok(b.includes('reason: "brain_error", usage };'), "an unreadable answer is the holding reply plus a person");
  assert.ok(b.includes('let escalate = parsed.value.escalate || text.includes("[[HUMAN]]");'));
  assert.ok(b.includes("meta: brainMetaOf(parsed.value, BRAIN_MODEL)"));
});

test("the handler keeps the record on the row, holds a reply below the dial, and tells the escalation why", () => {
  // The turn (model-turn.ts) and what it leaves on the draft and the escalation (dispatch.ts).
  const wa = ["model-turn", "dispatch"].map((m) => readCode(`packages/core/src/inbound/${m}.ts`)).join("\n");
  const steps = readCode("packages/core/src/inbound/steps.ts");
  assert.ok(wa.includes("let brainMeta: BrainMeta | undefined;"));
  assert.ok(wa.includes("brainMeta = r.meta;"));
  assert.ok(
    readCode("apps/edge/lib/receptionist/draft-queue.ts").includes(
      "meta: { source: a.source, delay_ms: a.delayMs, ...(a.brainMeta ?? {}), ...(a.extra ?? {}) } as Json,",
    ),
    "the draft row remembers",
  );
  assert.ok(
    readCode("apps/edge/lib/whatsapp/persist.ts").includes("...(meta ? { meta } : {}),"),
    "so does the sent row, through the door",
  );
  assert.ok(
    /replyMode === "auto" &&\s*minConfidence > 0 &&\s*typeof brainMeta\?\.confidence === "number" &&\s*brainMeta\.confidence < minConfidence;/.test(
      steps,
    ),
  );
  assert.ok(
    steps.includes('delayMs = replyDelayMs("veto", replyLimits);'),
    "held in the configured window, not a made-up one",
  );
  assert.ok(
    steps.includes('source: heldForConfidence ? "low_confidence" : "veto_window"') &&
      /plan\.source,\s*brainMeta,\s*channel,?\s*\)/.test(wa),
    "the draft remembers why it waited",
  );
  assert.equal(
    (wa.match(/brainMeta\?\.reason\s*\? `\$\{brainMeta\.reason\} — "\$\{bodyText\}"`\s*: bodyText/g) ?? []).length,
    2,
    "both escalation paths carry the reason",
  );
});

// The route's side runs in workspace/settings-routes.test.mjs: the dial taken by its row's name (and, for one release,
// its old one), kept to two places, a dial edit keeping the row's mode.
test("the dial reaches the policy row through the pane and the bridge", () => {
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts").includes(
      "if (d.minConfidence !== undefined) wire.min_confidence = d.minConfidence;",
    ),
  );
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(pane.includes('const AUT_CONF = [["Off", 0], ["60%", 0.6], ["75%", 0.75], ["90%", 0.9]];'));
  assert.ok(pane.includes('label="Send on its own only when it\'s sure"'));
  assert.ok(pane.includes("put(reply, undefined, { minConfidence: c[1] })"));
  const thread = readRaw("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(
    thread.includes("· {why.summary}"),
    "the summary the dial drives, now inside the button that opens the reason",
  );
  assert.ok(thread.includes('"Not sure enough to send alone · "'));
  // Conversations draws the one thread, this button included (one-thread.test.mjs).
});
