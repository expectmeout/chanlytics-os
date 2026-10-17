import { DAY_MS } from "../shared/time.js";
export const MINOR_PER_UNIT = 100;
const atNoon = (iso) => Date.parse(`${iso}T12:00:00Z`);
export function addDays(iso, n) {
  return new Date(atNoon(iso) + n * DAY_MS).toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / DAY_MS);
export function aboutADayAfter(o) {
  const { ad, amountMinor, endDay, today } = o;
  if (ad.budget.mode === "daily") return amountMinor;
  const spent = ad.days.reduce((all, d) => all + d.spendMinor, 0);
  const daysLeft = Math.max(1, daysBetween(today, endDay) + 1);
  const units = Math.max(0, Math.round((amountMinor - spent) / daysLeft / MINOR_PER_UNIT));
  return units * MINOR_PER_UNIT;
}
export function sameArea(a, b) {
  if (a.kind === "radius" && b.kind === "radius") return a.miles === b.miles;
  return a.kind === "zips" && b.kind === "zips" && a.zips.join(",") === b.zips.join(",");
}
const saidWords = (c) => JSON.stringify([c.headline, c.text, c.headlines, c.lines]);
export function patchRestarts(ad, patch) {
  const offer = patch.serviceId !== void 0 && patch.serviceId !== ad.serviceId;
  const area = patch.area !== void 0 && !sameArea(patch.area, ad.area);
  const words = patch.copy !== void 0 && saidWords(patch.copy) !== saidWords(ad.copy);
  return offer || area || words || patch.photo === true || ad.needs?.code === "rejected";
}
export function adWith(ad, read, patch) {
  const service = patch.serviceId === void 0 ? void 0 : read.services.find((s) => s.id === patch.serviceId);
  let next = service ? { ...ad, offer: service.name, serviceId: service.id } : ad;
  if (patch.area) next = { ...next, area: patch.area };
  if (patch.copy) next = { ...next, copy: patch.copy };
  if (patch.amountMinor === void 0 && patch.endDay === void 0) return next;
  const amountMinor = patch.amountMinor ?? ad.budget.amountMinor;
  const endDay = patch.endDay ?? ad.endDay;
  const aboutADayMinor = aboutADayAfter({ ad, amountMinor, endDay, today: read.today });
  return { ...next, endDay, budget: { ...ad.budget, amountMinor }, aboutADayMinor };
}
