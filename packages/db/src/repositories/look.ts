/**
 * A workspace's look (00407's logo, 00490's colour; decision 0075): read for an email or a page that wears it, written
 * by the member's door or the website read's. Storage keeps the logo's PATH; the address it is served at is contracts
 * workspaceLogoSrc, which the caller applies with its own deployment's storage origin.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

interface WorkspaceLookRow {
  name: string;
  slug: string;
  logo_path: string | null;
  accent: string | null;
}

/** The error a read that names the colour gets from a database 00490 has not reached. */
const lacksAccent = (message: string): boolean =>
  /\baccent\b/.test(message) && /does not exist|could not find/i.test(message);

/** The row's name, slug, logo path and colour; on a database 00490 has not reached, the colour is not said. Null for no such workspace. */
export async function workspaceLookOf(db: Db, tenantId: string): Promise<WorkspaceLookRow | null> {
  const r = await db.from("tenants").select("name, slug, logo_path, accent").eq("id", tenantId).maybeSingle();
  if (!r.error) return r.data ? { ...r.data, accent: r.data.accent ?? null } : null;
  if (!lacksAccent(r.error.message)) throw new Error(`cannot read the workspace's look: ${r.error.message}`);
  const older = await db.from("tenants").select("name, slug, logo_path").eq("id", tenantId).maybeSingle();
  if (older.error) throw new Error(`cannot read the workspace's look: ${older.error.message}`);
  return older.data ? { ...older.data, accent: null } : null;
}

/**
 * The member's door: the colour set or, with null, cleared; the database decides who may. The envelope comes back as
 * the door answered it, for the route to word a refusal by its code.
 */
export async function setWorkspaceAccent(
  db: Db,
  tenantId: string,
  accent: string | null,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("set_workspace_accent", { p_tenant_id: tenantId, p_accent: accent ?? "" });
  return { data, error };
}

/** The website read's door: what it wore of what was found. Throws when the door refuses or the write fails. */
export async function wearFoundLook(
  db: Db,
  p: { tenantId: string; logoPath: string | null; accent: string | null },
): Promise<{ logo: boolean; accent: boolean }> {
  const { data, error } = await db.rpc("wear_found_look", {
    p_tenant_id: p.tenantId,
    p_logo_path: p.logoPath ?? "",
    p_accent: p.accent ?? "",
  });
  if (error) throw new Error(`wear_found_look: ${error.message}`);
  const d =
    data && typeof data === "object" && !Array.isArray(data) ? (data as { logo?: unknown; accent?: unknown }) : {};
  return { logo: d.logo === true, accent: d.accent === true };
}
