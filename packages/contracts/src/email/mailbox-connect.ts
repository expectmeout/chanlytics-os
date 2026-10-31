/**
 * Connecting a mailbox, in words: what came of a connect, by the code the edge answers with, and what a mailbox brings
 * in as it connects (decision 0086), the words under Connect and the one act its row offers while its history comes in.
 * Its own module, so the first run's email card takes these without the rest of Connections' mailbox sentences.
 * Pure; the imports ledger's own line (imports/ledger.ts) says the run.
 */
import { IMPORT_STOPPED_WORDS, IMPORT_WORDS, importLineOf, type ImportRowDto } from "../imports/ledger";
import { clockDate } from "../shared/clock";
import type { SchemaSet } from "../shared/schema-sets";
import { MAILBOXES_PER_DOMAIN_MAX, MAILBOX_CONNECTIONS_MAX, type MailboxConnectionDto } from "./mailbox-connections";

/** What its owner chose as it connected (0086, 00499): its last six months brought in, or only what comes after. */
export type MailboxHistory = SchemaSet<"mailbox_connections.history">;

/** Why a connect did not finish, by the code the edge answers with, as the owner reads it once back from the provider. */
const CONNECT_FAILED = "That didn't go through. Try again in a minute.";
export const MAILBOX_CONNECT_WORDS: Record<string, string> = {
  // Said whatever it brings: its row and the Brought in card say where its history stands (0086).
  connected: "Connected: email from people comes into your Inbox.",
  reconnected: "Connected again: its emails go on where they waited.",
  declined: "Nothing was connected: the sign-in was cancelled.",
  scopes_missing: "Nothing was connected: send and read access are both needed. Connect again and leave both ticked.",
  no_refresh_token: "Nothing was connected: the provider gave no lasting access. Connect again.",
  taken: "Another workspace writes from this mailbox. Remove it there first.",
  too_many: `A workspace writes from ${MAILBOX_CONNECTIONS_MAX} mailboxes at most. Remove one to add another.`,
  too_many_on_domain: `A workspace writes from ${MAILBOXES_PER_DOMAIN_MAX} mailboxes on one domain at most.`,
  free_mail:
    "A free mailbox (Gmail.com, Outlook.com and the like) isn't for writing to businesses: connect one on your own domain.",
  not_available: "Connecting a mailbox isn't switched on here yet.",
  // The page's own gate says the same (contracts roleGate on `settings`), and so does the door's refusal.
  not_owner: "Only an owner can connect a mailbox.",
  no_address: "Nothing was connected: the provider didn't say which address the account sends from. Connect again.",
  unverified:
    "Nothing was connected: Google hasn't verified that account's address yet. Verify it, then connect again.",
  not_workspace:
    "Nothing was connected: that Google account isn't a Google Workspace mailbox. Connect the one your business writes from.",
  no_mailbox:
    "Nothing was connected: that account has no mailbox to send from (Gmail or Exchange isn't switched on for it). Ask whoever runs your email to switch it on.",
  wrong_account: "Nothing was connected: that's a different account. Sign in as the mailbox you're reconnecting.",
  admin_consent:
    "Your organisation's Microsoft 365 admin approves Chanlytics once. Copy the link for them, then connect again when they have.",
  admin_approved: "Approved for your organisation. Connect the mailbox now.",
  failed: CONNECT_FAILED,
};

/** The outcomes that are good news, said in the note's calm tone. */
const CONNECT_OK = new Set(["connected", "reconnected", "admin_approved"]);

/** Whether the word a connect came back with is good news. */
export function mailboxConnectOk(code: string | null | undefined): boolean {
  return !!code && CONNECT_OK.has(code);
}

export function mailboxConnectWords(code: string | null | undefined): string {
  return (code && MAILBOX_CONNECT_WORDS[code]) || CONNECT_FAILED;
}

/**
 * What a mailbox brings as it connects, chosen under Connect (0086): one quiet line saying it, Change to open the two
 * ways, and each way's one line of what happens. Its row in Connections says where its history stands while there is
 * something to say and offers the one act that fits: Stop while it comes in, Resume once stopped, Try again after it
 * failed, and the six months for a mailbox that chose from now on.
 */
export const MAILBOX_HISTORY_WORDS = {
  line: {
    six_months: "Brings in the last 6 months of email from people.",
    from_now: "Only email that arrives from now on.",
  },
  change: "Change",
  /** The two ways' group, for a screen reader: the line above says it to the eye. */
  choose: "What comes in as it connects",
  ways: {
    six_months: {
      label: "Last 6 months",
      says: "Your Inbox and People start full. Newsletters and notices stay in your mailbox.",
    },
    from_now: {
      label: "From now on",
      says: "Nothing older comes in. You can bring in the last 6 months later, from Connections.",
    },
  },
  /** A mailbox that chose from now on, on its row: since the day it connected, by the workspace's calendar. */
  fromNow: (day: string) => `Email from ${day} on`,
  stop: "Stop",
  resume: "Resume",
  again: IMPORT_WORDS.retry,
  bring: "Bring in the last 6 months",
  /** A toast's title where the door refused the act. */
  refused: { stop: "Not stopped", resume: "Not resumed", again: "Not started", bring: "Not started" },
} as const satisfies {
  line: Record<MailboxHistory, string>;
  ways: Record<MailboxHistory, { label: string; says: string }>;
  [k: string]: unknown;
};

/** What a mailbox's row offers for its history (MailboxHistoryLine). */
export type MailboxHistoryAct = "stop" | "resume" | "again" | "bring";

/** A mailbox's own history on its row: where it stands, and the one act that fits. */
export interface MailboxHistoryLine {
  says: string;
  act: MailboxHistoryAct | null;
}

/**
 * Where one mailbox's history stands, on its row in Connections (0086): coming in (Stop), stopped by its owner
 * (Resume), stopped by a failure (Try again), or, chosen from now on and never brought, since when its mail comes (the
 * six months). The words are the ledger's own line for its row (importLineOf), so the row and the Brought in card never
 * say one run two ways. Null where nothing is said: in (the Email card counts it), signed out (the row's Reconnect
 * starts it again), or no run of its own (a mailbox connected before 00499 brought its six months in on the
 * workspace's row).
 */
export function mailboxHistoryLine(
  m: Pick<MailboxConnectionDto, "id" | "history" | "connected_at" | "state">,
  rows: readonly ImportRowDto[] | null | undefined,
  nowMs: number,
  tz: string,
): MailboxHistoryLine | null {
  if (m.state === "removed") return null;
  const row = (rows ?? []).find((r) => r.source === "mailbox" && r.connection_id === m.id) ?? null;
  const W = MAILBOX_HISTORY_WORDS;
  if (!row) {
    if (m.history !== "from_now") return null;
    const at = Date.parse(m.connected_at);
    return { says: Number.isFinite(at) ? W.fromNow(clockDate(at, tz, nowMs)) : W.line.from_now, act: "bring" };
  }
  const l = importLineOf(row, tz);
  if (row.state === "running" || row.state === "queued") return { says: `${l.says} · ${l.stand}`, act: "stop" };
  if (row.state !== "failed" || m.state === "reconnect") return null;
  return { says: l.says, act: row.last_error === IMPORT_STOPPED_WORDS.byYou ? "resume" : "again" };
}
