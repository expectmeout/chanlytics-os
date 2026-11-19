/**
 * The ad account's card, read and pressed (the Ads plan, 4.2 and 4.3). One read (`GET ads/account`) says where the
 * connection stands; the page reads it as it opens, again when Meta's window closes, and again when the owner comes
 * back to the tab, so nothing here needs a reload.
 *
 * Connect is one press: Meta's own window opens at once, over the page, by the app's own route (which signs the way
 * out). The page waits. The window comes back to this app, says what happened on a channel every tab of the app hears,
 * and closes; the page reads the account again and the card goes on by itself. A window closed before Meta finished
 * says nothing, so once the owner is back on the page with the window gone, the card says "Nothing was connected".
 * Whether the window is gone is asked only then: a sign-in page may cut the tie between the two windows, after which
 * the page that opened one cannot tell an open window from a closed one. Where a browser will not open a second window
 * the same route is followed in this one, and the page it comes back to reads the same word from its address. Nothing
 * here holds a credential.
 *
 * Chanlytics looks again: an owner who left to mend something in Meta and comes back has the account asked about once,
 * no faster than every half minute (the edge keeps Meta's own pace beside this), and the card then reads what it found.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdAccountDto } from "@chanlytics/contracts";
import { api, read } from "@/bridge/api";

/** The channel a window that came back from Meta says its word on, to every tab of the app. */
const CHANNEL = "chanlytics-ads-connect";
const WINDOW_NAME = "chanlytics-ads-connect";
/** How often the page looks whether the owner is back with Meta's window gone, and how long after opening it first looks. */
const WINDOW_POLL_MS = 500;
const WINDOW_GRACE_MS = 1_500;
/** The least time between two looks at Meta for one tab. */
const LOOK_AGAIN_MS = 30_000;

/** What came back from Meta's window: `connected`, `choosing`, `closed`, or `error` with why. */
interface Returned {
  outcome: string;
  why: string | null;
}

/**
 * What this page's own address says came back from Meta, read once and taken off the address. The word is also said on
 * the app's channel, and a page that is Meta's window itself then closes: the owner is back where they pressed.
 */
function returnedHere(): Returned | null {
  if (typeof window === "undefined") return null;
  try {
    const query = new URLSearchParams(window.location.search);
    const outcome = query.get("connect");
    if (!outcome) return null;
    const returned: Returned = { outcome, why: query.get("why") };
    query.delete("connect");
    query.delete("why");
    const rest = query.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(returned);
    channel.close();
    // Only a window a script opened may close itself: the page the owner pressed Connect on stays.
    if (window.name === WINDOW_NAME || window.opener !== null) window.close();
    return returned;
  } catch {
    // An address that cannot be read says nothing came back: the card reads the account all the same.
    return null;
  }
}

/** The word a need is said by, of what came back: null where an account was connected or is to be chosen. */
const stopOf = (returned: Returned | null): string | null => {
  if (returned === null || returned.outcome === "connected" || returned.outcome === "choosing") return null;
  return returned.outcome === "closed" ? "closed" : (returned.why ?? "error");
};

export interface AdAccountHere {
  /** The server's answer; null until the first read is in, and where it could not be read. */
  dto: AdAccountDto | null;
  failed: boolean;
  /** What Meta's window came back with where it connected nothing; null otherwise. */
  outcome: string | null;
  /** Meta's window is open, or the page is reading what it shared. */
  checking: boolean;
  connect: () => void;
  choose: (externalId: string) => Promise<string | null>;
  again: () => void;
}

/** The workspace's ad account, where `on` says the page draws its card. */
export function useAdAccount(on: boolean): AdAccountHere {
  const [dto, setDto] = useState<AdAccountDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState(0);
  const lookedAt = useRef(0);
  const held = useRef<AdAccountDto | null>(null);
  held.current = dto;

  // What this page's own address came back with, once.
  useEffect(() => {
    if (on) setOutcome(stopOf(returnedHere()));
  }, [on]);

  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    read("GET ads/account").then(
      (answer) => {
        if (!live) return;
        setDto(answer);
        setFailed(false);
        setChecking(false);
      },
      () => {
        if (!live) return;
        setFailed(true);
        setChecking(false);
      },
    );
    return () => {
      live = false;
    };
  }, [on, asked]);

  const again = useCallback(() => setAsked((count) => count + 1), []);

  // The owner is back on the tab: where something is missing on a connected account, Chanlytics looks again at Meta.
  useEffect(() => {
    if (!on || typeof document === "undefined") return undefined;
    const back = () => {
      if (document.visibilityState !== "visible") return;
      const account = held.current;
      const card = account?.meta;
      const missing = card?.status === "connected" && card.checks.some((check) => check.ok !== true);
      // With nothing connected the account is only read again: a window that finished elsewhere shows here too.
      if (card?.status !== "connected") again();
      if (!account?.can_connect || !missing || Date.now() - lookedAt.current < LOOK_AGAIN_MS) return;
      lookedAt.current = Date.now();
      void api()("POST ads/account/check").then(again, again);
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [on, again]);

  // The wait for Meta's window, ended by a word on the channel, by the owner coming back with the window gone, or by
  // the page itself going.
  const waiting = useRef<(() => void) | null>(null);
  useEffect(() => () => waiting.current?.(), []);

  const connect = useCallback(() => {
    const url = api().url("GET ads/connect", { params: undefined });
    const opened = window.open(url, WINDOW_NAME, "popup,width=640,height=780");
    // A browser that opens no second window follows the same way in this one.
    if (!opened) {
      window.location.assign(url);
      return;
    }
    waiting.current?.();
    setOutcome(null);
    setChecking(true);
    const openedAt = Date.now();
    const channel = new BroadcastChannel(CHANNEL);
    const stop = () => {
      window.clearInterval(watch);
      channel.close();
      waiting.current = null;
    };
    const finish = (returned: Returned) => {
      stop();
      setOutcome(stopOf(returned));
      again();
    };
    channel.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      const { outcome: word, why } = (typeof data === "object" && data !== null ? data : {}) as Partial<Returned>;
      if (typeof word === "string") finish({ outcome: word, why: typeof why === "string" ? why : null });
    };
    // Back on the page with the window gone and no word said: it was closed before Meta finished.
    const watch = window.setInterval(() => {
      if (Date.now() - openedAt < WINDOW_GRACE_MS || !document.hasFocus() || !opened.closed) return;
      finish({ outcome: "closed", why: null });
    }, WINDOW_POLL_MS);
    waiting.current = stop;
  }, [again]);

  const choose = useCallback(
    async (externalId: string): Promise<string | null> => {
      const answer = await api()("POST ads/account/choose", { body: { external_id: externalId } });
      again();
      return answer.ok ? null : answer.message;
    },
    [again],
  );

  return { dto: on ? dto : null, failed, outcome, checking, connect, choose, again };
}
