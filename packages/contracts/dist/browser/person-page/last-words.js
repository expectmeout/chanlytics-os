export const LAST_WORDS_TITLE = "Their last words";
const BUBBLE = 280;
export function lastWordsOf(timeline) {
  const theirs = timeline.find((t) => t.kind === "customer" && !!t.text);
  const ours = timeline.find((t) => (t.kind === "receptionist" || t.kind === "team") && !t.unsent && !!t.text);
  return [theirs, ours].filter((t) => !!t).sort((a, b) => a.ts - b.ts).map((t) => ({
    id: t.id,
    mine: t.kind !== "customer",
    who: t.who,
    when: [t.day, t.time].filter(Boolean).join(" \xB7 "),
    text: t.text.length > BUBBLE ? `${t.text.slice(0, BUBBLE - 1).trimEnd()}\u2026` : t.text
  }));
}
