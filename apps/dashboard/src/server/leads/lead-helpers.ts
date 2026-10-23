/**
 * The helpers server/leads/leads.ts and its lead modules share. Internal: leads.ts re-exports only what was public.
 */
import {
  clockDate,
  hoursLines,
  leadMonth,
  parseTenantConfig,
  wallClockAt,
  type IdeaAbout,
} from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db";
import { tenantFacts } from "../tenant";
import type { RouteContext } from "../with-route";
import { storedConfigOf } from "../workspace/config-row";

/**
 * One door's arguments, with null where the owner named nothing.
 *
 * `database.types.ts` spells an argument that has a SQL default as OPTIONAL
 * (`p_class?: string`) and never as nullable, because the generator cannot see
 * that the default IS null. PostgREST sends an omitted argument and an
 * explicit null the same way, and 00142's own bodies read null as "not given"
 * (`coalesce(p_class, 'qualified')`). Naming the whole list in one object is
 * what makes a route's arguments readable in one place -- and assertable in
 * one deepEqual -- so this narrows that one difference, and nothing else: the
 * door's NAME and every argument's own type stay checked.
 */
export type DoorArgs<K extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][K]["Args"];

/* ----------------------------------------------------- what the plan says */

/** The month after this one, as the owner reads it: "Oct 1". */
export function renewsOnOf(tz: string, now: Date): string {
  const [y, m] = leadMonth(tz, now).split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const at = wallClockAt(tz, `${next.y}-${String(next.m).padStart(2, "0")}-01`, 12, 0);
  return clockDate(at, tz, now.getTime());
}

/** One counter's room, out of the month's whole. Never below zero: a reservation may sit above the cap for a moment. */
/**
 * What the month's two ceilings have already taken -- used and reserved
 * together, leads for the one and US dollars for the other -- through the door
 * 00143 opened. This is read as the MEMBER, and lead_counters is the engine's
 * own table with no member policy and select revoked from authenticated
 * (00140), so reading it directly raised for every owner and took the plan
 * card down with it; 00143's header records what that cost.
 *
 * `numeric` arrives from PostgREST as a string, so the budget is coerced.
 */
export async function monthUsed(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  period: string,
): Promise<{ allowance: number; budget: number }> {
  const { data, error } = await ctx.supabase.rpc("lead_month_used", { p_tenant_id: tenantId, p_period: period });
  if (error) throw new Error(`lead_month_used: ${error.message}`);
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);
  const taken = (kind: "allowance" | "budget") => {
    const c =
      data && typeof data === "object"
        ? (data as Record<string, { used?: unknown; reserved?: unknown } | undefined>)[kind]
        : null;
    return n(c?.used) + n(c?.reserved);
  };
  return { allowance: taken("allowance"), budget: taken("budget") };
}

/**
 * How much of the profile the ideas read beyond the line: every service and every note, each note to its own length,
 * within a whole the prompt carries (Ruben, 22 Oct 2026: the whole profile, where it read twelve services and five notes).
 */
const ABOUT_NOTE_CHARS = 600;
const ABOUT_NOTES_TOTAL = 6000;

/** A service as the ideas read it: its name, and how long it takes and what it costs where the profile says. */
const serviceWords = (s: { name: string; duration_min?: number; price_note?: string }): string => {
  const more = [s.duration_min ? `${s.duration_min} min` : "", s.price_note?.trim() ?? ""].filter(Boolean);
  return more.length ? `${s.name} (${more.join(", ")})` : s.name;
};

/** Each note as one line, whole up to ABOUT_NOTE_CHARS, in its order, until the whole would pass ABOUT_NOTES_TOTAL. */
function notesWithin(notes: { title: string; text: string }[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const n of notes) {
    const line = `${n.title}: ${n.text}`.replace(/\s+/g, " ").slice(0, ABOUT_NOTE_CHARS);
    if (total + line.length > ABOUT_NOTES_TOTAL) break;
    out.push(line);
    total += line.length;
  }
  return out;
}

/**
 * The workspace's own facts a draft may quote: its name, the address the law asks for at the foot, and what it offers;
 * and what the ideas read of it beyond the line: its business profile whole (every service with its length and price,
 * every note, its website, its hours and its languages).
 */
export async function workspaceOffer(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
): Promise<{ name: string; address: string; services: string[]; about: IdeaAbout }> {
  const [facts, config] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    storedConfigOf(ctx.supabase, tenantId),
  ]);
  const profile = parseTenantConfig(config)?.brain?.profile ?? null;
  const services = profile?.services ?? [];
  return {
    name: facts.name,
    address: (profile?.address ?? "").trim(),
    services: services.slice(0, 5).map((s) => s.name),
    about: {
      services: services.map(serviceWords),
      notes: notesWithin(profile?.notes ?? []),
      website: profile?.website ?? null,
      hours: hoursLines(profile?.hours),
      languages: profile?.languages ?? [],
    },
  };
}
