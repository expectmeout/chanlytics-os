import { isCount, recordOrNull } from "../shared/unknown.js";
const isText = (v) => typeof v === "string";
const isTextOrNull = (v) => v === null || typeof v === "string";
function isHistoryRun(v) {
  const r = recordOrNull(v);
  return !!r && isText(r.id) && isTextOrNull(r.run_for) && isText(r.state) && isText(r.scheduled_for) && isCount(r.recipient_count) && isCount(r.sent) && isCount(r.held) && isCount(r.delivered) && isCount(r.replied);
}
function isLastRun(v) {
  const r = recordOrNull(v);
  return !!r && isText(r.id) && isText(r.state) && isTextOrNull(r.run_for) && isCount(r.recipient_count);
}
function isWaiting(v) {
  const r = recordOrNull(v);
  return !!r && isText(r.id) && isCount(r.recipient_count) && isText(r.name) && isTextOrNull(r.run_for) && isTextOrNull(r.trigger);
}
function isTotalsRow(v) {
  const r = recordOrNull(v);
  return !!r && isCount(r.runs) && isCount(r.sent) && isCount(r.delivered) && isCount(r.replied) && isCount(r.held) && isLastRun(r.last_run) && (r.waiting === null || isWaiting(r.waiting)) && Array.isArray(r.history) && r.history.every(isHistoryRun);
}
export function isPlaybookTotalsDto(answer) {
  const byId = recordOrNull(answer);
  return !!byId && Object.values(byId).every(isTotalsRow);
}
