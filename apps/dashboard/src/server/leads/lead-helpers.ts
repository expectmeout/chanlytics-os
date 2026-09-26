/**
 * The helpers server/leads/leads.ts and its lead modules share. Internal: leads.ts re-exports only what was public.
 */
import { clockDate, leadMonth, parseTenantConfig, wallClockAt } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db";
import { tenantFacts } from "../tenant";
import type { RouteContext } from "../with-route";

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

export const SUGGEST_SYSTEM = [
  "You suggest three or four kinds of LOCAL BUSINESS that a small business could usefully reach out to.",
  "Each one is a kind of business with a listing and a front door -- never people at home, never a job title, never one named company.",
  "For each: what to search for in plain words, who it is for and why in one short phrase, and a lower_snake_case key for the kind.",
  "Also give one line naming the business you were told about, as its owner would say it.",
  "No slogans, and no numbers you were not given.",
].join("\n");

/** The workspace's own facts a draft may quote: its name, the address the law asks for at the foot, and what it offers. */
export async function workspaceOffer(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
): Promise<{ name: string; address: string; services: string[] }> {
  const [facts, cfg] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (cfg.error) throw new Error(cfg.error.message);
  const profile = parseTenantConfig(cfg.data?.config ?? null)?.brain?.profile ?? null;
  return {
    name: facts.name,
    address: (profile?.address ?? "").trim(),
    services: (profile?.services ?? []).slice(0, 5).map((s) => s.name),
  };
}
