/**
 * The service somebody means and what it is offered as: names folded one way (foldName, sameListed), the listed
 * service a caller or the assistant asked for (matchService), and whether it needs a consultation first
 * (needsConsultation, offerFor, offerLead). The phone tool, the assistant and the board read the one rule here.
 */

/** A service the business lists, as far as matching one needs it. */
export interface ServiceLike {
  name: string;
  duration_min?: number;
}

// Accents off and case folded: "unas" finds "Uñas de gel", and a caller who
// says "depilacion" means the service written "Depilación". Exported for the
// Business tab's services sheet, whose search folds a name the same way: one
// rule for what counts as the same name, not a copy of it in the page.
export const foldName = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Whether two names on one of the business's lists (its services, its languages) are one: accents, case and the space
 * around a name are not the name (foldName). The one test for "already there" on such a list: the first run's chips and
 * the Business tab's languages box both ask it, so a language chosen as "Haitian Créole" is the chip "Haitian Creole",
 * and is not offered again beside it. An empty name is no name, and the same as none. A business's own name is
 * facts.ts sameName's, which lets punctuation go too.
 */
export function sameListed(a: string, b: string): boolean {
  const x = foldName(String(a ?? "").trim());
  return x !== "" && x === foldName(String(b ?? "").trim());
}

const wordsOf = (s: string): string[] => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The listed service somebody means, from what they said ("a haircut", "the
 * balayage thing", "uñas"): exact first, then one name containing the other,
 * then the service sharing the most words of four letters or more.
 *
 * One function for the phone tool and the assistant. The two copies it
 * replaced split words differently, and the phone's cut "uñas" at the ñ into
 * two pieces too short to count, so a caller asking for nails matched nothing.
 */
export function matchService<S extends ServiceLike>(services: readonly S[] | undefined, asked: unknown): S | null {
  const q = typeof asked === "string" ? foldName(asked.trim()) : "";
  if (!q || !services?.length) return null;
  const named = services.map((s) => ({ s, n: foldName(s.name) }));
  const exact = named.find((x) => x.n === q);
  if (exact) return exact.s;
  const contains = named.find((x) => x.n && (x.n.includes(q) || q.includes(x.n)));
  if (contains) return contains.s;
  const asks = wordsOf(q).filter((w) => w.length >= 4);
  let best: S | null = null;
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

/** The booking rules as far as a consultation needs them. */
export interface ConsultRules {
  consult_first?: readonly string[];
}

/**
 * Whether a listed service needs a consultation before it can be booked, as Business lists them. Accents, case and the
 * spaces around a name are not the name, as in matchService; the board matched them exactly, lower-cased.
 */
export function needsConsultation(name: string, rules: ConsultRules | null | undefined): boolean {
  const n = foldName(name.trim());
  // A stored list that is not one (a hand-edited record) names nothing, never a throw.
  const list = Array.isArray(rules?.consult_first) ? rules.consult_first : [];
  return !!n && list.some((c) => foldName(String(c).trim()) === n);
}

/** What an asked-for service is offered as: itself, or a consultation first. */
export interface ServiceOffer<S extends ServiceLike = ServiceLike> {
  /** The listed service asked about. */
  service: S;
  /** Offered as a consultation, never as itself. */
  consultation: boolean;
  /** The listed service a consultation is, when the business lists one: the one sharing the service's words first. */
  consultationService: S | null;
  /** How long an open time has to be: the service's own length, a consultation's, or null for any open time. */
  minMinutes: number | null;
}

/**
 * The one rule for a service asked about, for the phone tool, the assistant and the board. A service that needs a
 * consultation first is never offered itself: the consultation is, sized by the consultation the business lists
 * ("Consultation", "Consulta"), or any open time when it lists none. All three sized a three-hour color correction by
 * its own length while the prompt said a consultation comes first (C5b). A client is past the consultation, and is
 * offered the service itself (0004).
 */
export function offerFor<S extends ServiceLike>(
  services: readonly S[] | undefined,
  rules: ConsultRules | null | undefined,
  asked: unknown,
  opts: { client?: boolean } = {},
): ServiceOffer<S> | null {
  const service = matchService(services, asked);
  if (!service) return null;
  // A client is past the consultation (0004): the service itself, sized by its own length.
  if (opts.client)
    return { service, consultation: false, consultationService: null, minMinutes: service.duration_min ?? null };
  if (!needsConsultation(service.name, rules))
    return { service, consultation: false, consultationService: null, minMinutes: service.duration_min ?? null };
  const own = wordsOf(foldName(service.name)).filter((w) => w.length >= 4);
  let consultationService: S | null = null;
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

/**
 * The words before the open times, the phone's and the assistant's alike: a service's length, or that it needs a
 * consultation first and what is offered instead.
 */
export function offerLead(offer: ServiceOffer | null): string {
  if (!offer) return "";
  if (!offer.consultation)
    return offer.service.duration_min
      ? `For ${offer.service.name} (about ${offer.service.duration_min} minutes): `
      : "";
  const c = offer.consultationService;
  const detail = [
    c && foldName(c.name.trim()) !== "consultation" ? c.name : "",
    offer.minMinutes ? `about ${offer.minMinutes} minutes` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return `${offer.service.name} needs a consultation before it can be booked, so offer a consultation instead. For a consultation${detail ? ` (${detail})` : ""}: `;
}
