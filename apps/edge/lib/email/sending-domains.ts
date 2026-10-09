/**
 * A workspace's own sending domains, on the edge: added at the cold mail account, checked there and in DNS, removed,
 * and the owner told when one is held. Reach out, Part 2 (docs/superpowers/plans/2026-09-25-reach-out-part-2-the-wire.md).
 *
 * What a domain's facts MEAN is contracts' (sending-domains.ts judgeDomain): this file holds the owner's acts, add,
 * resume and remove, and re-exports what the callers take of the rest: the check and the complaint hold
 * (sending-domain-check.ts), the shared ports and the row as the page is told it (sending-domain-ports.ts). The
 * disagreements between a row and the account (sending-domain-provider.ts) and the holds and their notices
 * (sending-domain-holds.ts) are theirs. A change is written onto the row that was read, and said: an event per change,
 * and a notification when a domain is held. The admin door (api/admin/sending-domains.ts) and the clock
 * (api/cron/domains.ts) are its two callers.
 */
import {
  applyDomainCheck,
  countSendingDomains,
  deleteSendingDomain,
  emitEvent,
  platformHoldStands,
  recordProviderDomain,
  reserveSendingDomain,
  touchSendingDomain,
  type Json,
  type SendingDomainRow,
} from "../packages/db.js";
import { createMailDomain, findMailDomain, removeMailDomain } from "../packages/channels.js";
import {
  domainPatchOf,
  normalizeFromLocal,
  normalizeHost,
  resumeDomain,
  whyNotAFromLocal,
  whyNotAFromName,
  whyNotASendingHost,
  PLATFORM_HOLD_READD,
  PLATFORM_HOLD_REFUSAL,
  REPUTATION_MEMORY_MS,
  SENDING_DOMAINS_MAX,
  type DomainResumer,
} from "../packages/contracts.js";
import { emailDomain } from "./email.js";
import { checkSendingDomain } from "./sending-domain-check.js";
import { tellDomainResumed } from "./sending-domain-holds.js";
import { domainDto, say, stateOf, type DoorAnswer, type DomainPorts } from "./sending-domain-ports.js";
import { adoptByName, takeOver } from "./sending-domain-provider.js";

export { checkSendingDomain, holdForComplaint } from "./sending-domain-check.js";
export { domainDto, type DomainPorts } from "./sending-domain-ports.js";

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
  // Removed while its hold was the platform's (D16): added again, it would start over clean and lift that hold by another
  // name. Its memory is the platform's thirty days.
  const since = new Date(p.now() - REPUTATION_MEMORY_MS).toISOString();
  if (await platformHoldStands(p.db, { tenantId: i.tenantId, host, sinceIso: since }))
    return say(409, "platform_hold", PLATFORM_HOLD_READD);
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
    if (held.holder?.tenant_id === i.tenantId)
      return say(409, "host_taken", "This workspace already sends from that domain.");
    // Another workspace's: nobody here can settle whose it is, so the platform is told and the owner is told so.
    await p.page?.(
      `sending_domain_conflict:${host}`,
      `sending domain: ${host} is held by another workspace`,
      `A workspace tried to add ${host}, which workspace ${held.holder?.tenant_id ?? "?"} holds. Only a person can settle whose it is.`,
    );
    return say(409, "host_taken", "That domain is already in use. We've been told and will get in touch.");
  }
  const reservation = held.row;
  const made = await createMailDomain(p.cfg, host);
  let domain = made.ok ? made.value : null;
  if (!made.ok) {
    // Whatever the failure, the account may hold a domain by this name: made by this create before its answer was
    // lost, or by an earlier one whose reservation is gone. Only this create's own is adopted; an older one is made
    // again with keys of its own, and one the account holds verified is somebody's, never taken (adoptByName).
    const adopted = await adoptByName(p, host, reservation.created_at);
    if (adopted === "verified_elsewhere") {
      await deleteSendingDomain(p.db, i.tenantId, reservation.id).catch((e) =>
        p.log.error("sending_domain_reservation_left", { domain: reservation.id, error: String(e) }),
      );
      await p.page?.(
        `sending_domain_conflict:${host}`,
        `sending domain: ${host} is already verified at the cold account`,
        `A workspace tried to add ${host}, which the cold account already holds verified with no workspace's row. It was not adopted: its keys are somebody else's. A person must remove it at the account, or find its owner.`,
      );
      return say(409, "host_elsewhere", "That domain is set up somewhere else. We've been told and will get in touch.");
    }
    domain = adopted;
    if (!domain) {
      await deleteSendingDomain(p.db, i.tenantId, reservation.id).catch((e) =>
        p.log.error("sending_domain_reservation_left", { domain: reservation.id, error: String(e) }),
      );
      p.log.warn("sending_domain_refused", { tenant_id: i.tenantId, host, status: made.status, message: made.message });
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
  await emitEvent(p.db, i.tenantId, "sending_domain.added", "sending_domain", row.id, { host, by: i.by });
  return { ok: true, domain: domainDto(row) };
}

const tooMany = (): DoorAnswer =>
  say(409, "too_many", `A workspace sends from ${SENDING_DOMAINS_MAX} domains at most.`);

/**
 * A domain held for its reputation, resumed: sending again at the ramp's first step, its counts cleared with the window
 * they counted. Its owner resumes it, unless it was held twice in thirty days (resume_by platform, D16): then only the
 * platform does, and the owner's press is refused in words that say so. A DNS hold is nobody's to lift (Check lifts it
 * when the records pass). Whoever resumed it, the next hold is its owner's to lift again, until a second in thirty days.
 */
export async function resumeSendingDomain(
  p: DomainPorts,
  row: SendingDomainRow,
  by: DomainResumer = "owner",
): Promise<DoorAnswer> {
  const judged = resumeDomain(stateOf(row), new Date(p.now()).toISOString());
  if (judged.change !== "resumed")
    return row.state === "held"
      ? say(409, "dns_hold", "Press Check: this one lifts itself when it reads right again.")
      : say(409, "not_held", `${row.host} isn't held.`);
  if (row.resume_by === "platform" && by !== "platform") return say(409, "platform_hold", PLATFORM_HOLD_REFUSAL);
  const written = await applyDomainCheck(p.db, row, {
    ...domainPatchOf(judged),
    sent_recent: null,
    bounced_recent: null,
    complaints: null,
    sent_days: null,
    resume_by: "owner",
  });
  if (!written) return say(409, "moved", `${row.host} changed just now. Look again, then resume it.`);
  const data = { host: row.host, ...(row.held_why ? { why: row.held_why } : {}), by };
  await emitEvent(p.db, row.tenant_id, "sending_domain.resumed", "sending_domain", row.id, data);
  // The platform lifted what its owner could not: the owner is told, as the hold's notice promised.
  if (by === "platform") await tellDomainResumed(p, written);
  // Read now, not at the next tick: a reputation hold is never read while it stands, so records that broke meanwhile
  // (a DNS hold the bounces took the place of) would otherwise send for up to a tick before they held it again.
  // Best effort: the resume is written, and the sweep reads it anyway.
  const read = await checkSendingDomain(p, written, { verify: false }).catch((e) => {
    p.log.warn("sending_domain_resume_unread", { domain: row.id, error: e instanceof Error ? e.message : String(e) });
    return null;
  });
  return { ok: true, domain: domainDto(read?.row ?? written) };
}

/**
 * An owner removes a domain: gone at the provider (already gone is gone), then the row, then said once. The row is
 * touched first, so a check already in flight -- which would read the provider's 404 as a domain that stopped
 * verifying, and hold it, and tell the owner -- finds it moved and writes nothing.
 */
export async function removeSendingDomain(
  p: DomainPorts,
  row: SendingDomainRow,
  by: string | null = null,
): Promise<DoorAnswer | { ok: true }> {
  await touchSendingDomain(p.db, row);
  let providerId = row.provider_domain_id;
  if (!providerId) {
    // A reservation that never learned its id may still have made one: asked by name, and "could not ask" keeps the
    // row, so nothing is left at the account that no row names.
    const found = await findMailDomain(p.cfg, row.host);
    if (!found.ok)
      return say(502, "provider", `The mail provider could not be asked about ${row.host} just now. Try again.`);
    providerId = found.value?.id ?? null;
  }
  if (providerId) {
    const gone = await removeMailDomain(p.cfg, providerId);
    if (!gone.ok) return say(502, "provider", `The mail provider could not remove ${row.host} just now. Try again.`);
  }
  if (await deleteSendingDomain(p.db, row.tenant_id, row.id)) {
    const data = { host: row.host, by };
    await emitEvent(p.db, row.tenant_id, "sending_domain.removed", "sending_domain", row.id, data);
  }
  return { ok: true };
}
