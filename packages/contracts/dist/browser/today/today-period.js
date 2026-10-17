export function todayPeriodLine(r) {
  if (!r) return null;
  if (r.empty) return { text: `${r.lead}: nobody wrote or called.`, to: "reports" };
  const parts = [
    `${r.messages.total} message${r.messages.total === 1 ? "" : "s"}${r.messages.compare ? ` (${r.messages.compare})` : ""}`
  ];
  if (r.answered.share !== null) parts.push(`${Math.round(r.answered.share * 100)}% answered by the receptionist`);
  if (r.calls) parts.push(`${r.calls} call${r.calls === 1 ? "" : "s"}`);
  return { text: `${r.lead}: ${parts.join(", ")}.`, to: "reports" };
}
