export const ownWord = (words, key) => Object.hasOwn(words, key) ? words[key] : void 0;
export function rankedEntries(counts, labelOf) {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([key, n]) => [key, labelOf(key), n]).sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1));
}
export function barsOf(entries) {
  const max = Math.max(1, ...entries.map(([, , value]) => value));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}
export const mixOf = (entries, line) => ({ rows: barsOf(entries), line, empty: null });
export const noMix = (empty) => ({ rows: [], line: null, empty });
export const isUncounted = (m) => m.rows.length === 0 && m.line === null && m.empty === null;
