import { isCount } from "../shared/unknown.js";
const FIGURES_MAX = 4;
const TEXT_MAX = 80;
export function parseTodayWidgetSnapshot(v) {
  if (!v || typeof v !== "object") return null;
  const s = v;
  const text = (x) => typeof x === "string" ? x.trim().slice(0, TEXT_MAX) : null;
  const headline = text(s.headline);
  const at = typeof s.at === "string" && !Number.isNaN(Date.parse(s.at)) ? s.at : null;
  const waiting = isCount(s.waiting) ? s.waiting : null;
  if (headline === null || at === null || waiting === null || !Array.isArray(s.figures)) return null;
  const figures = [];
  for (const f of s.figures.slice(0, FIGURES_MAX)) {
    if (!f || typeof f !== "object") return null;
    const label = text(f.label);
    const value = f.value;
    if (label === null || typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    figures.push({ label, value: Math.floor(value) });
  }
  let first = null;
  if (s.first !== null && s.first !== void 0) {
    if (typeof s.first !== "object") return null;
    const who = text(s.first.who);
    const reason = text(s.first.reason);
    if (who === null || reason === null) return null;
    first = { who, reason };
  }
  return { headline, figures, waiting, first, at };
}
