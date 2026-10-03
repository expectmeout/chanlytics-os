/**
 * Where a domain's rows and the cold account disagree: a host another workspace reserved and never verified (takeOver),
 * and a domain the account holds that no row names, from a create whose answer was lost (adoptByName). Moved whole from
 * sending-domains.ts.
 */
import { deleteSendingDomainAsRead, emitEvent, type SendingDomainHolder } from "../packages/db.js";
import {
  createMailDomain,
  findMailDomain,
  getMailDomain,
  removeMailDomain,
  type ProviderDomain,
} from "../packages/channels.js";
import { HOUR_MS, MIN_MS, type DomainRecord } from "../packages/contracts.js";
import type { DomainPorts } from "./sending-domain-ports.js";

/** A host another workspace reserved and never verified is theirs this long: the provider's own verification window. */
const UNVERIFIED_HOLD_MS = 72 * HOUR_MS;

/**
 * Whether a host another workspace holds may be taken from it: reserved, never verified, and older than the
 * provider's verification window. Its provider domain and its row go, said on that workspace's own ledger. A host
 * that ever verified is its holder's until they remove it.
 */
export async function takeOver(
  p: DomainPorts,
  tenantId: string,
  host: string,
  holder: SendingDomainHolder,
): Promise<boolean> {
  if (holder.tenant_id === tenantId || holder.state !== "records") return false;
  // Records the provider already reads, even partly, are the holder's own work at their registrar: never taken.
  if (holder.provider_status === "verified" || holder.provider_status === "partially_verified") return false;
  if (p.now() - Date.parse(holder.created_at) < UNVERIFIED_HOLD_MS) return false;
  // The sweep never reads a domain still in records, so the row's word may be old: the provider is asked now, and a
  // domain whose records it reads, even partly, is the holder's own work at their registrar.
  if (holder.provider_domain_id) {
    const now = await getMailDomain(p.cfg, holder.provider_domain_id);
    if (!now.ok) return false;
    if (now.value && (now.value.status === "verified" || now.value.status === "partially_verified")) return false;
  }
  // The provider says "not started" until someone presses Check, so its word cannot tell a holder who never came back
  // from one who published every record and never pressed it. DNS can: a holder's DKIM key at their registrar is
  // their work, and the host stays theirs. A DNS that cannot be read keeps it theirs too.
  const records = Array.isArray(holder.records) ? (holder.records as unknown as DomainRecord[]) : [];
  if ((await p.dkim(host, records)) !== false) return false;
  // The row first, as it was read (a holder who pressed Check in the meantime keeps it), then the provider's domain:
  // a provider that will not remove it now leaves a domain no row names, said, rather than a row naming none.
  if (!(await deleteSendingDomainAsRead(p.db, holder))) return false;
  if (holder.provider_domain_id) {
    const gone = await removeMailDomain(p.cfg, holder.provider_domain_id);
    if (!gone.ok)
      p.log.error("sending_domain_left_at_provider", {
        host,
        provider_domain_id: holder.provider_domain_id,
        status: gone.status,
      });
  }
  const data = { host, why: "unverified" };
  await emitEvent(p.db, holder.tenant_id, "sending_domain.removed", "sending_domain", holder.id, data);
  p.log.info("sending_domain_taken_over", { host, from: holder.tenant_id, to: tenantId });
  return true;
}

/** How far the provider's clock may run behind ours and a domain this press made still read as made by it. */
const ADOPT_SKEW_MS = 10 * MIN_MS;

/**
 * The account's own domain by this name, for a create whose answer was lost; null when it has none, or it could not be
 * asked. Adopted only when this very press made it (the provider made it after the reservation): its keys are then
 * nobody's yet. One the account already holds verified is never adopted: its keys and records are whoever verified
 * it. An older one, left behind by a removal or a takeover whose provider side did not finish, carries keys another
 * workspace was given and may have published, and adopting it would let this workspace verify against their DNS and
 * send as them: it is removed, and made again with keys of its own.
 */
export async function adoptByName(
  p: DomainPorts,
  host: string,
  reservedAt: string,
): Promise<ProviderDomain | "verified_elsewhere" | null> {
  const found = await findMailDomain(p.cfg, host);
  if (!found.ok || !found.value) return null;
  const read = await getMailDomain(p.cfg, found.value.id);
  if (!read.ok || !read.value) return null;
  if (read.value.status === "verified" || read.value.status === "partially_verified") return "verified_elsewhere";
  const madeAt = read.value.createdAt ? Date.parse(read.value.createdAt) : NaN;
  if (Number.isFinite(madeAt) && madeAt >= Date.parse(reservedAt) - ADOPT_SKEW_MS) {
    p.log.warn("sending_domain_adopted", { host, provider_domain_id: read.value.id });
    return read.value;
  }
  const gone = await removeMailDomain(p.cfg, read.value.id);
  if (!gone.ok) {
    p.log.error("sending_domain_left_at_provider", { host, provider_domain_id: read.value.id, status: gone.status });
    return null;
  }
  p.log.warn("sending_domain_remade", { host, provider_domain_id: read.value.id });
  const again = await createMailDomain(p.cfg, host);
  return again.ok ? again.value : null;
}
