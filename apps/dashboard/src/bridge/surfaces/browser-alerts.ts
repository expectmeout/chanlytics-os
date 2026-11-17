/**
 * This browser's alerts: one switch (Settings › Notifications, decision 0136), this browser's by definition.
 *
 * Two things can alert a browser. The server can tell the browser itself, Chanlytics open or closed (Web Push,
 * ../ask/web-push.ts), where the browser and the deployment can take it; and this page can raise an alert of its own
 * while it is open in a tab and not in view, for what is new and needs someone. They were two switches (the bell's foot
 * and a line of Settings), and a browser with both on was told each thing twice. Here they are one: on is the server's
 * push where it can be, else the page's own alert; off is both; and the page stands down while the server tells this
 * browser. Part of the bell (../notifications.ts), which keeps whether the page's own alert was asked for and hands
 * this the server's push and the way to a page (it imports neither: the bell's module is what leans on them).
 */
import type { NotificationItem } from "@chanlytics/contracts";

/** This browser's alerts, as the one switch says them. */
export interface BrowserAlerts {
  on: boolean;
  /** Whether this browser can alert at all. */
  can: boolean;
  /** The browser's own answer: "granted", "denied", "default", or "unsupported" where it has no alerts. */
  permission: string;
  /**
   * How an alert reaches this browser: `push`, the server tells the browser itself, Chanlytics open or closed (Web
   * Push); `tab`, this page alerts while it is open in a tab, where the browser or the deployment has no push. What is
   * on where it is on, else what a press would turn on.
   */
  by: "push" | "tab";
  /** An iPhone tells a site nothing until the site is on its Home Screen: said in the switch's place. */
  needsHomeScreen: boolean;
}

/** The server's push to a browser, as the switch asks it of one (../ask/web-push.ts), handed in by the bell. */
export interface BrowserPush {
  can(win: Window): { can: boolean; reason: "no_key" | "no_support" | "home_screen" | null };
  on(win: Window): Promise<boolean>;
  turnOn(win: Window): Promise<{ ok: boolean }>;
  turnOff(win: Window): Promise<unknown>;
}

/** What the bell keeps of the page's own alert, in this browser: whether it was asked for, and the way to keep that. */
interface PageAlertKept {
  on(): boolean;
  save(on: boolean): void;
}

/** Whether this window's browser has alerts of its own. */
const canNotify = (win: Window): win is Window & { Notification: typeof Notification } =>
  typeof Reflect.get(win, "Notification") === "function";

/** The browser's Notification, where it has one. */
const notificationOf = (win: Window): typeof Notification | undefined =>
  canNotify(win) ? win.Notification : undefined;

/**
 * The page's own alert asked for: on, by the browser's own permission (asked once, where it is not yet decided), or
 * off. The answer is kept.
 */
async function askPageAlerts(
  win: Window,
  on: boolean,
  kept: PageAlertKept,
): Promise<{ on: boolean; permission: string }> {
  const notifier = notificationOf(win);
  if (!on || !notifier) {
    kept.save(false);
    return { on: false, permission: notifier ? notifier.permission : "unsupported" };
  }
  let permission = notifier.permission;
  if (permission === "default") {
    try {
      permission = await notifier.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  kept.save(permission === "granted");
  return { on: permission === "granted", permission };
}

/** Whether the server tells this browser itself now (Web Push): false where the browser cannot say. */
async function findPushOn(win: Window, push: BrowserPush): Promise<boolean> {
  try {
    return await push.on(win);
  } catch {
    // A browser with no service worker to ask (or a window that is no browser's) is not being told.
    return false;
  }
}

/**
 * The one switch, pressed. On: the server's push where this browser and the deployment can take it, and the page's own
 * alert put down so nothing is said twice; where they cannot, or the subscription was not kept, the page's own alert,
 * which asks the same permission. Off: both.
 */
async function turnAlerts(
  win: Window,
  on: boolean,
  { pushOn, kept, push }: { pushOn: boolean; kept: PageAlertKept; push: BrowserPush },
): Promise<{ on: boolean; permission: string }> {
  if (!on) {
    // A subscription the browser would not give up is its own to drop: the page's alert still goes off below.
    if (pushOn) await push.turnOff(win).catch(() => undefined);
    return askPageAlerts(win, false, kept);
  }
  if (push.can(win).can) {
    // A browser that refused, or a subscription the server did not keep: the page's own alert is asked for below.
    const subscribed = await push.turnOn(win).catch(() => ({ ok: false }));
    if (subscribed.ok) {
      kept.save(false);
      return { on: true, permission: "granted" };
    }
  }
  return askPageAlerts(win, true, kept);
}

/**
 * This browser's one switch, over what the bell keeps of the page's own alert: what it says now (`alerts`), a press of
 * it (`setAlerts`), and whether the page's own alert goes off now (`byPage`: asked for, and the server is not telling
 * this browser itself). Whether the server tells this browser is the browser's to answer: asked as the bell is
 * installed and again after each press, and `emit` says when the answer changed.
 */
export function browserAlertsOf(
  win: Window,
  kept: PageAlertKept,
  push: BrowserPush,
  emit: () => void,
): {
  alerts: () => BrowserAlerts;
  setAlerts: (on: boolean) => Promise<{ on: boolean; permission: string }>;
  byPage: () => boolean;
} {
  let pushOn = false;
  const readPush = async () => {
    const on = await findPushOn(win, push);
    if (on === pushOn) return;
    pushOn = on;
    emit();
  };
  void readPush();
  return {
    alerts: () => {
      const notifier = notificationOf(win);
      const pushCan = push.can(win);
      const tabOn = kept.on() && !!notifier && notifier.permission === "granted";
      return {
        on: pushOn || tabOn,
        can: !!notifier || pushCan.can,
        permission: notifier ? notifier.permission : "unsupported",
        by: pushOn || (pushCan.can && !tabOn) ? "push" : "tab",
        needsHomeScreen: pushCan.reason === "home_screen",
      };
    },
    setAlerts: async (on) => {
      const turned = await turnAlerts(win, on, { pushOn, kept, push });
      await readPush();
      return turned;
    },
    byPage: () => kept.on() && !pushOn,
  };
}

/**
 * Wake the device for the rows that are new since the last look: three at most, only while the app is not in view and
 * the page's own alert is on, each opening its page (`open`, the bell's way to a route).
 */
export function alertDevice(
  win: Window,
  fresh: NotificationItem[],
  alertsOn: boolean,
  open: (route: string) => void,
): void {
  const notifier = notificationOf(win);
  if (!alertsOn || !notifier || notifier.permission !== "granted") return;
  if (win.document && win.document.visibilityState === "visible") return;
  for (const item of fresh.slice(0, 3)) {
    try {
      const note = new notifier(item.title, { body: item.message, tag: item.key, icon: "/icons/icon-192.png" });
      note.onclick = () => {
        win.focus();
        open(item.to);
        note.close();
      };
    } catch {
      /* a browser that refuses the constructor keeps the bell */
    }
  }
}
