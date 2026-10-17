import { ASK_LANGUAGES } from "./ask-language.js";
import { ASK_ANSWER_CAPS as C, ASK_LIST_STYLES } from "./ask-answer.js";
import { ASK_CITATION_KINDS, ASK_ROW_WORDS } from "./citations.js";
import { ASK_CHART_KINDS } from "./answer-text.js";
const SOURCE = {
  type: "object",
  description: "A row or a page read this turn (the workspace block and the reads above count, as does a tool's result), or a row an earlier answer in this thread named, with the kind and the exact id it came with (a page's id is its route; a run is kind broadcast); kind none when it rests on nothing read or named.",
  properties: {
    kind: { type: "string", enum: [...ASK_CITATION_KINDS, "none"] },
    id: { type: "string" },
    label: { type: "string", description: `A short name for it, at most ${C.label} characters.` }
  },
  required: ["kind", "id", "label"],
  additionalProperties: false
};
export const ASK_ANSWER_FORMAT = {
  type: "object",
  properties: {
    say: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          description: `The answer itself in one short plain sentence, the finding first and never a preamble; at most ${C.headline} characters.`
        },
        detail: {
          type: "string",
          description: `The body under the headline, as long as the question needs and no longer: empty when the headline says it whole, a sentence or two for a reason or a condition, more for why, how, a comparison, steps or a plan. Markdown where it helps the reader: **bold** for the number or name that matters, a short ### heading over each part of a long answer, - bullets and 1. numbered steps (two spaces nest a point under another), a table (a header row, its |---| rule, then its rows) for rows compared on the same columns, a customer's own words as a > quote, and a callout as > [!WARNING] (what must come first, or needs them) or > [!NOTE] (a side note), its words on the same line or the > lines after. A row this turn read, named in the words, as [its name](kind:id) with the kind and the id a tool gave, which opens it; never an address, and no HTML. At most ${C.detail} characters.`
        }
      },
      required: ["headline", "detail"],
      additionalProperties: false
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
                description: `The number as said: "5", "44%", "1 min"; at most ${C.value} characters.`
              },
              label: { type: "string", description: `What it counts, at most ${C.label} characters.` },
              note: {
                type: "string",
                description: `How it compares ("up from 1"), or empty; at most ${C.note} characters.`
              },
              source: SOURCE
            },
            required: ["value", "label", "note", "source"],
            additionalProperties: false
          }
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
                description: `The channel and how long, or empty; at most ${C.meta} characters.`
              },
              line: { type: "string", description: `Why it matters, in one line of at most ${C.line} characters.` },
              source: SOURCE
            },
            required: ["title", "meta", "line", "source"],
            additionalProperties: false
          }
        },
        breakdown: {
          type: "object",
          description: `One whole in its parts, at most ${C.parts} parts whose values add up exactly to total; parts empty when nothing splits.`,
          properties: {
            label: {
              type: "string",
              description: `What the whole is ("customer messages"), at most ${C.label} characters.`
            },
            total: { type: "number" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: `At most ${C.label} characters.` },
                  value: { type: "number" },
                  warn: { type: "boolean", description: "True for the one part that needs attention." }
                },
                required: ["label", "value", "warn"],
                additionalProperties: false
              }
            },
            source: SOURCE
          },
          required: ["label", "total", "parts", "source"],
          additionalProperties: false
        },
        chart: {
          type: "object",
          description: `A chart of numbers read this turn, when a picture says it faster than words: kind line for one count over time (a point a day, a week or a month, oldest first), bars for a few things compared, 2 to ${C.points} points, each value a number a tool returned, and the source they were read from. Points empty when nothing is charted, and never the numbers a breakdown or a table already shows.`,
          properties: {
            kind: { type: "string", enum: [...ASK_CHART_KINDS] },
            label: {
              type: "string",
              description: `What is counted ("bookings a week", "messages by channel"), at most ${C.label} characters.`
            },
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: {
                    type: "string",
                    description: `A day, a week, a month or a name, at most ${C.label} characters.`
                  },
                  value: { type: "number" }
                },
                required: ["label", "value"],
                additionalProperties: false
              }
            },
            source: SOURCE
          },
          required: ["kind", "label", "points", "source"],
          additionalProperties: false
        },
        list: {
          type: "object",
          description: "A flat list of points when the answer is one (bullets, numbered, steps, one per line): points in words, never the rows items hold; entries empty when nothing is a list. A list nested under headings, or set beside a table, goes in say.detail instead.",
          properties: {
            style: {
              type: "string",
              enum: [...ASK_LIST_STYLES],
              description: "bullets; numbers for steps or an order; lines for one entry to a line with no mark. With entries empty, numbers numbers the items."
            },
            entries: {
              type: "array",
              description: `At most ${C.entries}, each one point of at most ${C.entry} characters, with no bullet or number of its own (the page draws them); **bold** where a word matters.`,
              items: { type: "string" }
            }
          },
          required: ["style", "entries"],
          additionalProperties: false
        }
      },
      required: ["figures", "items", "breakdown", "chart", "list"],
      additionalProperties: false
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
              description: "True when they asked to open, show or see it: the app goes there as the answer lands."
            }
          },
          required: ["source", "label", "now"],
          additionalProperties: false
        },
        next: {
          type: "array",
          description: `Up to ${C.next} short questions they might ask next, at most ${C.question} characters each, never one about a place already offered; empty when nothing follows.`,
          items: { type: "string" }
        }
      },
      required: ["open", "next"],
      additionalProperties: false
    },
    language: { type: "string", enum: [...ASK_LANGUAGES] }
  },
  required: ["say", "show", "do", "language"],
  additionalProperties: false
};
