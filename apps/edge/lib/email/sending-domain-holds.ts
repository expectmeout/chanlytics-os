/**
 * Holds, said: when a hold is the platform's to lift (heldTwice), a check's change written as an event and, when it was a
 * hold, told to whoever must act (sayDomainChange: the owner once a day for what their records did, the platform for
 * what the account did), and the owner's two notices. Moved whole from sending-domains.ts.
 */
import { domainHeldSince, emitEvent, reputationHoldsSince, type SendingDomainRow } from "../packages/db.js";
import {
  DNS_HOLDS,
  DOMAIN_RAMP,
  HOUR_MS,
  PLATFORM_HOLD_NOTICE,
  REPUTATION_HOLDS,
  REPUTATION_MEMORY_MS,
  domainHoldNoticeWords,
  domainHoldWords,
  type DomainCounts,
  type DomainHold,
} from "../packages/contracts.js";
import { notify } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import type { DomainJudgementChange, DomainPorts } from "./sending-domain-ports.js";

/**
 * A reputation hold that comes a second time in thirty days is the platform's to lift (D16): a domain that keeps
 * drawing bounces, complaints or unsubscribes is not one more press of Resume. Asked before the hold is written, of
 * the holds said before it (its sending_domain.held events, by host), and only when the domain was not already held
 * for its reputation: a worse reason inside one hold is the same hold. A complaint hold whose complaints are all about
 * mail sent before the count began (a late spam report about the episode a Resume answered) is its owner's again. A
 * read that fails leaves the hold its owner's, and says so: the platform is not paged on a guess.
 */
export async function heldTwice(
  p: Pick<DomainPorts, "db" | "log"> & { now?: () => number },
  row: SendingDomainRow,
  judged: { change: DomainJudgementChange; held_why: DomainHold | null },
  counts: DomainCounts | null,
): Promise<boolean> {
  if (judged.change !== "held" || !judged.held_why || !REPUTATION_HOLDS.includes(judged.held_why)) return false;
  if (row.state === "held" && REPUTATION_HOLDS.includes(row.held_why as DomainHold)) return false;
  if (judged.held_why === "complaint" && (counts?.complained_new ?? counts?.complained ?? 0) === 0) return false;
  try {
    const since = new Date((p.now ?? Date.now)() - REPUTATION_MEMORY_MS).toISOString();
    const before = await reputationHoldsSince(p.db, {
      tenantId: row.tenant_id,
      host: row.host,
      sinceIso: since,
      whys: REPUTATION_HOLDS,
    });
    return before >= 1;
  } catch (e) {
    p.log.error("sending_domain_holds_unread", { domain: row.id, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** A day: an owner hears of a domain's holds at most once in one. */
const HOLD_NOTICE_COOLDOWN_MS = 24 * HOUR_MS;

/**
 * A check's change, said: one event, and who must act told when it was a hold. The owner, for what their records or
 * their mail did, at most once a day; the platform, for a domain the provider no longer knows (the account's fact,
 * which no owner can fix). Nothing when nothing changed.
 */
export async function sayDomainChange(
  p: Pick<DomainPorts, "db" | "log" | "page"> & { now?: () => number },
  row: SendingDomainRow,
  written: SendingDomainRow,
  judged: { change: DomainJudgementChange; held_why: DomainHold | null },
  counts: DomainCounts | null = null,
): Promise<void> {
  if (judged.change && judged.change !== "resumed") {
    // A hold for its reputation keeps what was counted, since a Resume clears the row's counts: the ledger is where
    // why it was held stays, and who lifts it.
    const reputationHeld = judged.change === "held" && !!judged.held_why && REPUTATION_HOLDS.includes(judged.held_why);
    const platform = reputationHeld && written.resume_by === "platform";
    const data = {
      host: row.host,
      ...(judged.held_why ? { why: judged.held_why } : {}),
      ...(reputationHeld
        ? {
            sent: written.sent_recent,
            bounced: written.bounced_recent,
            complaints: written.complaints,
            ...(counts?.unsubscribed !== undefined ? { unsubscribed: counts.unsubscribed } : {}),
            ...(platform ? { resume_by: "platform" } : {}),
          }
        : {}),
    };
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
    else if (judged.change === "held" && judged.held_why && !toldToday) {
      // Held twice in thirty days (D16): the platform lifts it, so the platform is paged, and the owner is told there is
      // nothing for them to press.
      if (platform)
        await p.page?.(
          `sending_domain_held_twice:${row.host}`,
          `sending domain: ${row.host} held twice in 30 days`,
          `${row.host} (workspace ${row.tenant_id}, domain ${row.id}) is held again because ` +
            `${domainHoldWords(judged.held_why)}. Its owner cannot resume it: look at what it sent, then lift it with ` +
            `the admin door (op resume, tenant_id, domain_id, by platform).`,
        );
      await tellDomainHeld(p, written, judged.held_why, platform);
    }
  }
}

/** The owner, told: the bell, and email where the workspace has somebody on file. Best effort: the row already says it. */
async function tellDomainHeld(
  p: Pick<DomainPorts, "db" | "log">,
  row: SendingDomainRow,
  why: DomainHold,
  platform = false,
): Promise<void> {
  const because = domainHoldWords(why);
  // Held twice in thirty days: nothing for the owner to press, so the notice says who lifts it instead of how.
  const what = platform ? PLATFORM_HOLD_NOTICE : domainHoldNoticeWords(why);
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
          `${what ? ` ${what}` : ""}\n\n` +
          `Connections has the details, under Email.`,
        redactedBody: "A workspace's sending domain was held.",
      },
    );
  } catch (e) {
    p.log.error("sending_domain_tell_failed", { domain: row.id, error: String(e) });
  }
}

/** The owner, told the platform lifted a hold that was its own to lift (D16). Best effort: the row already says it. */
export async function tellDomainResumed(p: Pick<DomainPorts, "db" | "log">, row: SendingDomainRow): Promise<void> {
  try {
    const addressing = await loadTenantNotifications(p.db, row.tenant_id);
    await notify(
      { tenantId: row.tenant_id, ...addressing },
      {
        kind: "sweep",
        route: "admin/integrations",
        about: { type: "sending_domain", id: row.id },
        subject: `${row.host} sends again`,
        body:
          `We've lifted the hold on ${row.host}. It sends again, starting at ${DOMAIN_RAMP[0].perDay} a day.\n\n` +
          `Connections has the details, under Email.`,
        redactedBody: "A workspace's sending domain sends again.",
      },
    );
  } catch (e) {
    p.log.error("sending_domain_tell_failed", { domain: row.id, error: String(e) });
  }
}
