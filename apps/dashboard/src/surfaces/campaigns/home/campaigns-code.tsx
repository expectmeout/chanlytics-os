/**
 * Campaigns' code that no page's first load carries, each a chunk of its own, fetched once for the tab by whichever asks
 * first:
 *   - Sequences, the page Campaigns lands on (route.tsx);
 *   - a message's own pane, the Library's (parts/message-in-place.tsx), which the sheet over a page (surfaces/see) and
 *     Sequences' step editor draw;
 *   - Messages, the Library's page as the view of Campaigns it is beside Sequences (templates/templates-page.tsx), which
 *     Campaigns draws ahead, hidden, once the frame is idle on it (route.tsx), so a switch to it shows a view already drawn.
 * Each is asked for ahead of the press: as a pointer or a thumb reaches a door to the page that draws it (LegacyApp's reach,
 * warmCampaignsCode), and Sequences once the frame is idle (warmCampaignsSoon, which reaches for Campaigns itself: its page,
 * its read and its code). The Inbox's code comes with the boot and its rows are read at boot, so its page arrives drawn;
 * Campaigns' page waited at the press for its chunks, the sheets' and the Library's among them, which only a sheet or an
 * edit draws, and for its list (local production builds, 18-19 Oct 2026: 427-591 ms on a desk against the Inbox's 109-121).
 */
import { lazy, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { routeOnScreen, warmsOnItsOwn } from "@/legacy-bridge/workspace";
import { FailedRead } from "../../kit/empty/empty";
import type { MessageInPlaceProps } from "../parts/message-in-place";
import { messagePaneContext } from "../parts/message-pane";
import { HomeReading } from "./failed";

/** A chunk fetched once: the module where it is in, and the fetch, shared by everyone who asks. */
interface Chunk<T> {
  load: () => Promise<T>;
  now: () => T | null;
  warm: () => void;
}

/** A chunk fetched once; one that failed (a dropped line, a deploy that took the old chunk away) is asked for again. */
function codeChunk<T>(fetchIt: () => Promise<T>): Chunk<T> {
  let held: T | null = null;
  let asked: Promise<T> | null = null;
  const load = (): Promise<T> =>
    (asked ??= fetchIt().then(
      (m) => (held = m),
      (e: unknown) => {
        asked = null;
        throw e;
      },
    ));
  return { load, now: () => held, warm: () => void load().catch(() => {}) };
}

const sequences = codeChunk(() => import("../sequences/sequences-page"));
const pane = codeChunk(() => import("../parts/message-in-place"));
const messages = codeChunk(() => import("../templates/templates-page"));

const PageWhenRead = lazy(() => sequences.load().then((m) => ({ default: m.SequencesPage })));

/**
 * Sequences' page as a mount draws it: the component itself where the code is in, which draws at once and never suspends,
 * else the lazy part. Asked once per mount (the caller's state), so a mount never swaps one for the other and loses what
 * it holds.
 */
export const sequencesPageNow = () => sequences.now()?.SequencesPage ?? PageWhenRead;

/**
 * A part held in a chunk, as a component draws it: the part itself where the chunk is in, else null while `wanted` asks
 * for it, then the part once it lands (a state of the caller's, as People's Leads is loaded: people-route.tsx); `failed`
 * where it could not be fetched, which another try (`retry`) asks for again.
 */
function useChunkPart<M, K extends keyof M>(of: Chunk<M>, name: K, wanted: boolean) {
  const [part, setPart] = useState<{ it: M[K] } | null>(() => {
    const m = of.now();
    return m ? { it: m[name] } : null;
  });
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (part || !wanted) return undefined;
    let live = true;
    of.load().then(
      (m) => live && setPart({ it: m[name] }),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [part, wanted, tries, of, name]);
  const retry = () => {
    setFailed(false);
    setTries((n) => n + 1);
  };
  return { part: part?.it ?? null, failed, retry };
}

/** Messages' view (the Library's page) while `wanted`: null until its chunk is in. */
export function useMessagesView(wanted: boolean) {
  return useChunkPart(messages, "TemplatesPage", wanted).part;
}

/** A message's pane, the Library's, where its chunk is out: the shell's quiet words after their beat, then the pane. */
export function MessageInPlaceWhenRead(p: MessageInPlaceProps) {
  const { part: Pane, failed, retry } = useChunkPart(pane, "MessageInPlace", true);
  if (Pane) return <Pane {...p} />;
  if (failed) return <FailedRead kind="line" what="this message" onRetry={retry} testid="cmh-pane-failed" />;
  return <HomeReading testid="cmh-pane-reading" />;
}

/**
 * The pane handed down to a view of Campaigns that draws it inside itself (the Sequences view's step editor;
 * parts/message-pane.ts), from the route, as the drawer draws it: the route reaching for the pane itself regrouped the
 * chunks the Campaigns page loads, and it carried the kit's icons a second time (+7 KB gzipped, #1644). What it hands down
 * fetches the pane as it is drawn, so neither the route nor Sequences carries the Library's code.
 */
export function MessagePaneProvider({ children }: { children: ReactNode }) {
  const Pane = messagePaneContext();
  return <Pane.Provider value={MessageInPlaceWhenRead}>{children}</Pane.Provider>;
}

/** The step editor opened: the pane its Edit the words draws, fetched now. */
export const warmMessagePane = pane.warm;

/** The routes that draw Sequences' code: Campaigns but its Ads view, and Sent. */
const DRAWS_SEQUENCES = /^(campaigns(?!\/ads)|broadcasts)(\/|$)/;
/** The routes that open a message: its home, the Library open on it (`campaigns/messages/<name>`), and its old drawer's. */
const OPENS_A_MESSAGE = /^campaigns\/(messages\/[^/]+|message:)/;

/** A route somebody is reaching for: the code it draws, fetched now. A fetch that fails is the page's to ask again. */
export function warmCampaignsCode(route: string): void {
  if (DRAWS_SEQUENCES.test(route)) sequences.warm();
  if (/^campaigns\/messages(\/|$)/.test(route)) messages.warm();
  if (OPENS_A_MESSAGE.test(route)) pane.warm();
}

/** How long an idle frame may wait before Campaigns is reached for: after the page's own reads, which a load starts first. */
const CAMPAIGNS_IDLE_MS = 4000;

/**
 * Campaigns reached for once the frame is idle after the page has loaded (`reach`: workspace.ts reachFor, the reach a
 * pointer at its door makes: its page warmed, its list read, its code fetched), where it may be with nobody reaching for it
 * (warmsOnItsOwn: not on Save-Data or 2g, where a press reaches for it). Campaigns is a door on every page, the sidebar's on
 * a desk and the More sheet's on a phone, so a press may come from anywhere, and its list is the one page's own read the
 * boot leaves out (onDemand): read here once, behind everything the page on screen asked for, it is held for the press,
 * as the Inbox's rows are. Not from Campaigns itself, which has it all.
 */
export function warmCampaignsSoon(reach: (route: string) => void, at?: Window): void {
  const win = at ?? (typeof window === "undefined" ? null : window);
  if (!win || !warmsOnItsOwn()) return;
  const go = () => {
    if (!/^(campaigns|broadcasts)(\/|$)/.test(routeOnScreen(win))) reach("campaigns");
  };
  const idle = () =>
    typeof win.requestIdleCallback === "function"
      ? win.requestIdleCallback(go, { timeout: CAMPAIGNS_IDLE_MS })
      : win.setTimeout(go, CAMPAIGNS_IDLE_MS);
  if (win.document.readyState === "complete") idle();
  else win.addEventListener("load", idle, { once: true });
}
