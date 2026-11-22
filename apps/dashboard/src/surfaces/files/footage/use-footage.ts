/**
 * Where the workspace's watched folder stands, read and pressed (the footage sources plan, P5). One read (`GET
 * sources`) says where the Google account and its folder stand; every screen that says it (the row in Settings,
 * Content's card, the Library's line, AI's card, a clip opened) reads it through here, so they share one answer and
 * one asking. It is read as the first of them is drawn, again after each press, again when the owner comes back to
 * the tab, and every few seconds while files are on their way, so nothing here needs a reload.
 *
 * Connect is one press: Google's own window opens at once, over the page, by the app's own route (which signs the way
 * out). The page waits. The window comes back to this app, says what happened on a channel every tab of the app
 * hears, and closes; the page reads the folder again and goes on by itself. A window closed before Google finished
 * says nothing, so once the owner is back on the page with the window gone, the word is "closed": nothing changed.
 * Where a browser will not open a second window the same route is followed in this one, and the page it comes back to
 * (Connections) reads the same word from its address. Nothing here holds a credential. The pattern is the ad
 * account's (campaigns/ads/connect/use-account.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIN_MS,
  SECOND_MS,
  FOOTAGE_WORDS,
  footageStandingOf,
  recordOrEmpty,
  type FootageDto,
  type FootageStanding,
} from "@chanlytics/contracts";
import { api, read } from "@/bridge/api";
import { pageClock } from "@/bridge/zone";

/** The channel a window that came back from Google says its word on, to every tab of the app. */
const DRIVE_CHANNEL = "chanlytics-drive-connect";
const WINDOW_NAME = "chanlytics-drive-connect";
/**
 * The mark a page leaves in the app's own storage while Google's window is open: the window reads it on the way back
 * and closes. Its name and its tie to the page are no proof, since a sign-in page may clear both. Good for as long as
 * the way there and back may take (a state lives ten minutes), so a mark left behind never closes a tab later.
 */
const WINDOW_MARK = "chanlytics.drive.connect-window.v1";
const WINDOW_MARK_LIFE_MS = 15 * MIN_MS;
/** How often the page looks whether the owner is back with Google's window gone, and how long after opening it first looks. */
const WINDOW_POLL_MS = 500;
const WINDOW_GRACE_MS = 1_500;
/** How often a folder whose files are on their way is read again, so its line counts as they land. */
const LIVE_EVERY_MS = 8 * SECOND_MS;

/** Settings › Connections, where the folder's row is: the way to it from a line or a clip. */
export const DRIVE_SETTINGS_ROUTE = "admin/integrations";

/** What came back from Google's window: `connected`, `closed`, or `error` with why. */
interface DriveReturned {
  outcome: string;
  why: string | null;
}

function markWindow(): void {
  try {
    window.localStorage.setItem(WINDOW_MARK, String(Date.now()));
  } catch {
    // A storage that refuses (a private window) costs the window's closing itself, never the Connect.
  }
}

function dropWindowMark(): void {
  try {
    window.localStorage.removeItem(WINDOW_MARK);
  } catch {
    // Nothing was kept to drop.
  }
}

/** Whether a page that came back from Google is the window a page left its mark for. Taken, so one page closes. */
function takeWindowMark(): boolean {
  try {
    const at = Number(window.localStorage.getItem(WINDOW_MARK));
    window.localStorage.removeItem(WINDOW_MARK);
    return at > 0 && Date.now() - at < WINDOW_MARK_LIFE_MS;
  } catch {
    // A storage that cannot be read holds no mark: the window's name and its tie to the page still say.
    return false;
  }
}

/**
 * What this page's own address says came back from Google, read once and taken off the address. The word is also said
 * on the app's channel, and a page that is Google's window itself then closes: the owner is back where they pressed.
 */
function driveReturnedHere(): DriveReturned | null {
  if (typeof window === "undefined") return null;
  try {
    const query = new URLSearchParams(window.location.search);
    const outcome = query.get("drive");
    if (!outcome) return null;
    const returned: DriveReturned = { outcome, why: query.get("why") };
    // Taken before the word is said: the page that waits drops its mark once it hears it.
    const marked = takeWindowMark();
    query.delete("drive");
    query.delete("why");
    const rest = query.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
    const channel = new BroadcastChannel(DRIVE_CHANNEL);
    channel.postMessage(returned);
    channel.close();
    // Only Google's window closes itself: the page the owner pressed Connect on stays, and a page that came back in
    // the same tab (a browser that opened no window) left no mark.
    if (marked || window.name === WINDOW_NAME || window.opener !== null) window.close();
    return returned;
  } catch {
    // An address that cannot be read says nothing came back: the row reads the folder all the same.
    return null;
  }
}

/**
 * What Google's window sent this page's own address back with, kept until it is cleared: the frame draws a page more
 * than once as it loads, and the address says it only the first time.
 */
let driveReturned: DriveReturned | null = null;

/** The steps a Google Workspace's manager is sent, put on the clipboard; whether the browser let it. */
export async function copyAdminSteps(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(FOOTAGE_WORDS.adminSteps);
    return true;
  } catch {
    // A browser that keeps its clipboard shut: whoever asked says the steps themselves.
    return false;
  }
}

/* ------------------------------------------------------------------------------------- the one read, shared -- */

interface Held {
  dto: FootageDto | null;
  failed: boolean;
}
let folderLastRead: Held = { dto: null, failed: false };
let asking: Promise<void> | null = null;
const folderHearers = new Set<(now: Held) => void>();

function tellFolder(next: Held): void {
  folderLastRead = next;
  for (const hear of folderHearers) hear(next);
}

/** The folder read again, for every screen that says it: one asking at a time, whoever asked. */
export function readFootageAgain(): Promise<void> {
  asking ??= read("GET sources")
    .then(
      (dto) => tellFolder({ dto, failed: false }),
      // A read that failed keeps what was last known on screen, and says so only where nothing is known.
      () => tellFolder({ dto: folderLastRead.dto, failed: true }),
    )
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** What the last read answered, for a step that has just asked for it again. */
export const heldFootage = (): FootageDto | null => folderLastRead.dto;

/** Whether a folder's files are on their way: its screens then read it again by themselves. */
const isLive = (dto: FootageDto | null): boolean =>
  !!dto?.folder && dto.folder.state !== "stopped" && (dto.folder.looking || dto.folder.counts.coming > 0);

export interface FootageHere {
  /** The server's answer; null until the first read is in, and where it could not be read. */
  dto: FootageDto | null;
  failed: boolean;
  /** Where it stands, in the words every screen says; null until it is read. */
  standing: FootageStanding | null;
  /** What Google's window came back with where it connected nothing (`closed`, or an error's why); null otherwise. */
  outcome: string | null;
  /** Google's window is open, or the page is reading what came of it. */
  connecting: boolean;
  connect: () => void;
  again: () => Promise<void>;
  clearOutcome: () => void;
}

/** The word a connect that connected nothing is said by: `closed`, or why it failed. */
const connectStopOf = (returned: DriveReturned | null): string | null => {
  if (returned === null || returned.outcome === "connected") return null;
  return returned.outcome === "closed" ? "closed" : (returned.why ?? "failed");
};

/**
 * The shared read, heard by a page that draws the folder: read as the page arrives, again when the owner comes back to
 * the tab (a window that finished elsewhere shows here too), and by itself while files are on their way.
 */
function useFolderRead(on: boolean): Held {
  const [now, setNow] = useState<Held>(folderLastRead);

  useEffect(() => {
    if (!on) return undefined;
    folderHearers.add(setNow);
    setNow(folderLastRead);
    void readFootageAgain();
    return () => {
      folderHearers.delete(setNow);
    };
  }, [on]);

  useEffect(() => {
    if (!on || typeof document === "undefined") return undefined;
    const back = () => {
      if (document.visibilityState === "visible") void readFootageAgain();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [on]);

  // Files on their way: the line counts as they land, with nobody pressing anything.
  const live = on && isLive(now.dto);
  useEffect(() => {
    if (!live) return undefined;
    const every = window.setInterval(() => {
      if (document.visibilityState === "visible") void readFootageAgain();
    }, LIVE_EVERY_MS);
    return () => window.clearInterval(every);
  }, [live]);

  return now;
}

/**
 * The wait for Google's window: ended by a word on the channel, or by the owner coming back with the window gone and
 * no word said (it was closed before Google finished). Answers how to end the wait early.
 */
function waitForWindow(opened: Window, finish: (returned: DriveReturned) => void): () => void {
  const openedAt = Date.now();
  const channel = new BroadcastChannel(DRIVE_CHANNEL);
  const watch = window.setInterval(() => {
    if (Date.now() - openedAt < WINDOW_GRACE_MS || !document.hasFocus() || !opened.closed) return;
    finish({ outcome: "closed", why: null });
  }, WINDOW_POLL_MS);
  channel.onmessage = (event: MessageEvent) => {
    const word = recordOrEmpty(event.data);
    if (typeof word.outcome === "string")
      finish({ outcome: word.outcome, why: typeof word.why === "string" ? word.why : null });
  };
  return () => {
    window.clearInterval(watch);
    channel.close();
  };
}

/** Google's own window: opened on Connect, waited for, and what it came back with where it connected nothing. */
function useDriveWindow(on: boolean): Pick<FootageHere, "outcome" | "connecting" | "connect" | "clearOutcome"> {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // What this page's own address came back with, kept until it is cleared: the frame draws the page more than once as
  // it loads, and the address says it only the first time.
  useEffect(() => {
    if (!on) return;
    driveReturned = driveReturnedHere() ?? driveReturned;
    if (driveReturned) setOutcome(connectStopOf(driveReturned));
  }, [on]);

  // The wait ends with the page itself, too.
  const waiting = useRef<(() => void) | null>(null);
  useEffect(() => () => waiting.current?.(), []);

  const connect = useCallback(() => {
    const url = api().url("GET sources/connect", { params: undefined });
    markWindow();
    const opened = window.open(url, WINDOW_NAME, "popup,width=560,height=720");
    // A browser that opens no second window follows the same way in this one, which then has no window to close.
    if (!opened) {
      dropWindowMark();
      window.location.assign(url);
      return;
    }
    waiting.current?.();
    driveReturned = null;
    setOutcome(null);
    setConnecting(true);
    const stop = waitForWindow(opened, (returned) => {
      stop();
      waiting.current = null;
      dropWindowMark();
      setOutcome(connectStopOf(returned));
      void readFootageAgain().finally(() => setConnecting(false));
    });
    waiting.current = stop;
  }, []);

  const clearOutcome = () => {
    driveReturned = null;
    setOutcome(null);
  };
  return { outcome, connecting, connect, clearOutcome };
}

/** The workspace's watched folder, where `on` says the page draws it. */
export function useFootage(on: boolean): FootageHere {
  const now = useFolderRead(on);
  const drive = useDriveWindow(on);
  const dto = on ? now.dto : null;
  const clock = pageClock();
  return {
    dto,
    failed: on && now.failed && now.dto === null,
    standing: dto ? footageStandingOf(dto, (iso) => clock.stamp(Date.parse(iso))) : null,
    again: readFootageAgain,
    ...drive,
  };
}
