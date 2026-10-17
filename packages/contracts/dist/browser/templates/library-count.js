const LIBRARY_SAMPLES = /* @__PURE__ */ new Set(["hello_world"]);
export const isLibrarySample = (name) => LIBRARY_SAMPLES.has(name);
export function libraryCount(messages, emailRows) {
  if (!messages) return null;
  return messages.filter((m) => !isLibrarySample(m.name) && !m.hidden).length + emailRows;
}
