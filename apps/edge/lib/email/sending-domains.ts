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
  type Database,
  type Json,
  type SendingDomainRow,
} from "../packages/db.js";
import {
  createMailDomain,
  getMailDomain,
  removeMailDomain,
  verifyMailDomain,
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

/** An owner adds a domain: judged here first, held for this workspace, then created at the provider. */
export async function addSendingDomain(
  p: DomainPorts,
  i: { tenantId: string; host: string; fromLocal: string; fromName: string; by: string | null },
): Promise<DoorAnswer> {
  const problem =
    whyNotASendingHost(i.host, { mailDomain: emailDomain() }) ??
    whyNotAFromLocal(i.fromLocal) ??
    whyNotAFromName(i.fromName);
  if (problem) return say(400, "invalid", problem);
  if ((await countSendingDomains(p.db, i.tenantId)) >= SENDING_DOMAINS_MAX)
    return say(409, "too_many", `A workspace sends from ${SENDING_DOMAINS_MAX} domains at most.`);
  const host = normalizeHost(i.host);
  const held = await reserveSendingDomain(p.db, {
    tenantId: i.tenantId,
    host,
    fromLocal: normalizeFromLocal(i.fromLocal),
    fromName: i.fromName.trim(),
    by: i.by,
  });
  if (!held.ok) return say(409, "host_taken", "Another workspace already sends from that domain.");
  const made = await createMailDomain(p.cfg, host);
  if (!made.ok) {
    // Nothing half-made is left behind: the reservation goes, so the owner can try again.
    await deleteSendingDomain(p.db, i.tenantId, held.row.id).catch((e) =>
      p.log.error("sending_domain_reservation_left", { domain: held.row.id, error: String(e) }),
    );
    p.log.warn("sending_domain_refused", { tenant: i.tenantId, host, status: made.status, message: made.message });
    return say(502, "provider", `The mail provider would not take ${host}: ${made.message}`);
  }
  const row = await recordProviderDomain(p.db, held.row.id, {
    providerDomainId: made.value.id,
    records: made.value.records as unknown as Json,
    providerStatus: made.value.status,
  });
  await emitEvent(p.db, i.tenantId, "sending_domain.added", "setup", "sending_domain", row.id, { host } as Json);
  return { ok: true, domain: domainDto(row) };
}

export interface CheckOutcome {
  /** The row as written; null when another writer changed it first, or it is gone. */
  row: SendingDomainRow | null;
  change: "verified" | "held" | "released" | null;
  /** The provider could not be asked: nothing was judged. */
  unreadable: boolean;
}

/**
 * Read a domain where it stands and write what the judge makes of it. `verify` is the owner's Check: the provider is
 * asked to look again first (asynchronously, at its end), and what it already knows is read now.
 */
export async function checkSendingDomain(
  p: DomainPorts,
  row: SendingDomainRow,
  o: { verify: boolean },
): Promise<CheckOutcome> {
  const nowIso = new Date(p.now()).toISOString();
  if (!row.provider_domain_id) return { row, change: null, unreadable: true };
  if (o.verify) {
    const asked = await verifyMailDomain(p.cfg, row.provider_domain_id);
    if (!asked.ok)
      p.log.warn("sending_domain_verify_refused", { domain: row.id, status: asked.status, message: asked.message });
  }
  const [read, dmarc] = await Promise.all([getMailDomain(p.cfg, row.provider_domain_id), p.dmarc(row.host)]);
  if (!read.ok) {
    p.log.error("sending_domain_unreadable", {
      domain: row.id,
      host: row.host,
      status: read.status,
      message: read.message,
    });
    return { row, change: null, unreadable: true };
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
    ...(dmarc ? { dmarc } : {}),
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

/** An owner removes a domain: gone at the provider (already gone is gone), then the row, then said. */
export async function removeSendingDomain(p: DomainPorts, row: SendingDomainRow): Promise<DoorAnswer | { ok: true }> {
  if (row.provider_domain_id) {
    const gone = await removeMailDomain(p.cfg, row.provider_domain_id);
    if (!gone.ok) return say(502, "provider", `The mail provider could not remove ${row.host} just now. Try again.`);
  }
  await deleteSendingDomain(p.db, row.tenant_id, row.id);
  await emitEvent(p.db, row.tenant_id, "sending_domain.removed", "setup", "sending_domain", row.id, {
    host: row.host,
  } as Json);
  return { ok: true };
}
