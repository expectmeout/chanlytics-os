/**
 * The domains sweep (Reach out, Part 2): every ten minutes, every sending domain that is being checked or can send
 * is read at the cold mail account and in DNS, and judged (contracts sending-domains.ts judgeDomain). A domain that
 * stopped verifying or lost its DMARC record is held, and its owner told; one held for DNS is sent again once both
 * read good. pg_cron calls this from the database (00175's trigger_domains_sweep), only when a domain is due.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like every sweep (cron-auth.ts).
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { env } from "../../lib/env.js";
import { dueSendingDomains } from "../../lib/packages/db.js";
import { readDmarc } from "../../lib/email/dmarc.js";
import { checkSendingDomain, type DomainPorts } from "../../lib/email/sending-domains.js";

export const config = { maxDuration: 60 };

/** A bound per tick: a backlog drains over successive ticks rather than one long call. */
const MAX_PER_TICK = 30;
/** How many are read at once: the provider allows ten requests a second per account. */
const AT_ONCE = 5;

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "domains" });
  const db = pg();
  if (!db) {
    L.error("domains_no_db");
    return json(503, { ok: false, error: "no_database" });
  }
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  // Domains exist only where the key did; a key that went missing leaves them unwatched, which is red, not quiet.
  const coldKey = env.RESEND_COLD_API_KEY;
  if (!coldKey) {
    L.error("domains_no_cold_key");
    return json(503, { ok: false, error: "no_cold_key" });
  }
  let rows;
  try {
    rows = await dueSendingDomains(db, MAX_PER_TICK);
  } catch (e) {
    L.error("domains_unreadable", { error: e instanceof Error ? e.message : String(e) });
    return json(503, { ok: false, error: "no_database" });
  }
  if (!rows.length) return json(200, { ok: true, checked: 0 });

  const ports: DomainPorts = { db, cfg: { apiKey: coldKey }, dmarc: (h) => readDmarc(h), now: Date.now, log: L };
  const counts = { checked: rows.length, verified: 0, held: 0, released: 0, unreadable: 0 };
  for (let i = 0; i < rows.length; i += AT_ONCE) {
    await Promise.all(
      rows.slice(i, i + AT_ONCE).map(async (row) => {
        try {
          const out = await checkSendingDomain(ports, row, { verify: false });
          if (out.unreadable) counts.unreadable++;
          else if (out.change) counts[out.change]++;
        } catch (e) {
          counts.unreadable++;
          L.error("domains_row_failed", { domain: row.id, error: e instanceof Error ? e.message : String(e) });
        }
      }),
    );
  }
  L.info("domains_swept", counts);
  // Every domain unreadable is the sweep learning nothing -- our key or the provider, not the domains -- and 503 is
  // how sweep_health turns that red. Some readable is a 200: the rest are tried again next tick.
  if (counts.unreadable === rows.length) return json(503, { ok: false, error: "no_domain_readable", ...counts });
  return json(200, { ok: true, ...counts });
}
