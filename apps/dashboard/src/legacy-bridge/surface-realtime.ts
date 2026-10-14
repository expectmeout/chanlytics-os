/**
 * Which realtime events repaint which surface.
 *
 * The runner holds ONE subscription and used to fan every event out to every
 * realtime-refreshed surface. When the calls table joined the watch list,
 * each transcript turn of a live call (an UPDATE every few seconds) re-ran
 * the Inbox, Today, Conversations, People and Reports fetches — three of
 * them plpgsql aggregates — per open tab. A surface now says which tables
 * it cares about; the historical trio stays the default for the surfaces
 * that never said.
 *
 * Pure, so the rule is tested without a browser.
 */
import { liveTablesOf, type MessageStatus, type RecordKind, type RecordTable } from "@chanlytics/contracts";

export const DEFAULT_REFRESH_TABLES: readonly string[] = ["messages", "conversations", "escalations"];

/**
 * What a thread has to draw of a message once it has left the queue: the ticks (sent, delivered, read) and the two
 * ends (failed, canceled). Not `received`, an inbound row's meta stamped after the fact, which no tick follows, and not
 * `queued`, a row still waiting.
 */
export const LEFT_THE_QUEUE: readonly MessageStatus[] = ["sent", "delivered", "read", "failed", "canceled"];

/** A delivery's receipts: a message on its way, arrived, read. None of them moves a hold, a call or a count of the day. */
const RECEIPTS: ReadonlySet<string> = new Set(["sent", "delivered", "read"]);

/**
 * The receipts a campaign's counts are made of: Sent's "N delivered", and the funnels' Delivered and Read (run_counts reads them
 * off the messages; what was sent or failed is the run's own rows, heard as a send). Heard where those counts are drawn (the
 * wiring's second audit, S3-5): a run finished, and was read, before most of its receipts came, and its counts stood still
 * while the page was open.
 */
export const COUNTED_RECEIPTS: readonly MessageStatus[] = ["delivered", "read"];

/**
 * How long a surface that counts receipts (`receiptsQuietMs`) waits for a run's receipts to quieten before it reads them,
 * and the longest it waits from the first while they keep coming: a run of five hundred is a thousand receipts in a few
 * minutes, each its own notice, and a count need not follow each one. A change that is not a receipt is read at the
 * surface's own pace.
 */
export const RECEIPTS_QUIET_MS = 5_000;
export const RECEIPTS_LONGEST_WAIT_MS = 30_000;

/**
 * Whether what a read was asked for by is a delivery's receipts alone: every change heard a message's update to sent, delivered
 * or read. Such a read re-reads the threads, whose last words carry the ticks, and nothing beside them: every receipt of a
 * reminder run made the Inbox and Conversations read the holds and the calls again, three requests where one tells (the wiring's
 * second audit, S10-2). None heard (a write's read, a pass, the boot) is no tick.
 */
export function deliveryTicksOnly(heard: readonly RealtimeChange[] | undefined): boolean {
  return (
    !!heard?.length &&
    heard.every(
      (c) =>
        c.table === "messages" &&
        c.event === "UPDATE" &&
        typeof c.row.status === "string" &&
        RECEIPTS.has(c.row.status),
    )
  );
}

/** One realtime event, as the rule sees it. */
export interface RealtimeChange {
  table: string;
  /** INSERT | UPDATE | DELETE, or "*" when the source did not say. */
  event: string;
  row: Record<string, unknown>;
  /**
   * The clock the database told this change by (ISO 8601, UTC, to the millisecond; 00408): when its statement finished,
   * a moment before the commit that let the tab hear it. Absent on a notice sent before 00408 and where the source did
   * not say. It is the database's clock, not the browser's.
   */
  at?: string;
}

/**
 * A transcript turn of a call in progress: an UPDATE of a call that stays ongoing, told every few seconds. It changes nothing a
 * figure counts, so the surfaces that count calls (Today, the Receptionist lens) leave it out of their rule; a call starting (an
 * INSERT) or ending (an UPDATE that leaves another status) is not a turn. Live, which draws the transcript, hears each.
 */
export function isLiveCallTurn(change: RealtimeChange): boolean {
  return change.table === "calls" && change.event === "UPDATE" && change.row.status === "ongoing";
}

export interface RefreshPreference {
  /** The historical flag: repaint on the default tables. */
  refreshOnMessageInserts?: boolean;
  /** An explicit list wins over the flag. */
  refreshOnTables?: readonly string[];
  /**
   * A finer rule on top of the table list, judged per event. Today wants a
   * call STARTING and ENDING, not the transcript turn every few seconds in
   * between — those are UPDATEs that leave the status ongoing.
   */
  refreshWhen?: (change: RealtimeChange) => boolean;
  /**
   * The statuses a message's UPDATE re-applies this surface for (00327). A message's update is told for every receipt
   * a provider sends, and the default tables were an arrival's before it, so a surface hears an update only by naming
   * what it draws of it: the Inbox and Conversations their ticks, Today a send that failed. Absent, it hears none, as
   * before. An update's notice carries the statuses its statement left, each a change of its own.
   */
  refreshOnMessageStatuses?: readonly MessageStatus[];
}

export function wantsRefresh(o: RefreshPreference, table: string, change?: RealtimeChange): boolean {
  const wanted = o.refreshOnTables?.length
    ? o.refreshOnTables.includes(table)
    : !!o.refreshOnMessageInserts && DEFAULT_REFRESH_TABLES.includes(table);
  if (!wanted) return false;
  // A message's update, heard only for the statuses the surface named (refreshOnMessageStatuses).
  if (change && table === "messages" && change.event === "UPDATE")
    if (!o.refreshOnMessageStatuses?.some((s) => s === change.row.status)) return false;
  return o.refreshWhen && change ? o.refreshWhen(change) : true;
}

/** True when the surface subscribes to anything at all. */
export function subscribesToRealtime(o: RefreshPreference): boolean {
  return !!o.refreshOnMessageInserts || !!o.refreshOnTables?.length;
}

/**
 * How fresh a surface must stay, said once (decision 0047):
 *  - `"live"`: a change to a record it draws reads it again, wherever the owner is on the product.
 *  - `"its-page"`: the same, but only while its page is on screen, and once when the owner comes back to it
 *    (surface-registry.ts onlyOnItsPage): for the dear reads, which the other pages need not pay for.
 *  - `{ aged }`: the feed tells it nothing. It is read where it is drawn, once what it holds is this many minutes old
 *    (`onDemand`, `isStale`, surface-data.ts readAged).
 *  - `"own-change"`: the feed tells it nothing and no clock ages it. It is read at boot and after the owner's own writes
 *    (refresh-map.ts), and a verb of its own publishes what it changed.
 */
export type Freshness = "live" | "its-page" | "own-change" | { aged: number };

/** Tables of a kind a surface draws and leaves unheard on purpose, in groups that share a reason. */
export type OmittedTables = readonly { tables: readonly RecordTable[]; why: string }[];

/**
 * What a surface draws and how fresh it must stay. Its live tables (`refreshOnTables`) are derived from this by
 * `declareReads` (surface-registry.ts), never written beside it: a table of a kind it draws is heard unless it says, with a
 * reason, that it is not.
 */
export interface ReadsDeclaration {
  /** The kinds of record it draws; it hears the tables of these (contracts liveTablesOf). */
  reads: readonly RecordKind[];
  fresh: Freshness;
  /**
   * Tables of those kinds it leaves unheard on purpose, each group with the reason. A surface that draws the number and the
   * pause of a channel but not its mailbox says so here; the kind stays what it draws.
   */
  omit?: OmittedTables;
  /** Tables beside its kinds it hears on purpose: a change that moves what it draws without being a record it draws. */
  extra?: readonly RecordTable[];
  /**
   * Under `"its-page"`: the kinds that are the surface's own, heard wherever the owner is. A table of the other kinds is
   * heard on its page, and kept for it elsewhere (surface-registry.ts onlyOnItsPage: a table it does not name is its own).
   */
  always?: readonly RecordKind[];
  /**
   * The surface's own rule per event, asked before the page rule: Today leaves out a call's transcript turn, so a turn
   * heard on another page is not kept for Today either. Absent, every event of a table it hears is heard.
   */
  when?: (change: RealtimeChange) => boolean;
  /**
   * Under `"its-page"`: what the surface calls its page, given the standard rule (the page it owns is on screen, else the
   * change is kept for it). The Campaigns lens narrows it to the lens alone, on a page that owns the Overview as well.
   */
  page?: (here: (change: RealtimeChange) => boolean) => (change: RealtimeChange) => boolean;
}

/** What a declaration comes to, to spread into the surface's override. */
export interface DeclaredReads {
  reads: readonly RecordKind[];
  fresh: Freshness;
  /** What it left unheard on purpose, with why: kept on the override so what is heard and what is not account for every table. */
  omit?: OmittedTables;
  /** Derived; absent where the surface hears nothing. */
  refreshOnTables?: string[];
  /** Derived from `when` and the page rule; absent where the surface has neither. */
  refreshWhen?: (change: RealtimeChange) => boolean;
}

/**
 * The tables a declaration hears, each once: the tables of the kinds it draws, less those it omits, and the extra. None where
 * the feed tells the surface nothing (`{ aged }`, `"own-change"`).
 */
export function heardTables(d: ReadsDeclaration): string[] {
  if (d.fresh !== "live" && d.fresh !== "its-page") return [];
  const left = new Set<string>((d.omit ?? []).flatMap((group) => group.tables));
  const tables: string[] = liveTablesOf(d.reads).filter((t) => !left.has(t));
  for (const t of d.extra ?? []) if (!tables.includes(t)) tables.push(t);
  return tables;
}

/** The tables a declaration hears only on its page: all it hears under `"its-page"`, less the kinds that are its own. */
export function heardOnItsPage(d: ReadsDeclaration): string[] {
  if (d.fresh !== "its-page") return [];
  const own = new Set<string>(liveTablesOf(d.always ?? []));
  return heardTables(d).filter((t) => !own.has(t));
}

/**
 * The longest a stream of notices is waited out, from the first, for a read of everyone in People (People, Sent's runs, the
 * playbooks): a reminder run's receipts are each a notice, and the runner's three seconds made each of these the whole book every
 * three seconds while it sent (the wiring's second audit, S10-2). One change alone is still read in under a second.
 */
export const DEAR_READ_LONGEST_WAIT_MS = 12_000;

/** How long the live feed may be down before the shell says so: the client rejoins a blip within seconds. */
export const REALTIME_GRACE_MS = 5000;

export interface FeedWatch {
  onStatus(status: string): void;
  /** The runner is tearing down: its own close is not a drop, and nothing more is said. */
  stop(): void;
}

/**
 * What the live feed's own reports mean for the page. The first join (`onJoin`) and every rejoin after it (`onReconnect`) read
 * what was missed, because the feed replays nothing it missed: what was read before the first join never heard what changed
 * between its read and the join (the wiring's second audit, S2-4). A drop is said only once it outlasts the grace, so a blip the
 * client rejoins within seconds never flashes a line, and it is said once however many errors follow; the feed's return is said
 * at once.
 */
export function feedWatch(opts: {
  graceMs: number;
  onDown: (down: boolean) => void;
  onReconnect: () => void;
  onJoin?: () => void;
}): FeedWatch {
  let joined = false;
  let down = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    onStatus(status) {
      if (stopped) return;
      if (status === "SUBSCRIBED") {
        clear();
        if (down) {
          down = false;
          opts.onDown(false);
        }
        if (joined) opts.onReconnect();
        else opts.onJoin?.();
        joined = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        timer ??= setTimeout(() => {
          timer = null;
          if (stopped || down) return;
          down = true;
          opts.onDown(true);
        }, opts.graceMs);
      }
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
