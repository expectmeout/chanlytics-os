/**
 * What Campaigns › Ads opens on: the ad account (`GET ads/account`) and, with it, the page's own read (`GET ads/page`,
 * null where no account was ever connected). Which page Ads is (its ads, or the page with nothing connected) waits on both,
 * and asked only once the page's code was in they drew it in three shapes on a cold load: the page with nothing
 * connected, then a line that loads, then the ads (110, 780 and 1,100 ms on a live account, 21 Nov 2026).
 *
 * So the document's head starts both with the settings read (contracts PREFETCH_READS), the boot takes them as it asks for
 * the settings read (./settings.ts), before it lets go of what nobody took, and the view's first draw waits for them as it
 * waits for its own surface (surface-status firstDrawWaitsFor), as New's first draw waits for its searches
 * (surfaces/campaigns/reach-out/sources.ts). The page's hooks start from the answer (surfaces/campaigns/ads/connect/use-account.ts,
 * live/use-live.ts) and read again themselves after it, on a press, a return to the tab and Meta's window: these are the
 * page's own reads, and no surface's, so nothing here hears the feed.
 *
 * The boot hands it its read and the tab's address: nothing here imports the boot's own modules, which the settings read
 * runs in a circle with, and nothing of the page is in it, so Ads' page stays the chunk it is.
 *
 * Content reads the same two ahead of the Ads tab's press (surfaces/campaigns/ads/warm.ts says why), so Ads is drawn hidden
 * beside Made and the Library and a press on it shows the page whole. A load of Content, where Ads is drawn, opens on them as
 * well (readAdsBesideContent): the Ads tab's figure is said from them at Content's first draw, beside Made's and the Library's,
 * where it came 2.7 s after them, once the frame was idle (Ruben, 26 Nov 2026). Content waits for them half a second at
 * most (ADS_BESIDE_CONTENT_WAIT_MS): past it Content draws, and the figure follows as Content reads Ads ahead.
 *
 * Whose the answer is: one workspace's, kept with the workspace the address named as it was asked, and said only for that
 * workspace (adsFirstAnswer, adsFirstPage). A switch loads the page again today; this holds if one ever does not.
 */
import type { AdAccountDto, AdsLiveDto } from "@chanlytics/contracts";
import { SECOND_MS } from "@chanlytics/contracts";
import type { Output } from "../../client/api";
import { firstDrawWaitsFor } from "../surface-status";
import { getActiveWorkspace } from "../workspace/on-screen";

/** The boot's read (bridge/api read), for the two routes Ads opens on. */
type AdsReader = <K extends "GET ads/account" | "GET ads/page">(route: K) => Promise<Output<K>>;

/** What the first reads are asked through, as the boot holds it. */
interface AdsOpeningIo {
  read: AdsReader;
  /** The route on screen as the boot asks (bridge/workspace routeOnScreen). */
  route: string;
  /** The workspace the address names (bridge/workspace getActiveWorkspace). */
  workspace: string | null;
}

/** The two answers, read together, and when, for the workspace they were read in. */
interface AdsFirstRead {
  account: AdAccountDto;
  page: AdsLiveDto | null;
  fetchedAt: number;
  /** The workspace the address named as they were read: they are its answers, and no other's. */
  workspace: string | null;
}

/**
 * How long the first answer stands for a hook mounting: one read this recently is the page's first answer, and the hook
 * asks nothing more; older, it is drawn at once and read again behind it.
 */
const FIRST_ANSWER_STANDS_MS = 30 * SECOND_MS;

/**
 * How long Content's first draw waits for Ads' two reads (readAdsBesideContent). They are database reads the document's
 * head started with Content's own, so they are most often in first; on a slow day they held Content's first screen for as
 * long as any first draw is held, three seconds (the review of 28 Nov 2026, R2.9). Past this Content draws without the Ads
 * tab's figure, which lands when the reads do and Content has read Ads ahead (surfaces/campaigns/ads/warm.ts).
 */
const ADS_BESIDE_CONTENT_WAIT_MS = SECOND_MS / 2;

/** Campaigns › Ads, at any of its addresses (an ad open, New ad, its results). */
const ADS_ROUTE = /^campaigns\/ads(:|\/|$)/;
/** Campaigns › Content, at any of its lists (Made, the Library, the Week) and a piece open in one. */
const CONTENT_ADDRESSES = /^campaigns\/content(:|\/|$)/;

let adsOpenedOn: AdsFirstRead | null = null;
/** The reads on their way, once asked, so a second ask while they are out waits for them rather than asking again. */
let adsReading: Promise<void> | null = null;

/** Both reads, together, kept for the page's hooks. A read that fails keeps nothing: the hooks then ask for themselves. */
function readAdsFirst(io: Omit<AdsOpeningIo, "route">): Promise<void> {
  const reading = Promise.all([io.read("GET ads/account"), io.read("GET ads/page")]).then(([account, page]) => {
    adsOpenedOn = { account, page, fetchedAt: Date.now(), workspace: io.workspace };
  });
  adsReading = reading;
  const done = () => {
    if (adsReading === reading) adsReading = null;
  };
  reading.then(done, done);
  return reading;
}

/** Whether an answer read at `fetchedAt` stands, at `nowMs`, with no read behind it: one read this recently does. */
export const firstAnswerStands = (fetchedAt: number, nowMs: number): boolean =>
  nowMs - fetchedAt < FIRST_ANSWER_STANDS_MS;

/**
 * Both reads, made ahead of the Ads tab's press (surfaces/campaigns/ads/warm.ts): the answers the page's hooks start from, or
 * nothing new where they are in and stand, or on their way. Whether they are held once it settles; a read that failed holds
 * none, and the page then asks for itself as it is shown.
 */
export async function readAdsAhead(io: Omit<AdsOpeningIo, "route">): Promise<AdsFirstRead | null> {
  const standing = adsFirstAnswer(io.workspace);
  if (!standing || !firstAnswerStands(standing.fetchedAt, Date.now()))
    await (adsReading ?? readAdsFirst(io)).catch(() => undefined);
  return adsFirstAnswer(io.workspace);
}

/**
 * Where the tab is on Ads, its first draw waits for both reads, which take what the document's head started: the wait,
 * or null where the tab is elsewhere. A wait that failed is over, and the page asks for itself.
 */
export function readAdsOpening(io: AdsOpeningIo): Promise<void> | null {
  if (!ADS_ROUTE.test(io.route)) return null;
  // A read that failed keeps nothing and ends the wait: the page's hooks then ask for themselves, and say a refusal.
  const wait = readAdsFirst(io).catch(() => undefined);
  firstDrawWaitsFor("campaigns", wait);
  return wait;
}

/**
 * Where the tab is on Content and Ads is drawn (the settings read says so), Content's first draw waits for both reads too,
 * which the document's head started beside Content's own (contracts PREFETCH_READS): the Ads tab then says how many ads it
 * holds, and amber where one needs the owner, with Made's and the Library's figures (surfaces/campaigns/ads/needs-you.ts).
 * The reads, settled, or null where the tab is elsewhere. One that failed is over, and the tab's figure comes with the page's
 * own read. The first draw waits for them ADS_BESIDE_CONTENT_WAIT_MS at most: reads slower than that still land here, for
 * the read ahead and the Ads page to start from, and hold nothing.
 */
export function readAdsBesideContent(io: AdsOpeningIo): Promise<void> | null {
  if (!CONTENT_ADDRESSES.test(io.route)) return null;
  // The boot's, once a tab, as readAdsOpening's: what the head started is taken, and a read ahead later waits for it.
  const wait = readAdsFirst(io).catch(() => undefined);
  firstDrawWaitsFor("campaigns", settledWithin(wait, ADS_BESIDE_CONTENT_WAIT_MS));
  return wait;
}

/** Settled as `wait` settles, or `ms` from now where that comes first; `wait` itself goes on. */
function settledWithin(wait: Promise<void>, ms: number): Promise<void> {
  return new Promise((done) => {
    const cap = setTimeout(done, ms);
    void wait.then(() => {
      clearTimeout(cap);
      done();
    });
  });
}

/** The ads the first answer holds, as the Ads tab's figure reads them before the page has noted its own: none unread. */
export const adsFirstPage = (): AdsLiveDto | null => adsFirstAnswer(getActiveWorkspace())?.page ?? null;

/**
 * The first answer as a hook starts from it; none in a workspace other than the one it was read in (a switch loads the page
 * again today, and this holds if one ever does not). Whether it stands with no read behind it is asked as the hook reads
 * (firstAnswerStands): a view drawn hidden ahead of its press starts from it then, and is shown later.
 */
export function adsFirstAnswer(workspace: string | null): AdsFirstRead | null {
  if (!adsOpenedOn || adsOpenedOn.workspace !== workspace) return null;
  return adsOpenedOn;
}
