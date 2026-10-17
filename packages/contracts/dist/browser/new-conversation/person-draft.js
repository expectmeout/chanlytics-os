export const DRAFT_HOWS = ["message", "call"];
export const DRAFT_TONES = ["shorter", "warmer"];
export const DRAFT_ABOUT_MAX = 500;
export const DRAFT_ASKS_MAX = 2;
export const DRAFT_ANSWER_MAX = 300;
export const PLAN_NOTE_MAX = 280;
export const PERSON_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["asks", "text", "subject", "note", "opening", "points", "avoid", "ask"],
  properties: {
    asks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "question"],
        properties: { key: { type: "string" }, question: { type: "string" } }
      }
    },
    text: { type: "string" },
    subject: { type: "string" },
    note: { type: "string" },
    opening: { type: "string" },
    points: { type: "array", items: { type: "string" } },
    avoid: { type: "array", items: { type: "string" } },
    ask: { type: "string" }
  }
};
