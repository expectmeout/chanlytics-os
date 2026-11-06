/**
 * What the agent's events mean to the Line (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5), pure, so
 * the spike's recorded events prove it. The vendor speaks everything the brain door streams, a read's label and the
 * buffer words included (the spike note, runs A and B8); the chat shows the answer's words alone, so a label becomes a
 * trace, the buffer words nothing, and the Say grows as a typed turn's does: the first sentence as the headline, the
 * rest as the detail, the final message read off the thread once the turn has landed.
 */

export type VoiceAction =
  /** What the person said, as the agent heard it (user_transcript). */
  | { t: "question"; text: string }
  /** A read's label, spoken while it runs ("Reading today"). */
  | { t: "trace"; text: string }
  /** The Say so far: a preview the stored turn replaces. */
  | { t: "say"; headline: string; detail: string }
  /** The whole response as the agent will have spoken it (agent_response), or what it spoke before a cut (a correction). */
  | { t: "spoken"; text: string }
  /** The person cut in: the response stops here. */
  | { t: "cut" }
  /** The turn is over (agent_response_complete): the thread holds the answer. */
  | { t: "landed" }
  | { t: "mode"; mode: "speaking" | "listening" }
  /** How loud the person is, 0 to 1, as the agent's own detector hears it. */
  | { t: "vad"; score: number }
  | { t: "gone"; reason: string };

/** The answer's words so far, labels and buffer words out. */
export interface VoiceTurnState {
  said: string;
}
export const VOICE_TURN_START: VoiceTurnState = { said: "" };

/** The vendor client's callbacks, each as one event: the Line's module (voice.ts) names which fired. */
export type VoiceEvent =
  | { kind: "message"; payload: { source?: string; role?: string; message?: string } }
  | { kind: "part"; payload: { text?: string; type?: string } }
  /** The vendor's correction, as its callback hands it: the event's inner object, or the whole event (both are read). */
  | { kind: "correction"; payload: unknown }
  | { kind: "interruption"; payload?: unknown }
  | { kind: "event"; payload: { type?: string } }
  | { kind: "mode"; payload: { mode?: string } }
  | { kind: "vad"; payload: { vadScore?: number; vad_score?: number } }
  | { kind: "disconnect"; payload: { reason?: string; message?: string } };

/** The vendor's buffer words, as the door sends them while the model is quiet: a pause in the voice, nothing in the chat. */
const BUFFER_WORDS = /(?:\.\.\.\s?)+/g;
/** A read's label as the door speaks it: words, an ellipsis, one space ("Reading today… "). */
const LABEL = /^([^.!?…]{1,80})…\s$/;
/** Where the first sentence ends: its mark, then a space or the end. */
const SENTENCE_END = /[.!?](?=\s|$)/;

/** The answer's words without the labels at their head and the buffer words anywhere. */
export function cleanSpoken(text: string): string {
  let out = text.replace(BUFFER_WORDS, "");
  for (;;) {
    const m = /^([^.!?…]{1,80})…\s/.exec(out);
    if (!m) break;
    out = out.slice(m[0].length);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** The Say as the Line draws it: the first sentence, then the rest. */
export function sayOf(said: string): { headline: string; detail: string } {
  const text = said.trim();
  const m = SENTENCE_END.exec(text);
  if (!m) return { headline: text, detail: "" };
  const cut = m.index + 1;
  return { headline: text.slice(0, cut).trim(), detail: text.slice(cut).trim() };
}

const modeOf = (mode: unknown): "speaking" | "listening" => (mode === "speaking" ? "speaking" : "listening");

/** What the agent spoke before the cut, wherever the vendor's callback put it: `corrected_response` on the object given, or on the event inside it. */
function correctedOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as {
    corrected_response?: unknown;
    agent_response_correction_event?: { corrected_response?: unknown };
  };
  if (typeof p.corrected_response === "string") return p.corrected_response;
  const inner = p.agent_response_correction_event;
  return inner && typeof inner.corrected_response === "string" ? inner.corrected_response : "";
}

export function reduceVoiceEvent(
  state: VoiceTurnState,
  ev: VoiceEvent,
): { state: VoiceTurnState; actions: VoiceAction[] } {
  switch (ev.kind) {
    case "message": {
      const who = ev.payload.source ?? ev.payload.role;
      const text = (ev.payload.message ?? "").trim();
      if (!text) return { state, actions: [] };
      if (who === "user") return { state: { said: "" }, actions: [{ t: "question", text }] };
      return { state, actions: [{ t: "spoken", text: cleanSpoken(text) }] };
    }
    case "part": {
      const type = ev.payload.type;
      if (type === "start") return { state: { said: "" }, actions: [] };
      if (type !== "delta") return { state, actions: [] };
      const raw = ev.payload.text ?? "";
      const label = state.said === "" ? LABEL.exec(raw) : null;
      if (label) return { state, actions: [{ t: "trace", text: label[1].trim() }] };
      const words = raw.replace(BUFFER_WORDS, "");
      if (!words) return { state, actions: [] };
      const said = state.said + words;
      return { state: { said }, actions: [{ t: "say", ...sayOf(said) }] };
    }
    case "correction": {
      const text = correctedOf(ev.payload);
      return { state, actions: text ? [{ t: "spoken", text: cleanSpoken(text) }] : [] };
    }
    case "interruption":
      return { state, actions: [{ t: "cut" }] };
    case "event":
      return ev.payload.type === "agent_response_complete"
        ? { state: { said: "" }, actions: [{ t: "landed" }] }
        : { state, actions: [] };
    case "mode":
      return { state, actions: [{ t: "mode", mode: modeOf(ev.payload.mode) }] };
    case "vad": {
      const score = ev.payload.vadScore ?? ev.payload.vad_score;
      return {
        state,
        actions: typeof score === "number" ? [{ t: "vad", score: Math.max(0, Math.min(1, score)) }] : [],
      };
    }
    case "disconnect":
      return { state: { said: "" }, actions: [{ t: "gone", reason: ev.payload.reason ?? "disconnect" }] };
    default:
      return { state, actions: [] };
  }
}
