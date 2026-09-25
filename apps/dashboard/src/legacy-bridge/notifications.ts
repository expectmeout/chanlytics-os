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
 *     row has left the feed;
 *   - the device-alert switch is this device's, by definition.
 *
 * Published to the mockup's top bar as window.__notifs.
 */
import {
  ALERT_KINDS,
  EMPTY_READ_STATE,
  agoLabel,
  applyReadState,
  bellSections,
  type BellSectionVM,
  buildNotificationFeed,
  type FeedCall,
  type FeedInvite,
  type FeedThread,
  type NotificationItem,
  type NotificationReadState,
  type NotificationRow,
  type NotificationsDto,
  SERVER_KEY_PREFIX,
  dedupeFeed,
  nameKnownCustomers,
  serverNotificationRows,
  unreadCount,
} from "@chanlytics/contracts";
import { api as client } from "./api";
import type { Input } from "../client/api";
import { getActiveWorkspace } from "./workspace";

export const FEED_EVENTS = [
  "surface:inbox",
  "surface:live",
  "surface:settings",
  "surface:workspace",
  "surface:notifications",
] as const;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Globals {
  INBOX_DATA?: { THREADS?: FeedThread[] };
  __LIVE?: { now?: FeedCall[]; recent?: FeedCall[] };
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
    calls: [...(g.__LIVE?.now ?? []), ...(g.__LIVE?.recent ?? [])],
    invites: g.__TEAM_INVITES ?? null,
    now,
  });
}

export function toRows(rows: NotificationRow[], now: number): BellRow[] {
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
    actions: [{ label: r.action, to: r.to, primary: true }],
  }));
}

export interface BellApi {
  /** The rows as this device sees them, now. */
  feed(): BellRow[];
  unread(): number;
  seenAll(): void;
  read(key: string): void;
  dismiss(key: string): void;
  restore(key: string): void;
  /** Device alerts: whether they are on, and whether they can be. */
  alerts(): { on: boolean; can: boolean; permission: string };
  setAlerts(on: boolean): Promise<{ on: boolean; permission: string }>;
  /** Subscribe to changes of the feed or the read state; returns unsubscribe. */
  onChange(cb: () => void): () => void;
  /** The rows as the bell draws them: new above earlier, notes of one kind said once (contracts bellSections). */
  sections(rows: BellRow[]): Array<BellSectionVM<BellRow>>;
}

/**
 * Install the bell. `win` and `storage` are injectable so the rule can be
 * executed in a test without a browser.
 */
export function installNotifications(
  win: Window & Globals = window as unknown as Window & Globals,
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
    nameKnownCustomers(list, win.INBOX_DATA?.THREADS, [...(win.__LIVE?.now ?? []), ...(win.__LIVE?.recent ?? [])]);
  const rows = () =>
    named(
      dedupeFeed([
        ...applyReadState(feedFromGlobals(win, Date.now()), deviceState()),
        ...serverNotificationRows(win.__NOTIFICATIONS?.dto),
      ]).sort((a, b) => b.at - a.at),
    );
  const isKept = (key: string) => key.startsWith(SERVER_KEY_PREFIX);
  // A kept row's marks go to the server, and the refresh map re-reads the
  // surface after one lands, so every device agrees; a failure here loses a
  // mark, never a notification — the next read re-syncs.
  const mark = async (body: Input<"PUT notifications">) => {
    await client()("PUT notifications", { body });
    emit();
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
    if (!fresh.length) return;
    const st = state();
    const N = (win as unknown as { Notification?: typeof Notification }).Notification;
    if (!st.alerts || !N || N.permission !== "granted") return;
    if (win.document && win.document.visibilityState === "visible") return;
    for (const i of fresh.slice(0, 3)) {
      try {
        const n = new N(i.title, { body: i.message, tag: i.key, icon: "/icons/icon-192.png" });
        n.onclick = () => {
          win.focus();
          win.location.hash = `/${i.to}`;
          n.close();
        };
      } catch {
        /* a browser that refuses the constructor keeps the bell */
      }
    }
  };
  for (const ev of FEED_EVENTS) win.addEventListener(ev, notice);

  const api: BellApi = {
    feed: () => toRows(rows(), Date.now()),
    unread: () => unreadCount(rows()),
    seenAll: () => {
      save({ seenAt: Date.now() });
      void mark({ seen: true });
    },
    read: (key) => {
      if (isKept(key)) {
        void mark({ id: key.slice(SERVER_KEY_PREFIX.length), read: true });
        return;
      }
      save({ read: [...new Set([...state().read, key])] });
    },
    dismiss: (key) => {
      if (isKept(key)) {
        void mark({ id: key.slice(SERVER_KEY_PREFIX.length), dismissed: true });
        return;
      }
      save({ dismissed: [...new Set([...state().dismissed, key])] });
    },
    restore: (key) => {
      if (isKept(key)) {
        void mark({ id: key.slice(SERVER_KEY_PREFIX.length), dismissed: false });
        return;
      }
      save({ dismissed: state().dismissed.filter((k) => k !== key) });
    },
    alerts: () => {
      const N = (win as unknown as { Notification?: typeof Notification }).Notification;
      return {
        on: state().alerts && !!N && N.permission === "granted",
        can: !!N,
        permission: N ? N.permission : "unsupported",
      };
    },
    setAlerts: async (on) => {
      const N = (win as unknown as { Notification?: typeof Notification }).Notification;
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
    },
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    sections: (list) => bellSections(list),
  };
  (win as unknown as { __notifs?: BellApi }).__notifs = api;
  return api;
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
