/**
 * A workspace's own rows as the runtimes read them beside their work (decision 0111): its name, clock and standing, and
 * its settings row as stored. Each answer is the database's as it came; the caller says a failed read in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { saysMissing } from "../../shared/missing-door";
import { DbFailure, type TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The workspace's name and time zone. */
export const findWorkspaceNameZone = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle();

/** The workspace's time zone and status (active or paused). */
export const findWorkspaceZoneStatus = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("timezone, status").eq("id", tenantId).maybeSingle();

/** The workspace's name and its address in the app. */
export const findWorkspaceNameSlug = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();

/** The workspace's address in the app. */
export const findWorkspaceSlug = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();

/** The workspaces' time zones, by their ids. */
export const listWorkspaceZones = async (db: Db, tenantIds: TenantId[]) =>
  db.from("tenants").select("id, timezone").in("id", tenantIds);

/** The workspace's name, by its id. */
export const findWorkspaceName = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();

/** These workspaces' addresses, standing and clocks, by their ids: a sweep's page. */
export const listWorkspaceStandings = async (db: Db, tenantIds: TenantId[]) =>
  db.from("tenants").select("id, slug, status, timezone").in("id", tenantIds);

/** The workspace's settings row, as stored. */
export const findConfigRow = async (db: Db, tenantId: TenantId) =>
  db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's id, name and address in the app: what an admin door answers about. */
export const findWorkspaceCard = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();

/** The workspace's row with its time zone, as the database answered it (findWorkspaceZone reads the zone alone). */
export const findWorkspaceZoneRow = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("id, timezone").eq("id", tenantId).maybeSingle();

/** "Did anything the runtime is built from change?": one text from one door (runtime_stamp). */
export const findRuntimeStamp = async (db: Db, tenantId: TenantId) =>
  db.rpc("runtime_stamp", { p_tenant_id: tenantId });

/** The workspace's settings row and its version, as stored. */
export const findConfigRowVersioned = async (db: Db, tenantId: TenantId) =>
  db.from("tenant_config").select("config, version").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's settings row changed. */
export const patchConfigRow = async (
  db: Db,
  tenantId: TenantId,
  set: Database["public"]["Tables"]["tenant_config"]["Update"],
) => db.from("tenant_config").update(set).eq("tenant_id", tenantId);

/** The workspace's own rules (its policies of no subject): each one's class, mode and limits. */
export const listWorkspaceRules = async (db: Db, tenantId: TenantId) =>
  db.from("policies").select("class, mode, limits").eq("tenant_id", tenantId).is("subject_type", null);

/**
 * What the receptionist's runtime reads of the workspace: its name, address, clock and status, and when its owner stopped
 * all sending (Stop everything), null while nothing is stopped.
 */
export const findWorkspaceRuntimeRow = async (db: Db, tenantId: TenantId) => {
  const withStop = await db
    .from("tenants")
    .select("name, slug, timezone, status, sending_stopped_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!noStopColumn(withStop.error)) return withStop;
  // A database the stop's column has not reached is read without it, and no stop stands there: every message is still
  // answered by code that shipped before its migration.
  const older = await db.from("tenants").select("name, slug, timezone, status").eq("id", tenantId).maybeSingle();
  return { ...older, data: older.data ? { ...older.data, sending_stopped_at: null } : null };
};

/**
 * Whether a read or a write failed because the database has not reached the migration that adds
 * `tenants.sending_stopped_at` (Stop everything): the one way every reader and the writer of the column ask it, of the
 * row itself or of a row that reads the workspace beside it (channels findWireRow). No stop stands on such a database,
 * so either may ship first.
 */
export const noStopColumn = (error: { message: string } | null | undefined): boolean =>
  !!error && /\bsending_stopped_at\b/.test(error.message) && saysMissing(error.message);

/**
 * Whether the workspace's owner stopped everything (`tenants.sending_stopped_at`, Stop everything): THE one reading of it
 * for whatever goes out by itself and asks before it starts. A campaign's run then waits as it was (core holdForTheStop),
 * a post due stays down in words (the edge's recheck), and nothing is said in public under the business's name
 * (doesWorkspaceAnswerOnItsOwn). A read that fails throws: "we could not check" is not "nothing is stopped".
 */
export async function isSendingStopped(db: Db, tenantId: TenantId): Promise<boolean> {
  const { data, error } = await db.from("tenants").select("sending_stopped_at").eq("id", tenantId).maybeSingle();
  if (noStopColumn(error)) return false;
  if (error) throw new DbFailure(error, "cannot read whether sending is stopped");
  return !!data?.sending_stopped_at;
}

/**
 * Stop everything, on the workspace's own row (`tenants.sending_stopped_at`): `at` writes it, null lifts it, as the
 * member who pressed it, with workspace.sending_stopped or .sending_resumed (00722 workspace_sending_stop). From the
 * write on, the send door holds whatever goes out on its own (core deliver/stop.ts). True once the row says it; false on
 * a database the door has not reached, where there is no stop to write. A write that fails, or finds no workspace,
 * throws: "it could not be written" is never "it is written".
 */
export async function setSendingStopped(db: Db, tenantId: TenantId, at: string | null): Promise<boolean> {
  const { data, error } = await db.rpc("workspace_sending_stop", {
    p_tenant_id: tenantId,
    ...(at ? { p_at: at } : {}),
  });
  if (error && saysMissing(error.message)) return false;
  if (error) throw new DbFailure(error, "cannot write whether sending is stopped");
  if (data !== true) throw new Error(`setSendingStopped: no workspace ${tenantId}`);
  return true;
}

/**
 * What a stop holds (what it paused, to start again), kept in Ask's own section of the settings as the member who
 * pressed it (00722 ask_stopped_keep); null removes it. Throws when it could not be written.
 */
export async function keepWhatTheStopHolds(db: Db, tenantId: TenantId, stopped: Json | null): Promise<void> {
  const { error } = await db.rpc("ask_stopped_keep", {
    p_tenant_id: tenantId,
    ...(stopped === null ? {} : { p_stopped: stopped }),
  });
  if (error) throw new DbFailure(error, "cannot keep what the stop holds");
}

/** Whether AI works alone, as the member who set it (00722 ask_alone_set), with its event where it changed. */
export async function setAskAlone(db: Db, tenantId: TenantId, on: boolean): Promise<void> {
  const { error } = await db.rpc("ask_alone_set", { p_tenant_id: tenantId, p_on: on });
  if (error) throw new DbFailure(error, "cannot set whether AI works alone");
}

/** A new workspace as its sign-up is told: its id, name, address, clock and when it was made. */
export const findNewWorkspace = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("id, name, slug, timezone, created_at").eq("id", tenantId).maybeSingle();

/** The workspace's switch, when its last member left it (00262), and its clock. */
export const findWorkspaceStanding = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("status, left_empty_at, timezone").eq("id", tenantId).maybeSingle();

/** The workspace's word for an appointment, as stored, or none. */
export const findAppointmentWord = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("appointment_word").eq("id", tenantId).maybeSingle();
