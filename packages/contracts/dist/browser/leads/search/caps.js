import { dayInZone } from "../../calendar/zone-math.js";
export const LEAD_MONTHLY_ALLOWANCE = 500;
export const LEAD_MONTHLY_BUDGET_USD = 25;
export const LEAD_DAY_CAP_USD = 10;
export const LEAD_PLATFORM_DAY_CAP_USD = 50;
export const LEAD_QUESTION_THRESHOLD = 0.6;
export const LEAD_QUESTION_MIN_EVIDENCE = 10;
export const LEAD_PROBE_PLACES = 25;
export const LEAD_JUDGE_BATCH = 25;
export const LEAD_MAX_PLACES = 1e3;
export const LEAD_FACT_MAX = 120;
export const BUSINESS_LINE_MAX = 400;
export const LEAD_REASON_MAX_WORDS = 12;
export const LEAD_ASSUMED_YIELD = 0.5;
export const LEAD_ESTIMATE_MARGIN = 1.3;
export const LEAD_ASK_MIN_FACTOR = 1.2;
export const LEAD_ASK_MAX_FACTOR = 4;
export function leadMonth(zone, at) {
  const d = dayInZone(zone, at.getTime());
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}
