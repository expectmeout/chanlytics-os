export function senderVerdictOf(said, address) {
  const a = address.trim().toLowerCase();
  const exact = said.get(a);
  if (exact) return exact;
  const labels = a.slice(a.lastIndexOf("@") + 1).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const v = said.get(labels.slice(i).join("."));
    if (v) return v;
  }
  return null;
}
