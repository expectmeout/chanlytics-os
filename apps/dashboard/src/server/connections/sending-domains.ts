/**
 * A workspace's own sending domains, as the dashboard holds them (Reach out, Part 2): the rows a member may read
 * (RLS, no provider id), and the owner's three verbs -- add, check, remove -- through the edge's door
 * (apps/edge/api/admin/sending-domains.ts), which holds the cold mail account's key. Nothing here knows that key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { AppError, sendingDomainDtoOf, type SendingDomainDto } from "@chanlytics/contracts";
import { edgeConfigured, edgeHeaders, edgeUrl, READY_TTL_MS } from "../edge";
import { deployment } from "../deployment";
import type { EdgeAnswer } from "./lines";

const AUD = "/api/admin/sending-domains";

/** The columns the page may see: every one but the provider's id. */
const SENDING_DOMAIN_COLUMNS =
  "id, host, from_local, from_name, records, state, provider_status, dmarc, held_why, held_at, verified_at, clean_since, counted_since, checked_at, created_at, sent_recent, bounced_recent, complaints, sent_days, resume_by";

export async function sendingDomainsFor(db: SupabaseClient<Database>, tenantId: string): Promise<SendingDomainDto[]> {
  const { data, error } = await db
    .from("sending_domains")
    .select(SENDING_DOMAIN_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => sendingDomainDtoOf(r));
}

/** One call to the edge's sending-domains door. Never throws: a failure is a status the caller reads. */
async function edgeDomains(body: Record<string, unknown>, timeoutMs = 25_000): Promise<EdgeAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // The deployment gate every provider door keeps: a preview never creates a domain at the real account.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  try {
    const r = await fetch(`${edgeUrl()}${AUD}`, {
      method: "POST",
      headers: edgeHeaders(AUD, {
        workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
        user: typeof body.user_id === "string" ? body.user_id : null,
      }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = (await r.json().catch(() => null)) as unknown;
    return {
      status: r.status,
      body: parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null,
    };
  } catch (e) {
    return { status: 503, body: { ok: false, error: e instanceof Error ? e.message : String(e) } };
  }
}

let readyCache: { at: number; ready: boolean } | null = null;
/** A "not ready" answer is kept briefly: a key set a minute ago must not hide the block for five. */
const NOT_READY_TTL_MS = 30_000;

/**
 * Whether this deployment can add own domains at all: the edge holds the cold account's key. Cached per lambda, as
 * lines' and Google's readiness are; an unreachable edge is not ready, so nothing draws a verb that cannot work.
 */
export async function domainsReadiness(now = Date.now()): Promise<boolean> {
  if (readyCache && now - readyCache.at < (readyCache.ready ? READY_TTL_MS : NOT_READY_TTL_MS)) return readyCache.ready;
  const a = await edgeDomains({ op: "status" }, 4_000);
  const ready = a.status === 200 && a.body?.ok === true && a.body?.ready === true;
  readyCache = { at: now, ready };
  return ready;
}

/** For tests, and for a route that must not read a stale answer. */
export function forgetDomainsReadiness(): void {
  readyCache = null;
}

/** The edge's refusals, in the owner's words; the door's own sentence when it gave one. */
function refusal(a: EdgeAnswer, doing: string): AppError {
  const b = a.body ?? {};
  const error = typeof b.error === "string" ? b.error : "failed";
  const said = typeof b.message === "string" && b.message.trim() ? b.message.trim() : null;
  switch (error) {
    // Not the domain typed: the mail account behind it is not here. Its own code, so a form says it in a toast.
    case "preview":
      return new AppError("upstream_email", "Domains can't be added or checked from a preview.", 503);
    case "no_cold_key":
      return new AppError("upstream_email", "Sending from your own domain isn't switched on here yet.", 503);
    case "invalid":
      return new AppError("validation", said ?? "That can't be a domain to send from.", 400);
    // Resume's three (00176) are conflicts too: a hold the records lift, a domain not held, a row that moved; and a hold
    // that is the platform's to lift, or a domain removed while so held (D16).
    case "too_many":
    case "host_taken":
    case "dns_hold":
    case "not_held":
    case "moved":
    case "platform_hold":
      return new AppError("conflict", said ?? "That domain can't be added.", 409);
    case "not_found":
      return new AppError("not_found", "That domain isn't this workspace's.", 404);
    default:
      return new AppError("internal", said ?? `The domain could not be ${doing}. Try again in a minute.`, 502);
  }
}

export async function addSendingDomain(
  tenantId: string,
  userId: string,
  input: { host: string; fromLocal: string; fromName: string },
): Promise<SendingDomainDto> {
  const a = await edgeDomains({
    op: "add",
    tenant_id: tenantId,
    user_id: userId,
    host: input.host,
    from_local: input.fromLocal,
    from_name: input.fromName,
  });
  if (a.status !== 200 || a.body?.ok !== true) throw refusal(a, "added");
  return a.body.domain as SendingDomainDto;
}

export async function checkSendingDomain(
  tenantId: string,
  userId: string,
  domainId: string,
): Promise<SendingDomainDto> {
  const a = await edgeDomains({ op: "check", tenant_id: tenantId, user_id: userId, domain_id: domainId });
  if (a.status !== 200 || a.body?.ok !== true) throw refusal(a, "checked");
  return a.body.domain as SendingDomainDto;
}

export async function resumeSendingDomain(
  tenantId: string,
  userId: string,
  domainId: string,
): Promise<SendingDomainDto> {
  const a = await edgeDomains({ op: "resume", tenant_id: tenantId, user_id: userId, domain_id: domainId });
  if (a.status !== 200 || a.body?.ok !== true) throw refusal(a, "resumed");
  return a.body.domain as SendingDomainDto;
}

export async function removeSendingDomain(tenantId: string, userId: string, domainId: string): Promise<void> {
  const a = await edgeDomains({ op: "remove", tenant_id: tenantId, user_id: userId, domain_id: domainId });
  if (a.status !== 200 || a.body?.ok !== true) throw refusal(a, "removed");
}
