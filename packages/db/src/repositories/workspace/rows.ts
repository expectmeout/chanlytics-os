/**
 * A workspace's own rows as the runtimes read them beside their work (decision 0111): its name, clock and standing, and
 * its settings row as stored. Each answer is the database's as it came; the caller says a failed read in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The workspace's name and time zone. */
export const findWorkspaceNameZone = (db: Db, tenantId: string) =>
  db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle();

/** The workspace's time zone and status (active or paused). */
export const findWorkspaceZoneStatus = (db: Db, tenantId: string) =>
  db.from("tenants").select("timezone, status").eq("id", tenantId).maybeSingle();

/** The workspace's name and its address in the app. */
export const findWorkspaceNameSlug = (db: Db, tenantId: string) =>
  db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();

/** The workspace's address in the app. */
export const findWorkspaceSlug = (db: Db, tenantId: string) =>
  db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();

/** The workspaces' time zones, by their ids. */
export const listWorkspaceZones = (db: Db, tenantIds: string[]) =>
  db.from("tenants").select("id, timezone").in("id", tenantIds);

/** The workspace's name, by its id. */
export const findWorkspaceName = (db: Db, tenantId: string) =>
  db.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();

/** These workspaces' addresses, standing and clocks, by their ids: a sweep's page. */
export const listWorkspaceStandings = (db: Db, tenantIds: string[]) =>
  db.from("tenants").select("id, slug, status, timezone").in("id", tenantIds);

/** The workspace's settings row, as stored. */
export const findConfigRow = (db: Db, tenantId: string) =>
  db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's id, name and address in the app: what an admin door answers about. */
export const findWorkspaceCard = (db: Db, tenantId: string) =>
  db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
