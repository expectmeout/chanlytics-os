/**
 * The reading of a reach-out's reply, as the job runner is handed it (Reach out Part 5, PR 3; the plan's G2, G4, G16):
 * the three things the reply_read job needs from the edge, where the model's key, the spend and the notification door
 * are. The rules are contracts' (reach-out-replies.ts) and the verb is core's (readReply); this asks and tells.
 *
 *   - ask: Haiku (REACH_OUT_MODEL) through the platform's one JSON-model transport (lib/model.ts askJson), with no
 *     retry of its own and a deadline of the check's call time or the job's time left, whichever is sooner. A plain-JSON
 *     second call when the schema format is refused is part of the one read.
 *   - mayRead: the model's key, the workspace's one reading of whether it may spend (workspaceMaySpend, as the check
 *     asks it), and one read taken from its UTC day (REACH_OUT_READS_PER_DAY, beside the check's attempts). No second
 *     budget rule: a read is spent the way a check's attempt is.
 *   - tell: the notification door, once (notifyOnce: the bell's row, the push, the mail), true only when the owner was
 *     told; a mail that failed takes the row back, so the ledger's retry does not leave the bell a twin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REACH_OUT_MODEL,
  REACH_OUT_READS_PER_DAY,
  REPLY_READ_MAX_TOKENS,
  REPLY_SCHEMA,
} from "../packages/contracts.js";
import { takeReplyRead, workspaceMaySpend, type Database } from "../packages/db.js";
import type { JobContext } from "../packages/jobs.js";
import { askJson } from "../model.js";
import { env } from "../env.js";
import { notifyOnce } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { CHECK_CALL_MS } from "./check.js";

type Db = SupabaseClient<Database>;
type Replies = NonNullable<JobContext["replies"]>;

/** The reader over this database. The tests give their own `tell` (true only when the owner was told) and clock. */
export function replyReader(db: Db, over: { tell?: Replies["tell"]; now?: () => number } = {}): Replies {
  const now = over.now ?? Date.now;
  return {
    ask: async (system, user, deadline) => {
      const ms = Math.min(CHECK_CALL_MS, deadline - now());
      if (ms <= 0) throw new Error("reply_read: no time left for the reader");
      const answered = await askJson({
        model: REACH_OUT_MODEL,
        system,
        user,
        schema: REPLY_SCHEMA,
        maxTokens: REPLY_READ_MAX_TOKENS,
        plainJsonHint: "Answer with only a JSON object in the shape asked.",
        timeoutMs: ms,
        maxRetries: 0,
        signal: AbortSignal.timeout(ms),
      });
      return answered?.answer ?? null;
    },
    mayRead: async (tenantId, at) => {
      if (!env.ANTHROPIC_API_KEY) return "no_model";
      if (!(await workspaceMaySpend(db, tenantId))) return "may_not_spend";
      return (await takeReplyRead(db, { tenantId, cap: REACH_OUT_READS_PER_DAY, at })) ? null : "day_spent";
    },
    tell:
      over.tell ??
      (async (tenantId, notice) => {
        const target = await loadTenantNotifications(db, tenantId);
        return notifyOnce(
          { tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault },
          {
            kind: "reach_out_replied",
            route: `inbox/th-${notice.conversationId}`,
            about: { type: "conversation", id: notice.conversationId },
            subject: notice.subject,
            body: notice.body,
            redactedBody: notice.redacted,
          },
          { db },
        );
      }),
  };
}
