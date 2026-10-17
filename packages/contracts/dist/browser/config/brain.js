import { POLICY_COVERS } from "./workspace-config/policy-classes.js";
import { INTENT_LABELS } from "./intent-labels.js";
import { BOOKING_REQUEST_SCHEMA_FIELDS } from "../calendar/visit/booking-request.js";
export const BRAIN_INTENTS = [
  "booking",
  "pricing",
  // A refund, a discount, a deposit, a payment plan, any negotiation of what someone pays: the Autonomy pane's locked
  // money row (never), so a person answers whatever the words say (policy-classes.ts policyClassOfIntent; defect 5).
  "money",
  "hours",
  "services",
  "location",
  "complaint",
  "smalltalk",
  "other"
];
export const BRAIN_LANGUAGES = ["en", "es", "other"];
export const BRAIN_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS],
      description: `What the customer is after. money: ${POLICY_COVERS.money}.`
    },
    escalate: {
      type: "boolean",
      description: "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so."
    },
    reason: {
      type: "string",
      description: "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies."
    },
    confidence: {
      type: "number",
      description: "How sure you are that this reply is right and complete for this customer, from 0 to 1."
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description: "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none."
    },
    language: {
      type: "string",
      enum: [...BRAIN_LANGUAGES],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
export function brainOutputSchemaFor(o) {
  if (!o.bookingRequests) return BRAIN_OUTPUT_JSON_SCHEMA;
  return {
    ...BRAIN_OUTPUT_JSON_SCHEMA,
    properties: { ...BRAIN_OUTPUT_JSON_SCHEMA.properties, ...BOOKING_REQUEST_SCHEMA_FIELDS },
    required: [...BRAIN_OUTPUT_JSON_SCHEMA.required, "booking_slot", "booking_service"]
  };
}
export function brainMetaOf(out, model, stamp) {
  return {
    intent: out.intent,
    confidence: Math.round(out.confidence * 100) / 100,
    reason: out.reason,
    facts_used: out.facts_used,
    language: out.language,
    model,
    ...stamp ? { prompt_hash: stamp.promptHash, config_version: stamp.configVersion } : {}
  };
}
export function replyWhy(meta) {
  if (!meta || typeof meta !== "object") return null;
  const intent = BRAIN_INTENTS.includes(String(meta.intent)) ? meta.intent : null;
  const conf = typeof meta.confidence === "number" && Number.isFinite(meta.confidence) ? Math.round(Math.min(1, Math.max(0, meta.confidence)) * 100) : null;
  if (intent === null && conf === null) return null;
  const facts = Array.isArray(meta.facts_used) ? meta.facts_used.filter((f) => typeof f === "string" && !!f.trim()) : [];
  const reason = typeof meta.reason === "string" && meta.reason.trim() ? meta.reason.trim() : null;
  const source = typeof meta.source === "string" ? meta.source : null;
  const heldFor = source === "low_confidence" ? "low_confidence" : source === "veto_window" ? "veto_window" : null;
  const label = intent ? INTENT_LABELS[intent] : "Reply";
  return {
    intent: intent ?? "other",
    intentLabel: label,
    confidence: conf,
    reason,
    facts,
    heldFor,
    summary: conf === null ? label : `${label} \xB7 ${conf}% sure`
  };
}
export const CONFIDENCE_STEPS = [0, 0.6, 0.75, 0.9];
