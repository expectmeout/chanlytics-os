/**
 * The receptionist's draft of an answer to a reach-out's reply (Reach out Part 5, PR 5; decision 0017, the plan's G14):
 * the draft port the reply_read job asks. Core's readReply decides when; this asks the gates and the brain.
 *
 *   - The runtime is the workspace's, loaded by a RoutedChannel built from its mailbox (loadTenantRuntime reads
 *     everything by the tenant; an email kind binds no WhatsApp credentials). No wire is bound from it: a draft is text
 *     on the reading, and nothing sends it but a person.
 *   - The gates are G14's, in its order (contracts draftRefusal): a receptionist that can speak, a workspace whose reply
 *     policy lets it, the day's tokens (tokenBudgetSpent, the receptionist's own rule), the spend (workspaceMaySpend).
 *   - The brain is the receptionist's (generateReply) over the workspace's own prompt, the thread, and the lead note.
 *     Its holding words are never a draft: an answer that hands off, refuses or fails is not drafted.
 *   - Layer two (core layerTwo, Blueprint section 6) reads the answer as it reads the receptionist's own: a price in it
 *     is refused outright, so no draft a person may send as written names one. Not drafted, never the holding words in
 *     its place. Only that rule applies here: the classes a workspace holds for a person (Autonomy's ask) are about what
 *     the receptionist itself sends, and nothing here sends.
 *   - Its tokens are written through the one writer (recordTokens), so the day's budget counts them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeNow,
  draftRefusal,
  resolveSystemPrompt,
  tokenBudgetSpent,
  tokenCapOf,
  type DraftWhy,
} from "../packages/contracts.js";
import {
  mailboxOfTenant,
  readThreadState,
  workspaceMaySpend,
  type Database,
  type RoutedChannel,
} from "../packages/db.js";
import { layerTwo } from "../packages/core.js";
import type { JobContext } from "../packages/jobs.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";
import { brainCallOf, generateReply } from "../receptionist/brain.js";
import { recordTokens, tokensLast24h } from "../receptionist/budget.js";
import { loadTenantRuntime } from "../tenant-runtime.js";

type Db = SupabaseClient<Database>;
type Draft = NonNullable<JobContext["replies"]>["draft"];

/** The thread's turns the brain is shown, as the receptionist reads them (readThreadState's own default). */
const DRAFT_HISTORY = 16;

/** The draft port over this database. The tests give their own brain and clock. */
export function replyDrafter(db: Db, over: { brain?: typeof generateReply; now?: () => number } = {}): Draft {
  const brain = over.brain ?? generateReply;
  const now = over.now ?? Date.now;
  return async (tenantId, ask) => {
    const L = logger({ tenant_id: tenantId });
    const said = (why: DraftWhy): { why: DraftWhy } => {
      L.info("reach_out_reply_draft", { conversation: ask.conversationId, drafted: false, why });
      return { why };
    };
    const mailbox = await mailboxOfTenant(db, tenantId);
    if (!mailbox) return said("no_receptionist");
    const routed: RoutedChannel = {
      kind: "email",
      channelId: mailbox.id,
      tenantId,
      externalId: mailbox.local_part,
      numberE164: null,
      credentialsRef: null,
      config: {},
    };
    const rt = await loadTenantRuntime(db, routed);
    const limits = rt.policy["reply"]?.limits ?? {};
    const cap = tokenCapOf(limits);
    const refusal = draftRefusal({
      receptionist: !!rt.brain && !rt.configBroken && !rt.loadFailed && !!env.ANTHROPIC_API_KEY,
      mode: rt.policy["reply"]?.mode ?? "ask",
      budgetSpent: cap > 0 && tokenBudgetSpent(limits, await tokensLast24h(db, tenantId, cap)),
      maySpend: await workspaceMaySpend(db, tenantId),
    });
    if (refusal || !rt.brain) return said(refusal ?? "no_receptionist");

    const ms = ask.deadline - now();
    if (ms <= 0) throw new Error("reply_draft: no time left for the receptionist");
    const thread = await readThreadState(db, tenantId, ask.conversationId, null, DRAFT_HISTORY);
    const at = new Date(now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([
      brain(
        thread.history,
        ask.text,
        resolveSystemPrompt(rt.brain, "whatsapp", rt.timezone, at, rt.policy, rt.known),
        // No holding words: an answer the brain could not give is not drafted, never drafted as the fallback.
        "",
        ask.note,
        describeNow(rt.timezone, at, rt.brain.profile?.closures),
        undefined,
        undefined,
        // The usage ledger's row: a draft's spend told apart from the receptionist's answers.
        brainCallOf(tenantId, rt, { subjectId: ask.conversationId, purpose: "reply_draft" }),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("reply_draft: the receptionist ran past the job's deadline")), ms);
      }),
    ]).finally(() => clearTimeout(timer));

    if (r.usage) {
      const usage = { ...r.usage, source: "reach_out_reply_draft", escalate: r.escalate, reason: r.reason ?? null };
      await recordTokens(db, tenantId, ask.conversationId, usage).catch((e: unknown) =>
        L.error("reach_out_reply_draft_usage_failed", { conversation: ask.conversationId, error: errField(e) }),
      );
    }
    if (r.escalate || r.reason || !r.text.trim()) return said("not_drafted");
    // No policy and no intent: the price rule alone (see the header). A price the model wrote is refused, not swapped
    // for layer two's holding words, which are never a draft.
    const two = layerTwo({
      replyText: r.text,
      escalate: false,
      escalationReason: "",
      brainCfg: rt.brain,
      policy: null,
      intent: null,
      known: rt.known,
    });
    if (two.priceBlocked) {
      L.warn("policy_block_price", { conversation: ask.conversationId });
      return said("not_drafted");
    }
    L.info("reach_out_reply_draft", { conversation: ask.conversationId, drafted: true, chars: r.text.length });
    return { text: r.text };
  };
}
