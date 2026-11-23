/**
 * Campaigns' code that no page's first load carries, each a chunk of its own, fetched once for the tab by whichever asks
 * first:
 *   - Sequences, the page Campaigns lands on (route.tsx), and its other views: Content, Ads and Forms;
 *   - a message's own pane (parts/message-in-place.tsx), which the sheet over a page (surfaces/see), a step's own sheet and
 *     Sequences' step editor draw.
 * Each is asked for ahead of the press: as a pointer or a thumb reaches a door to the page that draws it (FrameApp's reach,
 * warmCampaignsCode), and Sequences once the frame is idle (warmCampaignsSoon, which reaches for Campaigns itself: its page,
 * its read and its code). The Inbox's code comes with the boot and its rows are read at boot, so its page arrives drawn;
 * Campaigns' page waited at the press for its chunks, the sheets' and the Library's among them, which only a sheet or an
 * edit draws, and for its list (local production builds, 18-19 Oct 2026: 427-591 ms on a desk against the Inbox's 109-121).
 * A load that opens on a view fetches its code beside the frame's own, and its first draw waits for it (./opening.ts).
 */
import type { ReactNode } from "react";
import { aheadWhenIdle, routeOnScreen } from "@/bridge/workspace";
import { codeOnce, type CodeOnce } from "@/lib/code-once";
import { partNow, useCode } from "@/lib/use-code";
import { FailedRead } from "../../kit/empty/empty";
import type { MessageInPlaceProps } from "../parts/message-in-place";
import { messagePaneContext } from "../parts/message-pane";
import { HomeReading } from "./failed";

export const sequencesCode = codeOnce(() => import("../sequences/sequences-page"));
const pane = codeOnce(() => import("../parts/message-in-place"));
/** Content's code, Ads' and Forms': each a chunk of its own, fetched where its view is drawn (route.tsx). */
export const contentCode = codeOnce(() => import("../content/page"));
export const adsCode = codeOnce(() => import("../ads/ads-page"));
export const formsCode = codeOnce(() => import("../forms/page"));

/** Each view's page as a mount draws it (lib/use-code.ts partNow): the page itself where its code is in, else the lazy part. */
export const sequencesPageNow = partNow(sequencesCode, (m) => m.SequencesPage);
export const contentPageNow = partNow(contentCode, (m) => m.ContentPage);
export const adsPageNow = partNow(adsCode, (m) => m.AdsPage);
export const formsPageNow = partNow(formsCode, (m) => m.FormsPage);

/**
 * A part held in a chunk, as a component draws it (lib/use-code.ts): the part itself where the chunk is in, else null
 * while `wanted` asks for it, then the part once it lands; `failed` where it could not be fetched, which another try
 * (`retry`) asks for again.
 */
function useChunkPart<M, K extends keyof M>(of: CodeOnce<M>, name: K, wanted: boolean) {
  const { loaded, failed, retry } = useCode(of, wanted);
  return { part: loaded ? loaded[name] : null, failed, retry };
}

/** A message's pane, where its chunk is out: the shell's quiet words after their beat, then the pane. */
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
 * fetches the pane as it is drawn, so neither the route nor Sequences carries the pane's code.
 */
export function MessagePaneProvider({ children }: { children: ReactNode }) {
  const Pane = messagePaneContext();
  return <Pane.Provider value={MessageInPlaceWhenRead}>{children}</Pane.Provider>;
}

/** The step editor opened: the pane its Edit the words draws, fetched now. */
export const warmMessagePane = pane.warm;

/** The routes that draw Sequences' code: Campaigns but its Ads view, and Sent. */
const DRAWS_SEQUENCES = /^(campaigns(?!\/ads)|broadcasts)(\/|$)/;
/** The routes that open a message: its address (`campaigns/messages/<name>`, which opens it over the list), and its old drawer's. */
const OPENS_A_MESSAGE = /^campaigns\/(messages\/[^/]+|message:)/;

/** A route somebody is reaching for: the code it draws, fetched now. A fetch that fails is the page's to ask again. */
export function warmCampaignsCode(route: string): void {
  if (DRAWS_SEQUENCES.test(route)) sequencesCode.warm();
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
  if (!win) return;
  const go = () => {
    if (!/^(campaigns|broadcasts)(\/|$)/.test(routeOnScreen(win))) reach("campaigns");
  };
  const idle = () => void aheadWhenIdle(go, CAMPAIGNS_IDLE_MS);
  if (win.document.readyState === "complete") idle();
  else win.addEventListener("load", idle, { once: true });
}
