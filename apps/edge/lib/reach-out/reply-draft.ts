/**
 * The receptionist's draft of an answer to a reach-out's reply (Reach out Part 5, PR 5; decision 0017, the plan's G14): the
 * draft port the reply_read job asks. Core's readReply decides when; the one writer of a reply (drafts/draft-writer.ts,
 * decision 0093) asks the gates and the brain, here with a reach-out's own note and its one extra gate, the workspace's
 * reply policy. Why it was not drafted is told in a reach-out's words: a draft that named money is simply not drafted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import type { JobContext } from "../packages/jobs.js";
import { draftWriter } from "../drafts/draft-writer.js";
import type { generateReply } from "../receptionist/brain.js";

type Db = SupabaseClient<Database>;
type Draft = NonNullable<JobContext["replies"]>["draft"];

/** The draft port over this database. The tests give their own brain and clock. */
export function replyDrafter(db: Db, over: { brain?: typeof generateReply; now?: () => number } = {}): Draft {
  const write = draftWriter(db, over);
  return async (tenantId, ask) => {
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
      instruction: null,
      given: null,
      deadline: ask.deadline,
      note: ask.note,
    });
    if ("why" in out) return { why: out.why === "named_money" ? "not_drafted" : out.why };
    return { text: out.text, used: out.used };
  };
}
