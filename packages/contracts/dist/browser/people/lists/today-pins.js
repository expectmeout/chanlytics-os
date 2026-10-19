import { parseListToken } from "./list-token.js";
export const TODAY_PINS_MAX = 8;
export function pinTokens(view) {
  const pins = view && typeof view === "object" ? view.pins : null;
  return Array.isArray(pins) ? pins.filter((t) => typeof t === "string" && parseListToken(t) !== null).slice(0, TODAY_PINS_MAX) : [];
}
export function todayPins(view, people, counts) {
  const counted = (token, own) => counts && token in counts ? counts[token] ?? null : own;
  return pinTokens(view).flatMap((token) => {
    const ref = parseListToken(token);
    if (!ref) return [];
    if (ref.kind === "builtin") {
      const l = people.lists.find((x) => x.id === ref.id);
      return l ? [{ token, label: l.label, count: counted(token, l.count), to: `clients/seg:${l.id}` }] : [];
    }
    const s = people.saved.find((x) => x.id.toLowerCase() === ref.id);
    return s ? [{ token, label: s.name, count: counted(token, s.unknown ? null : s.count), to: `clients/list:${s.id}` }] : [];
  });
}
export function togglePin(view, token) {
  const pins = pinTokens(view);
  const t = token.toLowerCase();
  if (pins.some((p) => p.toLowerCase() === t)) return { pins: pins.filter((p) => p.toLowerCase() !== t) };
  return pins.length < TODAY_PINS_MAX ? { pins: [...pins, token] } : null;
}
