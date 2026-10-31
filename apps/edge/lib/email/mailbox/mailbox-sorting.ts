/**
 * Whether a connected mailbox takes an email in as a person's, or leaves it where it is, and why (decision 0073, R13
 * and R19; 00483; decision 0080). One sorting for the live read (mailbox-sync.ts) and the six months
 * (imports/mail-history.ts), asked only outside a thread a reach-out started (a reply there is a reply, whatever it
 * looks like), in this order:
 *
 *   ours         the platform's own sender (LEAD_FROM): an alert, a digest, an invitation from Chanlytics is never a
 *                person, whatever the workspace said. Mail sent before every one carried Auto-Submitted (#1858) has
 *                nothing else to tell it by, and the six months bring it in to any workspace, whatever its own domains.
 *                Left as automated, or as its own where the workspace's domain is the platform's too.
 *   said         what the workspace said of the sender (contracts senderVerdictOf, by address, then by domain): a person
 *                comes in whatever the email looks like, an automated sender is left.
 *   own          the sender is on one of the workspace's own domains (its connected mailboxes' hosts): the business's
 *                own mail -- its website's notifier, its alerts, a colleague, its other mailbox -- is never a person's
 *                (the 27 Oct 2026 walk). Not listed as a sender left: it is not a stranger's mail.
 *   claim        what the email claims to be (channels classifyReceived): anything but a person's is left.
 *   gmail_tab    Gmail filed it under Promotions, Social or Forums (channels filedAsBulk).
 *   talks        the business talks with the sender (db talksWith: it wrote them an email, they are on another wire,
 *                or a door the owner chose made them): in. A person a mailbox's own mail made is not one: the first
 *                notice from a program made its person, and every later one came from "someone known" (30 Oct 2026).
 *   reading      what Chanlytics read the sender to be, kept (00495): in for someone asking or writing as a person,
 *                left as a pitch, a notice or a relayed message.
 *   others_said  three or more other workspaces' owners said the sender's domain is automated (never a free-mail one).
 *   updates      Gmail filed it under Updates (channels filedUnderUpdates) and it answers nothing (no In-Reply-To, no
 *                References): a stranger's notice, an account's alert, an invoice.
 *   service      a mailing service sent it (channels sentByAService: Amazon SES, SendGrid, ...) and its replies go to
 *                nobody else (replyToElsewhere): a program's notice. A form passing on someone's message names them as
 *                its Reply-To, and is read.
 *   (read)       anything else is a stranger: the model reads their first email (mailbox-reader.ts) and what it read is
 *                kept. Nothing answered (no key, no spend, no answer): in, as before, and read again next time.
 *
 * What is left is noted, one line a sender (00483 mailbox_left), so the owner sees who was left and why.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addressOf,
  classifyReceived,
  filedAsBulk,
  filedUnderUpdates,
  replyToElsewhere,
  sentByAService,
  type MailboxEmail,
} from "../../packages/channels.js";
import {
  isFreeMail,
  normalizeEmail,
  senderLeftWhy,
  senderVerdictOf,
  type MailboxLeftWhy,
  type MailboxSenderVerdict,
  type SenderReading,
} from "../../packages/contracts.js";
import {
  domainSaidAutomated,
  mailboxConnectionsOf,
  mailboxSenderVerdicts,
  noteMailboxLeft,
  senderReadingOf,
  talksWith,
  type Database,
} from "../../packages/db.js";
import { platformFrom } from "../../ops/notify.js";
import type { Logger } from "../../log.js";
import { answersSomething, senderReaderFor, type SenderReader } from "./mailbox-reader.js";

type Db = SupabaseClient<Database>;

/**
 * What a sorting reads beside the email: the platform's own sending address, what the workspace said of its senders,
 * its own domains, and, asked as needed and once a sender: whether the business talks with an address, what Chanlytics
 * read a sender to be, what other workspaces said of a domain, and the reader of a stranger's first email.
 */
export interface MailSorting {
  /** The platform's own sending address (LEAD_FROM), lower-cased; null where this deployment sends none. */
  ours: string | null;
  said: ReadonlyMap<string, MailboxSenderVerdict>;
  /** The hosts of the workspace's connected mailboxes, lower-cased: mail from them is the business's own. */
  own: ReadonlySet<string>;
  talks(address: string): Promise<boolean>;
  reading(address: string): Promise<SenderReading | null>;
  othersSaid(domain: string): Promise<boolean>;
  /** Reads a stranger's email (mailbox-reader.ts), at most once a sender a sorting; null where nothing answered. */
  read: SenderReader;
}

/** How many readings may go unanswered before a sorting stops asking: a model that is down is not asked all minute. */
const UNREAD_MAX = 3;

/** An answer per key, asked once a sorting. */
function memoBy<T>(ask: (key: string) => Promise<T>): {
  get: (key: string) => Promise<T>;
  put: (key: string, v: T) => void;
} {
  const asked = new Map<string, Promise<T>>();
  return {
    get: (key) => {
      const had = asked.get(key);
      if (had) return had;
      const now = ask(key);
      asked.set(key, now);
      return now;
    },
    put: (key, v) => {
      asked.set(key, Promise.resolve(v));
    },
  };
}

/**
 * A workspace's sorting, read once for a sync or a part: what it said of its senders and its mailboxes' domains now,
 * the rest as needed. `reader` is the tests' own; a workspace's is mailbox-reader.ts's.
 */
export async function mailSortingFor(
  db: Db,
  tenantId: string,
  log: Logger,
  reader: SenderReader = senderReaderFor(db, tenantId, log),
): Promise<MailSorting> {
  const [said, boxes] = await Promise.all([mailboxSenderVerdicts(db, tenantId), mailboxConnectionsOf(db, tenantId)]);
  const talks = memoBy((a) => talksWith(db, tenantId, a));
  const readings = memoBy((a) => senderReadingOf(db, tenantId, a));
  const others = memoBy((d) => domainSaidAutomated(db, tenantId, d));
  // One reading a sender a sorting: a second email from them while the first is read waits for it, and one nothing
  // answered for stays unanswered until the next sorting.
  const reads = new Map<string, Promise<SenderReading | null>>();
  let unread = 0;
  return {
    ours: addressOf(platformFrom())?.address ?? null,
    said,
    own: new Set(boxes.map((b) => b.host.toLowerCase())),
    talks: talks.get,
    reading: readings.get,
    othersSaid: others.get,
    read: (e, until) => {
      const from = normalizeEmail(e.from?.address) ?? "";
      const had = reads.get(from);
      if (had) return had;
      if (unread >= UNREAD_MAX) return Promise.resolve(null);
      const now = reader(e, until).then((r) => {
        if (r) readings.put(from, r);
        else unread++;
        return r;
      });
      reads.set(from, now);
      return now;
    },
  };
}

/** Why a sorting leaves an email: a reason the owner's list of senders notes, or the business's own mail, which it does not. */
export type SortedWhy = MailboxLeftWhy | "own";

/** What the rules say of an email: left and why, in, or a stranger only a reading can judge. */
export type RulesSay = SortedWhy | "in" | "stranger";

/** The domain an address is at. */
const domainOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1);

/** What the workspace and the email's own headers settle, before anything is asked of the sender. */
function settledBy(e: MailboxEmail, s: MailSorting, from: string | null): RulesSay | null {
  if (from && from === s.ours) return s.own.has(domainOf(from)) ? "own" : "automated";
  const said = from ? senderVerdictOf(s.said, from) : null;
  if (said === "person") return "in";
  if (said === "automated") return "said";
  if (from && s.own.has(domainOf(from))) return "own";
  const claim = classifyReceived(e);
  if (claim !== "person") return claim;
  if (filedAsBulk(e)) return "gmail_tab";
  return from ? null : "in";
}

/**
 * What the rules say of an email, the model never asked: the order above to its last line. The six months ask it of a
 * message read by its headers alone (mail-history.ts), and read it whole only where it may come in.
 */
export async function sortByRules(e: MailboxEmail, s: MailSorting): Promise<RulesSay> {
  const from = normalizeEmail(e.from?.address);
  const settled = settledBy(e, s, from);
  if (settled || !from) return settled ?? "in";
  if (await s.talks(from)) return "in";
  const read = await s.reading(from);
  if (read) return senderLeftWhy(read.kind) ?? "in";
  const domain = domainOf(from);
  if (!isFreeMail(domain) && (await s.othersSaid(domain))) return "others_said";
  if (filedUnderUpdates(e) && !answersSomething(e)) return "updates";
  if (sentByAService(e) && !replyToElsewhere(e)) return "service";
  return "stranger";
}

/**
 * Why the mailbox leaves this email where it is, or null when it comes in as a person's: the rules, then, for a
 * stranger, the model's reading of their email before `until` (epoch ms), the caller's own line.
 */
export async function leftWhy(
  e: MailboxEmail,
  s: MailSorting,
  until = Number.POSITIVE_INFINITY,
): Promise<SortedWhy | null> {
  const say = await sortByRules(e, s);
  if (say === "in") return null;
  if (say !== "stranger") return say;
  const read = await s.read(e, until);
  return read ? senderLeftWhy(read.kind) : null;
}

/**
 * The line about what was left, one a sender (00483): best effort, the email is left either way. The business's own
 * mail is no stranger's, and is not listed.
 */
export async function noteLeft(db: Db, tenantId: string, e: MailboxEmail, why: SortedWhy): Promise<void> {
  const address = normalizeEmail(e.from?.address);
  if (!address || why === "own") return;
  await noteMailboxLeft(db, {
    tenantId,
    address,
    name: e.from?.name ?? null,
    why,
    at: e.createdAt ?? new Date().toISOString(),
  });
}
