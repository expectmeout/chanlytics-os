/**
 * The receptionist's draft of an answer to a reach-out's reply (Reach out Part 5, PR 5; decision 0017, the plan's G14): the
 * draft port the reply_read job asks. Core's readReply decides when; the one writer of a reply (drafts/writer.ts,
 * decision 0093) asks the gates and the brain, here with a reach-out's own note and its one extra gate, the workspace's
 * reply policy. Why it was not drafted is told in a reach-out's words: a draft that named money is simply not drafted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTenantConfig, replyOfferSteer } from "@chanlytics/contracts";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import type { JobContext } from "@chanlytics/jobs";
import { draftWriter } from "../../drafts/writer.js";
import type { generateReply } from "../../ai/receptionist-brain.js";

type Db = SupabaseClient<Database>;
type Draft = NonNullable<JobContext["replies"]>["draft"];

/** The draft port over this database. The tests give their own brain and clock. */
export function replyDrafter(db: Db, over: { brain?: typeof generateReply; now?: () => number } = {}): Draft {
  const write = draftWriter(db, over);
  return async (tenantId, ask) => {
    const steer = await offerSteerOf(db, tenantId);
    const out = await write.reply(tenantId, {
      conversationId: ask.conversationId,
      contactId: null,
      forMessageId: null,
      source: "reach_out",
      wire: "email",
      theirWords: ask.text,
      theirSubject: null,
      holdReason: null,
      holdDetails: null,
      // What How it reaches out says the answer offers (decision 0113): nothing said for the booking link, as before.
      instruction: steer,
      given: null,
      deadline: ask.deadline,
      note: ask.note,
    });
    if ("why" in out) return { why: out.why === "named_money" ? "not_drafted" : out.why };
    return { text: out.text, used: out.used };
  };
}

/**
 * The steer for what an answer to a lead offers, read off the workspace's config (contracts replyOfferSteer). A config
 * that cannot be read steers nothing: the answer is drafted as it was before How it reaches out, never not drafted.
 */
async function offerSteerOf(db: Db, tenantId: string): Promise<string | null> {
  try {
    const w = await findWorkspaceNameAndConfig(db, tenantId);
    return replyOfferSteer(parseTenantConfig(w.config)?.reach_out?.reply_offer);
  } catch {
    return null;
  }
}
