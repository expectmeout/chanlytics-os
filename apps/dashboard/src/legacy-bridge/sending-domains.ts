/**
 * The domains a workspace sends cold email from, on the classic Connections page (Reach out, Part 2): the owner's
 * four acts -- add one, Check it, resume one held for its reputation, remove it -- and what may be typed and what each row says, which are contracts'
 * (sending-domains.ts), so the form says the same sentence before the press that the door says after it.
 *
 * All four routes are in the refresh map under Setup: the block repaints from Setup's re-read, and the ten-minute
 * clock's changes arrive the same way, by realtime (sending_domains is watched).
 */
import {
  domainDailyCap,
  domainHoldWords,
  sendingDomainWords,
  whyNotAFromLocal,
  whyNotAFromName,
  whyNotASendingHost,
  DMARC_RECOMMENDED,
  DNS_HOLDS,
  SENDING_DOMAINS_MAX,
} from "@chanlytics/contracts";
import { api } from "./api";
import type { ApiResult } from "../client/api";

export interface SendingDomainsApi {
  add(input: { host: string; fromLocal: string; fromName: string }): Promise<ApiResult<unknown>>;
  check(id: string): Promise<ApiResult<unknown>>;
  resume(id: string): Promise<ApiResult<unknown>>;
  remove(id: string): Promise<ApiResult<unknown>>;
  whyNotAHost: (typed: string, mailDomain: string | null) => string | null;
  whyNotAFromLocal: typeof whyNotAFromLocal;
  whyNotAFromName: typeof whyNotAFromName;
  words: typeof sendingDomainWords;
  /** Why it was held, as a clause: what Resume's Confirm asks the owner to have fixed. */
  holdWords: typeof domainHoldWords;
  cap: typeof domainDailyCap;
  dmarc: string;
  max: number;
  /** The holds that lift once the records pass: their records are shown, and Check is offered. */
  dnsHolds: readonly string[];
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
    resume: (id) => api()("POST sending-domains/[id]/resume", { params: { id } }),
    remove: (id) => api()("DELETE sending-domains/[id]", { params: { id } }),
    whyNotAHost: (typed, mailDomain) => whyNotASendingHost(typed, { mailDomain }),
    whyNotAFromLocal,
    whyNotAFromName,
    words: sendingDomainWords,
    holdWords: domainHoldWords,
    cap: domainDailyCap,
    dmarc: DMARC_RECOMMENDED,
    max: SENDING_DOMAINS_MAX,
    dnsHolds: DNS_HOLDS,
  };
}
