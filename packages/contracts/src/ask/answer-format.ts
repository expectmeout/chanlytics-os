/**
 * The format the model writes Ask's answer in: the answer's shape (ask-answer.ts) as a JSON schema, passed as
 * `output_config.format` and read back by normalizeAnswer. It rides in every request. Pure.
 */
import { ASK_LANGUAGES } from "./ask-language";
import { ASK_ANSWER_CAPS as C } from "./ask-answer";
import { ASK_CITATION_KINDS, ASK_ROW_WORDS } from "./citations";

const SOURCE = {
  type: "object",
  description:
    "A row or a page read this turn (the workspace block and the reads above count, as does a tool's result), with the kind and the exact id it came with (a page's id is its route; a run is kind broadcast); kind none when it rests on nothing read.",
  properties: {
    kind: { type: "string", enum: [...ASK_CITATION_KINDS, "none"] },
    id: { type: "string" },
    label: { type: "string", description: `A short name for it, at most ${C.label} characters.` },
  },
  required: ["kind", "id", "label"],
  additionalProperties: false,
} as const;

/**
 * The answer's shape as the model writes it, passed as `output_config.format` (spec 5.3). Every property is required
 * and nothing else is allowed, so "nothing" is an empty string, an empty array or kind none. Structured outputs take
 * no length limits, so each limit is said in its description, from ASK_ANSWER_CAPS and nowhere else the model reads
 * (D6). `say` comes first, so it streams first. Changing it resets the prompt cache for every conversation.
 */
export const ASK_ANSWER_FORMAT = {
  type: "object",
  properties: {
    say: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          description: `The answer itself in one sentence, the finding first and never a preamble; under 20 words and at most ${C.headline} characters.`,
        },
        detail: {
          type: "string",
          description: `Only what the headline needs: empty when the headline is enough; at most two short sentences, or five when they asked why, how, for a summary or for detail; at most ${C.detail} characters.`,
        },
      },
      required: ["headline", "detail"],
      additionalProperties: false,
    },
    show: {
      type: "object",
      properties: {
        figures: {
          type: "array",
          description: `The numbers the headline rests on, at most ${C.figures}; empty when there is none.`,
          items: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: `The number as said: "5", "44%", "1 min"; at most ${C.value} characters.`,
              },
              label: { type: "string", description: `What it counts, at most ${C.label} characters.` },
              note: {
                type: "string",
                description: `How it compares ("up from 1"), or empty; at most ${C.note} characters.`,
              },
              source: SOURCE,
            },
            required: ["value", "label", "note", "source"],
            additionalProperties: false,
          },
        },
        items: {
          type: "array",
          description: `The rows the answer names (${ASK_ROW_WORDS}), at most ${C.items}; empty when it names none. Each opens its row.`,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: `Who or what it is, at most ${C.title} characters.` },
              meta: {
                type: "string",
                description: `The channel and how long, or empty; at most ${C.meta} characters.`,
              },
              line: { type: "string", description: `Why it matters, in one line of at most ${C.line} characters.` },
              source: SOURCE,
            },
            required: ["title", "meta", "line", "source"],
            additionalProperties: false,
          },
        },
        breakdown: {
          type: "object",
          description: `One whole in its parts, at most ${C.parts} parts whose values add up exactly to total; parts empty when nothing splits.`,
          properties: {
            label: {
              type: "string",
              description: `What the whole is ("customer messages"), at most ${C.label} characters.`,
            },
            total: { type: "number" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: `At most ${C.label} characters.` },
                  value: { type: "number" },
                  warn: { type: "boolean", description: "True for the one part that needs attention." },
                },
                required: ["label", "value", "warn"],
                additionalProperties: false,
              },
            },
            source: SOURCE,
          },
          required: ["label", "total", "parts", "source"],
          additionalProperties: false,
        },
      },
      required: ["figures", "items", "breakdown"],
      additionalProperties: false,
    },
    do: {
      type: "object",
      properties: {
        open: {
          type: "object",
          description: "The one place to open, when it helps: its source, kind none when nothing needs opening.",
          properties: {
            source: SOURCE,
            label: { type: "string", description: `The button's words, at most ${C.label} characters.` },
            now: {
              type: "boolean",
              description: "True when they asked to open, show or see it: the app goes there as the answer lands.",
            },
          },
          required: ["source", "label", "now"],
          additionalProperties: false,
        },
        next: {
          type: "array",
          description: `Up to ${C.next} short questions they might ask next, at most ${C.question} characters each, never one about a place already offered; empty when nothing follows.`,
          items: { type: "string" },
        },
      },
      required: ["open", "next"],
      additionalProperties: false,
    },
    language: { type: "string", enum: [...ASK_LANGUAGES] },
  },
  required: ["say", "show", "do", "language"],
  additionalProperties: false,
} as const;
