/** A lead's own email, from a mailbox the business connected (decision 0094): its send, and its Undo. */
import type { LeadEmailWords } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { api } from "@/bridge/api";

export function sendLeadEmail(
  id: string,
  words: LeadEmailWords,
): Promise<ApiResult<{ message_id: string; from: string }>> {
  return api()("POST leads/[id]/send", { params: { id }, body: words, refresh: "behind", once: true });
}

/** Inside its grace: the reply's own door. */
export function callBackLeadEmail(messageId: string): Promise<ApiResult<unknown>> {
  return api()("POST messages/[id]/cancel-send", { params: { id: messageId } });
}
