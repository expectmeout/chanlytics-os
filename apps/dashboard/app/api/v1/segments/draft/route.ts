import { z } from "zod";
import { write, workspace } from "@/server/route";
import { draftList } from "@/server/people/lists";

const Body = z.object({
  words: z.string().trim().min(4, "Say who is on the list — one line is enough.").max(300),
});

/**
 * POST /api/v1/segments/draft — { words } → { name, rule, cannot }: a smart list drafted from the owner's own words,
 * in the rule vocabulary (contracts list-rules.ts), with what the words asked that it cannot say. A draft, never a
 * list: the page shows its chips and its count, and the owner saves it (POST /segments with the rule). Owner or
 * operator; counted against the workspace's assistant budget like any other assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: Body,
  handle: async ({ ctx, member, input }) => draftList(ctx, member.tenantId, input.words),
});
