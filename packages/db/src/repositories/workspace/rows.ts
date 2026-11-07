/**
 * A workspace's own rows as the runtimes read them beside their work (decision 0111): its name, clock and standing, and
 * its settings row as stored. Each answer is the database's as it came; the caller says a failed read in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The workspace's name and time zone. */
export const findWorkspaceNameZone = async (db: Db, tenantId: string) =>
  db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle();

/** The workspace's time zone and status (active or paused). */
export const findWorkspaceZoneStatus = async (db: Db, tenantId: string) =>
  db.from("tenants").select("timezone, status").eq("id", tenantId).maybeSingle();

/** The workspace's name and its address in the app. */
export const findWorkspaceNameSlug = async (db: Db, tenantId: string) =>
  db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();

/** The workspace's address in the app. */
export const findWorkspaceSlug = async (db: Db, tenantId: string) =>
  db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();

/** The workspaces' time zones, by their ids. */
export const listWorkspaceZones = async (db: Db, tenantIds: string[]) =>
  db.from("tenants").select("id, timezone").in("id", tenantIds);

/** The workspace's name, by its id. */
export const findWorkspaceName = async (db: Db, tenantId: string) =>
  db.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();

/** These workspaces' addresses, standing and clocks, by their ids: a sweep's page. */
export const listWorkspaceStandings = async (db: Db, tenantIds: string[]) =>
  db.from("tenants").select("id, slug, status, timezone").in("id", tenantIds);

/** The workspace's settings row, as stored. */
export const findConfigRow = async (db: Db, tenantId: string) =>
  db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's id, name and address in the app: what an admin door answers about. */
export const findWorkspaceCard = async (db: Db, tenantId: string) =>
  db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();

/** The workspace's row with its time zone, as the database answered it (findWorkspaceZone reads the zone alone). */
export const findWorkspaceZoneRow = async (db: Db, tenantId: string) =>
  db.from("tenants").select("id, timezone").eq("id", tenantId).maybeSingle();

/** "Did anything the runtime is built from change?": one text from one door (runtime_stamp). */
export const findRuntimeStamp = async (db: Db, tenantId: string) => db.rpc("runtime_stamp", { p_tenant_id: tenantId });

/** The workspace's settings row and its version, as stored. */
export const findConfigRowVersioned = async (db: Db, tenantId: string) =>
  db.from("tenant_config").select("config, version").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's settings row changed. */
export const patchConfigRow = async (
  db: Db,
  tenantId: string,
  set: Database["public"]["Tables"]["tenant_config"]["Update"],
) => db.from("tenant_config").update(set).eq("tenant_id", tenantId);

/** The workspace's own rules (its policies of no subject): each one's class, mode and limits. */
export const listWorkspaceRules = async (db: Db, tenantId: string) =>
  db.from("policies").select("class, mode, limits").eq("tenant_id", tenantId).is("subject_type", null);

/** What the receptionist's runtime reads of the workspace: its name, address, clock and status. */
export const findWorkspaceRuntimeRow = async (db: Db, tenantId: string) =>
  db.from("tenants").select("name, slug, timezone, status").eq("id", tenantId).maybeSingle();

/** A new workspace as its sign-up is told: its id, name, address, clock and when it was made. */
export const findNewWorkspace = async (db: Db, tenantId: string) =>
  db.from("tenants").select("id, name, slug, timezone, created_at").eq("id", tenantId).maybeSingle();

/** The workspace's switch, when its last member left it (00262), and its clock. */
export const findWorkspaceStanding = async (db: Db, tenantId: string) =>
  db.from("tenants").select("status, left_empty_at, timezone").eq("id", tenantId).maybeSingle();

/** The workspace's word for an appointment, as stored, or none. */
export const findAppointmentWord = async (db: Db, tenantId: string) =>
  db.from("tenants").select("appointment_word").eq("id", tenantId).maybeSingle();
