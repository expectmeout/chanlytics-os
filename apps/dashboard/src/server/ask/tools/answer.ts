import "server-only";
import { ASK_ANSWER_FORMAT } from "@chanlytics/contracts";
import type { CallOutcome, RoundBlock } from "../round";
import type { ToolDef } from "./context";
import { ACT_TOOL_NAMES } from "./registry";

/**
 * The answer as a tool (ASK_ANSWER_TOOL on, 15 Oct 2026): its input is the answer's format, and it streams.
 *
 * On Opus 5.5 the text a round writes after a tool result is held back and arrives in one burst at the end of the
 * round, whatever the format, the effort or the tool choice; a tool's input streams as it is written when the tool asks
 * for it (`eager_input_streaming`). So a turn that read before it answered showed "Reading…" and then the whole answer
 * at once (all 38 multi-round turns of the 15 Oct eval), and the answer written as this tool's input draws its Say as it
 * grows on every round (docs: 2026-10-15-ask-effort-formatting-streaming.md, section 2). It is offered on every round,
 * the same bytes, so the tools block stays the cache's first prefix. It runs nothing: the loop takes its input as the
 * turn's answer, and normalizeAnswer is its validator, since an input that streams is not checked by the API. Opus 5.5
 * refuses a forced tool choice, so the model is asked to answer through it (prompt.ts), and an answer written as text
 * in the format is read as it always was.
 */
const ANSWER_TOOL_NAME = "answer";

export const ANSWER_TOOL: ToolDef = {
  name: ANSWER_TOOL_NAME,
  description:
    "Give the person your answer: say, show, do and language, as the answer's format describes them. Call it once, alone or beside the cards you propose, when you have read what you need; it is how every answer is written, never as text. Never call it beside a read: read first, then answer.",
  input_schema: ASK_ANSWER_FORMAT,
  eager_input_streaming: true,
};

/** Said after the results before the last round, where the answer is the tool's: calling it is how that round ends. */
export const LAST_ROUND_WORDS = "This is the last round: answer now through the answer tool, with what you have.";

/**
 * A round's calls, the answer tool's apart (they are the answer, never a read or a card), and the answer the round
 * wrote, if any, with how: the first answer call's input ("{}" when it is empty, which shapes to no answer), else its
 * JSON as text -- written even with the format refused, since the rules ask for it -- or words where no call stands
 * beside them or the format was refused. Words beside a call, where the format asks for JSON, are the model thinking
 * aloud.
 */
export function roundAnswer(blocks: RoundBlock[], format: boolean) {
  const used = blocks.filter((b) => b.type === "tool_use");
  const answered = used.filter((b) => b.name === ANSWER_TOOL_NAME);
  const calls = used.filter((b) => b.name !== ANSWER_TOOL_NAME);
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const prose = text && (text.startsWith("{") || !format || !calls.length) ? text : "";
  const [first] = answered;
  return first
    ? { used, answered, calls, written: first.json.trim() || "{}", via: "tool" as const }
    : { used, answered, calls, written: prose, via: "text" as const };
}

/**
 * The answer tool's input as it grows, handed to `preview` (the loop's Say); any other call's is no answer. Not while a
 * read came before it in the round: that answer was written before the read's rows and is set aside, and a Say shown
 * and then taken back is a flicker (the end-to-end review, A7). A read written after it cannot be known in time.
 */
export const answerInput = (preview: (json: string) => void) => (b: RoundBlock, earlier: RoundBlock[]) => {
  const read = (x: RoundBlock) => x.type === "tool_use" && x.name !== ANSWER_TOOL_NAME && !ACT_TOOL_NAMES.has(x.name);
  if (b.name === ANSWER_TOOL_NAME && !earlier.some(read)) preview(b.json);
};

/**
 * Every call of a round answered, in the order of the calls, as the next request carries them: the reads' and the
 * cards' outcomes, and each answer call told it was shown, where it is the turn's answer, or set aside (beside a read,
 * or a card that was not made), so the model answers again from what came back.
 */
export function everyCallAnswered(
  used: RoundBlock[],
  outcomes: CallOutcome[],
  answered: RoundBlock[],
  shown: boolean,
): CallOutcome[] {
  const out = shown
    ? { result: JSON.stringify({ shown: true }), isError: false }
    : {
        result: JSON.stringify({ error: "this answer was not shown: answer again from what came back" }),
        isError: true,
      };
  const all = [...outcomes, ...answered.map((block) => ({ block, out }))];
  return used.flatMap((b) => all.filter((o) => o.block === b));
}
