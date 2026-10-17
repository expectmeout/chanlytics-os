const asSentence = (s) => {
  const t = s.trim();
  if (!t) return null;
  const up = `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return /[.!?]$/.test(up) ? up : `${up}.`;
};
export function personHeadStateOf(p) {
  const needs = p.state === "needs_you" || p.state === "waiting_on_you";
  return {
    state: p.state,
    word: p.stateLabel,
    sentence: needs ? asSentence(p.rightNow.detail) : asSentence(p.stateDetail)
  };
}
