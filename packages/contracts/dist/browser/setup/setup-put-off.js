import { DAY_MS } from "../shared/time.js";
export function setupLaterOf(view) {
  const later = view && typeof view === "object" ? view.later : null;
  if (!Array.isArray(later)) return [];
  return [...new Set(later.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 40))];
}
export const TRY_SKIPPED = "try-skipped";
export const RECEPTIONIST_MET = "receptionist-met";
export const REHEARSE_SKIPPED = "rehearse-skipped";
export const CHANNELS_SEEN = "channels-seen";
export const GOOGLE_CONNECT_LATER = "google-connect-later";
export const REMIND_SKIPPED = "remind-skipped";
export const KEEP_ROW = "keep";
export const SETUP_REST_MS = 7 * DAY_MS;
const SETUP_RESTS_MAX = 20;
export function setupRestsOf(view) {
  const rests = view && typeof view === "object" ? view.rests : null;
  if (!rests || typeof rests !== "object" || Array.isArray(rests)) return {};
  const kept = Object.entries(rests).filter(
    (e) => e[0].length > 0 && e[0].length <= 40 && typeof e[1] === "string" && Number.isFinite(Date.parse(e[1]))
  );
  return Object.fromEntries(kept.slice(0, SETUP_RESTS_MAX));
}
const restUntil = (s, id) => {
  const until = new Map(Object.entries(s.rests)).get(id);
  return until === void 0 ? null : Date.parse(until);
};
export function setupOffNow(s, id, nowMs) {
  const until = restUntil(s, id);
  return s.later.includes(id) || until !== null && until > nowMs;
}
export function setupBack(s, id, nowMs) {
  const until = restUntil(s, id);
  return !s.later.includes(id) && until !== null && until <= nowMs;
}
export function setupPutOffEver(s, id) {
  return s.later.includes(id) || restUntil(s, id) !== null;
}
export function putOffEnds(id, back) {
  return back && id !== KEEP_ROW ? "good" : "week";
}
export function setupPutOffNext(s, ids, change, nowMs) {
  const later = new Set(s.later);
  const rests = new Map(Object.entries(s.rests));
  for (const id of ids) {
    if (!change.on) {
      if (later.has(id)) later.delete(id);
      else rests.delete(id);
    } else if (!setupOffNow(s, id, nowMs)) {
      if (change.why === "answer" || putOffEnds(id, setupBack(s, id, nowMs)) === "good") later.add(id);
      else rests.set(id, new Date(nowMs + SETUP_REST_MS).toISOString());
    }
  }
  return { later: [...later], rests: Object.fromEntries(rests) };
}
export const FORWARDING_WAIT_WORDS = "Until it is set up, only calls to your receptionist's own number are answered.";
export const SETUP_LATER_REFUSED = {
  reading: "Setting up is still being read. Try again in a moment.",
  unread: "What you put off could not be read just now, so nothing changed. Try again in a moment."
};
