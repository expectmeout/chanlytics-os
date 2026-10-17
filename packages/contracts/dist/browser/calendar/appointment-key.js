import { isDayKey } from "./day-keys.js";
export function appointmentKeyOf(item) {
  if (!item.uid) return `ev:${item.start}`;
  return item.occurrence === void 0 ? item.uid : `${item.uid}:${item.occurrence}`;
}
const RECORD_KEY = "appt:";
export function recordKeyOf(id) {
  return `${RECORD_KEY}${id}`;
}
export function recordIdOf(key) {
  return key.startsWith(RECORD_KEY) ? key.slice(RECORD_KEY.length) : null;
}
const VISIT_ID = /^[A-Za-z0-9_-]+$/;
const CALENDAR_VIEWS = ["week", "day", "month", "agenda"];
export function visitRoute(id, dayKey, view) {
  const day = dayKey && isDayKey(dayKey) ? dayKey : null;
  const lead = view && !(view === "day" && day) ? `${view}:` : "";
  return `calendar/${lead}${day ? `${day}:` : ""}a-${id}`;
}
export function visitDoor(dayKey, id) {
  return id ? visitRoute(id, dayKey) : `calendar/${dayKey}`;
}
export function visitLinkWords(id, word) {
  return id ? `Open the ${word}` : "Open the day";
}
function dayAndVisitOf(s) {
  const dayOf = (k) => isDayKey(k) ? k : null;
  const alone = dayOf(s);
  if (alone) return { day: alone, visitId: null };
  const at = s.indexOf(":");
  const word = at < 0 ? s : s.slice(at + 1);
  const id = word.startsWith("a-") ? word.slice(2) : "";
  if (!VISIT_ID.test(id)) return null;
  if (at < 0) return { day: null, visitId: id };
  const day = dayOf(s.slice(0, at));
  return day ? { day, visitId: id } : null;
}
export function calendarParamParts(param) {
  const none = { view: null, day: null, visitId: null };
  if (!param) return none;
  const cut = param.indexOf(":");
  const lead = cut < 0 ? param : param.slice(0, cut);
  const view = CALENDAR_VIEWS.find((v) => v === lead) ?? null;
  if (view && cut < 0) return { view, day: null, visitId: null };
  const rest = dayAndVisitOf(view ? param.slice(cut + 1) : param);
  return rest ? { view, ...rest } : none;
}
