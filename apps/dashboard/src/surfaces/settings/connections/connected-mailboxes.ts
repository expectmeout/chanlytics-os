/**
 * The mailboxes a workspace connected to write its reach-outs from, on Settings › Connections (decision 0056): the
 * owner's acts -- connect one at Google or Microsoft, pause it, resume one its own mail held, set its name, signature
 * and cap, send a test to itself, Check its records, remove it -- and what each row says, which are contracts'
 * (email/mailbox-connections.ts), so the row says the same sentence the door and the clock decided.
 *
 * Every write is in the refresh map under Setup: the block repaints from Setup's re-read, and the mailboxes clock's
 * changes arrive the same way, by realtime (mailbox_connections is watched). A connect leaves for the provider and
 * comes back to this page with one word (`?mailbox=`), read once.
 */
import {
  MAILBOX_CONNECTIONS_MAX,
  MAILBOX_DAILY_CAP_MAX,
  MAILBOX_PROVIDER_WORDS,
  customerDomainWords,
  mailboxActs,
  mailboxConnectWords,
  mailboxRecordRows,
  mailboxWords,
  mailboxesFootWords,
  type MailboxProvider,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { ApiResult } from "@/client/api";

interface ConnectedMailboxesApi {
  /** To the provider's consent screen: the browser leaves, and comes back to Connections. */
  connect(provider: MailboxProvider): void;
  set(
    id: string,
    s: { paused?: boolean; from_name?: string; signature?: string | null; daily_cap?: number },
  ): Promise<ApiResult<unknown>>;
  resume(id: string): Promise<ApiResult<unknown>>;
  check(id: string): Promise<ApiResult<unknown>>;
  test(id: string): Promise<ApiResult<unknown>>;
  remove(id: string): Promise<ApiResult<unknown>>;
  /** What the browser came back from the provider with, said once: its words, and whether it connected. */
  outcome(): { ok: boolean; words: string } | null;
  words: typeof mailboxWords;
  acts: typeof mailboxActs;
  records: typeof mailboxRecordRows;
  foot: typeof mailboxesFootWords;
  customerDomain: typeof customerDomainWords;
  providerWords: typeof MAILBOX_PROVIDER_WORDS;
  max: number;
  capMax: number;
}

export const connectedMailboxes: ConnectedMailboxesApi = {
  connect: (provider) => window.location.assign(api().url("GET mailbox-connections/connect", { query: { provider } })),
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
      const ok = outcome === "connected" || outcome === "reconnected";
      return { ok, words: mailboxConnectWords(ok ? outcome : why) };
    } catch {
      return null;
    }
  },
  words: mailboxWords,
  acts: mailboxActs,
  records: mailboxRecordRows,
  foot: mailboxesFootWords,
  customerDomain: customerDomainWords,
  providerWords: MAILBOX_PROVIDER_WORDS,
  max: MAILBOX_CONNECTIONS_MAX,
  capMax: MAILBOX_DAILY_CAP_MAX,
};
