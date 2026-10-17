import { MODEL_EFFORTS } from "./models.js";
export const EFFORT_MESSAGE_BETA = "mid-conversation-output-config-2026-07-01";
export function effortMessage(effort) {
  return { role: "system", content: [], output_config: { effort } };
}
const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
export function isEffortMessage(m) {
  if (!isPlainObject(m)) return false;
  const { role, content, output_config: oc, ...rest } = m;
  if (role !== "system" || !Array.isArray(content) || content.length > 0 || Object.keys(rest).length > 0) return false;
  if (!isPlainObject(oc)) return false;
  const { effort, ...more } = oc;
  return Object.keys(more).length === 0 && MODEL_EFFORTS.includes(effort);
}
export function effortInForce(messages, base) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (isEffortMessage(m)) return m.output_config.effort;
  }
  return base;
}
export function effortAbove(a, b) {
  return MODEL_EFFORTS.indexOf(a) > MODEL_EFFORTS.indexOf(b);
}
export function foldEffortMessages(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const effort = effortInForce(messages, null);
  if (effort === null) return body;
  const own = isPlainObject(body.output_config) ? body.output_config : {};
  return { ...body, messages: messages.filter((m) => !isEffortMessage(m)), output_config: { ...own, effort } };
}
