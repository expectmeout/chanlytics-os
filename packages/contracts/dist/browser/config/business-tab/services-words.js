import { CANNOT_SAY_SERVICES } from "./business-gap.js";
import { CHIPS_SHOWN, chipsMoreWords, count } from "./counts.js";
import { blockShareWords } from "./prompt-cost-words.js";
const SERVICE_CHIPS = CHIPS_SHOWN;
export function lengthWords(minutes) {
  const m = typeof minutes === "string" ? Number(minutes.trim()) : minutes;
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) return null;
  const whole = Math.round(m);
  if (whole < 60) return `${whole} min`;
  const h = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
export const SERVICE_PRICE_EMPTY = "At consult";
export function serviceLineWords(s, consultFirst) {
  const price = typeof s.price_note === "string" && s.price_note.trim() ? s.price_note.trim() : SERVICE_PRICE_EMPTY;
  return [lengthWords(s.duration_min), price, consultFirst ? "Consult first" : null].filter(Boolean).join(" \xB7 ");
}
export function servicesWords(services) {
  const list = (Array.isArray(services) ? services : []).filter(
    (s) => !!s && typeof s.name === "string" && s.name.trim() !== ""
  );
  const n = list.length;
  if (!n) return { count: 0, line: null, chips: [], more: null };
  const chips = list.slice(0, SERVICE_CHIPS).map((s) => ({
    name: s.name.trim(),
    takes: lengthWords(s.duration_min)
  }));
  return {
    count: n,
    line: count(n),
    chips,
    more: n > SERVICE_CHIPS ? chipsMoreWords(n - SERVICE_CHIPS) : null
  };
}
export function servicesToldWords(i) {
  const n = i.count;
  if (!n) return `No services, so it ${CANNOT_SAY_SERVICES}.`;
  const share = i.chars ? blockShareWords(i.chars, i.total ?? 0) : null;
  const size = i.chars ? `, ${count(i.chars)} characters` : "";
  return `${count(n)} ${n === 1 ? "service" : "services"}${size}${share ? ` \u2014 ${share}` : ""}.`;
}
export function serviceUndoName(name) {
  const n = typeof name === "string" ? name.trim() : "";
  return n ? `Undo removing ${n}` : "Undo removing a service";
}
export function servicesFoundWords(shown, total) {
  if (!total) return "No services yet.";
  if (!shown) return "No service is called that.";
  return `${count(shown)} of ${count(total)} ${total === 1 ? "service" : "services"}`;
}
