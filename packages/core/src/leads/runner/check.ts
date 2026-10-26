/**
 * lead_check: one checker run per batch of the addresses still waiting, claimed first (claim.ts). The checker run's
 * answers are read by the collect (collect.ts).
 */

import { LEAD_CARDS, LEAD_ESTIMATE_MARGIN, PEOPLE_RUN_FLOOR_USD } from "@chanlytics/contracts";
import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import { CARDS, CHECKER_RUN_TIMEOUT_SECS } from "../cards";
import { FINAL_RUN_STATES } from "../endings";
import { runIdFor, sha256Hex } from "../ids";
import type { LeadMemberRow, LeadPorts, LeadRoundRow, LeadRunRow } from "../ports";
import { claimOrRecover, startFailed } from "./claim";
import {
  CHECK_BATCH,
  FIRST_COLLECT_SECONDS,
  INPUT_MARKER,
  LeadRetry,
  heldBack,
  iso,
  outOfTime,
  webhookUrl,
} from "./rules";

/* ------------------------------------------------------------- the check */

export type CheckOutcome =
  | { kind: "not_open" }
  | { kind: "paused" | "may_not_spend" }
  | { kind: "nothing_to_check" }
  | { kind: "started"; emails: number; more: boolean }
  | { kind: "already" }
  | { kind: "unknown" }
  | { kind: "refused"; why: string };

/** Check again (D3, 00145): the nonce that gives the run an id of its own, and the leads the owner named. */
export type CheckAgain = { nonce: string; leadIds: string[] };
/** A run started by Check again: the door's nonce is in its term, so the round may have ended by the time it commits. */
export const isAgainRun = (run: Pick<LeadRunRow, "purpose" | "term">): boolean =>
  run.purpose === "check" && (run.term ?? "").startsWith("again:");

/**
 * What a checker run may charge (its cap): its addresses at the card's price, with the estimate's room, held to what
 * the round has left of its reservation once its other checks still out keep their own caps, as a discovery run's cap
 * is (sizing.ts runCaps, people.ts capOf). Never under the floor every run takes (contracts PEOPLE_RUN_FLOOR_USD, the
 * checker's as much as the provider's), so the addresses the round found are checked even when discovery used its
 * room. A Check again runs after the round gave its reservation back, so nothing of the round holds it: the door that
 * asked for it read whether the workspace may spend, and its addresses are capped at their price with room.
 */
async function checkerCapOf(p: LeadPorts, round: LeadRoundRow, runId: string, addresses: number): Promise<number> {
  const brief = LEAD_CARDS.find((c) => c.id === round.plan.card);
  const want = addresses * (brief?.checkPerEmailUsd ?? 0.00089) * LEAD_ESTIMATE_MARGIN;
  const out = (await p.db.runsOfRound(round.id)).filter(
    (r) => r.purpose === "check" && r.id !== runId && !FINAL_RUN_STATES.has(r.state),
  );
  const left =
    round.state === "ended"
      ? want
      : round.cost_reserved_usd - round.cost_usd - out.reduce((sum, r) => sum + (r.cap_usd ?? 0), 0);
  return Math.round(Math.max(PEOPLE_RUN_FLOOR_USD, Math.min(left, want)) * 100) / 100;
}

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
  // The switch, and whether the workspace may still spend, read before anything
  // reaches the provider, as a start reads them (§0.5). The mailbox check is
  // money too: with searches off, or a plan that lapsed since the door
  // reserved, the addresses still waiting say "Couldn't check", and the round
  // ends the word the endings carry for it.
  const held = await heldBack(p, round.tenant_id);
  if (held) {
    if (slice.length)
      await p.db.checkCommit(
        round.id,
        null,
        slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })),
        0,
        false,
      );
    if (!again) await p.db.roundEnd(round.id, "paused");
    return { kind: held };
  }
  if (!slice.length) {
    if (batch === 0 && round.state === "checking" && !again) await p.db.checkCommit(round.id, null, [], 0, true);
    return { kind: "nothing_to_check" };
  }
  const term = again ? `again:${again.nonce}:${batch}` : `batch:${batch}`;
  const id = await runIdFor(round.id, "check", term);
  const token = await p.webhookToken(id);
  const emails = [...new Set(slice.map((m) => m.email as string))];
  const capUsd = await checkerCapOf(p, round, id, emails.length);
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
    const failed = await startFailed(p, row, owner, e);
    if (failed.kind === "refused") {
      // These addresses cannot be checked: "Couldn't check", so the round can end.
      await p.db.checkCommit(
        round.id,
        row.id,
        slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })),
        0,
        !again && all.length <= (batch + 1) * CHECK_BATCH,
      );
    }
    return failed;
  }
}
