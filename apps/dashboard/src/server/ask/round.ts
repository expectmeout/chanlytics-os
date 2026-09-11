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
  type: "text" | "tool_use";
  id: string;
  name: string;
  text: string;
  json: string;
}

export interface RoundResult {
  /** In the order the model wrote them. */
  blocks: RoundBlock[];
  stopReason: string | null;
  /** The stream broke after it started; the blocks so far are still here. */
  streamError: string | null;
}

/** `stream` is the gateway unless a test hands in its own events, so the gathering runs without a model. */
export async function runRound(call: GatewayCall, onAnswer: (delta: string) => void, stream: typeof streamModel = streamModel): Promise<RoundResult> {
  const blocks = new Map<number, RoundBlock>();
  let stopReason: string | null = null;
  let streamError: string | null = null;
  let finishIndex = -1;
  let answerSoFar = "";
  for await (const ev of stream(call)) {
    switch (ev.type) {
      case "block_start":
        blocks.set(ev.index, { type: ev.block.type, id: ev.block.type === "tool_use" ? ev.block.id : "", name: ev.block.type === "tool_use" ? ev.block.name : "", text: "", json: "" });
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
      case "stop": stopReason = ev.stopReason; break;
      case "error": streamError = ev.message; break;
      default: break;
    }
  }
  return { blocks: [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b), stopReason, streamError };
}

export function parseInput(json: string): Record<string, unknown> {
  try { return json ? (JSON.parse(json) as Record<string, unknown>) : {}; } catch { return {}; }
}
