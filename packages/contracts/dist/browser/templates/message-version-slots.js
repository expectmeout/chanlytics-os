import { versionSlotsRefusal } from "./message-versions.js";
import { slotMentions, slotOutside, slotWritten } from "./slot-sets.js";
export const partWritten = (part) => part.written ?? slotWritten(part.slot);
export function toSlotParts(text, set = { kind: "numbered" }) {
  const parts = [];
  let last = 0;
  for (const m of slotMentions(set, text)) {
    if (m.key === "") continue;
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const slot = { kind: "slot", slot: m.key };
    parts.push(m.written === slotWritten(m.key) ? slot : { ...slot, written: m.written });
    last = m.index + m.written.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
export function fromSlotParts(parts) {
  return parts.map((p) => p.kind === "slot" ? partWritten(p) : p.text).join("");
}
const within = (text, at) => Math.max(0, Math.min(text.length, Math.trunc(at)));
export function insertSlot(text, slot, start, end) {
  const from = within(text, Math.min(start, end));
  const to = within(text, Math.max(start, end));
  const written = slotWritten(slot);
  return { text: `${text.slice(0, from)}${written}${text.slice(to)}`, caret: from + written.length };
}
export function clampWords(text, caret, max, set = { kind: "numbered" }) {
  const at = within(text, caret);
  const over = text.length - Math.max(0, max);
  if (over <= 0) return { text, caret: at };
  const held = new Array(text.length).fill(false);
  for (const m of slotMentions(set, text)) if (m.key !== "") held.fill(true, m.index, m.index + m.written.length);
  const letters = [];
  for (let i = 0; i < text.length; ) {
    const to = i + ((text.codePointAt(i) ?? 0) > 65535 ? 2 : 1);
    if (!held[i]) letters.push({ from: i, to });
    i = to;
  }
  const nearest = [...letters.filter((l) => l.from < at).reverse(), ...letters.filter((l) => l.from >= at)];
  const gone = /* @__PURE__ */ new Set();
  for (const l of nearest) {
    if (gone.size >= over) break;
    for (let i = l.from; i < l.to; i += 1) gone.add(i);
  }
  let kept = "";
  let before = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!gone.has(i)) kept += text.charAt(i);
    else if (i < at) before += 1;
  }
  return { text: kept, caret: at - before };
}
export function eraseSlot(text, start, end, way, set = { kind: "numbered" }) {
  if (start !== end) return null;
  let at = 0;
  for (const p of toSlotParts(text, set)) {
    const length = p.kind === "slot" ? partWritten(p).length : p.text.length;
    const hit = p.kind === "slot" && (way === "back" ? at + length === start : at === start);
    if (hit) return { text: `${text.slice(0, at)}${text.slice(at + length)}`, caret: at };
    at += length;
  }
  return null;
}
export const slotKnown = (set, slot) => set.keys.includes(String(slot));
export function slotLabel(set, slot) {
  const key = String(slot);
  const own = set.labels[set.keys.indexOf(key)]?.trim();
  return own || (set.kind === "numbered" ? `Value ${key}` : key);
}
function namesJoined(names) {
  return names.length < 2 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
function namedRefusal(text, set) {
  const extra = slotOutside(set, text);
  if (extra === null) return null;
  const name = slotLabel(set, extra);
  return set.keys.length === 0 ? `This message fills no values, so ${name} has nothing to take.` : `${name} is not one of this message's values: it has ${namesJoined(set.keys.map((k) => slotLabel(set, k)))}.`;
}
export function namedProblem(check, words, set) {
  if (check.ok) return null;
  if (set.kind === "named") return check.error;
  const subject = words.subject ?? "";
  const count = set.keys.length;
  const theirs = versionSlotsRefusal(subject, count) ?? versionSlotsRefusal(words.body, count);
  if (theirs === null || theirs !== check.error) return check.error;
  return namedRefusal(subject, set) ?? namedRefusal(words.body, set) ?? check.error;
}
