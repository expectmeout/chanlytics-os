/**
 * The values the Inbox reads off the shell's `CHANLY` (data/constants.jsx): the confidence thresholds, the seed clock, the
 * routes it links to, and how a dollar change is said. The shell's copy stays for the pages that have not moved and goes
 * with the frame; these are the same words, so a page drawn from either says the same thing.
 */

/** Confidence is a 0-1 float everywhere: safe to send from 0.8, wants a look from 0.5. */
export const CONF = { SAFE: 0.8, MED: 0.5 } as const;

/** A second: the veto bar and a live call count down by it. */
export const TICK_MS = 1000;

/** The beat between a press that asks for the composer and the composer taking focus, so the pane has drawn it. */
export const FOCUS_COMPOSER_MS = 60;

/** How long "Saved" stays under Save draft. */
export const SAVED_NOTICE_MS = 1600;

/** When the scripted "this thread changed under you" notice appears, where its update names no time. */
export const STALE_AFTER_MS = 11_000;

/** The seed clock: the time a session decision stamps on a seeded thread. */
export const IX_NOW = "12:04";

/** How sure a level is, as the tone its meter and its word wear. */
export function confTone(level: number): "high" | "med" | "low" {
  return level >= CONF.SAFE ? "high" : level >= CONF.MED ? "med" : "low";
}

/** A dollar change with its sign: a dash for none. */
export function fmtDelta(n: number | null | undefined): string {
  if (n === 0 || n == null) return "—";
  return (n > 0 ? "+" : "−") + "$" + Math.abs(Math.round(n)).toLocaleString();
}

/** The routes the Inbox links to, each written the way the frame reads it. */
export const ROUTES = {
  agent: (id: string) => `fleet/${id}`,
  appt: (id: string) => `calendar/${id}`,
  client: (id: string) => `clients/${id}`,
  /** A lead has no page of its own: Leads is a scope of People, and a lead opens in its peek there. */
  lead: () => "clients/leads",
  thread: (id: string) => `inbox/${id}`,
  admin: (pane: string) => `admin/${pane}`,
};
