import "server-only";
import { partialAnswer } from "@chanlytics/contracts";
import { streamModel, type GatewayCall } from "./gateway";

/**
 * One model round: the request goes out, the stream comes back, the content
 * blocks are gathered. The finish call's answer field is forwarded as it
 * streams, so the palette shows the words while the rest of the turn is
 * still being written. Nothing here knows what a tool does or what a turn
 * is; the loop decides what to do with the blocks.
 */

export interface RoundBlock {
  type: "text" | "tool_use" | "thinking" | "redacted_thinking";
  id: string;
  name: string;
  text: string;
  json: string;
  /** A thinking block's words (empty when the display is omitted) and its signature, carried back unmodified. */
  thinking?: string;
  signature?: string;
  /** A redacted thinking block's data, carried back unmodified. */
  data?: string;
}

export interface RoundResult {
  /** In the order the model wrote them. */
  blocks: RoundBlock[];
  stopReason: string | null;
  /** The stream broke after it started; the blocks so far are still here. */
  streamError: string | null;
}

/** `stream` is the gateway unless a test hands in its own events, so the gathering runs without a model. */
export async function runRound(
  call: GatewayCall,
  onAnswer: (delta: string) => void,
  stream: typeof streamModel = streamModel,
): Promise<RoundResult> {
  const blocks = new Map<number, RoundBlock>();
  let stopReason: string | null = null;
  let streamError: string | null = null;
  let finishIndex = -1;
  let answerSoFar = "";
  for await (const ev of stream(call)) {
    switch (ev.type) {
      case "block_start":
        blocks.set(ev.index, {
          type: ev.block.type,
          id: ev.block.type === "tool_use" ? ev.block.id : "",
          name: ev.block.type === "tool_use" ? ev.block.name : "",
          text: "",
          json: "",
          ...(ev.block.type === "thinking" ? { thinking: "", signature: "" } : {}),
          ...(ev.block.type === "redacted_thinking" ? { data: ev.block.data } : {}),
        });
        if (ev.block.type === "tool_use" && ev.block.name === "finish") finishIndex = ev.index;
        break;
      case "text": {
        const b = blocks.get(ev.index);
        if (b) b.text += ev.text;
        break;
      }
      case "input_json": {
        const b = blocks.get(ev.index);
        if (!b) break;
        b.json += ev.partial;
        if (ev.index === finishIndex) {
          const a = partialAnswer(b.json);
          if (a.length > answerSoFar.length) {
            onAnswer(a.slice(answerSoFar.length));
            answerSoFar = a;
          }
        }
        break;
      }
      case "thinking": {
        const b = blocks.get(ev.index);
        if (b) b.thinking = (b.thinking ?? "") + ev.thinking;
        break;
      }
      case "signature": {
        const b = blocks.get(ev.index);
        if (b) b.signature = (b.signature ?? "") + ev.signature;
        break;
      }
      case "stop":
        stopReason = ev.stopReason;
        break;
      case "error":
        streamError = ev.message;
        break;
      default:
        break;
    }
  }
  return { blocks: [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b), stopReason, streamError };
}

export function parseInput(json: string): Record<string, unknown> {
  try {
    return json ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * A round's blocks as the next request carries them back: in the order
 * written, and a thinking block exactly as it came -- its words and its
 * signature, or a redacted block's data -- because a model that always thinks
 * refuses a turn whose thinking was changed (Opus 5.5's migration guide). An
 * empty text block goes back as a space, which the API accepts; a tool call as
 * its parsed input.
 */
export function replayBlocks(blocks: RoundBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "thinking":
        return { type: "thinking", thinking: b.thinking ?? "", signature: b.signature ?? "" };
      case "redacted_thinking":
        return { type: "redacted_thinking", data: b.data ?? "" };
      case "text":
        return { type: "text", text: b.text || " " };
      default:
        return { type: "tool_use", id: b.id, name: b.name, input: parseInput(b.json) };
    }
  });
}
