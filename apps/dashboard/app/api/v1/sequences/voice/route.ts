import { write, workspace } from "@/server/route";
import { VOICE_BODY } from "@/server/sequences/bodies";
import { learnVoice } from "@/server/sequences/voice";

/**
 * POST /api/v1/sequences/voice — { text } → { lines, full }: an email the owner wrote, read once by Ask into up to three
 * lines about how they write a cold email, each kept in Ask's memory as learned (decision 0078), which every draft and
 * every Ask turn then reads; Settings › Memory lists and forgets them. Owner or operator, who may keep a memory line;
 * counted against the workspace's assistant budget like any other assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: VOICE_BODY,
  handle: ({ ctx, member, input }) => learnVoice(ctx, member.tenantId, input),
});
