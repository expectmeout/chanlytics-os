/**
 * The domains sweep (Reach out, Part 2): every ten minutes, every sending domain that is being checked or can send
 * ('verifying', 'verified' or 'held', the longest unread first) is read at the cold mail account (Resend, on
 * RESEND_COLD_API_KEY) and in DNS (its DMARC record), and judged (contracts sending-domains.ts judgeDomain).
 * A domain still waiting on its records is its owner's to finish and is not read here; neither is one held for a
 * complaint, which only a Resume lifts. What the judge decides is written by checkSendingDomain
 * (lib/email/sending-domains.ts) onto the row it read, and said: an event per change (sending_domain.verified, .held,
 * .released) and a notice to whoever must act.
 *   - A domain that stops verifying, or loses its DMARC record on two reads in a row, is held for its records and its
 *     owner told; one held for its records, or for the provider no longer knowing it, is sent again once both read good.
 *   - A verified or held domain's own bounces, complaints and unsubscribes are counted from our rows and hold it for
 *     its reputation, even on a tick the provider could not be asked; only a Resume lifts those, its owner's, or the
 *     platform's after a second hold in thirty days.
 *   - A domain the provider no longer has is the account's fact, not the owner's: it is held and the platform is paged
 *     (pageOperator), not the owner mailed.
 *   - "We could not look" (no answer from the provider or from DNS) changes nothing else, and the row is stamped read so
 *     it waits its turn.
 * Beside the domains, and inside the same budget, the sweep runs two watches that page the platform and never change
 * its answer: watchColdReceipts (a domain whose emails of the last day heard nothing back) and probeUnsubscribe (an
 * unsubscribe link sealed the way a send seals it and opened the way a mail client would).
 *
 * The work is bounded by time: up to MAX_DUE domains are read, AT_ONCE at a time and no faster than one batch every
 * BATCH_AT_LEAST_MS, and no batch starts after YIELD_AT_MS from the door's first line, so what is left is first in
 * line next tick.
 *
 * pg_cron runs it at minutes 2, 12, ... 52 ('domains-sweep', 00175), and trigger_domains_sweep asks the edge
 * (request_sweep, waiting 65 s) only when a domain is verifying, verified or held, and otherwise records only that it
 * looked. sweep_health() judges the answer and expects one at least every 40 minutes (00175). Auth is authorizeCron:
 * the x-cron-key header against the sweep key held in Vault.
 *
 * It answers 200 with the counts, how many were due, the age of the oldest read (oldest_read_s) and the unsubscribe
 * probe's outcome. A missing RESEND_COLD_API_KEY is a 503 (no_cold_key), since domains exist only where the key did and
 * a key that went missing leaves them unwatched: red, not quiet. Domains that cannot be read are a 503 (no_database);
 * the key refused for EVERY domain read this tick is a 503 (no_domain_readable), ours and not the domains'. A blip (a
 * 5xx, a slow second, a 429) is a 200: those domains are read next tick. Its lines carry `sweep: "domains"`, and the
 * tick ends in one domains_swept.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger, door } from "../../lib/log.js";
import { env } from "../../lib/env.js";
import { dueSendingDomains } from "../../lib/packages/db.js";
import { dkimPublished, readDmarc } from "../../lib/email/dmarc.js";
import { checkSendingDomain, type DomainPorts } from "../../lib/email/sending-domains.js";
import { watchColdReceipts } from "../../lib/email/cold-receipts.js";
import { probeUnsubscribe } from "../../lib/email/unsubscribe-probe.js";
import { unsubscribeOrigin } from "../../lib/dashboard-origin.js";
import { pageOperator } from "../../lib/ops/page-operator.js";

/**
 * The most a tick reads from the table. The time budget below is what bounds the work: a tick reads every due domain
 * it has time for, longest unread first, and what is left is first in line next tick.
 */
const MAX_DUE = 500;
/** How many are read at once: the provider allows ten requests a second per account. */
const AT_ONCE = 5;
/**
 * No batch starts after this, counted from the door's first line: a row's check still to come must end inside the
 * function's limit in vercel.json. That is a provider read (channels SEND_TIMEOUT_MS; DNS is read beside it, two names
 * of 6 s for a host of three labels), then the notice a hold sends (a page or the owner's mail, NOTIFY_TIMEOUT_MS), then
 * the writes. ops-hygiene.test.mjs holds the sum under the limit.
 */
export const YIELD_AT_MS = 30_000;
/**
 * The least a batch takes: five reads a second at most, so the sweep leaves most of the account's rate for the sends
 * that share it (Resend limits requests per team, not per key).
 */
const BATCH_AT_LEAST_MS = 1_000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const POST = door(async function POST(request: Request): Promise<Response> {
  // The budget's clock, from the first line: the door's own reads and a cold start are inside the limit too.
  const started = Date.now();
  const L = logger({ sweep: "domains" });
  const db = pg();
  if (!db) {
    L.error("domains_no_db");
    return refuse(503, "no_database");
  }
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  // Domains exist only where the key did; a key that went missing leaves them unwatched, which is red, not quiet.
  const coldKey = env.RESEND_COLD_API_KEY;
  if (!coldKey) {
    L.error("domains_no_cold_key");
    return refuse(503, "no_cold_key");
  }
  let rows;
  try {
    rows = await dueSendingDomains(db, MAX_DUE);
  } catch (e) {
    L.error("domains_unreadable", { error: e instanceof Error ? e.message : String(e) });
    return refuse(503, "no_database");
  }
  if (!rows.length) return json(200, { ok: true, checked: 0 });

  const page = (key: string, subject: string, body: string) => pageOperator({ db }, key, subject, body);
  const ports: DomainPorts = {
    db,
    cfg: { apiKey: coldKey },
    dmarc: (h) => readDmarc(h),
    dkim: (h, records) => dkimPublished(h, records),
    now: Date.now,
    log: L,
    page,
  };
  // How stale the oldest due read was when this tick began: what a person reading the sweep's answer judges it by.
  // Null when the oldest due domain was never read at all.
  const oldestReadS = rows[0]?.checked_at ? Math.round((Date.now() - Date.parse(rows[0].checked_at)) / 1000) : null;
  // Whether cold email's receipts reach us at all (lib/email/cold-receipts.ts): one read, and a page to the platform
  // when a domain's emails of the last day heard nothing back. First, inside the tick's time budget, so a tick with
  // hundreds of domains to read still asks it. It is the platform's to act on: the sweep's answer is about the
  // domains, and a watch that could not be read changes nothing below.
  // And whether the dashboard opens the unsubscribe links the edge seals (lib/email/unsubscribe-probe.ts), asked
  // beside it: the same budget, the same pager, and nothing below depends on either.
  const [, unsubscribe] = await Promise.all([
    watchColdReceipts({ db, now: Date.now, log: L, page }),
    probeUnsubscribe({ secret: env.UNSUBSCRIBE_SECRET ?? null, origin: unsubscribeOrigin(), log: L, page }),
  ]);
  const counts = { checked: 0, verified: 0, held: 0, released: 0, unreadable: 0, refused: 0 };
  for (let i = 0; i < rows.length; i += AT_ONCE) {
    // What is left is read next tick, the longest unread first.
    if (Date.now() - started > YIELD_AT_MS) break;
    const batch = rows.slice(i, i + AT_ONCE);
    counts.checked += batch.length;
    const batchStarted = Date.now();
    await Promise.all(
      batch.map(async (row) => {
        try {
          const out = await checkSendingDomain(ports, row, { verify: false });
          if (out.unreadable) {
            counts.unreadable++;
            if (out.status === 401 || out.status === 403) counts.refused++;
          } else if (out.change) counts[out.change]++;
        } catch (e) {
          counts.unreadable++;
          L.error("domains_row_failed", { domain: row.id, error: e instanceof Error ? e.message : String(e) });
        }
      }),
    );
    const spent = Date.now() - batchStarted;
    if (i + AT_ONCE < rows.length && spent < BATCH_AT_LEAST_MS) await sleep(BATCH_AT_LEAST_MS - spent);
  }
  L.info("domains_swept", { ...counts, due: rows.length, oldest_read_s: oldestReadS, unsubscribe });
  // The key refused for every domain read is the sweep learning nothing -- ours, not the domains' -- and 503 is how
  // sweep_health turns that red. A blip (a 5xx, a slow second, a 429) is not: those domains are read next tick, and
  // with one or two domains a single blip must not page the platform (registrations.ts judges the same way).
  if (counts.checked > 0 && counts.refused === counts.checked)
    return json(503, { ok: false, error: "no_domain_readable", ...counts });
  return json(200, { ok: true, ...counts, due: rows.length, oldest_read_s: oldestReadS, unsubscribe });
});
