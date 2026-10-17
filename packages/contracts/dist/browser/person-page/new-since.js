export const NEW_SINCE_WORDS = "New since you last looked";
const theirs = (kind) => kind === "customer" || kind === "call";
export function newSinceOf(items, looked) {
  if (!looked || !looked.markedAtMs) return /* @__PURE__ */ new Set();
  return new Set(
    items.filter(
      (e) => e.ts <= looked.visitAtMs && e.ts > (theirs(e.kind) ? looked.seenAtMs || looked.markedAtMs : looked.markedAtMs)
    ).map((e) => e.id)
  );
}
