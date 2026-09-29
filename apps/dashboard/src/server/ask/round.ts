import "server-only";
import { streamModel, type GatewayCall } from "./gateway";

/**
 * One model round: the request goes out, the stream comes back, the content
 * blocks are gathered. The answer is written as text, so the text so far is
 * handed on as it grows, and the Line draws its Say while the rest of the
 * turn is still being written. Nothing here knows what a tool does or what a
 * turn is; the loop decides what to do with the blocks.
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

/** What the round cost, as the API said it on the stream (sse.ts GatewayUsage plus the stop's output side). */
export interface RoundUsage {
  messageId: string | null;
  /** The model that answered, in the API's own name (sse.ts GatewayUsage.model). */
  model: string | null;
  /** Why the round missed the cache the message it named had written (sse.ts GatewayUsage.cacheMiss). */
  cacheMiss: string | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Null when the stop carried no usage: unknown, never zero. */
  outputTokens: number | null;
}

/** Where the round's time went, from the request: null when the event never came. */
export interface RoundTiming {
  firstEventMs: number | null;
  firstTextMs: number | null;
  totalMs: number;
  /**
   * The hop through the edge, both ways (the Phase 6 plan, D3): the wait for the response's headers less the edge's own
   * time and the model's, as the edge's server-timing said them; null when it said nothing.
   */
  hopMs: number | null;
}

export interface RoundResult {
  /** In the order the model wrote them. */
  blocks: RoundBlock[];
  stopReason: string | null;
  /** The stream broke after it started; the blocks so far are still here. */
  streamError: string | null;
  /** Null when no usage frame came: a broken stream, or a scripted round in a test. */
  usage?: RoundUsage | null;
  timing?: RoundTiming;
}

/** `stream` is the gateway unless a test hands in its own events, so the gathering runs without a model. */
export async function runRound(
  call: GatewayCall,
  onText: (textSoFar: string) => void,
  stream: typeof streamModel = streamModel,
): Promise<RoundResult> {
  const t0 = Date.now();
  const blocks = new Map<number, RoundBlock>();
  let stopReason: string | null = null;
  let streamError: string | null = null;
  let usage: RoundUsage | null = null;
  let firstEventMs: number | null = null;
  let firstTextMs: number | null = null;
  let hopMs: number | null = null;
  let textSoFar = "";
  for await (const ev of stream(call)) {
    // The edge's timing is said before the stream begins: it is no byte of the model's.
    if (firstEventMs === null && ev.type !== "timing") firstEventMs = Date.now() - t0;
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
        break;
      case "text": {
        const b = blocks.get(ev.index);
        if (!b) break;
        if (firstTextMs === null && ev.text) firstTextMs = Date.now() - t0;
        b.text += ev.text;
        textSoFar += ev.text;
        onText(textSoFar);
        break;
      }
      case "input_json": {
        const b = blocks.get(ev.index);
        if (b) b.json += ev.partial;
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
      case "usage":
        usage = {
          messageId: ev.messageId,
          model: ev.model ?? null,
          cacheMiss: ev.cacheMiss,
          inputTokens: ev.inputTokens,
          cacheReadTokens: ev.cacheReadTokens,
          cacheCreationTokens: ev.cacheCreationTokens,
          outputTokens: null,
        };
        break;
      case "stop":
        stopReason = ev.stopReason;
        if (usage && ev.outputTokens !== null) usage.outputTokens = ev.outputTokens;
        break;
      case "error":
        streamError = ev.message;
        break;
      case "timing":
        hopMs =
          ev.gatewayMs === null || ev.modelMs === null ? null : Math.max(0, ev.headersMs - ev.gatewayMs - ev.modelMs);
        break;
      default:
        break;
    }
  }
  return {
    blocks: [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b),
    stopReason,
    streamError,
    usage,
    timing: { firstEventMs, firstTextMs, totalMs: Date.now() - t0, hopMs },
  };
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

/** A call a round made, and what it answered: a read's rows or an act's card, or the error said in words. */
export interface CallOutcome {
  block: RoundBlock;
  out: { result: string; isError: boolean };
}

/**
 * What a round's calls answered, as the next request carries it: one result
 * under each call's id, in the order of the calls, an error marked as one. The
 * loop sends them back when the round goes on; a turn that ends on its round
 * keeps them for the next turn to send (memory.ts, the raw turn).
 */
export function resultBlocks(outcomes: CallOutcome[]): unknown[] {
  return outcomes.map(({ block, out }) => ({
    type: "tool_result",
    tool_use_id: block.id,
    content: out.result,
    is_error: out.isError,
  }));
}
