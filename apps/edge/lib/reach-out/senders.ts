/**
 * A reach-out step's mailboxes as the timetable takes them (decision 0056): each it writes from (contracts
 * reachOutWritesFrom: those its owner picked, or every connected one), and each a later step's lead keeps (`also`),
 * with its day's share (contracts mailboxDailyCap: its ramp, its owner's cap, the customer domain's ceiling) and the
 * moments it already spends (00422 mailbox_capacity). A mailbox that does not send now (paused, held, signed out) has
 * no share, so nothing is placed on it while it does not; `gone` is those of `also` that are removed or not the
 * workspace's, whose leads' chains end there. The run (run-context.ts) and the replan (replan.ts) read it alike, so a
 * send is planned again by the reading it was planned by.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailboxCapacityOf, mailboxConnectionsOf, type Database } from "../packages/db.js";
import { mailboxDailyCap, reachOutWritesFrom, type TimetableSender } from "../packages/contracts.js";

type Db = SupabaseClient<Database>;

export async function stepSenders(
  db: Db,
  p: {
    tenantId: string;
    /** The step's own mailboxes (playbooks.mailbox_ids): none named is every connected one. */
    named: readonly string[];
    /** The mailboxes later steps' leads keep, read whatever the step names. */
    also?: readonly string[];
    at: Date;
    /** Moments to leave out of a mailbox's times, by mailbox: a send planned again never waits for the time it held. */
    own?: ReadonlyMap<string, readonly number[]>;
  },
): Promise<{ senders: TimetableSender[]; gone: Set<string> }> {
  const also = new Set(p.also ?? []);
  const rows = await mailboxConnectionsOf(db, p.tenantId);
  const senders: TimetableSender[] = [];
  for (const r of rows) {
    if (!reachOutWritesFrom(r, p.named) && !also.has(r.id)) continue;
    const c = await mailboxCapacityOf(db, r.id, p.at);
    const recent = [...c.recent];
    for (const t of p.own?.get(r.id) ?? []) {
      const i = recent.indexOf(t);
      if (i >= 0) recent.splice(i, 1);
    }
    senders.push({ id: r.id, cap: c.state === "connected" ? mailboxDailyCap(c) : 0, recent });
  }
  const live = new Set(rows.map((r) => r.id));
  return { senders, gone: new Set([...also].filter((id) => !live.has(id))) };
}
