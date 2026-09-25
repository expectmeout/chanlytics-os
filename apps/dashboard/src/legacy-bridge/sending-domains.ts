/**
 * The domains a workspace sends cold email from, on the classic Connections page (Reach out, Part 2): the owner's
 * three acts -- add one, Check it, remove it -- and what may be typed and what each row says, which are contracts'
 * (sending-domains.ts), so the form says the same sentence before the press that the door says after it.
 *
 * All three routes are in the refresh map under Setup: the block repaints from Setup's re-read, and the ten-minute
 * clock's changes arrive the same way, by realtime (sending_domains is watched).
 */
import {
  domainDailyCap,
  sendingDomainWords,
  whyNotAFromLocal,
  whyNotAFromName,
  whyNotASendingHost,
  DMARC_RECOMMENDED,
  SENDING_DOMAINS_MAX,
} from "@chanlytics/contracts";
import { api } from "./api";
import type { ApiResult } from "../client/api";

export interface SendingDomainsApi {
  add(input: { host: string; fromLocal: string; fromName: string }): Promise<ApiResult<unknown>>;
  check(id: string): Promise<ApiResult<unknown>>;
  remove(id: string): Promise<ApiResult<unknown>>;
  whyNotAHost: (typed: string, mailDomain: string | null) => string | null;
  whyNotAFromLocal: typeof whyNotAFromLocal;
  whyNotAFromName: typeof whyNotAFromName;
  words: typeof sendingDomainWords;
  cap: typeof domainDailyCap;
  dmarc: string;
  max: number;
}

declare global {
  interface Window {
    __sendingDomains?: SendingDomainsApi;
  }
}

export function installSendingDomains(win: Window = window): void {
  win.__sendingDomains = {
    add: ({ host, fromLocal, fromName }) =>
      api()("POST sending-domains", { body: { host, from_local: fromLocal, from_name: fromName } }),
    check: (id) => api()("POST sending-domains/[id]/check", { params: { id } }),
    remove: (id) => api()("DELETE sending-domains/[id]", { params: { id } }),
    whyNotAHost: (typed, mailDomain) => whyNotASendingHost(typed, { mailDomain }),
    whyNotAFromLocal,
    whyNotAFromName,
    words: sendingDomainWords,
    cap: domainDailyCap,
    dmarc: DMARC_RECOMMENDED,
    max: SENDING_DOMAINS_MAX,
  };
}
