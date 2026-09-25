/**
 * A workspace's own sending domains, on the edge: added at the cold mail account, checked there and in DNS, removed,
 * and the owner told when one is held. Reach out, Part 2 (docs/superpowers/plans/2026-09-25-reach-out-part-2-the-wire.md).
 *
 * What a domain's facts MEAN is contracts' (sending-domains.ts judgeDomain): this file reads the facts, writes what
 * the judge decided onto the row it read, and says so -- an event per change, and a notification when a domain is
 * held. The admin door (api/admin/sending-domains.ts) and the clock (api/cron/domains.ts) are its two callers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyDomainCheck,
  countSendingDomains,
  deleteSendingDomain,
  emitEvent,
  recordProviderDomain,
  reserveSendingDomain,
  touchSendingDomain,
  type Database,
  type Json,
  type SendingDomainHolder,
  type SendingDomainRow,
} from "../packages/db.js";
import {
  createMailDomain,
  findMailDomain,
  getMailDomain,
  removeMailDomain,
  verifyMailDomain,
  type ProviderDomain,
  type ResendConfig,
} from "../packages/channels.js";
import {
  domainHoldWords,
  judgeDomain,
  normalizeFromLocal,
  normalizeHost,
  whyNotAFromLocal,
  whyNotAFromName,
  whyNotASendingHost,
  SENDING_DOMAINS_MAX,
  type DomainHold,
  type DomainRecord,
  type SendingDomainDto,
} from "../packages/contracts.js";
import { notify } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { emailDomain } from "./email.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

export interface DomainPorts {
  db: Db;
  /** The cold account's key (env RESEND_COLD_API_KEY). */
  cfg: ResendConfig;
  /** DMARC at the host or a parent (dmarc.ts readDmarc); null when DNS could not be read. */
  dmarc: (host: string) => Promise<"found" | "missing" | null>;
  now: () => number;
  log: Logger;
}

/** A row as the page is told about it: the address it sends as, and never the provider's id. */
export function domainDto(row: SendingDomainRow): SendingDomainDto {
  return {
    id: row.id,
    host: row.host,
    from_local: row.from_local,
    from_name: row.from_name,
    address: `${row.from_local}@${row.host}`,
    state: row.state as SendingDomainDto["state"],
    held_why: (row.held_why ?? null) as SendingDomainDto["held_why"],
    held_at: row.held_at,
    verified_at: row.verified_at,
    clean_since: row.clean_since,
    provider_status: row.provider_status,
    dmarc: (row.dmarc ?? null) as SendingDomainDto["dmarc"],
    records: Array.isArray(row.records) ? (row.records as unknown as DomainRecord[]) : [],
    checked_at: row.checked_at,
    created_at: row.created_at,
  };
}

export type DoorAnswer =
  { ok: true; domain: SendingDomainDto } | { ok: false; status: number; error: string; message: string };

const say = (status: number, error: string, message: string): DoorAnswer => ({ ok: false, status, error, message });

/** A host another workspace reserved and never verified is theirs this long: the provider's own verification window. */
export const UNVERIFIED_HOLD_MS = 72 * 3600_000;

/**
 * An owner adds a domain: judged here first, held for this workspace, then created at the provider.
 *
 * Nothing half-made is left behind, whichever step fails. A reservation whose create is refused goes. A create whose
 * answer was lost (a timeout, a 5xx, a shape that is not a domain) may have made the domain anyway, so the account's
 * own list is asked and a domain by that name is adopted, rather than left at the account with no row. A row that
 * cannot be written takes the provider's domain with it.
 */
export async function addSendingDomain(
  p: DomainPorts,
  i: { tenantId: string; host: string; fromLocal: string; fromName: string; by: string | null },
): Promise<DoorAnswer> {
  const problem =
    whyNotASendingHost(i.host, { mailDomain: emailDomain() }) ??
    whyNotAFromLocal(i.fromLocal) ??
    whyNotAFromName(i.fromName);
  if (problem) return say(400, "invalid", problem);
  if ((await countSendingDomains(p.db, i.tenantId)) >= SENDING_DOMAINS_MAX) return tooMany();
  const host = normalizeHost(i.host);
  const reserve = () =>
    reserveSendingDomain(p.db, {
      tenantId: i.tenantId,
      host,
      fromLocal: normalizeFromLocal(i.fromLocal),
      fromName: i.fromName.trim(),
      by: i.by,
    });
  let held = await reserve();
  if (!held.ok && held.reason === "taken" && held.holder && (await takeOver(p, i.tenantId, host, held.holder)))
    held = await reserve();
  if (!held.ok) {
    if (held.reason === "too_many") return tooMany();
    return held.holder?.tenant_id === i.tenantId
      ? say(409, "host_taken", "This workspace already sends from that domain.")
      : say(409, "host_taken", "That domain is already in use. If it's yours, write to us and we'll sort it out.");
  }
  const reservation = held.row;
  const made = await createMailDomain(p.cfg, host);
  let domain = made.ok ? made.value : null;
  if (!made.ok) {
    domain = await adoptByName(p, host);
    if (!domain) {
      await deleteSendingDomain(p.db, i.tenantId, reservation.id).catch((e) =>
        p.log.error("sending_domain_reservation_left", { domain: reservation.id, error: String(e) }),
      );
      p.log.warn("sending_domain_refused", { tenant: i.tenantId, host, status: made.status, message: made.message });
      return made.status === 0 || made.status >= 500
        ? say(502, "provider", "The mail provider didn't answer. Try again in a minute.")
        : say(502, "provider", `The mail provider would not take ${host}: ${made.message}`);
    }
  }
  const madeDomain = domain!;
  let row: SendingDomainRow;
  try {
    row = await recordProviderDomain(p.db, reservation.id, {
      providerDomainId: madeDomain.id,
      records: madeDomain.records as unknown as Json,
      providerStatus: madeDomain.status,
    });
  } catch (e) {
    // The account has a domain no row names: it goes too, so nothing is stranded where nothing lists it.
    await removeMailDomain(p.cfg, madeDomain.id).catch(() => null);
    await deleteSendingDomain(p.db, i.tenantId, reservation.id).catch(() => false);
    throw e;
  }
  await emitEvent(p.db, i.tenantId, "sending_domain.added", "setup", "sending_domain", row.id, { host } as Json);
  return { ok: true, domain: domainDto(row) };
}

const tooMany = (): DoorAnswer =>
  say(409, "too_many", `A workspace sends from ${SENDING_DOMAINS_MAX} domains at most.`);

/**
 * Whether a host another workspace holds may be taken from it: reserved, never verified, and older than the
 * provider's verification window. Its provider domain and its row go, said on that workspace's own ledger. A host
 * that ever verified is its holder's until they remove it.
 */
async function takeOver(p: DomainPorts, tenantId: string, host: string, holder: SendingDomainHolder): Promise<boolean> {
  if (holder.tenant_id === tenantId || holder.state !== "records") return false;
  if (p.now() - Date.parse(holder.created_at) < UNVERIFIED_HOLD_MS) return false;
  if (holder.provider_domain_id) {
    const gone = await removeMailDomain(p.cfg, holder.provider_domain_id);
    if (!gone.ok) return false;
  }
  if (!(await deleteSendingDomain(p.db, holder.tenant_id, holder.id))) return false;
  const data = { host, why: "unverified" } as Json;
  await emitEvent(p.db, holder.tenant_id, "sending_domain.removed", "setup", "sending_domain", holder.id, data);
  p.log.info("sending_domain_taken_over", { host, from: holder.tenant_id, to: tenantId });
  return true;
}

/** The account's own domain by this name, read whole; null when it has none, or it could not be asked. */
async function adoptByName(p: DomainPorts, host: string): Promise<ProviderDomain | null> {
  const found = await findMailDomain(p.cfg, host);
  if (!found.ok || !found.value) return null;
  const read = await getMailDomain(p.cfg, found.value.id);
  if (!read.ok || !read.value) return null;
  p.log.warn("sending_domain_adopted", { host, provider_domain_id: read.value.id });
  return read.value;
}

export interface CheckOutcome {
  /** The row as written; null when another writer changed it first, or it is gone. */
  row: SendingDomainRow | null;
  change: "verified" | "held" | "released" | null;
  /** The provider could not be asked: nothing was judged. */
  unreadable: boolean;
  /** The provider's answer when it could not be asked (0: never reached it); what the clock's alarm is judged by. */
  status?: number;
}

/**
 * Read a domain where it stands and write what the judge makes of it. `verify` is the owner's Check: the provider is
 * asked to look again first (asynchronously, at its end), and what it already knows is read now. A verified domain is
 * never asked: the provider marks a domain pending when it is, whatever it was, and a verified domain is re-read by
 * the provider on its own.
 */
export async function checkSendingDomain(
  p: DomainPorts,
  given: SendingDomainRow,
  o: { verify: boolean },
): Promise<CheckOutcome> {
  const nowIso = new Date(p.now()).toISOString();
  let row = given;
  // A reservation whose create answered nothing we could keep: the account's own list says whether it made one.
  if (!row.provider_domain_id) {
    const adopted = await adoptByName(p, row.host);
    if (!adopted) return { row, change: null, unreadable: true, status: 0 };
    row = await recordProviderDomain(p.db, row.id, {
      providerDomainId: adopted.id,
      records: adopted.records as unknown as Json,
      providerStatus: adopted.status,
    });
  }
  const providerId = row.provider_domain_id!;
  if (o.verify && row.state !== "verified") {
    const asked = await verifyMailDomain(p.cfg, providerId);
    if (!asked.ok)
      p.log.warn("sending_domain_verify_refused", { domain: row.id, status: asked.status, message: asked.message });
  }
  const [read, dmarc] = await Promise.all([getMailDomain(p.cfg, providerId), p.dmarc(row.host)]);
  if (!read.ok) {
    p.log.error("sending_domain_unreadable", {
      domain: row.id,
      host: row.host,
      status: read.status,
      message: read.message,
    });
    return { row, change: null, unreadable: true, status: read.status };
  }
  // The provider no longer has it: a domain that cannot verify, whatever it said before.
  const providerStatus = read.value ? read.value.status : "not_found";
  const judged = judgeDomain(
    {
      state: row.state as SendingDomainDto["state"],
      held_why: (row.held_why ?? null) as DomainHold | null,
      held_at: row.held_at,
      verified_at: row.verified_at,
      clean_since: row.clean_since,
      dmarc: (row.dmarc ?? null) as SendingDomainDto["dmarc"],
    },
    { provider: providerStatus, dmarc },
    nowIso,
  );
  const written = await applyDomainCheck(p.db, row, {
    state: judged.state,
    held_why: judged.held_why,
    held_at: judged.held_at,
    verified_at: judged.verified_at,
    clean_since: judged.clean_since,
    provider_status: providerStatus,
    dmarc: judged.dmarc,
    ...(read.value ? { records: read.value.records as unknown as Json } : {}),
    checked_at: nowIso,
  });
  if (!written) return { row: null, change: null, unreadable: false };
  if (judged.change) {
    const data = { host: row.host, ...(judged.held_why ? { why: judged.held_why } : {}) } as Json;
    await emitEvent(
      p.db,
      row.tenant_id,
      judged.change === "verified"
        ? "sending_domain.verified"
        : judged.change === "held"
          ? "sending_domain.held"
          : "sending_domain.released",
      "setup",
      "sending_domain",
      row.id,
      data,
    );
    if (judged.change === "held" && judged.held_why) await tellDomainHeld(p, written, judged.held_why);
  }
  return { row: written, change: judged.change, unreadable: false };
}

/** The owner, told: the bell, and email where the workspace has somebody on file. Best effort: the row already says it. */
async function tellDomainHeld(p: DomainPorts, row: SendingDomainRow, why: DomainHold): Promise<void> {
  const because = domainHoldWords(why);
  try {
    const addressing = await loadTenantNotifications(p.db, row.tenant_id);
    await notify(
      { tenantId: row.tenant_id, ...addressing },
      {
        kind: "sweep",
        route: "admin/integrations",
        about: { type: "sending_domain", id: row.id },
        subject: `${row.host} is held: ${because}`,
        body:
          `Nothing leaves from ${row.host} until it's fixed, because ${because}.\n\n` +
          `Connections has the details, under Email.`,
        redactedBody: "A workspace's sending domain was held.",
      },
    );
  } catch (e) {
    p.log.error("sending_domain_tell_failed", { domain: row.id, error: String(e) });
  }
}

/**
 * An owner removes a domain: gone at the provider (already gone is gone), then the row, then said once. The row is
 * touched first, so a check already in flight -- which would read the provider's 404 as a domain that stopped
 * verifying, and hold it, and tell the owner -- finds it moved and writes nothing.
 */
export async function removeSendingDomain(p: DomainPorts, row: SendingDomainRow): Promise<DoorAnswer | { ok: true }> {
  await touchSendingDomain(p.db, row);
  const providerId =
    row.provider_domain_id ?? (await findMailDomain(p.cfg, row.host).then((f) => (f.ok ? f.value?.id : null)));
  if (providerId) {
    const gone = await removeMailDomain(p.cfg, providerId);
    if (!gone.ok) return say(502, "provider", `The mail provider could not remove ${row.host} just now. Try again.`);
  }
  if (await deleteSendingDomain(p.db, row.tenant_id, row.id)) {
    const data = { host: row.host } as Json;
    await emitEvent(p.db, row.tenant_id, "sending_domain.removed", "setup", "sending_domain", row.id, data);
  }
  return { ok: true };
}
