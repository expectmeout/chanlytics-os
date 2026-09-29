/**
 * The reading of a reach-out's reply, as the job runner is handed it (Reach out Part 5, PR 3; the plan's G2, G4, G16):
 * the three things the reply_read job needs from the edge, where the model's key, the spend and the notification door
 * are. The rules are contracts' (reach-out-replies.ts) and the verb is core's (readReply); this asks and tells.
 *
 *   - ask: Haiku (the registry's reply_read route) through the platform's one JSON-model transport (lib/model.ts
 *     askJson), with no retry of its own on "not now" and a deadline of the check's call time or the job's time left,
 *     whichever is sooner; an overload is asked once of the route's fallback when that deadline leaves room. A
 *     plain-JSON second call when the schema format is refused is part of the one read. Each call is written to the
 *     usage ledger for the reply's workspace (defect 53: the reader kept no usage).
 *   - mayRead: the model's key, the workspace's one reading of whether it may spend (workspaceMaySpend, as the check
 *     asks it), and one read taken from its UTC day (REACH_OUT_READS_PER_DAY, beside the check's attempts). No second
 *     budget rule: a read is spent the way a check's attempt is.
 *   - tell: the notification door, once (notifyOnce: the bell's row, the push, the mail), true only when the owner was
 *     told; a mail that failed takes the row back, so the ledger's retry does not leave the bell a twin.
 *   - draft: the receptionist's draft of an answer (reply-draft.ts, decision 0017).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REACH_OUT_READS_PER_DAY,
  REPLY_READ_MAX_TOKENS,
  REPLY_SCHEMA,
  replyReadPrimary,
  replyReadShadowCall,
} from "../packages/contracts.js";
import { takeReplyRead, workspaceMaySpend, type Database } from "../packages/db.js";
import type { JobContext } from "../packages/jobs.js";
import { askJson, promptHashOf, type JsonAnswer } from "../model.js";
import { startShadow } from "../shadow.js";
import { env } from "../env.js";
import { notifyOnce } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { CHECK_CALL_MS } from "./check.js";
import { replyDrafter } from "./reply-draft.js";

type Db = SupabaseClient<Database>;
type Replies = NonNullable<JobContext["replies"]>;

/** The reader over this database. The tests give their own `tell` (true only when the owner was told), draft and clock. */
export function replyReader(
  db: Db,
  over: { tell?: Replies["tell"]; draft?: Replies["draft"]; now?: () => number } = {},
): Replies {
  const now = over.now ?? Date.now;
  return {
    draft: over.draft ?? replyDrafter(db, { now }),
    ask: async (system, user, deadline, forWhom) => {
      const ms = Math.min(CHECK_CALL_MS, deadline - now());
      if (ms <= 0) throw new Error("reply_read: no time left for the reader");
      // The reply's intent is also put to a second model in shadow, when it is on (decision 0023): never the person-or-
      // automatic read, which the intake's header claim keeps. Its answer is compared and kept, and never read here.
      const shadow = startShadow("reply_read", forWhom, [replyReadShadowCall(user)]);
      let answered: JsonAnswer | null = null;
      try {
        answered = await askJson({
          purpose: "reply_read",
          system,
          user,
          schema: REPLY_SCHEMA,
          maxTokens: REPLY_READ_MAX_TOKENS,
          plainJsonHint: "Answer with only a JSON object in the shape asked.",
          timeoutMs: ms,
          signal: AbortSignal.timeout(ms),
          // The reading is stamped by its ledger row: the message it read (subject) and the hash of what it was told.
          for: { ...forWhom, promptHash: promptHashOf(system) },
        });
      } finally {
        await shadow?.settle((_ref, question) => replyReadPrimary(answered?.answer)[question] ?? null);
      }
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
