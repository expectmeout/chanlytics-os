import { DAY_MS } from "../shared/time.js";
export const WAITING_AFTER_DAYS = 7;
export const PACE_AFTER_YESES = 5;
export const PACE_WINDOW_DAYS = 365;
export function isYes(d) {
  return d.stage === "won" || d.stage === "ended";
}
export function waitAfterDays(pace) {
  if (!pace) return WAITING_AFTER_DAYS;
  return Math.min(30, Math.max(3, Math.round(pace.medianDays * 1.2)));
}
export function yesWaitWords(days) {
  return days === 0 ? "under a day" : `${days} ${days === 1 ? "day" : "days"}`;
}
export function dealPaceWords(medianDays) {
  return `Usually ${yesWaitWords(medianDays)} to a yes`;
}
export function dealPaceOf(dto) {
  if (!dto || typeof dto.median_days !== "number" || !Number.isFinite(dto.median_days)) return null;
  if (!(dto.yeses >= PACE_AFTER_YESES)) return null;
  const medianDays = Math.max(0, Math.round(dto.median_days));
  const waitDays = waitAfterDays({ medianDays });
  return {
    medianDays,
    yeses: dto.yeses,
    waitDays,
    longerThanUsual: waitDays > medianDays,
    words: dealPaceWords(medianDays)
  };
}
export function heardSinceProposal(r) {
  const d = r.deal;
  return !!d && d.stage === "proposed" && d.sinceMs !== null && r.askedMs !== null && r.askedMs >= d.sinceMs;
}
export function waitingOnProposal(r, nowMs, pace) {
  const d = r.deal;
  if (!d || d.stage !== "proposed" || d.sinceMs === null) return false;
  const wait = pace && Number.isFinite(pace.waitDays) ? pace.waitDays : WAITING_AFTER_DAYS;
  if (nowMs - d.sinceMs < wait * DAY_MS) return false;
  return !heardSinceProposal(r);
}
export function eachOpenProposal(rows) {
  return rows.flatMap((r) => {
    const open = r.openDeals && r.openDeals.length ? r.openDeals : r.deal ? [r.deal] : [];
    return open.filter((d) => d.stage === "proposed").map((d) => ({ ...r, deal: d }));
  });
}
export function proposalsWaiting(rows, nowMs, pace) {
  return rows.filter((r) => waitingOnProposal(r, nowMs, pace));
}
