/**
 * The claim renewed (the ledger's own module holds its thirty names): what the tick asks before it settles a job it is
 * giving up on (tick.ts conclude).
 */
import { swapFiredJob } from "@chanlytics/db/jobs";
import { DbFailure, SECOND_MS } from "@chanlytics/contracts";
import { LEASE_SECONDS, type Db } from "./ledger";

/**
 * The claim renewed for a lease more, by the same compare-and-swap as the ledger's exits: true while this run still
 * holds the row. So the settle is made by the run that holds the row, and the row is still claimed, to come back, if
 * that run dies before it fails it.
 */
export async function keepJob(
  db: Db,
  job: { id: string; attempts: number },
  leaseSeconds = LEASE_SECONDS,
): Promise<boolean> {
  const { data, error } = await swapFiredJob(db, job, {
    lease_until: new Date(Date.now() + leaseSeconds * SECOND_MS).toISOString(),
  });
  if (error) throw new DbFailure(error, "keep_job");
  return data.length > 0;
}
