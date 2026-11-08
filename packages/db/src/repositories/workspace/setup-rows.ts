/**
 * What Setup's rows and the Connections page count and read of a workspace (decision 0111): its team and open
 * invitations, its channels, the last WhatsApp message in, its templates' verdicts, who said yes, its asks for help, its
 * capabilities, and the facts a prompt states (name, clock, channels). Read on the member's own client, each naming
 * the workspace. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** How many members the workspace has, partners aside. */
export const countTeamMembers = async (db: Db, tenantId: string) =>
  db.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("role", "partner");

/** How many of the workspace's invitations are open. */
export const countOpenInvites = async (db: Db, tenantId: string) =>
  db
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("accepted_at", null)
    .is("revoked_at", null);

/** The workspace's channels as Setup's rows read them. */
export const listSetupChannels = async (db: Db, tenantId: string) =>
  db.from("tenant_channels").select("kind, status, number_e164, config, created_at").eq("tenant_id", tenantId);

/** The workspace's channels as the Connections page lists them, by kind. */
export const listChannelsForPage = async (db: Db, tenantId: string) =>
  db
    .from("tenant_channels")
    .select("id, kind, number_e164, status, created_at, config")
    .eq("tenant_id", tenantId)
    .order("kind");

/** The workspace's newest WhatsApp message in: when WhatsApp said it came, and when it was kept. */
export const findLastWhatsAppIn = async (db: Db, tenantId: string) =>
  db
    .from("messages")
    .select("channel_ts, created_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .eq("channel", "whatsapp")
    .order("channel_ts", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

/** The workspace's WhatsApp templates' verdicts: Meta's status and whether each is hidden. */
export const listTemplateVerdicts = async (db: Db, tenantId: string) =>
  db.from("templates").select("name, meta_status, hidden_at").eq("tenant_id", tenantId).eq("channel", "whatsapp");

/** How many of the workspace's people said yes to messages. */
export const countSaidYes = async (db: Db, tenantId: string) =>
  db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("consent", "opted_in")
    .is("erased_at", null);

/** How many of the workspace's people said yes to offers, with no do-not-contact. */
export const countOffersYes = async (db: Db, tenantId: string) =>
  db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("marketing_consent", "opted_in")
    .eq("dnc", false)
    .is("erased_at", null);

/**
 * How many of the workspace's people an offer can reach: `mayReceive(r, "marketing")` as a count, the yes to offers,
 * no do-not-contact, and a number to send to.
 */
export const countOffersReach = async (db: Db, tenantId: string) =>
  db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("marketing_consent", "opted_in")
    .eq("dnc", false)
    .is("erased_at", null)
    .not("phone_e164", "is", null);

/** The workspace's newest asks for help with its setup, `limit` of them. */
export const listSetupAsks = async (db: Db, tenantId: string, limit: number) =>
  db
    .from("events")
    .select("created_at, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "setup.requested")
    .order("created_at", { ascending: false })
    .limit(limit);

/** The workspace's capabilities: each one's switch on and off, and by whom. */
export const listCapabilityRows = async (db: Db, tenantId: string) =>
  db
    .from("capability_activations")
    .select("capability, activated_at, activated_by, deactivated_at")
    .eq("tenant_id", tenantId);

/** The workspace's name, clock and whether it is the platform's own (00469). */
export const findWorkspaceFacts = async (db: Db, tenantId: string) =>
  db.from("tenants").select("name, timezone, ours").eq("id", tenantId).maybeSingle();
