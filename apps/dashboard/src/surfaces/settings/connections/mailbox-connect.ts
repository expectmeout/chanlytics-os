/**
 * Leaving for a provider's consent screen, and what the browser came back with. Apart from connected-mailboxes.ts, whose
 * words are a whole page's: New and Cold email connect a mailbox and draw none of its rows.
 */
import {
  mailboxConnectOk,
  mailboxConnectWords,
  type MailboxHistory,
  type MailboxProvider,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import type { ApiResult } from "@/client/api";

/** The page that asked, where the owner comes back to (mailbox-connections.ts CONNECT_CAME_FROM); absent, Connections. */
type ConnectBack = "start" | "new" | "cold_email";

/**
 * To the provider's consent screen: the door is asked for the way there, and the browser leaves only when it gave one, so
 * a refusal comes back here to be said on the page. A Reconnect names its mailbox. `history` is what its owner chose of a
 * new mailbox's history (decision 0086); absent, its last six months.
 */
export const connectMailbox = async (
  provider: MailboxProvider,
  mailboxId?: string | null,
  back?: ConnectBack,
  history?: MailboxHistory,
): Promise<ApiResult<unknown>> => {
  const r = await api()("GET mailbox-connections/connect", {
    query: {
      provider,
      ...(mailboxId ? { mailbox_id: mailboxId } : {}),
      ...(back ? { back } : {}),
      ...(history && !mailboxId ? { history } : {}),
    },
  });
  if (r.ok) window.location.assign(r.data.url);
  return r;
};

/** What the browser came back from the provider with, said once: its words, whether it is good news, and its word. */
export const mailboxConnectOutcome = (): { ok: boolean; words: string; code: string | null } | null => {
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
};
