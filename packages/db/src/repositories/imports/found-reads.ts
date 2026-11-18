/**
 * A found read's pace and budget (00642 found_read_spend; the footage sources plan's D21): an account a business
 * names is read for its posts once in a day, a workspace asks for a few reads in a day, and the platform for so many.
 * Spent or refused in one statement, so two pastes at once cannot both be the last of a day. The service role's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import type { Database } from "../../types";
import { readAnswer } from "../../shared/read-json";
import { ledgerCountsOf } from "./ledger";

type Db = SupabaseClient<Database>;

/** Which of a found read's budgets bound it: the workspace's reads of the day, or the platform's. */
const FOUND_READ_BUDGETS_BOUND = ["workspace_reads", "platform_reads"] as const;

/**
 * What the pace says of a read asked for. `go`: it is spent, and `since` is when this account's last whole read began
 * (ask only for what is newer), or null to read it whole. `read_lately`: nothing is spent; when it was read, where
 * that read stands and what it brought. `wait`: a budget binds, and until when.
 */
export type FoundReadSpend =
  | { fate: "go"; since: Date | null }
  | { fate: "read_lately"; readAt: Date; state: string | null; counts: Record<string, number> }
  | { fate: "wait"; binds: (typeof FOUND_READ_BUDGETS_BOUND)[number]; until: Date };

const SpendAnswer = z.object({
  fate: z.enum(["go", "read_lately", "wait"]),
  since: z.string().nullish(),
  read_at: z.string().nullish(),
  state: z.string().nullish(),
  counts: z.record(z.string(), z.unknown()).nullish(),
  binds: z.enum(FOUND_READ_BUDGETS_BOUND).optional(),
  until: z.string().nullish(),
});

/**
 * A read of an account asked for: spent, or said to have been read lately, or made to wait. Every number is the
 * caller's setting.
 */
export async function spendFoundRead(
  db: Db,
  spend: { tenantId: TenantId; source: "instagram"; account: string; workspaceMax: number; platformMax: number },
): Promise<FoundReadSpend> {
  const { data, error } = await db.rpc("found_read_spend", {
    p_tenant_id: spend.tenantId,
    p_source: spend.source,
    p_account: spend.account,
    p_workspace_max: spend.workspaceMax,
    p_platform_max: spend.platformMax,
  });
  if (error) throw new DbFailure(error, "cannot spend the found read's budget");
  const answer = readAnswer("found_read_spend", SpendAnswer, data);
  if (answer.fate === "go") return { fate: "go", since: answer.since ? new Date(answer.since) : null };
  if (answer.fate === "read_lately" && answer.read_at)
    return {
      fate: "read_lately",
      readAt: new Date(answer.read_at),
      state: answer.state ?? null,
      counts: ledgerCountsOf(answer.counts),
    };
  if (answer.fate !== "wait" || !answer.binds || !answer.until)
    throw new Error("found read spend: an answer with no fate to act on");
  return { fate: "wait", binds: answer.binds, until: new Date(answer.until) };
}
