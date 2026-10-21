import { CONSENT_LIST_IDS } from "../broadcasts/broadcast-audience.js";
import { REACH_OUT_AFTER_DAYS, REACH_OUT_STEPS_MAX } from "../reach-out/reach-out-words.js";
import { FOLLOW_UP_CONDITIONS } from "./follow-up.js";
import { SEQUENCE_WAIT_DAYS } from "./sequence-draft.js";
export const NEW_KINDS = ["sequence", "once"];
export const NEW_AUDIENCES = ["people", "leads"];
export const NEW_STEP_DOES = ["message", "call", "note"];
export const NEW_STEPS_MAX = { people: 6, leads: REACH_OUT_STEPS_MAX };
export const NEW_WAIT_DAYS = {
  people: SEQUENCE_WAIT_DAYS,
  leads: { min: REACH_OUT_AFTER_DAYS.min, max: REACH_OUT_AFTER_DAYS.max }
};
export const newWaitOf = (audience, days) => Math.min(NEW_WAIT_DAYS[audience].max, Math.max(NEW_WAIT_DAYS[audience].min, Math.round(days)));
export const newConditionsOf = (audience) => audience === "people" ? FOLLOW_UP_CONDITIONS : [];
export const NEW_ONCE_AHEAD_DAYS = 30;
export const NEW_WORDS_MAX = 500;
export function whoSuits(who, audience, kind) {
  if (audience === "leads") return who.kind === "search" || who.kind === "leads";
  if (kind === "sequence") return who.kind === "moment" || who.kind === "list";
  return who.kind === "everyone" || who.kind === "list";
}
export function newListOf(token, kind) {
  const id = token.startsWith("seg:") ? token.slice(4) : null;
  if (id === "opted_out") return "never";
  if (kind === "once" && id !== null && CONSENT_LIST_IDS.includes(id)) return "everyone";
  return "list";
}
export function leadChainStepOf(s, i) {
  if (s.does !== "message")
    return { subject: null, body: "", after_days: s.after_days, hand: { kind: s.does, words: s.hand } };
  return {
    subject: i === 0 ? s.email?.subject ?? "" : null,
    body: s.email?.body ?? "",
    after_days: i === 0 ? null : s.after_days
  };
}
export function handStepsHold(steps) {
  return steps.every((s, i) => s.does === "message" || i > 0 && i === steps.length - 1);
}
export const NEW_VALUES = [
  { say: "first name", kind: "first_name", label: "First name", example: "Dani" },
  { say: "business name", kind: "business_name", label: "Business name", example: "Maya Studio" },
  { say: "booking link", kind: "booking_link", label: "Booking link", example: "https://example.com/book" },
  { say: "review link", kind: "review_link", label: "Review link", example: "https://example.com/review" },
  { say: "booked time", kind: "visit_when", label: "Booked time", example: "tomorrow at 2:30 PM" },
  { say: "booked service", kind: "visit_service", label: "Booked service", example: "color" },
  { say: "proposal link", kind: "proposal_link", label: "Proposal link", example: "https://example.com/proposal" }
];
export function numberedValues(versions) {
  const order = [];
  for (const text of versions) {
    if (/\{(?!\{)|(?<!\})\}/.test(text.replace(/\{\{[^{}]*\}\}/g, ""))) return null;
    for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const say = (m[1] ?? "").toLowerCase();
      if (!NEW_VALUES.some((v) => v.say === say)) return null;
      if (!order.includes(say)) order.push(say);
    }
  }
  const slots = order.map((say, i) => {
    const v = NEW_VALUES.find((x) => x.say === say);
    if (!v) throw new Error(`unknown value ${say}`);
    return { position: i + 1, label: v.label, example: v.example, kind: v.kind };
  });
  const rewrite = (text) => text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, say) => `{{${order.indexOf(say.toLowerCase()) + 1}}}`);
  return { rewrite, slots };
}
export const NEW_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "audience", "who", "name", "hour", "when", "steps", "cannot"],
  properties: {
    kind: { type: "string", enum: [...NEW_KINDS] },
    audience: { type: "string", enum: [...NEW_AUDIENCES] },
    who: { type: "string" },
    name: { type: "string" },
    hour: { type: "integer" },
    when: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["does", "after_days", "only_if", "message", "texts", "write", "subject", "body", "words"],
        properties: {
          does: { type: "string", enum: [...NEW_STEP_DOES] },
          after_days: { type: "integer" },
          only_if: { type: "array", items: { type: "string", enum: [...FOLLOW_UP_CONDITIONS] } },
          message: { type: "string" },
          texts: { type: "array", items: { type: "string" } },
          write: {
            type: "object",
            additionalProperties: false,
            required: ["title", "offer", "whatsapp", "email_subject", "email_body", "text"],
            properties: {
              title: { type: "string" },
              offer: { type: "boolean" },
              whatsapp: { type: "string" },
              email_subject: { type: "string" },
              email_body: { type: "string" },
              text: { type: "string" }
            }
          },
          subject: { type: "string" },
          body: { type: "string" },
          words: { type: "string" }
        }
      }
    },
    cannot: { type: "string" }
  }
};
