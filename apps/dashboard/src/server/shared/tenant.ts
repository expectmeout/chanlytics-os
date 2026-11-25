import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE, DbFailure } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db/types";
import { findWorkspaceNameZone } from "@chanlytics/db/workspace";
import type { TenantId } from "@chanlytics/contracts";

/**
 * The two facts every export header needs: what the business is called and
 * which clock it keeps. Read under the caller's RLS; a member can read their
 * own tenant's row and nobody else's.
 */
export async function getTenantFacts(
  supabase: SupabaseClient<Database>,
  tenantId: TenantId,
): Promise<{ name: string; timezone: string }> {
  const known = FACTS_KNOWN.get(supabase)?.get(tenantId);
  if (known) return known;
  const { data, error } = await findWorkspaceNameZone(supabase, tenantId);
  if (error) throw new DbFailure(error);
  return tenantFactsOf(data);
}

/**
 * The two facts a read's request already has, by the client it reads through, which is the request's own. Who is asking
 * was resolved from a row that carried them (with-route.ts resolveMember), and the readers beneath asked for them again
 * by the workspace, a round trip each: `tenants` was one database call in eighteen of a signed-in evening (production's
 * gateway log, 24 Nov 2026).
 */
const FACTS_KNOWN = new WeakMap<object, Map<TenantId, { name: string; timezone: string }>>();

/**
 * A read's request knows the workspace's two facts: getTenantFacts answers them over the same client without asking.
 * Said for a read alone (with-route.ts): a write may change them, and what it reads after is the database's to say.
 */
export function tenantFactsKnown(
  supabase: SupabaseClient<Database>,
  tenantId: TenantId,
  facts: { name: string; timezone: string },
): void {
  const known = FACTS_KNOWN.get(supabase);
  if (known) known.set(tenantId, facts);
  else FACTS_KNOWN.set(supabase, new Map([[tenantId, facts]]));
}

/** The two facts as a tenant's row says them, wherever the row was read: by itself, or with the membership. */
export function tenantFactsOf(row: { name?: string | null; timezone?: string | null } | null | undefined): {
  name: string;
  timezone: string;
} {
  return { name: row?.name ?? "Workspace", timezone: row?.timezone ?? DEFAULT_TIMEZONE };
}
