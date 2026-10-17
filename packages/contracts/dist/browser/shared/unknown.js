export const finiteOrNull = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
export const isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;
export const finiteOrZero = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
export const trimmedOrNull = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
export const nonBlankOrNull = (v) => typeof v === "string" && v.trim() ? v : null;
export const recordOrNull = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
export const lineOrNull = (s) => {
  const t = (s ?? "").replace(/[\r\n]+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
};
