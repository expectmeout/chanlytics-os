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
  deleteSendingDomainAsRead,
  domainHeldSince,
  emitEvent,
  recordProviderDomain,
  reserveSendingDomain,
  sendingDomainByHost,
  sendingDomainCounts,
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
  domainHoldFixWords,
  domainHoldWords,
  domainPatchOf,
  DNS_HOLDS,
  judgeDomain,
  sendingDomainDtoOf,
  resumeDomain,
  normalizeFromLocal,
  normalizeHost,
  whyNotAFromLocal,
  whyNotAFromName,
  whyNotASendingHost,
  SENDING_DOMAINS_MAX,
  type DomainCounts,
  type DomainHold,
  type DomainJudgement,
  type DomainRowState,
  type SendingDomainDto,
} from "../packages/contracts.js";
import { notify } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { emailDomain } from "./email.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;
type DomainJudgementChange = DomainJudgement["change"];

export interface DomainPorts {
  db: Db;
  /** The platform's pager (ops/page-operator.ts): what is the account's, not a workspace's. Optional: a test may omit it. */
  page?: (key: string, subject: string, body: string) => Promise<unknown>;
  /** The cold account's key (env RESEND_COLD_API_KEY). */
  cfg: ResendConfig;
  /** DMARC at the host or a parent (dmarc.ts readDmarc); null when DNS could not be read. */
  dmarc: (host: string) => Promise<"found" | "missing" | null>;
  now: () => number;
  log: Logger;
}

/** A row as the page is told about it: contracts' one mapping, which never carries the provider's id. */
export function domainDto(row: SendingDomainRow): SendingDomainDto {
  return sendingDomainDtoOf(row);
}

/** The row's state, as the judge reads it. */
function stateOf(row: SendingDomainRow): DomainRowState {
  return {
    state: row.state as SendingDomainDto["state"],
    held_why: (row.held_why ?? null) as DomainHold | null,
    held_at: row.held_at,
    verified_at: row.verified_at,
    clean_since: row.clean_since,
    counted_since: row.counted_since,
    dmarc: (row.dmarc ?? null) as SendingDomainDto["dmarc"],
    provider_status: row.provider_status,
  };
}

/** Where a domain's reputation is counted from: its own clock (00178), or, for a row older than it, the ramp's. */
const countedSince = (row: SendingDomainRow): string | null => row.counted_since ?? row.clean_since;

/** A day: an owner hears of a domain's holds at most once in one. */
const HOLD_NOTICE_COOLDOWN_MS = 24 * 3600_000;

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
    // lost, or by an earlier one whose reservation is gone. It is looked for, and adopted only while unverified: one
    // the account holds verified is somebody's records and keys (adoptByName), never taken.
    const adopted = await adoptByName(p, host);
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
  const data = { host, why: "unverified" } as Json;
  await emitEvent(p.db, holder.tenant_id, "sending_domain.removed", "setup", "sending_domain", holder.id, data);
  p.log.info("sending_domain_taken_over", { host, from: holder.tenant_id, to: tenantId });
  return true;
}

/**
 * The account's own domain by this name, read whole; null when it has none, or it could not be asked. One the account
 * already holds verified is never adopted: its signing keys and its records are whoever verified it, and adopting it
 * would let this workspace send as them.
 */
async function adoptByName(p: DomainPorts, host: string): Promise<ProviderDomain | "verified_elsewhere" | null> {
  const found = await findMailDomain(p.cfg, host);
  if (!found.ok || !found.value) return null;
  const read = await getMailDomain(p.cfg, found.value.id);
  if (!read.ok || !read.value) return null;
  if (read.value.status === "verified" || read.value.status === "partially_verified") return "verified_elsewhere";
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
    if (!adopted || adopted === "verified_elsewhere") return { row, change: null, unreadable: true, status: 0 };
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
  // What a verified domain sent since it was clean: its bounces and complaints are what hold it. Our own rows, so they
  // are read whatever the provider says. A count that cannot be read judges nothing about reputation this time.
  const countOf = async (r: SendingDomainRow): Promise<DomainCounts | null> => {
    if (r.state !== "verified") return null;
    try {
      return await sendingDomainCounts(p.db, r.tenant_id, r.host, countedSince(r));
    } catch (e) {
      p.log.error("sending_domain_counts_unread", {
        domain: r.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  };
  const [read, dmarc, counts] = await Promise.all([getMailDomain(p.cfg, providerId), p.dmarc(row.host), countOf(row)]);
  const countsPatch = counts
    ? { sent_recent: counts.sent, bounced_recent: counts.bounced, complaints: counts.complained }
    : {};
  if (!read.ok) {
    p.log.error("sending_domain_unreadable", {
      domain: row.id,
      host: row.host,
      status: read.status,
      message: read.message,
    });
    // The provider could not be asked, and a complaint still holds: nothing else is judged. The attempt is the row's
    // read time either way, so a domain the provider will not answer for waits its turn instead of heading every tick.
    const own = judgeDomain(stateOf(row), { provider: null, dmarc: null, counts }, nowIso);
    const held = await applyDomainCheck(p.db, row, {
      ...(own.change === "held" ? domainPatchOf(own) : {}),
      ...countsPatch,
      checked_at: nowIso,
    });
    if (held && own.change === "held") await sayDomainChange(p, row, held, own);
    return {
      row: held,
      change: held && own.change === "held" ? "held" : null,
      unreadable: true,
      status: read.status,
    };
  }
  // The provider no longer has it: a domain that cannot verify, whatever it said before.
  const providerStatus = read.value ? read.value.status : "not_found";
  const judged = judgeDomain(stateOf(row), { provider: providerStatus, dmarc, counts }, nowIso);
  const written = await applyDomainCheck(p.db, row, {
    ...domainPatchOf(judged),
    provider_status: providerStatus,
    ...(read.value ? { records: read.value.records as unknown as Json } : {}),
    ...countsPatch,
    checked_at: nowIso,
  });
  if (!written) return { row: null, change: null, unreadable: false };
  await sayDomainChange(p, row, written, judged);
  return { row: written, change: judged.change === "resumed" ? null : judged.change, unreadable: false };
}

/**
 * A check's change, said: one event, and who must act told when it was a hold. The owner, for what their records or
 * their mail did, at most once a day; the platform, for a domain the provider no longer knows (the account's fact,
 * which no owner can fix). Nothing when nothing changed.
 */
async function sayDomainChange(
  p: Pick<DomainPorts, "db" | "log" | "page"> & { now?: () => number },
  row: SendingDomainRow,
  written: SendingDomainRow,
  judged: { change: DomainJudgementChange; held_why: DomainHold | null },
): Promise<void> {
  if (judged.change && judged.change !== "resumed") {
    const data = { host: row.host, ...(judged.held_why ? { why: judged.held_why } : {}) } as Json;
    // A DNS hold tells its owner once a day, however often the records flap; a reputation hold always tells (only
    // they can resume it), and a provider hold tells the platform instead. Asked before this hold is written.
    const toldToday =
      judged.change === "held" && judged.held_why && DNS_HOLDS.includes(judged.held_why)
        ? await domainHeldSince(
            p.db,
            row.tenant_id,
            row.id,
            new Date((p.now ?? Date.now)() - HOLD_NOTICE_COOLDOWN_MS).toISOString(),
            DNS_HOLDS,
          ).catch(() => false)
        : false;
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
    if (judged.change === "held" && judged.held_why === "provider")
      await p.page?.(
        "sending_domain_provider_lost",
        "sending domain: the cold account no longer has a domain",
        `The cold mail account answered that it has no domain ${row.host} (workspace ${row.tenant_id}). It is held, and sends again by itself if the account has it again. Many at once is the account, not the domains.`,
      );
    else if (judged.change === "held" && judged.held_why && !toldToday)
      await tellDomainHeld(p, written, judged.held_why);
  }
}

/**
 * A complaint just landed on an email from one of this workspace's own domains: the domain is judged now, from its
 * own counts, rather than at the next ten-minute sweep, so a domain drawing complaints stops at the first. Only a
 * verified domain can be held for its reputation; anything else is left to the sweep. Best-effort by contract: the
 * receipt is already applied, and the sweep holds the domain anyway.
 */
export async function holdForComplaint(
  p: Pick<DomainPorts, "db" | "log" | "now">,
  tenantId: string,
  host: string,
): Promise<"held" | "unchanged"> {
  const row = await sendingDomainByHost(p.db, tenantId, host);
  if (!row || row.state !== "verified") return "unchanged";
  const nowIso = new Date(p.now()).toISOString();
  const counts = await sendingDomainCounts(p.db, row.tenant_id, row.host, countedSince(row));
  const judged = judgeDomain(stateOf(row), { provider: null, dmarc: null, counts }, nowIso);
  if (judged.change !== "held") return "unchanged";
  const patch = {
    ...domainPatchOf(judged),
    sent_recent: counts.sent,
    bounced_recent: counts.bounced,
    complaints: counts.complained,
  };
  // Written only onto the row as read. Another writer since (the sweep, an owner's Check) wins once; the row is read
  // again and judged again, so the complaint is not left to the next tick.
  let written = await applyDomainCheck(p.db, row, patch);

  if (!written) {
    const again = await sendingDomainByHost(p.db, tenantId, host);
    if (!again || again.state !== "verified") return "unchanged";

    written = await applyDomainCheck(p.db, again, patch);
    if (!written) return "unchanged";
  }
  await sayDomainChange(p, row, written, judged);
  return "held";
}

/**
 * The owner resumes a domain held for its reputation: sending again at the ramp's first step, its counts cleared
 * with the window they counted. A DNS hold is not the owner's to lift (Check lifts it when the records pass).
 */
export async function resumeSendingDomain(p: DomainPorts, row: SendingDomainRow): Promise<DoorAnswer> {
  const judged = resumeDomain(stateOf(row), new Date(p.now()).toISOString());
  if (judged.change !== "resumed")
    return row.state === "held"
      ? say(409, "dns_hold", "Press Check: this one lifts itself when it reads right again.")
      : say(409, "not_held", `${row.host} isn't held.`);
  const written = await applyDomainCheck(p.db, row, {
    ...domainPatchOf(judged),
    sent_recent: null,
    bounced_recent: null,
    complaints: null,
  });
  if (!written) return say(409, "moved", `${row.host} changed just now. Look again, then resume it.`);
  const data = { host: row.host, ...(row.held_why ? { why: row.held_why } : {}) } as Json;
  await emitEvent(p.db, row.tenant_id, "sending_domain.resumed", "setup", "sending_domain", row.id, data);
  return { ok: true, domain: domainDto(written) };
}

/** The owner, told: the bell, and email where the workspace has somebody on file. Best effort: the row already says it. */
async function tellDomainHeld(
  p: Pick<DomainPorts, "db" | "log">,
  row: SendingDomainRow,
  why: DomainHold,
): Promise<void> {
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
          `Nothing leaves from ${row.host} until it's fixed, because ${because}.` +
          `${domainHoldFixWords(why) ? ` ${domainHoldFixWords(why)}` : ""}\n\n` +
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
    const data = { host: row.host } as Json;
    await emitEvent(p.db, row.tenant_id, "sending_domain.removed", "setup", "sending_domain", row.id, data);
  }
  return { ok: true };
}
