/**
 * What Setup's rows and the Connections page read of a workspace (decision 0111). Setup's are read in one call
 * (setup_rows, 00700): its settings, its hosted mailbox, its channels, the last WhatsApp message and the
 * last call in, its templates' verdicts, its team and open invitations, who said yes, its asks for help, its lines, its
 * Google listing and connection, its plan, its capabilities, what its first run read and chose. Each is read as the
 * caller, under the same policies as a read of its own table. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import type { Database, Json } from "../../types";
import { readAnswer } from "../../shared/read-json";
import { ledgerCountsOf } from "../imports/ledger";
import type { TenantConfigRow } from "./control-plane/config";

type Db = SupabaseClient<Database>;
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

/** A row of the answer, typed as the table holds it: an object, checked as one. */
const record = <T>() => z.custom<T>((v) => typeof v === "object" && v !== null && !Array.isArray(v));
/** A list of such rows. */
const rowListOf = <T>() => z.array(record<T>());

/** setup_rows' answer, key by key (00700 says what each stands for). */
const SetupRowsAnswer = z.object({
  config: record<TenantConfigRow & { feed_hidden: boolean }>().nullable(),
  mailbox: record<Row<"mailboxes">>().nullable(),
  channels: rowListOf<Pick<Row<"tenant_channels">, "kind" | "status" | "number_e164" | "config" | "created_at">>(),
  last_whatsapp: record<Pick<Row<"messages">, "channel_ts" | "created_at">>().nullable(),
  last_call: record<Pick<Row<"calls">, "started_at">>().nullable(),
  templates: rowListOf<Pick<Row<"templates">, "name" | "meta_status" | "hidden_at">>(),
  roster: rowListOf<Database["public"]["Functions"]["team_roster"]["Returns"][number]>().nullable(),
  members: z.number().nullable(),
  invitations: rowListOf<Pick<Row<"invitations">, "id" | "email" | "role" | "created_at" | "expires_at">>(),
  people: z.object({ said_yes: z.number(), offers_yes: z.number(), offers_reach: z.number(), all: z.number() }),
  asks: rowListOf<{ created_at: string; data: Json }>(),
  lines:
    rowListOf<
      Pick<
        Row<"lines">,
        | "id"
        | "e164"
        | "kind"
        | "provider"
        | "area_code"
        | "voice_state"
        | "sms_state"
        | "reg_step"
        | "reg_mock"
        | "reg_sole_prop"
        | "whatsapp_state"
        | "port_state"
        | "forwarding_state"
        | "step"
        | "last_error"
        | "state_since"
        | "created_at"
        | "facts"
      >
    >(),
  listing:
    record<
      Pick<
        Row<"google_listings">,
        | "place_id"
        | "name"
        | "address"
        | "maps_uri"
        | "business_status"
        | "rating"
        | "review_count"
        | "linked_at"
        | "checked_at"
        | "check_error"
      >
    >().nullable(),
  listing_facts: record<Pick<Row<"google_listings">, "name" | "address" | "facts">>().nullable(),
  google:
    record<
      Pick<
        Row<"google_connections">,
        | "google_email"
        | "account_title"
        | "location_name"
        | "location_title"
        | "connected_at"
        | "last_synced_at"
        | "sync_error"
      >
    >().nullable(),
  billing:
    record<
      Pick<
        Row<"billing_accounts">,
        | "mode"
        | "status"
        | "price_id"
        | "current_period_end"
        | "trial_end"
        | "cancel_at"
        | "cancel_at_period_end"
        | "card_brand"
        | "card_last4"
        | "last_payment_failed_at"
        | "last_paid_at"
        | "updated_at"
      >
    >().nullable(),
  activations:
    rowListOf<Pick<Row<"capability_activations">, "capability" | "activated_at" | "activated_by" | "deactivated_at">>(),
  day_before: z.boolean(),
  rehearsals: z.object({ reviewed: z.number(), kept: z.number(), last_at: z.string().nullable() }),
  imports:
    rowListOf<
      Pick<
        Row<"imports">,
        | "source"
        | "connection_id"
        | "state"
        | "counts"
        | "parts_done"
        | "parts_total"
        | "oldest"
        | "started_at"
        | "finished_at"
        | "last_error"
        | "via"
      >
    >(),
  business_reads: rowListOf<Pick<Row<"business_reads">, "source" | "facts" | "read_from" | "read_at" | "error">>(),
  choices: record<Pick<Row<"setup_choices">, "phone" | "whatsapp" | "marks" | "version">>().nullable(),
});

/**
 * Every row Setup reads of the workspace, from one call. `roster`: the team as its roster, for a member's own session;
 * the back office, which has no session, reads the count of members instead (team_roster refuses anyone but a member).
 * The imports' counts are read as numbers, as the ledger's own read reads them. Throws on a failed read: Setup says
 * nothing it could not read.
 */
export async function readSetupRows(db: Db, tenantId: TenantId, roster: boolean) {
  const { data, error } = await db.rpc("setup_rows", { p_tenant_id: tenantId, p_roster: roster });
  if (error) throw new DbFailure(error, "cannot read where the workspace's setup stands");
  const rows = readAnswer("setup_rows", SetupRowsAnswer, data);
  return {
    ...rows,
    imports: rows.imports.map((r) => ({ ...r, counts: ledgerCountsOf(r.counts) })),
  };
}

/** What setup_rows answers, as Setup reads it. */
export type SetupRows = Awaited<ReturnType<typeof readSetupRows>>;

/** The workspace's channels as the Connections page lists them, by kind. */
export const listChannelsForPage = async (db: Db, tenantId: TenantId) =>
  db
    .from("tenant_channels")
    .select("id, kind, number_e164, status, created_at, config")
    .eq("tenant_id", tenantId)
    .order("kind");

/** The workspace's name, clock and whether it is the platform's own (00469). */
export const findWorkspaceFacts = async (db: Db, tenantId: TenantId) =>
  db.from("tenants").select("name, timezone, ours").eq("id", tenantId).maybeSingle();
