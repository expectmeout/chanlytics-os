import { ASK_SCOPE_KINDS } from "./ask.js";
import { answerFromV1 } from "./ask-answer.js";
export const ASK_CONTEXT_MAX_ROWS = 40;
export const ASK_CONTEXT_ROW_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "lead",
  "search",
  "run",
  "playbook",
  "reach_out",
  "template"
];
const isRowFocus = (k) => k !== "page" && ASK_SCOPE_KINDS.includes(k);
export function itemFocus(m, n) {
  const item = (m.answer ?? answerFromV1(m)).show.items[n - 1];
  if (!item) return void 0;
  const { kind: cited, id, label } = item.source;
  const kind = cited === "broadcast" ? "run" : cited;
  return isRowFocus(kind) ? { kind, id, label: label.slice(0, 80) || `this ${kind}` } : null;
}
