export const MODEL_TURN_WRITE_MS = 1500;
const MODEL_TURN_TEXT_MAX = 2e4;
export function modelTurnRequestOf(sent) {
  return {
    now: sent.now ?? null,
    who: sent.who ?? null,
    steer: sent.steer ?? null,
    messages: sent.messages.map((m) => ({ role: m.role, content: m.content })),
    photo: sent.photoType ?? null
  };
}
export function modelTurnResponseOf(stopReason, record, text) {
  return { stop_reason: stopReason, text: text.slice(0, MODEL_TURN_TEXT_MAX), record: record ? { ...record } : null };
}
