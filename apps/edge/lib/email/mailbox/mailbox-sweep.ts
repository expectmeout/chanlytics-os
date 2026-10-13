/**
 * The mailboxes sweep (decision 0056): every five minutes, each mailbox a business connected that is connected, paused
 * or held (the longest unread first) is tended:
 *
 *   its watch   made or renewed a day before it lapses (mailbox-watch.ts), so its provider tells the edge it changed.
 *   its sync    read back from its cursor (mailbox-sync.ts): a push may have been lost, and a deployment with no push
 *               has only this.
 *   its health  its own mail judged hourly, its ramp's days kept, its rest lifted, its domain's records read daily
 *               (mailbox-health.ts).
 *
 * Beside them, inside the same budget, the unsubscribe links are probed (unsubscribe-probe.ts) while any mailbox can
 * write a reach-out: a link that does not open is the platform's, and paged.
 *
 * The route is api/cron/mailboxes.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and
 * checks the sweep key. pg_cron asks it at minutes 2, 7, ... 57 ('mailboxes-sweep', 00421), and trigger_mailboxes_sweep
 * only when a mailbox is connected, paused or held. sweep_health() expects an answer at least every 20 minutes.
 *
 * The work is bounded by time: up to MAX_DUE mailboxes are read, AT_ONCE at a time, and neither a batch nor any
 * mailbox's provider or DNS read starts after READS_UNTIL_MS from the door's first line, so what is left is first in
 * line next tick (its synced_at is oldest). It
 * answers 200 with the counts; a table that cannot be read is a 503 (no_database). Its lines carry
 * `sweep: "mailboxes"`, and the tick ends in one mailboxes_swept.
 */
import { json, refuse } from "../../http.js";
import { env } from "../../env.js";
import { mailboxConnectionById, mailboxesToTend, type MailboxConnectionRow } from "../../packages/db.js";
import { probeUnsubscribe } from "../unsubscribe-probe.js";
import { unsubscribeOrigin } from "../../dashboard-origin.js";
import { pageOperator } from "../../ops/page-operator.js";
import { tokenFor } from "./mailbox-credentials.js";
import { tendMailboxHealth } from "./mailbox-health.js";
import { syncMailbox } from "./mailbox-sync.js";
import { keepWatch, watchDue } from "./mailbox-watch.js";
import { markSignedOut } from "./mailbox-wire.js";
import { errField, type Logger } from "../../log.js";
import type { SweepTick } from "../../ops/sweep-door.js";

/** The most a tick reads from the table: the time budget is what bounds the work. */
const MAX_DUE = 200;

/** How many are tended at once: each is a few provider reads, on that mailbox's own quota. */
const AT_ONCE = 4;

/**
 * No batch, and no provider or DNS read of any mailbox's, starts after this, counted from the door's first line: the
 * read in flight then (a provider read's bound, its one retry included), a notice to its owner and the writes still end
 * inside the function's limit in vercel.json (repo/ops-hygiene.test.mjs adds them up).
 */
export const READS_UNTIL_MS = 25_000;

type Counts = { tended: number; synced: number; replies: number; bounced: number; held: number; failed: number };

/** One mailbox: its watch when due, its sync, its health. Never throws. */
async function tend(tick: SweepTick, row: MailboxConnectionRow, counts: Counts): Promise<void> {
  const { db, L } = tick;
  const log: Logger = L.child({ tenant_id: row.tenant_id });
  const now = Date.now();
  try {
    const until = tick.started + READS_UNTIL_MS;
    let current = row;
    if (watchDue(row, now) && now < until) {
      const t = await tokenFor(db, row, now);
      if (t.ok) {
        // The watch may have started its cursor: the sync reads from it, never from the row read before it.
        if (await keepWatch(db, row, t.token, log, now, until))
          current = (await mailboxConnectionById(db, row.id)) ?? row;
      } else if (t.why === "signed_out") {
        await markSignedOut(db, row, log, now);
        return;
      }
    }
    const s = Date.now() < until ? await syncMailbox(db, current, log, now, until) : null;
    if (!s) return;
    if (s.outcome === "failed") counts.failed++;
    else if (s.outcome !== "busy" && s.outcome !== "no_token" && s.outcome !== "later") counts.synced++;
    counts.replies += s.replies;
    counts.bounced += s.bounced;
    // Its health is judged on the row as the sync left it.
    const fresh = (await mailboxConnectionById(db, row.id)) ?? current;
    const after = await tendMailboxHealth(db, fresh, log, now, until);
    if (after.state === "held" && row.state !== "held") counts.held++;
  } catch (e) {
    counts.failed++;
    log.error("mailboxes_row_failed", { mailbox: row.id, error: errField(e) });
  }
}

export async function sweepMailboxes(tick: SweepTick): Promise<Response> {
  const { db, L, started } = tick;
  let rows: MailboxConnectionRow[];
  try {
    rows = await mailboxesToTend(db, MAX_DUE);
  } catch (e) {
    L.error("mailboxes_unreadable", { error: errField(e) });
    return refuse(503, "no_database");
  }
  if (!rows.length) return json(200, { ok: true, tended: 0 });

  // Whether the unsubscribe links every reach-out email carries open (unsubscribe-probe.ts): first, inside the budget.
  const page = (key: string, subject: string, body: string) => pageOperator({ db }, key, subject, body);
  const unsubscribe = await probeUnsubscribe({
    secret: env.UNSUBSCRIBE_SECRET ?? null,
    origin: unsubscribeOrigin(),
    log: L,
    page,
  });
  const counts: Counts = { tended: 0, synced: 0, replies: 0, bounced: 0, held: 0, failed: 0 };
  for (let i = 0; i < rows.length; i += AT_ONCE) {
    if (Date.now() - started > READS_UNTIL_MS) break;
    const batch = rows.slice(i, i + AT_ONCE);
    counts.tended += batch.length;
    await Promise.all(batch.map((row) => tend(tick, row, counts)));
  }
  L.info("mailboxes_swept", { ...counts, due: rows.length, unsubscribe });
  return json(200, { ok: true, ...counts, due: rows.length, unsubscribe });
}
