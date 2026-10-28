/**
 * The mailboxes a workspace connected to write its reach-outs from, on Settings › Connections (decision 0056): the
 * owner's acts -- connect one at Google or Microsoft, pause it, resume one its own mail held, set its name, signature
 * and cap, send a test to itself, Check its records, remove it -- and what each row says, which are contracts'
 * (email/mailbox-connections.ts), so the row says the same sentence the door and the clock decided.
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
  MAILBOX_PROVIDER_WORDS,
  MAILBOX_SIGNATURE_WORDS,
  customerDomainWords,
  mailboxActs,
  mailboxConnectOk,
  mailboxConnectWords,
  mailboxGmailSignsWords,
  mailboxRecordRows,
  mailboxRowWords,
  mailboxSendingLines,
  mailboxSignsAsWords,
  mailboxSignsChoiceOf,
  mailboxSignsOf,
  mailboxesFootWords,
  type MailboxProvider,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { ApiResult } from "@/client/api";

interface ConnectedMailboxesApi {
  /**
   * To the provider's consent screen: the door is asked for the way there, and the browser leaves only when it gave
   * one, so a refusal comes back here to be said on the page. A Reconnect names its mailbox.
   */
  /** `back: "start"` brings the owner back to the first run that asked (decision 0073), not to Connections. */
  connect(provider: MailboxProvider, mailboxId?: string | null, back?: "start"): Promise<ApiResult<unknown>>;
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
  /** What the browser came back from the provider with, said once: its words, whether it is good news, and its word. */
  outcome(): { ok: boolean; words: string; code: string | null } | null;
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
  foot: typeof mailboxesFootWords;
  customerDomain: typeof customerDomainWords;
  providerWords: typeof MAILBOX_PROVIDER_WORDS;
  max: number;
  capMax: number;
}

export const connectedMailboxes: ConnectedMailboxesApi = {
  connect: async (provider, mailboxId, back) => {
    const r = await api()("GET mailbox-connections/connect", {
      query: { provider, ...(mailboxId ? { mailbox_id: mailboxId } : {}), ...(back ? { back } : {}) },
    });
    if (r.ok) window.location.assign(r.data.url);
    return r;
  },
  adminLink: () => api()("GET mailbox-connections/connect", { query: { provider: "microsoft", admin: "1" } }),
  set: (id, s) => api()("PATCH mailbox-connections/[id]", { params: { id }, body: s }),
  resume: (id) => api()("POST mailbox-connections/[id]/resume", { params: { id } }),
  check: (id) => api()("POST mailbox-connections/[id]/check", { params: { id } }),
  test: (id) => api()("POST mailbox-connections/[id]/test", { params: { id } }),
  remove: (id) => api()("DELETE mailbox-connections/[id]", { params: { id } }),
  outcome() {
    try {
      const q = new URLSearchParams(window.location.search);
      const outcome = q.get("mailbox");
      if (!outcome) return null;
      const why = q.get("why");
      q.delete("mailbox");
      q.delete("why");
      const rest = q.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
      );
      const ok = mailboxConnectOk(outcome);
      const code = ok ? outcome : why;
      return { ok, words: mailboxConnectWords(code), code };
    } catch {
      return null;
    }
  },
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
  foot: mailboxesFootWords,
  customerDomain: customerDomainWords,
  providerWords: MAILBOX_PROVIDER_WORDS,
  max: MAILBOX_CONNECTIONS_MAX,
  capMax: MAILBOX_DAILY_CAP_MAX,
};
