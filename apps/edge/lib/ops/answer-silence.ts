/**
 * The alarm on a workspace nobody answered all day: customers wrote, and neither the receptionist nor a person replied
 * (00277 platform_answer_silence, over the day the nightly rollup counted into platform_metrics).
 *
 * Nothing else notices it. The receptionist off by mistake, a line whose replies all fail, a workspace whose owner
 * left: every clock stays healthy, every door answers 200, and customers are ignored. The health sweep reads
 * yesterday's silent workspaces and pages the platform, naming workspaces and counts, never a customer.
 *
 * Once a day. The rollup runs at 00:17 UTC and the sweep every thirty minutes; the page is suppressed for six hours,
 * so it is only sent while the day is fresh (before PAGE_UNTIL_HOUR UTC): one page per silent day.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS } from "../packages/contracts.js";
import type { Database } from "../packages/db.js";
import { pageOperator, type PagePorts } from "./page-operator.js";
import { logger } from "../log.js";

/** The page goes out only in the first hours after the rollup: once per day, not once per suppression window. */
const ANSWER_SILENCE_PAGE_UNTIL_HOUR = 6;
/** The pager's condition: one key, the day in the page itself. */
const ANSWER_SILENCE_PAGE_KEY = "answer_rate_zero";

interface SilentWorkspace {
  tenant_id: string;
  name: string;
  asks: number;
}

/** Whether the sweep running at `nowMs` is the one that pages about yesterday. */
function answerSilenceDue(nowMs: number): boolean {
  return new Date(nowMs).getUTCHours() < ANSWER_SILENCE_PAGE_UNTIL_HOUR;
}

/** Yesterday's UTC day, as the rollup names it. */
function rolledDay(nowMs: number): string {
  return new Date(nowMs - DAY_MS).toISOString().slice(0, 10);
}

function describeAnswerSilence(silent: SilentWorkspace[], day: string): { subject: string; body: string } {
  const lines = silent.map(
    (w) =>
      `  ${w.name} (${w.tenant_id}): ${w.asks} ${w.asks === 1 ? "message" : "messages"} from customers, none answered`,
  );
  return {
    subject: `${silent.length} ${silent.length === 1 ? "workspace" : "workspaces"} answered nobody on ${day}`,
    body:
      `Customers wrote to these workspaces on ${day} (UTC), and nobody answered them: not the receptionist, not a person.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Look first at whether the receptionist is on for each (its settings, and whether it has a model key), then at the sends: ` +
      `a line whose replies all fail says message.send_failed on the ledger and deliver_* in the edge log. ` +
      `The day's counts are in platform_metrics (the back office's day by workspace).\n`,
  };
}

/**
 * One sweep: yesterday's silent workspaces read from the rollup and, while the day is fresh, paged once. Answers how many
 * were silent. Never throws for a read that fails (a database 00277 has not reached has no rollup to read, and says
 * nothing; any other failure is logged), so the health sweep's other checks stand.
 */
export async function watchAnswerSilence(
  db: SupabaseClient<Database>,
  nowMs: number,
  pager: Omit<PagePorts, "db"> = {},
): Promise<number> {
  if (!answerSilenceDue(nowMs)) return 0;
  const day = rolledDay(nowMs);
  const silence = await db.rpc("platform_answer_silence", { p_day: day });
  if (silence.error) {
    if (silence.error.code !== "PGRST202")
      logger({ sweep: "health" }).error("answer_silence_unreadable", { error: silence.error.message });
    return 0;
  }
  const silent: SilentWorkspace[] = silence.data ?? [];
  if (silent.length === 0) return 0;
  const page = describeAnswerSilence(silent, day);
  await pageOperator({ db, ...pager }, ANSWER_SILENCE_PAGE_KEY, page.subject, page.body);
  return silent.length;
}
