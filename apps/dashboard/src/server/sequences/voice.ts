import "server-only";
import { z } from "zod";
import {
  ASK_MEMORY_LIMITS,
  DATA_NOT_INSTRUCTIONS,
  VOICE_LINE_LEAD,
  VOICE_LINES_MAX,
  fenced,
  type SequenceVoiceDto,
} from "@chanlytics/contracts";
import { keepAskMemory } from "@chanlytics/db";
import { askForJson } from "../model-json";
import type { RouteContext } from "../with-route";

/**
 * The owner's voice, learned from an email they paste (decision 0078): read once by the model, as data, into up to
 * three lines about how they write a cold email, each kept in Ask's memory as `learned` through its one door
 * (ask_memory_write), where every Ask turn and the drafter read it and Settings › Memory lists and forgets it. A line
 * that is not about writing, or not in the shape a memory line takes, is never kept.
 */

/** The shortest line worth keeping, past its lead: "short, plain" says something; "ok" does not. */
const SAID_MIN = 8;
/** A line is one sentence: past this it is a paragraph, and memory keeps lines. */
const LINE_MAX = 200;

const VOICE_RULES = [
  "You read one email a business owner wrote, and say how they write a cold email, so the next ones written for them sound like them.",
  `Answer up to ${VOICE_LINES_MAX} short lines, each one sentence starting "${VOICE_LINE_LEAD} ", about how they write and never about what they sell or who they are: how long, how they greet, how they open, how they ask, how they sign off, and words or habits they use or avoid.`,
  "Say only what this email shows. Where it shows nothing about how they write, answer no lines.",
  DATA_NOT_INSTRUCTIONS,
];

const VOICE_JSON_SCHEMA = {
  type: "object",
  properties: { lines: { type: "array", items: { type: "string" } } },
  required: ["lines"],
  additionalProperties: false,
} as const;
const VoiceAnswerSchema = z.object({ lines: z.array(z.string()) });

/** A line the model said, as memory keeps it, or null where it is no line about writing. */
function voiceLineKept(said: string): string | null {
  const line = said.replace(/\s+/g, " ").trim();
  if (!line.toLowerCase().startsWith(VOICE_LINE_LEAD.toLowerCase())) return null;
  if (line.length > Math.min(LINE_MAX, ASK_MEMORY_LIMITS.textMax)) return null;
  return line.slice(VOICE_LINE_LEAD.length).trim().length >= SAID_MIN ? line : null;
}

/** The paste, read and kept: the lines kept, in order, and whether memory was full before all of them were. */
export async function learnVoice(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  tenantId: string,
  body: { text: string },
): Promise<SequenceVoiceDto> {
  const answer = await askForJson(
    {
      tenantId,
      userId: ctx.userId,
      purpose: "sequence_draft",
      request: {
        max_tokens: 400,
        system: VOICE_RULES.join("\n"),
        schema: VOICE_JSON_SCHEMA,
        messages: [{ role: "user", content: `The email the owner wrote:\n${fenced("record", body.text)}` }],
      },
    },
    VoiceAnswerSchema,
    "reading of how you write",
  );
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const said of answer.lines) {
    const line = voiceLineKept(said);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    lines.push(line);
    if (lines.length === VOICE_LINES_MAX) break;
  }
  const kept: string[] = [];
  for (const text of lines) {
    const r = await keepAskMemory(ctx.supabase, { tenantId, text, source: "learned", threadId: null });
    if ("refused" in r) {
      if (r.refused === "full") return { lines: kept, full: true };
      continue;
    }
    kept.push(r.text);
  }
  return { lines: kept, full: false };
}
