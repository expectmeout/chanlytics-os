/**
 * Reading a domain where it stands and writing what the judge makes of it (checkSendingDomain: the owner's Check and the
 * clock's sweep), and holding a domain at the first complaint instead of the next sweep (holdForComplaint). What a
 * domain's facts mean is contracts' (judgeDomain). Moved whole from sending-domains.ts, which re-exports both.
 */
import {
  applyDomainCheck,
  domainCapacityOf,
  recordProviderDomain,
  sendingDomainByHost,
  sendingDomainCounts,
  type Json,
  type SendingDomainRow,
} from "../packages/db.js";
import { getMailDomain, verifyMailDomain } from "../packages/channels.js";
import { domainPatchOf, judgeDomain, type DomainCounts } from "../packages/contracts.js";
import { countedSince, stateOf, type DomainPorts } from "./sending-domain-ports.js";
import { adoptByName } from "./sending-domain-provider.js";
import { heldTwice, sayDomainChange } from "./sending-domain-holds.js";

interface CheckOutcome {
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
    const adopted = await adoptByName(p, row.host, row.created_at);
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
  // What a verified or held domain sent since its count began: its bounces and complaints are what hold it, a held one
  // too (judgeDomain). Our own rows, so they are read whatever the provider says. A count that cannot be read judges
  // nothing about reputation this time.
  const countOf = async (r: SendingDomainRow): Promise<DomainCounts | null> => {
    if (r.state !== "verified" && r.state !== "held") return null;
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
  // The days it has sent on since it was clean (D15), for Connections to say: the door reads the capacity itself, so a
  // read that fails leaves the row's last answer and judges nothing.
  const sentDaysOf = async (r: SendingDomainRow): Promise<number | null> => {
    if (r.state !== "verified" && r.state !== "held") return null;
    try {
      return (await domainCapacityOf(p.db, r.id, new Date(p.now()))).sent_days;
    } catch (e) {
      p.log.error("sending_domain_capacity_unread", {
        domain: r.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  };
  const [read, dmarc, counts, sentDays] = await Promise.all([
    getMailDomain(p.cfg, providerId),
    p.dmarc(row.host),
    countOf(row),
    sentDaysOf(row),
  ]);
  const countsPatch = {
    ...(counts ? { sent_recent: counts.sent, bounced_recent: counts.bounced, complaints: counts.complained } : {}),
    ...(sentDays !== null ? { sent_days: sentDays } : {}),
  };
  // Clean again (a first verify, a hold released): the ramp's days start over in the same write, never the days read
  // before it (D15 counts from clean_since, and the door reads this row).
  const cleanBefore = row.clean_since;
  const daysOf = (patch: { clean_since?: string | null }) =>
    "clean_since" in patch && patch.clean_since !== cleanBefore ? { sent_days: 0 } : {};
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
    const ownPatch = own.change === "held" ? domainPatchOf(own) : {};
    const twice = await heldTwice(p, row, own, counts);
    const held = await applyDomainCheck(p.db, row, {
      ...ownPatch,
      ...countsPatch,
      ...daysOf(ownPatch),
      ...(twice ? { resume_by: "platform" } : {}),
      checked_at: nowIso,
    });
    if (held && own.change === "held") await sayDomainChange(p, row, held, own, counts);
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
  const judgedPatch = domainPatchOf(judged);
  const twice = await heldTwice(p, row, judged, counts);
  const written = await applyDomainCheck(p.db, row, {
    ...judgedPatch,
    provider_status: providerStatus,
    ...(read.value ? { records: read.value.records as unknown as Json } : {}),
    ...countsPatch,
    ...daysOf(judgedPatch),
    ...(twice ? { resume_by: "platform" } : {}),
    checked_at: nowIso,
  });
  if (!written) return { row: null, change: null, unreadable: false };
  await sayDomainChange(p, row, written, judged, counts);
  return { row: written, change: judged.change === "resumed" ? null : judged.change, unreadable: false };
}

/**
 * A complaint just landed on an email from one of this workspace's own domains: the domain is judged now, from its
 * own counts, rather than at the next ten-minute sweep, so a domain drawing complaints stops at the first. A verified
 * domain is held for it, and so is one held for another reason (judgeDomain: a complaint outranks a DNS or provider
 * hold, and bounces), so its owner weighs the complaint before any Resume. Best-effort by contract: the receipt is
 * already applied, and the sweep, which reads every hold but a complaint's, holds the domain anyway.
 */
export async function holdForComplaint(
  p: Pick<DomainPorts, "db" | "log" | "now" | "page">,
  tenantId: string,
  host: string,
): Promise<"held" | "unchanged"> {
  const nowIso = new Date(p.now()).toISOString();
  // The row as read, judged on its counts; the write lands only on that row. Another writer since (the sweep, an
  // owner's Check) wins once, and the row is read and judged again, so the complaint is not left to the next tick.
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await sendingDomainByHost(p.db, tenantId, host);
    if (!row || (row.state !== "verified" && row.state !== "held")) return "unchanged";
    const counts = await sendingDomainCounts(p.db, row.tenant_id, row.host, countedSince(row));
    const judged = judgeDomain(stateOf(row), { provider: null, dmarc: null, counts }, nowIso);
    if (judged.change !== "held") return "unchanged";
    const twice = await heldTwice(p, row, judged, counts);
    const written = await applyDomainCheck(p.db, row, {
      ...domainPatchOf(judged),
      sent_recent: counts.sent,
      bounced_recent: counts.bounced,
      complaints: counts.complained,
      ...(twice ? { resume_by: "platform" } : {}),
    });
    if (written) {
      await sayDomainChange(p, row, written, judged, counts);
      return "held";
    }
  }
  return "unchanged";
}
