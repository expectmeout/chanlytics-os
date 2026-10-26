import { DAY_MS } from "../../shared/time.js";
export function bookedAfterAsk(visits, askedMs) {
  if (!visits) return false;
  return visitAnswersAsk(visitStartOf(visits.next), begunOf(visits.last, visits.missed), askedMs);
}
function visitStartOf(v) {
  const t = !v ? NaN : typeof v.start === "number" ? v.start : Date.parse(v.start);
  return Number.isFinite(t) ? t : null;
}
function begunOf(last, missed) {
  const starts = [visitStartOf(last), visitStartOf(missed)].filter((t) => t !== null);
  return starts.length ? Math.max(...starts) : null;
}
function visitAnswersAsk(nextStartMs, lastStartMs, askedMs) {
  if (nextStartMs !== null) return true;
  return lastStartMs !== null && lastStartMs >= askedMs - DAY_MS;
}
