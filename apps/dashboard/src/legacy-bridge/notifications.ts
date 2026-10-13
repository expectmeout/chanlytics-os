/**
 * The bell, wired to what the browser already holds.
 *
 * Reads the Inbox threads, the Live calls and the open invitations the
 * surfaces have fetched, builds the feed (contracts/notifications.ts), shows
 * it beside the rows the workspace keeps (the notifications surface), and —
 * when the owner asked for it — raises a system notification for something
 * new that needs them while the app is in the background.
 *
 * What lives where, so two devices agree:
 *   - the kept rows' read and dismissed marks are the server's;
 *   - the "seen everything" moment is the server's too: Mark all read writes
 *     it there, every device reads it back, and this device keeps its own
 *     copy only so the badge does not wait for the re-read;
 *   - read and dismissed marks on DERIVED rows (a thread that needs you, a
 *     held draft, a missed call, an open invitation — rows nothing stores)
 *     stay on this device, keyed by the workspace's id, and go when their
 *     row has left the feed; except a thread that needs you whose hold the
 *     edge has kept: that row is one with the kept notice and carries ITS
 *     marks, the server's (contracts bellFeed);
 *   - the phone app's icon is the kept rows' unread count alone (keptUnread),
 *     the number the edge counts before a push;
 *   - the device-alert switch is this device's, by definition.
 *
 * Published to the mockup's top bar as window.__notifs.
 */
import {
  ALERT_KINDS,
  EMPTY_READ_STATE,
  agoLabel,
  bellActionOf,
  bellCalls,
  bellFeed,
  bellSections,
  type BellSectionVM,
  buildNotificationFeed,
  type FeedInvite,
  type FeedLive,
  type FeedThread,
  type NotificationItem,
  type NotificationReadState,
  type NotificationRow,
  type NotificationsDto,
  type ReachOutRepliesDto,
  SERVER_KEY_PREFIX,
  type WhatWaits,
  holdMarksOf,
  keptUnreadOf,
  nameKnownCustomers,
  bellOlderOf,
  serverNotificationRows,
  settledNoticeIds,
  unreadCount,
  type RunDays,
} from "@chanlytics/contracts";
import { surfaceValue } from "../surfaces/surface-values";
import { approvalDaysNow } from "../surfaces/campaigns/broadcasts/when-words";
import { api as client, serversClockOf } from "./api";
import type { Input } from "../client/api";
import { onSurfaceMoved } from "./surface-status";
import { getActiveWorkspace, goToRoute } from "./workspace";

export const FEED_EVENTS = [
  "surface:inbox",
  "surface:live",
  "surface:settings",
  "surface:workspace",
  "surface:notifications",
] as const;

/**
 * The surfaces that say whether a kept row's subject still waits (whatWaits): the runs in Sent, the booking emails the Calendar
 * holds, the reviews Google's read holds, the searches Leads holds. The bell is drawn again when one of them moves, as when its
 * own pages do; they alert no one (the rows' own kinds do), so they are heard as surfaces moving and not as feed events. The
 * Inbox's threads say whether a hold still waits too, and are heard already (FEED_EVENTS' surface:inbox): listed here they
 * would draw the bell twice per Inbox read.
 */
const WAITS_SURFACES = ["broadcasts", "calendar", "google", "leads"] as const;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Globals {
  INBOX_DATA?: { THREADS?: FeedThread[] };
  __LIVE?: FeedLive;
  __TEAM_INVITES?: FeedInvite[] | null;
  /** The kept rows, from the notifications surface. */
  __NOTIFICATIONS?: { dto: NotificationsDto } | null;
  /** The workspace's id, as the server decided it. The marks are keyed by it: the slug is an address, and addresses change. */
  __ACTIVE_WORKSPACE?: string;
}

/** The row the popover draws: the mockup's own shape. */
export interface BellRow {
  id: string;
  /** What kind of thing this is, so a reader can group twelve of them into one row (contracts todayAwayGrouped). */
  kind: string;
  icon: string;
  tone: string;
  unread: boolean;
  time: string;
  title: string;
  message: string;
  /** The record it is about, when the edge said so -- how Today knows this conversation is already in its queue. */
  about: { type: string; id: string } | null;
  actions: Array<{ label: string; to: string; primary: boolean }>;
}

/** The runs Sent holds, with what the verb asks of each and the emails the check holds in a going reach-out run. */
function runsHeld(): WhatWaits["runs"] {
  const sent = surfaceValue("broadcasts");
  if (!sent || !Array.isArray(sent.rows)) return null;
  return {
    readAt: serversClockOf(sent.fetchedAt),
    held: new Map(
      sent.rows.map((r) => [
        r.id,
        {
          state: r.state,
          playbook_id: r.playbook_id,
          run_for: r.run_for,
          audience: r.audience,
          held: typeof r.held === "number" ? r.held : null,
        },
      ]),
    ),
  };
}

/** The business's days a waiting run is judged by: asked only over runs to judge, and none where the clock cannot say. */
function runDays(runs: WhatWaits["runs"]): RunDays | null {
  if (!runs || !runs.held.size) return null;
  try {
    return approvalDaysNow();
  } catch {
    return null;
  }
}

/**
 * The threads the Inbox holds, by conversation id, and whether each needs you now: only from a read that took every hold that
 * waits on a person with its thread (holdsWhole), since a hold the read did not take would read as no longer waiting.
 */
function holdsHeld(): WhatWaits["holds"] {
  const inbox = surfaceValue("inbox");
  if (!inbox || typeof inbox.readAt !== "number" || inbox.holdsWhole !== true || !Array.isArray(inbox.THREADS))
    return null;
  return {
    readAt: serversClockOf(inbox.readAt),
    held: new Map(inbox.THREADS.flatMap((t) => (t.real ? [[t.conversationId, !!t.needsYou] as const] : []))),
  };
}

/** The searches Leads holds, by id, with their newest round's id and state, from when the read was asked. */
function searchesHeld(): WhatWaits["searches"] {
  const leads = surfaceValue("leads");
  if (!leads || typeof leads.readAt !== "number" || !Array.isArray(leads.searches)) return null;
  return {
    readAt: serversClockOf(leads.readAt),
    held: new Map(leads.searches.map((s) => [s.id, { roundId: s.round?.id ?? null, state: s.round?.state ?? null }])),
  };
}

/**
 * What the surfaces this tab holds say still waits on the owner (contracts notice-closes.ts): the runs Sent holds, the booking emails
 * the Calendar's read holds, the reviews Google's read holds, the threads the Inbox holds and the searches Leads holds, each with
 * when it was read, and none before it is. A booking email list the card cut at its twenty (or never listed) is not the whole of
 * them, and settles nothing; nor does one from a server that did not say each email's delivery, which is what the bell's row is
 * about (the row's own id is the card's). Each read's moment is this browser's, and a kept row's is the database's: the read is
 * put on the servers' clock first (serversClockOf), so a fast clock does not judge a new row by a read that never saw it.
 */
function whatWaits(): WhatWaits {
  // A value the tab kept from an earlier visit may predate a field: each is read only as the shape it is known to have.
  const calendar = surfaceValue("calendar");
  const list = calendar?.vm?.feed?.notices?.heldList;
  const google = surfaceValue("google");
  const runs = runsHeld();
  return {
    runs,
    days: runDays(runs),
    holds: holdsHeld(),
    searches: searchesHeld(),
    heldEmails:
      calendar &&
      Array.isArray(list) &&
      list.length >= (calendar.vm.feed.notices.held ?? 0) &&
      list.every((h) => typeof h.noticeId === "string")
        ? { readAt: serversClockOf(calendar.fetchedAt), held: new Set(list.flatMap((h) => [h.id, h.noticeId ?? h.id])) }
        : null,
    reviews:
      google && Array.isArray(google.dto?.reviews)
        ? {
            readAt: serversClockOf(google.fetchedAt),
            held: google.dto.reviews.map((r) => ({ id: r.id, reviewId: r.review_id, replied: !!r.reply_text })),
          }
        : null,
  };
}

export function storageKey(workspaceId: string | null): string {
  return `chanlytics:notifs:${workspaceId ?? "default"}`;
}

export function readState(storage: StorageLike | null, workspaceId: string | null): NotificationReadState {
  if (!storage) return { ...EMPTY_READ_STATE };
  try {
    const raw = storage.getItem(storageKey(workspaceId));
    if (!raw) return { ...EMPTY_READ_STATE };
    const j = JSON.parse(raw) as Partial<NotificationReadState>;
    return {
      seenAt: typeof j.seenAt === "number" ? j.seenAt : 0,
      read: Array.isArray(j.read) ? j.read.filter((k): k is string => typeof k === "string") : [],
      dismissed: Array.isArray(j.dismissed) ? j.dismissed.filter((k): k is string => typeof k === "string") : [],
      alerts: j.alerts === true,
    };
  } catch {
    return { ...EMPTY_READ_STATE };
  }
}

export function writeState(
  storage: StorageLike | null,
  workspaceId: string | null,
  state: NotificationReadState,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(workspaceId), JSON.stringify(state));
  } catch {
    /* a full or blocked store loses only read marks */
  }
}

/** The feed from the globals, before this device's read state. */
export function feedFromGlobals(g: Globals, now: number) {
  return buildNotificationFeed({
    threads: g.INBOX_DATA?.THREADS ?? null,
    calls: bellCalls(g.__LIVE),
    invites: g.__TEAM_INVITES ?? null,
    now,
  });
}

export function toRows(rows: NotificationRow[], now: number): BellRow[] {
  // A reply to a reach-out whose draft waits says so on its row's door (Reach out Part 5, PR 8; contracts bellActionOf).
  const readings = (globalThis as { __REPLIES?: ReachOutRepliesDto | null }).__REPLIES?.replies ?? [];
  return rows.map((r) => ({
    id: r.key,
    kind: r.kind,
    icon: r.icon,
    tone: r.tone,
    unread: r.unread,
    time: agoLabel(r.at, now),
    title: r.title,
    message: r.message,
    about: r.about ?? null,
    actions: [{ label: bellActionOf(r, readings), to: r.to, primary: true }],
  }));
}

export interface BellApi {
  /** The rows as this device sees them, now. */
  feed(): BellRow[];
  /** The bell's number: the rows' unread and the older unread rows it does not list (older). */
  unread(): number;
  /** The unread kept rows the bell does not list (older than its newest BELL_LIST_ROWS). */
  older(): number;
  /** The kept rows' unread count alone, by the rule the edge counts a push's badge by (contracts unreadFor): the phone app's icon. */
  keptUnread(): number;
  seenAll(): void;
  read(key: string): void;
  dismiss(key: string): void;
  restore(key: string): void;
  /** Device alerts: whether they are on, and whether they can be. */
  alerts(): { on: boolean; can: boolean; permission: string };
  setAlerts(on: boolean): Promise<{ on: boolean; permission: string }>;
  /**
   * Read every unread kept row that `match` names, on the server: a thing dealt with elsewhere (a review answered) is read with the
   * rows that told of it. A derived row has no subject to match and is left to its page.
   */
  readWhere(match: (row: { kind: string; about: { type: string; id: string } | null }) => boolean): void;
  /** Subscribe to changes of the feed or the read state; returns unsubscribe. */
  onChange(cb: () => void): () => void;
  /** The rows as the bell draws them: new above earlier, notes of one kind said once (contracts bellSections). */
  sections(rows: BellRow[]): Array<BellSectionVM<BellRow>>;
}

/**
 * The server's rows a mark on this key is written to: a kept row's own, and for a derived row that stands for a hold the edge
 * has kept, that hold's notices (its marks are theirs). None for any other derived row, whose marks are this device's.
 */
function serverIdsOf(key: string, dto: NotificationsDto | null | undefined): string[] {
  return key.startsWith(SERVER_KEY_PREFIX)
    ? [key.slice(SERVER_KEY_PREFIX.length)]
    : holdMarksOf(key, dto).map((n) => n.id);
}

/** The phone app's icon: the kept rows' unread, less the ones the surfaces settle now (contracts settledNoticeIds). */
const keptUnreadIn = (win: Window & Globals, seenMs: number): number =>
  keptUnreadOf(win.__NOTIFICATIONS?.dto, seenMs, settledNoticeIds(win.__NOTIFICATIONS?.dto, whatWaits()));

/**
 * Device alerts asked for: on, by the browser's own permission (asked once, where it is not yet decided), or off. The
 * device's answer is kept (`save`).
 */
async function askAlerts(
  win: Window,
  on: boolean,
  save: (patch: Partial<NotificationReadState>) => void,
): Promise<{ on: boolean; permission: string }> {
  const N = notificationOf(win);
  if (!on || !N) {
    save({ alerts: false });
    return { on: false, permission: N ? N.permission : "unsupported" };
  }
  let permission = N.permission;
  if (permission === "default") {
    try {
      permission = await N.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  save({ alerts: permission === "granted" });
  return { on: permission === "granted", permission };
}

/**
 * Install the bell. `win` and `storage` are injectable so the rule can be
 * executed in a test without a browser.
 */
export function installNotifications(
  win: Window & Globals = window,
  storage: StorageLike | null = safeStorage(),
): BellApi {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((cb) => cb());
  // The workspace's id when the server has said which; the address's slug
  // only before it has. A store keyed by the slug was orphaned by a rename.
  const ws = () => win.__ACTIVE_WORKSPACE ?? getActiveWorkspace();
  const state = () => readState(storage, ws());
  /**
   * The "seen everything" moment as the server has it, or this device's own
   * copy when that is later: Mark all read just went out and the re-read has
   * not landed. Two devices read the same server value, so after Mark all
   * read on one the badge is the same number on both.
   */
  const seenAt = () => Math.max(state().seenAt, Date.parse(win.__NOTIFICATIONS?.dto?.seen_at ?? "") || 0);
  // The unread kept rows the bell does not list, less the holds it draws itself (contracts bellOlderOf; S6-10).
  const older = () => bellOlderOf(win.__NOTIFICATIONS?.dto, seenAt(), rows());
  const deviceState = (): NotificationReadState => ({ ...state(), seenAt: seenAt() });
  /**
   * Marks for rows that have left the feed go, once the source that would
   * hold the row is loaded to say so: a thread answered, a call read, an
   * invitation accepted. The store used to grow for ever and be cut at five
   * hundred on read, oldest first, which is a mark lost at random.
   */
  const prune = (s: NotificationReadState): NotificationReadState => {
    const live = new Set(feedFromGlobals(win, Date.now()).map((i) => i.key));
    const loaded = {
      threads: Array.isArray(win.INBOX_DATA?.THREADS),
      calls: !!win.__LIVE,
      invites: Array.isArray(win.__TEAM_INVITES),
    };
    const keep = (k: string) =>
      live.has(k) ||
      !(k.startsWith("call:") ? loaded.calls : k.startsWith("invite:") ? loaded.invites : loaded.threads);
    return { ...s, read: s.read.filter(keep), dismissed: s.dismissed.filter(keep) };
  };
  const save = (patch: Partial<NotificationReadState>) => {
    writeState(storage, ws(), prune({ ...state(), ...patch }));
    emit();
  };
  // What the surfaces derive (read marks on this device, the seen moment
  // the server's) beside what the workspace keeps (marks on the server),
  // newest first.
  // A kept row that names its customer by number takes their name when the Inbox or the calls here know it.
  const named = <T extends NotificationRow>(list: T[]): T[] =>
    nameKnownCustomers(list, win.INBOX_DATA?.THREADS, bellCalls(win.__LIVE));
  // One row for one hold (contracts bellFeed): the row the browser derives carries the marks of the notice the edge kept.
  // A kept row whose subject no longer waits (a run approved, a booking email dismissed, a review answered) reads as read, from what
  // the surfaces hold (whatWaits).
  const rows = () =>
    named(
      bellFeed({
        derived: feedFromGlobals(win, Date.now()),
        device: deviceState(),
        kept: win.__NOTIFICATIONS?.dto,
        waits: whatWaits(),
      }).sort((a, b) => b.at - a.at),
    );
  // A kept row's marks go to the server, and the refresh map re-reads the
  // surface after one lands, so every device agrees; a failure here loses a
  // mark, never a notification — the next read re-syncs.
  const mark = async (body: Input<"PUT notifications">) => {
    await client()("PUT notifications", { body });
    emit();
  };
  // A mark on a row the server keeps -- a kept row, or the derived row of a hold the edge has kept -- goes there; false for
  // any other, whose marks are this device's.
  const markOnServer = (key: string, patch: { read: true } | { dismissed: boolean }): boolean => {
    const ids = serverIdsOf(key, win.__NOTIFICATIONS?.dto);
    for (const id of ids) void mark({ id, ...patch });
    return ids.length > 0;
  };

  // Device alerts. The keys seen at the first computation are the backlog
  // and never alert; only what appears AFTER, while the app is not in view.
  let known: Set<string> | null = null;
  // The same rule for the rows the workspace keeps, with its own first look: those arrive with the bell's own
  // surface, often after the Inbox's, and a backlog read late is still a backlog. Only an alerting kind the person
  // has not read wakes the device (a search waiting a day on its question is one; its row is the trigger's).
  let knownKept: Set<string> | null = null;
  const freshKept = (): NotificationItem[] => {
    const dto = win.__NOTIFICATIONS?.dto;
    if (!dto) return [];
    const rows = serverNotificationRows(dto).filter((r) => r.unread && ALERT_KINDS.includes(r.kind));
    const keys = new Set(rows.map((r) => r.key));
    const out = knownKept === null ? [] : rows.filter((r) => !knownKept!.has(r.key));
    knownKept = keys;
    return out;
  };
  const notice = () => {
    const now = Date.now();
    const items = feedFromGlobals(win, now);
    const keys = new Set(items.map((i) => i.key));
    const kept = freshKept();
    if (known === null) {
      known = keys;
      emit();
      return;
    }
    const fresh = [...items.filter((i) => !known!.has(i.key) && ALERT_KINDS.includes(i.kind)), ...kept];
    known = keys;
    emit();
    if (fresh.length) alertDevice(win, fresh, state().alerts);
  };
  for (const ev of FEED_EVENTS) win.addEventListener(ev, notice);
  // The surfaces that say what still waits move the badge without a new row: the bell is drawn again.
  onSurfaceMoved(WAITS_SURFACES, emit);

  const api: BellApi = {
    feed: () => toRows(rows(), Date.now()),
    unread: () => unreadCount(rows()) + older(),
    older,
    seenAll: () => {
      save({ seenAt: Date.now() });
      void mark({ seen: true });
    },
    keptUnread: () => keptUnreadIn(win, seenAt()),
    read: (key) => {
      if (!markOnServer(key, { read: true })) save({ read: [...new Set([...state().read, key])] });
    },
    dismiss: (key) => {
      if (!markOnServer(key, { dismissed: true })) save({ dismissed: [...new Set([...state().dismissed, key])] });
    },
    restore: (key) => {
      if (!markOnServer(key, { dismissed: false })) save({ dismissed: state().dismissed.filter((k) => k !== key) });
    },
    alerts: () => {
      const N = notificationOf(win);
      return {
        on: state().alerts && !!N && N.permission === "granted",
        can: !!N,
        permission: N ? N.permission : "unsupported",
      };
    },
    setAlerts: (on) => askAlerts(win, on, save),
    readWhere: (match) => {
      for (const n of win.__NOTIFICATIONS?.dto?.notifications ?? []) {
        if (n.read || n.dismissed || !n.subject_type || !n.subject_id) continue;
        if (match({ kind: n.kind, about: { type: n.subject_type, id: n.subject_id } }))
          void mark({ id: n.id, read: true });
      }
    },
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    sections: (list) => bellSections(list, older()),
  };
  (win as unknown as { __notifs?: BellApi }).__notifs = api;
  installed = api;
  return api;
}

/** The bell this tab installed, for a module that marks its rows (google.ts, a review answered); null before it is installed. */
let installed: BellApi | null = null;
export const bellNow = (): BellApi | null => installed;

/** The browser's Notification, where it has one. */
const notificationOf = (win: Window): typeof Notification | undefined =>
  (win as unknown as { Notification?: typeof Notification }).Notification;

/**
 * Wake the device for the rows that are new since the last look: three at most, only while the app is not in view and the
 * person turned alerts on, each opening its page.
 */
function alertDevice(win: Window & Globals, fresh: NotificationItem[], alertsOn: boolean): void {
  const N = notificationOf(win);
  if (!alertsOn || !N || N.permission !== "granted") return;
  if (win.document && win.document.visibilityState === "visible") return;
  for (const i of fresh.slice(0, 3)) {
    try {
      const note = new N(i.title, { body: i.message, tag: i.key, icon: "/icons/icon-192.png" });
      note.onclick = () => {
        win.focus();
        goToRoute(i.to, {}, win);
        note.close();
      };
    } catch {
      /* a browser that refuses the constructor keeps the bell */
    }
  }
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
