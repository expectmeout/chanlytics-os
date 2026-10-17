export function numberedSlots(labels) {
  const names = typeof labels === "number" ? Array.from({ length: Math.max(0, labels) }, () => "") : labels;
  return { kind: "numbered", keys: names.map((_, i) => String(i + 1)), labels: names };
}
export function namedSlots(names, labels = names) {
  return { kind: "named", keys: names, labels };
}
const NUMBERED_SLOT = /\{\{(\d+)\}\}/g;
const NAMED_SLOT = /\{\{([^{}]*)\}\}/g;
const patternOf = (set) => set.kind === "numbered" ? NUMBERED_SLOT : NAMED_SLOT;
function slotKey(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
const keyInSet = (set, inner) => set.kind === "numbered" ? inner.replace(/^0+(?=\d)/, "") : slotKey(inner);
export const slotWritten = (key) => `{{${key}}}`;
export function slotMentions(set, text) {
  return [...text.matchAll(patternOf(set))].map((m) => ({
    key: keyInSet(set, m[1] ?? ""),
    index: m.index,
    written: m[0]
  }));
}
export function slotsWritten(set, text) {
  const keys = [...new Set(slotMentions(set, text).map((m) => m.key))];
  if (set.kind === "numbered") return { keys: keys.sort((a, b) => Number(a) - Number(b)), stray: false };
  return { keys, stray: /[{}]/.test(text.replace(NAMED_SLOT, "")) };
}
export function slotCountIn(set, text, key) {
  return slotMentions(set, text).filter((m) => m.key === key).length;
}
export function slotsOut(set, text) {
  return text.replace(patternOf(set), " ");
}
export function slotOutside(set, text) {
  return slotsWritten(set, text).keys.find((k) => !set.keys.includes(k)) ?? null;
}
export function slotFault(set, text) {
  return slotOutside(set, text) !== null || slotsWritten(set, text).stray;
}
const placeInSet = (set, key) => !set || set.kind === "numbered" ? Number(key) - 1 : set.keys.indexOf(key);
export function slotValueOf(set, key, values) {
  return values[placeInSet(set, key)];
}
export function fillSlots(text, values, set) {
  const kind = set ?? { kind: "numbered" };
  return text.replace(
    patternOf(kind),
    (whole, inner) => slotValueOf(set, keyInSet(kind, inner), values) ?? whole
  );
}
export function slotValues(set, known) {
  return set.keys.map((key) => known[key]?.trim() || void 0);
}
export function slotHoles(set, text, values) {
  const written = slotsWritten(set, text);
  return written.stray || written.keys.some((key) => (slotValueOf(set, key, values) ?? null) === null);
}
