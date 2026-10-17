export const MIN_MS = 6e4;
export const HOUR_MS = 36e5;
export const DAY_MS = 864e5;
export const WEEK_MS = 7 * DAY_MS;
const JITTER_SPREAD = 0.2;
export function jittered(ms, random = Math.random) {
  return Math.round(ms * (1 + JITTER_SPREAD * Math.min(1, Math.max(0, random()))));
}
export function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
const FORMATS_KEPT = 256;
const DATE_FORMATS = /* @__PURE__ */ new Map();
const NUMBER_FORMATS = /* @__PURE__ */ new Map();
function formatterKept(cache, key, make) {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  if (cache.size >= FORMATS_KEPT) cache.clear();
  cache.set(key, made);
  return made;
}
export function dateFormat(locales, options) {
  return formatterKept(
    DATE_FORMATS,
    `${locales}|${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(locales, options)
  );
}
export function numberFormat(locales, options) {
  return formatterKept(
    NUMBER_FORMATS,
    `${locales}|${JSON.stringify(options)}`,
    () => new Intl.NumberFormat(locales, options)
  );
}
export const DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });
export function isoMs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
export function spanUnits(ms) {
  const gap = Math.max(0, ms);
  if (gap < MIN_MS) return { n: Math.round(gap / 1e3), unit: "s" };
  const minutes = Math.round(gap / MIN_MS);
  if (minutes < 60) return { n: minutes, unit: "m" };
  const hours = Math.round(gap / HOUR_MS);
  if (hours < 24) return { n: hours, unit: "h" };
  return { n: Math.round(gap / DAY_MS), unit: "d" };
}
export function spanLabel(ms) {
  const u = spanUnits(ms);
  return u.unit === "s" ? "now" : `${u.n}${u.unit}`;
}
export function waitedLabel(ms) {
  const u = spanUnits(ms);
  return u.unit === "s" ? "1m" : `${u.n}${u.unit}`;
}
export function agoShort(atMs, nowMs) {
  return spanLabel(nowMs - atMs);
}
export function agoWords(atMs, nowMs, opts = {}) {
  const gap = Math.max(0, nowMs - atMs);
  const dateAfter = opts.dateAfterMs ?? WEEK_MS;
  if (gap >= dateAfter && opts.date) return opts.date(atMs);
  const u = spanUnits(gap);
  return u.unit === "s" ? "just now" : `${u.n}${u.unit} ago`;
}
export function timezoneCity(tz) {
  const tail = tz.split("/").pop() || tz;
  return tail.replace(/_/g, " ");
}
