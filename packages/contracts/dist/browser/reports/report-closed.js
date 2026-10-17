import { hasHours, openAt } from "../calendar/availability.js";
export function closedOf(arrivals, profile) {
  if (!arrivals || !profile || !hasHours(profile.hours)) return null;
  return arrivals.reduce((s, a) => s + (openAt(profile.hours, profile.closures, a.d, a.q * 15) ? 0 : a.n), 0);
}
export function hoursUnsetOf(arrivals, profile) {
  return arrivals !== void 0 && profile != null && !hasHours(profile.hours);
}
