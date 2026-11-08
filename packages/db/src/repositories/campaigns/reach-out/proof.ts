/**
 * How many emails each step sent (decision 0113): what How it reaches out counts beside a claim, as the emails whose
 * step's words carry it. Sent alone: a planned, held or skipped send never reached anyone. One count a step, asked
 * side by side and never read back row by row, so a step that sent thousands costs what one that sent ten does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";

type Db = SupabaseClient<Database>;

export async function countSentByStep(
  db: Db,
  tenantId: string,
  stepIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    [...new Set(stepIds)].map(async (stepId) => {
      const { count, error } = await db
        .from("sequence_sends")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("step_id", stepId)
        .eq("state", "sent");
      if (error) throw new Error(`cannot count a step's sent emails: ${error.message}`);
      return [stepId, count ?? 0] as const;
    }),
  );
  return new Map(counts);
}
