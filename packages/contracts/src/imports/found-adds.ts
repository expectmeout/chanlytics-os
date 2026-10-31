/**
 * What a thing Check found adds to the Business record (decision 0073, R10): one rule for each kind, the first run's
 * Found for you's presses (surfaces/setup/first-run/found.tsx) and a lead's own receptionist alike (decision 0079), which
 * wears everything its website said at once.
 *
 *   foundRecordOf       what the record holds, as foundOf weighs what was found against it
 *   foundServicesRoom   the services found that the record has room for
 *   withFoundServices   services, as many as the record has room for, with their price and minutes where asked
 *   withFoundClosure    a day closed, with the day it runs to
 *   withFoundNote       an answer or the business's own words, as a thing it should know; a rule, among the booking
 *                       rules' notes
 *   withFoundWorn       all of them at once, a service's price left out: a preview never quotes one
 *
 * Each takes the profile as stored and gives the next one. A press adds one thing, which the settings' write schema
 * judges as it always has; withFoundWorn adds only where the record has room (PROFILE_LIMITS), so all of it is taken.
 */
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules";
import { FOUND_WORDS, type FoundVM, type foundOf } from "./business-reads";

type Profile = Record<string, unknown>;
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * What the record holds, as foundOf weighs what was found against it: its services, its days closed, its notes and its
 * booking rules' notes. Its own words are never offered over (null): the business's words go in as a note.
 */
export function foundRecordOf(p: Profile): Parameters<typeof foundOf>[1] {
  const rules = (p.booking_rules || {}) as { notes?: string[] };
  return {
    services: asList(p.services) as { name?: string }[],
    closures: asList(p.closures) as { date?: string }[],
    notes: [
      ...(asList(p.notes) as { title?: string; text?: string }[]),
      ...(rules.notes ?? []).map((t) => ({ title: null, text: t })),
    ],
    description: null,
  };
}

type FoundService = FoundVM["services"][number];

/** The services found that the record has room for, in the order they were found. */
export function foundServicesRoom(p: Profile, picked: readonly FoundService[]): FoundService[] {
  return picked.slice(0, Math.max(0, PROFILE_LIMITS.services - asList(p.services).length));
}

/** Services found, as many as the record has room for: with their price and minutes, or with their minutes alone. */
export function withFoundServices(p: Profile, picked: readonly FoundService[], o: { prices: boolean }): Profile {
  const kept = foundServicesRoom(p, picked).map((s) => ({
    name: s.name,
    ...(o.prices && s.price_note ? { price_note: s.price_note.slice(0, PROFILE_LIMITS.servicePrice) } : {}),
    ...(s.duration_min ? { duration_min: s.duration_min } : {}),
  }));
  return kept.length ? { ...p, services: [...asList(p.services), ...kept] } : p;
}

/** A day closed, and the day it runs to. */
export function withFoundClosure(p: Profile, c: FoundVM["closed"][number]): Profile {
  return { ...p, closures: [...asList(p.closures), { date: c.date, ...(c.until ? { until: c.until } : {}) }] };
}

/** A booking rule in its own words, among the rules' notes. */
function withFoundRule(p: Profile, text: string): Profile {
  const br = (p.booking_rules || {}) as { notes?: string[] };
  return { ...p, booking_rules: { ...br, notes: [...(br.notes ?? []), text.slice(0, PROFILE_LIMITS.ruleNote)] } };
}

/** An answer, or the business's own words, as a thing it should know; a booking rule goes with the rules. */
export function withFoundNote(p: Profile, n: { title: string; text: string }): Profile {
  if (n.title === FOUND_WORDS.rulesTitle) return withFoundRule(p, n.text);
  return { ...p, notes: [...asList(p.notes), { title: n.title, text: n.text }] };
}

/** Whether the record has room for one more of a list, by its limit. */
const roomIn = (list: unknown, limit: number): boolean => asList(list).length < limit;
const rulesOf = (p: Profile): unknown => ((p.booking_rules || {}) as { notes?: unknown }).notes;

/** Everything found, at once, where the record has room, a service's price left out (a preview's, decision 0079). */
export function withFoundWorn(p: Profile, found: FoundVM): Profile {
  let next = withFoundServices(p, found.services, { prices: false });
  for (const c of found.closed) if (roomIn(next.closures, PROFILE_LIMITS.closures)) next = withFoundClosure(next, c);
  const about = found.description ? [{ title: FOUND_WORDS.aboutTitle, text: found.description.text }] : [];
  for (const n of [...found.notes, ...about]) {
    const room =
      n.title === FOUND_WORDS.rulesTitle
        ? roomIn(rulesOf(next), PROFILE_LIMITS.ruleNotes)
        : roomIn(next.notes, PROFILE_LIMITS.notes);
    if (room) next = withFoundNote(next, n);
  }
  return next;
}
