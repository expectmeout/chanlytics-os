export const foldName = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export function sameListed(a, b) {
  const x = foldName(String(a ?? "").trim());
  return x !== "" && x === foldName(String(b ?? "").trim());
}
const wordsOf = (s) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export function matchService(services, asked) {
  const q = typeof asked === "string" ? foldName(asked.trim()) : "";
  if (!q || !services?.length) return null;
  const named = services.map((s) => ({ s, n: foldName(s.name) }));
  const exact = named.find((x) => x.n === q);
  if (exact) return exact.s;
  const contains = named.find((x) => x.n && (x.n.includes(q) || q.includes(x.n)));
  if (contains) return contains.s;
  const asks = wordsOf(q).filter((w) => w.length >= 4);
  let best = null;
  let bestScore = 0;
  for (const { s, n } of named) {
    const own = wordsOf(n);
    const score = asks.filter((w) => own.includes(w)).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}
export function serviceNamedIn(title, services, only) {
  const t = foldName(String(title ?? "").trim());
  if (!t) return null;
  let best = null;
  for (const s of services ?? []) {
    const name = String(s.name ?? "").trim();
    const folded = foldName(name);
    if (!folded || !t.includes(folded) || only && !only(name)) continue;
    if (!best || folded.length > best.folded.length) best = { name, folded };
  }
  return best ? best.name : null;
}
export function needsConsultation(name, rules) {
  const n = foldName(name.trim());
  const list = Array.isArray(rules?.consult_first) ? rules.consult_first : [];
  return !!n && list.some((c) => foldName(String(c).trim()) === n);
}
export function offerFor(services, rules, asked, opts = {}) {
  const service = matchService(services, asked);
  if (!service) return null;
  if (opts.client)
    return { service, consultation: false, consultationService: null, minMinutes: service.duration_min ?? null };
  if (!needsConsultation(service.name, rules))
    return { service, consultation: false, consultationService: null, minMinutes: service.duration_min ?? null };
  const own = wordsOf(foldName(service.name)).filter((w) => w.length >= 4);
  let consultationService = null;
  let best = -1;
  for (const s of services ?? []) {
    const n = foldName(s.name);
    if (s === service || !n.includes("consult") || needsConsultation(s.name, rules)) continue;
    const score = wordsOf(n).filter((w) => own.includes(w)).length;
    if (score > best) {
      consultationService = s;
      best = score;
    }
  }
  return { service, consultation: true, consultationService, minMinutes: consultationService?.duration_min ?? null };
}
export function offerLead(offer) {
  if (!offer) return "";
  if (!offer.consultation)
    return offer.service.duration_min ? `For ${offer.service.name} (about ${offer.service.duration_min} minutes): ` : "";
  const c = offer.consultationService;
  const detail = [
    c && foldName(c.name.trim()) !== "consultation" ? c.name : "",
    offer.minMinutes ? `about ${offer.minMinutes} minutes` : ""
  ].filter(Boolean).join(", ");
  return `${offer.service.name} needs a consultation before it can be booked, so offer a consultation instead. For a consultation${detail ? ` (${detail})` : ""}: `;
}
