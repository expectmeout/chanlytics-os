/**
 * The mailboxes a workspace connected to write its reach-outs from, on Settings › Connections (decision 0056): the
 * owner's acts -- connect one at Google or Microsoft (its last six months or from now on: decision 0086), pause it,
 * resume one its own mail held, set its name, signature and cap, send a test to itself, Check its records, stop, resume
 * or bring in what it brings, remove it -- and what each row says, which are contracts'
 * (email/mailbox-connections/rows.ts), so the row says the same sentence the door and the clock decided.
 *
 * Every write is in the refresh map under Setup: the block repaints from Setup's re-read, and the mailboxes clock's
 * changes arrive the same way, by realtime (mailbox_connections is watched). A connect asks the door for the way to
 * the provider and leaves only when it is given one (a refusal is said on the page, never landed on); it comes back to
 * this page with one word (`?mailbox=`), read once.
 */
import {
  MAILBOX_CARD_WORDS,
  MAILBOX_CONNECTIONS_MAX,
  MAILBOX_DAILY_CAP_MAX,
  MAILBOX_DNS_WORDS,
  MAILBOX_HISTORY_WORDS,
  MAILBOX_PROVIDER_WORDS,
  MAILBOX_SIGNATURE_WORDS,
  customerDomainWords,
  mailboxActs,
  mailboxDnsOf,
  mailboxGmailSignsWords,
  mailboxHistoryLine,
  mailboxRecordRows,
  mailboxRecordStateWords,
  mailboxRowWords,
  mailboxSendingLines,
  mailboxSignsAsWords,
  mailboxSignsChoiceOf,
  mailboxSignsOf,
  mailboxesFootWords,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import type { ApiResult } from "@/client/api";
import { connectMailbox, mailboxConnectOutcome } from "./mailbox-connect";

interface ConnectedMailboxesApi {
  /** To the provider's consent screen (mailbox-connect.ts). */
  connect: typeof connectMailbox;
  /** The link a Microsoft 365 admin opens to approve Chanlytics for their organisation, once. */
  adminLink(): Promise<ApiResult<{ url: string }>>;
  set(
    id: string,
    s: {
      paused?: boolean;
      from_name?: string;
      signature?: string | null;
      signature_off?: boolean;
      daily_cap?: number;
    },
  ): Promise<ApiResult<unknown>>;
  resume(id: string): Promise<ApiResult<unknown>>;
  check(id: string): Promise<ApiResult<unknown>>;
  test(id: string): Promise<ApiResult<unknown>>;
  remove(id: string): Promise<ApiResult<unknown>>;
  /** What it brings in (0086): Stop where it stands, Resume (or Try again) where it stopped, or its six months brought. */
  history(id: string, act: "stop" | "resume" | "bring"): Promise<ApiResult<unknown>>;
  /** Where its history stands on its row, and the act that fits; and the choice's words. */
  historyLine: typeof mailboxHistoryLine;
  historyWords: typeof MAILBOX_HISTORY_WORDS;
  /** What the browser came back from the provider with, said once (mailbox-connect.ts). */
  outcome: typeof mailboxConnectOutcome;
  row: typeof mailboxRowWords;
  sending: typeof mailboxSendingLines;
  /** What it signs with (00487): the choice it stands on, what the Gmail choice says, the rule the send reads (the
   * sheet's preview), what the card says it signs as, and Settings' words. */
  signs: {
    choiceOf: typeof mailboxSignsChoiceOf;
    of: typeof mailboxSignsOf;
    as: typeof mailboxSignsAsWords;
    gmail: typeof mailboxGmailSignsWords;
    words: typeof MAILBOX_SIGNATURE_WORDS;
  };
  /** The Email card's and its sheet's words (the mailbox canvas, 27 Oct 2026). */
  card: typeof MAILBOX_CARD_WORDS;
  acts: typeof mailboxActs;
  records: typeof mailboxRecordRows;
  /** Its domain's records in the DNS sheet (the mailbox canvas's D1): how many found and to add, each one's state, the words. */
  dns: { of: typeof mailboxDnsOf; state: typeof mailboxRecordStateWords; words: typeof MAILBOX_DNS_WORDS };
  foot: typeof mailboxesFootWords;
  customerDomain: typeof customerDomainWords;
  providerWords: typeof MAILBOX_PROVIDER_WORDS;
  max: number;
  capMax: number;
}

export const connectedMailboxes: ConnectedMailboxesApi = {
  connect: connectMailbox,
  adminLink: () => api()("GET mailbox-connections/connect", { query: { provider: "microsoft", admin: "1" } }),
  set: (id, s) => api()("PATCH mailbox-connections/[id]", { params: { id }, body: s }),
  resume: (id) => api()("POST mailbox-connections/[id]/resume", { params: { id } }),
  check: (id) => api()("POST mailbox-connections/[id]/check", { params: { id } }),
  test: (id) => api()("POST mailbox-connections/[id]/test", { params: { id } }),
  remove: (id) => api()("DELETE mailbox-connections/[id]", { params: { id } }),
  history: (id, act) => api()("POST mailbox-connections/[id]/history", { params: { id }, body: { act } }),
  historyLine: mailboxHistoryLine,
  historyWords: MAILBOX_HISTORY_WORDS,
  outcome: mailboxConnectOutcome,
  row: mailboxRowWords,
  signs: {
    choiceOf: mailboxSignsChoiceOf,
    of: mailboxSignsOf,
    as: mailboxSignsAsWords,
    gmail: mailboxGmailSignsWords,
    words: MAILBOX_SIGNATURE_WORDS,
  },
  card: MAILBOX_CARD_WORDS,
  sending: mailboxSendingLines,
  acts: mailboxActs,
  records: mailboxRecordRows,
  dns: { of: mailboxDnsOf, state: mailboxRecordStateWords, words: MAILBOX_DNS_WORDS },
  foot: mailboxesFootWords,
  customerDomain: customerDomainWords,
  providerWords: MAILBOX_PROVIDER_WORDS,
  max: MAILBOX_CONNECTIONS_MAX,
  capMax: MAILBOX_DAILY_CAP_MAX,
};
