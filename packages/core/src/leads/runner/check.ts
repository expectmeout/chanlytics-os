/**
 * lead_check: one checker run per batch of the addresses still waiting, claimed first (claim.ts). The checker run's
 * answers are read by the collect (collect.ts).
 */

import { LEAD_CARDS, LEAD_ESTIMATE_MARGIN } from "@chanlytics/contracts";
import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import { CARDS, CHECKER_RUN_TIMEOUT_SECS } from "../cards";
import { runIdFor, sha256Hex } from "../ids";
import type { LeadMemberRow, LeadPorts, LeadRunRow } from "../ports";
import { claimOrRecover, startFailed } from "./claim";
import { CHECK_BATCH, FIRST_COLLECT_SECONDS, INPUT_MARKER, LeadRetry, iso, outOfTime, webhookUrl } from "./rules";

/* ------------------------------------------------------------- the check */

export type CheckOutcome =
  | { kind: "not_open" }
  | { kind: "paused" }
  | { kind: "nothing_to_check" }
  | { kind: "started"; emails: number; more: boolean }
  | { kind: "already" }
  | { kind: "unknown" }
  | { kind: "refused" };

/** Check again (D3, 00145): the nonce that gives the run an id of its own, and the leads the owner named. */
export type CheckAgain = { nonce: string; leadIds: string[] };
/** A run started by Check again: the door's nonce is in its term, so the round may have ended by the time it commits. */
export const isAgainRun = (run: Pick<LeadRunRow, "purpose" | "term">): boolean =>
  run.purpose === "check" && (run.term ?? "").startsWith("again:");

/** The members whose picked address still waits for its check, in one fixed order. */
export function checkable(members: LeadMemberRow[]): LeadMemberRow[] {
  return members
    .filter((m) => m.email !== null && m.email_state === "checking")
    .sort((a, b) => (a.lead_id < b.lead_id ? -1 : a.lead_id > b.lead_id ? 1 : 0));
}

export async function check(
  p: LeadPorts,
  roundId: string,
  batch: number,
  owner: string,
  again: CheckAgain | null = null,
): Promise<CheckOutcome> {
  const round = await p.db.round(roundId);
  // A round that ended is closed to its own checks; a Check again runs under it after it ended, by design (00145).
  if (!round || (round.state === "ended" && !again)) return { kind: "not_open" };
  const card = CARDS[round.plan.card];
  const named = again ? new Set(again.leadIds) : null;
  const all = checkable(await p.db.membersOfRound(round.id)).filter((m) => !named || named.has(m.lead_id));
  const slice = all.slice(batch * CHECK_BATCH, (batch + 1) * CHECK_BATCH);
  // The switch, read before anything reaches the provider, as a start reads it
  // (§0.5). The mailbox check is money too: with searches off the addresses
  // still waiting say "Couldn't check", and the round ends the word the
  // endings carry for it.
  if (!(await p.db.leadSearchesOn(round.tenant_id))) {
    if (slice.length)
      await p.db.checkCommit(
        round.id,
        null,
        slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })),
        0,
        false,
      );
    if (!again) await p.db.roundEnd(round.id, "paused");
    return { kind: "paused" };
  }
  if (!slice.length) {
    if (batch === 0 && round.state === "checking" && !again) await p.db.checkCommit(round.id, null, [], 0, true);
    return { kind: "nothing_to_check" };
  }
  const term = again ? `again:${again.nonce}:${batch}` : `batch:${batch}`;
  const id = await runIdFor(round.id, "check", term);
  const token = await p.webhookToken(id);
  const emails = [...new Set(slice.map((m) => m.email as string))];
  const brief = LEAD_CARDS.find((c) => c.id === round.plan.card);
  const capUsd = Math.max(
    0.5,
    Math.round(emails.length * (brief?.checkPerEmailUsd ?? 0.00089) * LEAD_ESTIMATE_MARGIN * 100) / 100,
  );
  const rows = await p.db.runsEnsure([
    {
      id,
      tenant_id: round.tenant_id,
      round_id: round.id,
      purpose: "check",
      term,
      actor: card.checker.actor,
      build: card.checker.build,
      webhook_token_hash: await sha256Hex(token),
      cap_usd: capUsd,
    },
  ]);
  const row = rows.find((r) => r.id === id);
  if (!row || (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner)))
    return { kind: "already" };
  if (outOfTime(p)) throw new LeadRetry("out of time before the checker");
  const claim = await claimOrRecover(p, card.checker.actor, row, owner);
  if (claim !== "mine") return { kind: "already" };
  try {
    const started = await p.apify.startRun(
      card.checker.actor,
      { ...(card.checker.buildInput(emails) as Record<string, unknown>), [INPUT_MARKER]: row.id },
      {
        build: card.checker.build,
        timeoutSecs: CHECKER_RUN_TIMEOUT_SECS,
        maxTotalChargeUsd: capUsd,
        webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(p, row.id, token) }],
      },
    );
    await p.db.runRecordStart(row.id, owner, started.id, started.datasetId, capUsd);
    await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
    const more = all.length > (batch + 1) * CHECK_BATCH;
    if (more)
      await p.schedule(
        "lead_check",
        { round_id: round.id, batch: batch + 1, ...(again ? { again: again.nonce, lead_ids: again.leadIds } : {}) },
        0,
      );
    return { kind: "started", emails: emails.length, more };
  } catch (e) {
    const kind = await startFailed(p, row, owner, e);
    if (kind === "refused") {
      // These addresses cannot be checked: "Couldn't check", so the round can end.
      await p.db.checkCommit(
        round.id,
        row.id,
        slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })),
        0,
        !again && all.length <= (batch + 1) * CHECK_BATCH,
      );
    }
    return { kind };
  }
}
