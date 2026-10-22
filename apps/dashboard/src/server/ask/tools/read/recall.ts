import "server-only";
import { z } from "zod";
import { clockStamp } from "@chanlytics/contracts";
import { searchAsk } from "@chanlytics/db";
import { defineRead, type ToolContext } from "../context";

/** How many things one recall says, at most. */
const RECALL_CAP = 12;

/**
 * Recall (decision 0070): what was said before, found by its words -- the person's own earlier questions and what you
 * answered, in any of their threads (never a teammate's: RLS keeps a member to their own), the lines you remember, and
 * the days of your journal -- newest first, each with when it was and where it opens (search_ask, 00471: the words
 * index of 00219, no model). The memory and the newest journal days are already in the shape; recall is for the rest:
 * an older day, a thread from last month, "what did we decide about Texas".
 */
async function runRecall(t: ToolContext, input: { words: string }): Promise<unknown> {
  const words = input.words.trim().slice(0, 120);
  if (!words) return { error: "recall: say the words to look for" };
  const found = await searchAsk(t.ctx.supabase, t.tenantId, words, RECALL_CAP);
  const nowMs = t.now.getTime();
  return {
    // Said in words alone: an earlier thread opens in the Line, never on a page, so no row here is one a citation names.
    found: found.map((r) => ({
      kind: r.kind === "turn" ? "said in a thread" : r.kind === "memory" ? "you remember" : "your journal",
      when: r.kind === "journal" ? r.at.slice(0, 10) : clockStamp(Date.parse(r.at), t.timezone, nowMs),
      words: r.snippet,
    })),
    ...(found.length ? {} : { note: "Nothing said before holds those words. Try other words, or read the pages." }),
  };
}

export const recallTool = defineRead({
  name: "recall",
  description:
    'What was said before, found by its words: the person\'s own earlier questions to you and your answers in any of their threads, the lines you remember and the days of your journal, newest first, each with when it was. Call it when they refer to something from before ("what did we decide about Texas", "the list you made last week") that this thread and the shape do not hold. It reads words, never a page\'s rows: for those, read the page\'s tool. At most twelve; nothing changes because it was read.',
  input: z.object({
    words: z.string().describe("A few words to look for, as they would have been said: names, places, kinds."),
  }),
  label: "Recalling",
  run: runRecall,
});
