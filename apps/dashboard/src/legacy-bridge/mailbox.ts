/**
 * The workspace's email address on the classic Connections page: the owner's
 * two acts (choose it once, change the name beside it) and the rules for what
 * may be typed, which are contracts' (mailbox.ts), so the form says the same
 * sentence before the press that the route says after it.
 *
 * Both routes are in the refresh map under Setup: the row that offered the
 * form becomes the row that shows the address without the page asking.
 */
import { suggestLocalPart, whyNotAFromName, whyNotALocalPart } from "@chanlytics/contracts";
import { api } from "./api";
import type { ApiResult } from "../client/api";

export interface MailboxApi {
  create(input: { localPart: string; fromName: string }): Promise<ApiResult<unknown>>;
  rename(id: string, fromName: string): Promise<ApiResult<unknown>>;
  whyNotALocalPart: typeof whyNotALocalPart;
  whyNotAFromName: typeof whyNotAFromName;
  suggestLocalPart: typeof suggestLocalPart;
}

declare global {
  interface Window {
    __mailbox?: MailboxApi;
  }
}

export function installMailbox(win: Window = window): void {
  win.__mailbox = {
    create: ({ localPart, fromName }) => api()("POST mailboxes", { body: { local_part: localPart, from_name: fromName } }),
    rename: (id, fromName) => api()("PUT mailboxes/[id]", { params: { id }, body: { from_name: fromName } }),
    whyNotALocalPart,
    whyNotAFromName,
    suggestLocalPart,
  };
}
