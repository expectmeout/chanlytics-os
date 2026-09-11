/**
 * The bell, wired to what the browser already holds.
 *
 * Reads the Inbox threads, the Live calls and the open invitations the
 * surfaces have fetched, builds the feed (contracts/notifications.ts), keeps
 * this device's read state in localStorage, and — when the owner asked for
 * it — raises a system notification for something new that needs them while
 * the app is in the background. Nothing here talks to a server; the feed is
 * exactly as fresh as the surfaces around it, and it refreshes when they do.
 *
 * Published to the mockup's top bar as window.__notifs.
 */
import {
  ALERT_KINDS,
  EMPTY_READ_STATE,
  agoLabel,
  applyReadState,
  buildNotificationFeed,
  type FeedCall,
  type FeedInvite,
  type FeedThread,
  type NotificationReadState,
  type NotificationRow,
  type NotificationsDto,
  SERVER_KEY_PREFIX,
  dedupeFeed,
  serverNotificationRows,
} from "@chanlytics/contracts";
import { api as client } from "./api";
import type { Input } from "../client/api";
import { getActiveWorkspace } from "./workspace";

export const FEED_EVENTS = ["surface:inbox", "surface:live", "surface:settings", "surface:workspace", "surface:notifications"] as const;

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
}

/** The row the popover draws: the mockup's own shape. */
export interface BellRow {
  id: string;
  icon: string;
  tone: string;
  unread: boolean;
  time: string;
  title: string;
  message: string;
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
      read: Array.isArray(j.read) ? j.read.filter((k): k is string => typeof k === "string").slice(-500) : [],
      dismissed: Array.isArray(j.dismissed) ? j.dismissed.filter((k): k is string => typeof k === "string").slice(-500) : [],
      alerts: j.alerts === true,
    };
  } catch {
    return { ...EMPTY_READ_STATE };
  }
}

export function writeState(storage: StorageLike | null, workspaceId: string | null, state: NotificationReadState): void {
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
    icon: r.icon,
    tone: r.tone,
    unread: r.unread,
    time: agoLabel(r.at, now),
    title: r.title,
    message: r.message,
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
  const ws = () => getActiveWorkspace();
  const state = () => readState(storage, ws());
  const save = (patch: Partial<NotificationReadState>) => {
    writeState(storage, ws(), { ...state(), ...patch });
    emit();
  };
  // What the surfaces derive (read state on this device) beside what the
  // workspace keeps (read state on the server), newest first.
  const rows = () => dedupeFeed([...applyReadState(feedFromGlobals(win, Date.now()), state()), ...serverNotificationRows(win.__NOTIFICATIONS?.dto)]).sort((a, b) => b.at - a.at);
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
  const notice = () => {
    const now = Date.now();
    const items = feedFromGlobals(win, now);
    const keys = new Set(items.map((i) => i.key));
    if (known === null) {
      known = keys;
      emit();
      return;
    }
    const fresh = items.filter((i) => !known!.has(i.key) && ALERT_KINDS.includes(i.kind));
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
    unread: () => rows().filter((r) => r.unread).length,
    seenAll: () => { save({ seenAt: Date.now() }); void mark({ seen: true }); },
    read: (key) => { if (isKept(key)) { void mark({ id: key.slice(SERVER_KEY_PREFIX.length), read: true }); return; } save({ read: [...new Set([...state().read, key])] }); },
    dismiss: (key) => { if (isKept(key)) { void mark({ id: key.slice(SERVER_KEY_PREFIX.length), dismissed: true }); return; } save({ dismissed: [...new Set([...state().dismissed, key])] }); },
    restore: (key) => { if (isKept(key)) { void mark({ id: key.slice(SERVER_KEY_PREFIX.length), dismissed: false }); return; } save({ dismissed: state().dismissed.filter((k) => k !== key) }); },
    alerts: () => {
      const N = (win as unknown as { Notification?: typeof Notification }).Notification;
      return { on: state().alerts && !!N && N.permission === "granted", can: !!N, permission: N ? N.permission : "unsupported" };
    },
    setAlerts: async (on) => {
      const N = (win as unknown as { Notification?: typeof Notification }).Notification;
      if (!on || !N) {
        save({ alerts: false });
        return { on: false, permission: N ? N.permission : "unsupported" };
      }
      let permission = N.permission;
      if (permission === "default") {
        try { permission = await N.requestPermission(); } catch { permission = "denied"; }
      }
      save({ alerts: permission === "granted" });
      return { on: permission === "granted", permission };
    },
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
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
