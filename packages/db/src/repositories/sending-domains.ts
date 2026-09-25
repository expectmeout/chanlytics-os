/**
 * sending_domains (00175): a workspace's own domains for cold email, as the edge reads and writes them. The one place
 * the table is typed. Members read it through RLS (the dashboard's server/sending-domains.ts); every write here is
 * the service role's, on the edge, because each follows a call to the cold mail account.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;
export type SendingDomainRow = Database["public"]["Tables"]["sending_domains"]["Row"];
type Patch = Database["public"]["Tables"]["sending_domains"]["Update"];

const must = <T>(what: string, r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(`sending_domains: ${what}: ${r.error.message}`);
  return r.data as T;
};

export async function sendingDomainsOf(db: Db, tenantId: string): Promise<SendingDomainRow[]> {
  return (
    must(
      "read a workspace's domains",
      await db.from("sending_domains").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
    ) ?? []
  );
}

export async function sendingDomainOf(db: Db, tenantId: string, id: string): Promise<SendingDomainRow | null> {
  return must(
    "read a domain",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
  );
}

/** One of a workspace's domains by its host (lower-cased, 00175); null when it owns none by that name. */
export async function sendingDomainByHost(db: Db, tenantId: string, host: string): Promise<SendingDomainRow | null> {
  return must(
    "read a domain by host",
    await db
      .from("sending_domains")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("host", host.trim().toLowerCase())
      .maybeSingle(),
  );
}

/** What the clock reads: every domain being checked or able to send, the longest unread first. */
export async function dueSendingDomains(db: Db, limit: number): Promise<SendingDomainRow[]> {
  return (
    must(
      "read the due domains",
      await db
        .from("sending_domains")
        .select("*")
        .in("state", ["verifying", "verified", "held"])
        .order("checked_at", { ascending: true, nullsFirst: true })
        .limit(limit),
    ) ?? []
  );
}

export async function countSendingDomains(db: Db, tenantId: string): Promise<number> {
  const r = await db.from("sending_domains").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (r.error) throw new Error(`sending_domains: count a workspace's domains: ${r.error.message}`);
  return r.count ?? 0;
}

/** Who holds a host a reservation found taken: enough to say whose it is, and whether it was ever verified. */
export type SendingDomainHolder = Pick<
  SendingDomainRow,
  "id" | "tenant_id" | "state" | "created_at" | "provider_domain_id"
>;

/**
 * The host, held for this workspace before the provider is asked: unique across the platform (00175). Taken names
 * the holder; five already is the table's own limit (sending_domains_within_limit), which a count before the insert
 * could not hold against two adds pressed at once.
 */
export async function reserveSendingDomain(
  db: Db,
  i: { tenantId: string; host: string; fromLocal: string; fromName: string; by: string | null },
): Promise<
  | { ok: true; row: SendingDomainRow }
  | { ok: false; reason: "taken"; holder: SendingDomainHolder | null }
  | { ok: false; reason: "too_many" }
> {
  const r = await db
    .from("sending_domains")
    .insert({
      tenant_id: i.tenantId,
      host: i.host,
      from_local: i.fromLocal,
      from_name: i.fromName,
      created_by: i.by,
      // Where every domain starts: its records to publish. Said, not left to the column's default.
      state: "records",
    })
    .select("*")
    .single();
  const code = (r.error as { code?: string; hint?: string } | null)?.code;
  if (code === "P0001" && (r.error as { hint?: string }).hint === "too_many") return { ok: false, reason: "too_many" };
  if (code === "23505") {
    const holder = must(
      "read who holds a host",
      await db
        .from("sending_domains")
        .select("id, tenant_id, state, created_at, provider_domain_id")
        .eq("host", i.host)
        .maybeSingle(),
    );
    return { ok: false, reason: "taken", holder: holder ?? null };
  }
  return { ok: true, row: must("reserve a domain", r) };
}

/**
 * A write that changes nothing but the row's `updated_at` (moddatetime): a removal fences off a check already in
 * flight, whose write names the row as it was read and now finds it moved (applyDomainCheck). Null when the row is gone.
 */
export async function touchSendingDomain(db: Db, row: SendingDomainRow): Promise<SendingDomainRow | null> {
  return must(
    "touch a domain",
    await db
      .from("sending_domains")
      .update({ checked_at: row.checked_at })
      .eq("id", row.id)
      .eq("tenant_id", row.tenant_id)
      .select("*")
      .maybeSingle(),
  );
}

/** The provider's id, records and word, on the row reserved for them. */
export async function recordProviderDomain(
  db: Db,
  id: string,
  p: { providerDomainId: string; records: Json; providerStatus: string },
): Promise<SendingDomainRow> {
  return must(
    "record the provider's domain",
    await db
      .from("sending_domains")
      .update({ provider_domain_id: p.providerDomainId, records: p.records, provider_status: p.providerStatus })
      .eq("id", id)
      .select("*")
      .single(),
  );
}

/**
 * A check's result, written only onto the row as it was read: another writer since (an owner's Check racing the
 * clock, a removal) wins, and this answers null rather than overwrite what it did not see.
 */
export async function applyDomainCheck(db: Db, row: SendingDomainRow, patch: Patch): Promise<SendingDomainRow | null> {
  const r = await db
    .from("sending_domains")
    .update(patch)
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("*")
    .maybeSingle();
  return must("write a domain's check", r);
}

/**
 * What one own domain sent since it was last clean (00176): the last 500 that left, the bounces among them, and the
 * complaints. A read that fails throws; the caller judges nothing on it.
 */
export async function sendingDomainCounts(
  db: Db,
  tenantId: string,
  host: string,
  since: string | null,
): Promise<{ sent: number; bounced: number; complained: number }> {
  const r = await db.rpc("sending_domain_counts", { p_tenant_id: tenantId, p_host: host, p_since: since } as never);
  const c = (must("count a domain's sends", r) ?? {}) as Record<string, unknown>;
  const n = (k: string): number => (typeof c[k] === "number" ? (c[k] as number) : Number(c[k] ?? 0) || 0);
  return { sent: n("sent"), bounced: n("bounced"), complained: n("complained") };
}

export async function deleteSendingDomain(db: Db, tenantId: string, id: string): Promise<boolean> {
  const r = must(
    "remove a domain",
    await db.from("sending_domains").delete().eq("tenant_id", tenantId).eq("id", id).select("id"),
  );
  return (r ?? []).length > 0;
}
