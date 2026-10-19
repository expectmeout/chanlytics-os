/**
 * Today's pinned lists (decision 0009: any list is a door on Today): which a member keeps, their counts' answer and the
 * pins as Today draws them. Their own module, since the frame reads the tokens on every page (today/pins-surface.ts).
 */
import { parseListToken } from "./list-token";

/** How many lists a member may pin to Today: a row of doors, not a second rail. */
export const TODAY_PINS_MAX = 8;

/** A pinned list as Today draws it: a door to People with its count, or none when it can't be counted here. */
export interface TodayPin {
  token: string;
  label: string;
  count: number | null;
  to: string;
}

/** The tokens a member's Today keeps (memberships.views.today.pins), in their order; anything else is left out. */
export function pinTokens(view: unknown): string[] {
  const pins = view && typeof view === "object" ? (view as { pins?: unknown }).pins : null;
  return Array.isArray(pins)
    ? pins.filter((t): t is string => typeof t === "string" && parseListToken(t) !== null).slice(0, TODAY_PINS_MAX)
    : [];
}

/**
 * GET people/list-counts' answer (the wiring's second audit, R10): each pinned list's count by its token, counted on the
 * server over the pool People's lists are counted on, for the member asking; null where the list can't be counted there, or
 * is no list. Today's pins read it, so their numbers follow what moves them without People's whole book.
 */
export interface ListCountsDto {
  counts: Record<string, number | null>;
}

/**
 * Today's pinned lists (decision 0009: any list is a door on Today), over the People surface: one of People's lists
 * shown here, or one of the workspace's own that is live. A pin to a list that isn't here now is left out; the pin
 * itself stays, and comes back with the list. `counts` (ListCountsDto, R10), where it holds a token, is the count Today
 * draws: People's is as of its last read, which nothing on Today reads again.
 */
export function todayPins(
  view: unknown,
  people: {
    lists: readonly { id: string; label: string; count: number }[];
    saved: readonly { id: string; name: string; count: number; unknown?: string | null }[];
  },
  counts?: ListCountsDto["counts"] | null,
): TodayPin[] {
  const counted = (token: string, own: number | null) => (counts && token in counts ? (counts[token] ?? null) : own);
  return pinTokens(view).flatMap((token): TodayPin[] => {
    const ref = parseListToken(token);
    if (!ref) return [];
    if (ref.kind === "builtin") {
      const l = people.lists.find((x) => x.id === ref.id);
      return l ? [{ token, label: l.label, count: counted(token, l.count), to: `clients/seg:${l.id}` }] : [];
    }
    const s = people.saved.find((x) => x.id.toLowerCase() === ref.id);
    return s
      ? [{ token, label: s.name, count: counted(token, s.unknown ? null : s.count), to: `clients/list:${s.id}` }]
      : [];
  });
}

/**
 * Today's view with a list pinned, or unpinned when it was: the newest pin last. Null when Today already keeps
 * TODAY_PINS_MAX: no pin is dropped to make room; one is taken off first.
 */
export function togglePin(view: unknown, token: string): { pins: string[] } | null {
  const pins = pinTokens(view);
  const t = token.toLowerCase();
  if (pins.some((p) => p.toLowerCase() === t)) return { pins: pins.filter((p) => p.toLowerCase() !== t) };
  return pins.length < TODAY_PINS_MAX ? { pins: [...pins, token] } : null;
}
