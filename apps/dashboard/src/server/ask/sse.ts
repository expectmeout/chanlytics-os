/**
 * The API's event stream, read one frame at a time.
 *
 * Pure on purpose: no environment, no fetch, so the parser can be executed
 * in a test. gateway.ts opens the connection and feeds frames through here.
 */

export interface GatewayBlockStart {
  type: "block_start";
  index: number;
  block: { type: "text" } | { type: "tool_use"; id: string; name: string };
}
export interface GatewayTextDelta {
  type: "text";
  index: number;
  text: string;
}
export interface GatewayInputDelta {
  type: "input_json";
  index: number;
  partial: string;
}
export interface GatewayBlockStop {
  type: "block_stop";
  index: number;
}
export interface GatewayStop {
  type: "stop";
  stopReason: string | null;
}
export interface GatewayError {
  type: "error";
  message: string;
}
export type GatewayEvent =
  GatewayBlockStart | GatewayTextDelta | GatewayInputDelta | GatewayBlockStop | GatewayStop | GatewayError;

/** Whether a 400 from the API names the strict-tool or format feature, so the loop can retry without it. */
export function featureRejected(message: string): boolean {
  return /strict|output_config|output_format|json_schema|schema|format/i.test(message);
}

interface RawEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  error?: { message?: string; type?: string };
}

/** One SSE frame → one event, or nothing for pings and the frames the loop does not use. */
export function parseFrame(frame: string): GatewayEvent | null {
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  let ev: RawEvent;
  try {
    ev = JSON.parse(data);
  } catch {
    return null;
  }
  switch (ev.type) {
    case "content_block_start": {
      const b = ev.content_block;
      if (!b || typeof ev.index !== "number") return null;
      if (b.type === "tool_use")
        return {
          type: "block_start",
          index: ev.index,
          block: { type: "tool_use", id: b.id ?? "", name: b.name ?? "" },
        };
      return { type: "block_start", index: ev.index, block: { type: "text" } };
    }
    case "content_block_delta": {
      if (typeof ev.index !== "number" || !ev.delta) return null;
      if (ev.delta.type === "text_delta") return { type: "text", index: ev.index, text: ev.delta.text ?? "" };
      if (ev.delta.type === "input_json_delta")
        return { type: "input_json", index: ev.index, partial: ev.delta.partial_json ?? "" };
      return null;
    }
    case "content_block_stop":
      return typeof ev.index === "number" ? { type: "block_stop", index: ev.index } : null;
    case "message_delta":
      return { type: "stop", stopReason: ev.delta?.stop_reason ?? null };
    case "error":
      return { type: "error", message: ev.error?.message ?? ev.error?.type ?? "model error" };
    default:
      return null;
  }
}
