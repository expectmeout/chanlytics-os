/**
 * What Ask made for the business, for Campaigns › Content: `GET content`, read only where the view is drawn, again when what
 * it holds has aged, and when the feed says a file changed, so a video that lands shows without a press. A video still being
 * made and a post on its way are told to no page (00611, 00613): the page asks again while one moves (page.tsx).
 *
 * The value is the seam's (`useSurface("content")`): undefined until read, null when the read failed. This module rides the
 * route every page loads, so it holds the read and the one move that changes what it asks.
 */
import type { ContentPageDto, ContentView } from "@chanlytics/contracts";
import { CONTENT_MAX, SECOND_MS, contentViewDrawsLines } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { readAged, type SurfaceOverride } from "@/bridge/surface-data";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/bridge/surface-realtime";
import { declareReads } from "@/bridge/surface-registry";
import { surfaceMoved } from "@/bridge/surface-status";
import { setSurfaceValue, surfaceValue } from "../../surface-values";

/** How quiet the feed must be before the page is read again: a look landing tells a notice a second or two. */
const CONTENT_QUIET_MS = 2 * SECOND_MS;

export interface ContentSurface {
  dto: ContentPageDto;
  fetchedAt: number;
}

/**
 * The view of Made asked for, the words All is found by, and how far down a person has read. All, from its top, asks with no
 * query at all, which is the read the document's head started (contracts route-prefetch). A new object each move, so a read
 * that answers after a newer move is known by it.
 */
let contentOnScreen: { view?: ContentView; limit?: number; about?: string } = {};

type ContentAsk = typeof contentOnScreen;

/** A read's query: the view and the words, how many, and the page it reads on from. */
const queryOf = ({ view, limit, about }: ContentAsk, before?: string) => ({
  ...(view ? { view } : {}),
  ...(limit ? { limit } : {}),
  ...(about ? { about } : {}),
  ...(before ? { before } : {}),
});

/** How much of a view a page holds: its lines where it draws lines, else what was made. */
const heldIn = (dto: ContentPageDto): number => (contentViewDrawsLines(dto.view) ? dto.lines.length : dto.made.length);

/** A page with the next one after it: what is being made is the first page's, since a later page answers none. */
const joinedPages = (held: ContentPageDto, more: ContentPageDto): ContentPageDto => ({
  ...more,
  making: held.making,
  made: [...held.made, ...more.made],
  lines: [...held.lines, ...more.lines],
});

/**
 * The view as long as it was read. Past the most one read answers (CONTENT_MAX), the pages after the first are read on from
 * where each ended, the way Show more reads them, so a list or a search a person has scrolled far down stands as it was: the
 * piece they opened, and their place, are still there when they come back to it.
 */
async function readAsked(ask: ContentAsk): Promise<ContentPageDto> {
  if (!ask.view && !ask.limit && !ask.about) return read("GET content");
  const wanted = ask.limit ?? 0;
  let held = await read("GET content", {
    query: queryOf(wanted ? { ...ask, limit: Math.min(wanted, CONTENT_MAX) } : ask),
  });
  while (held.next && heldIn(held) < wanted) {
    const rest = Math.min(wanted - heldIn(held), CONTENT_MAX);
    held = joinedPages(held, await read("GET content", { query: queryOf({ ...ask, limit: rest }, held.next) }));
  }
  return held;
}

/**
 * The view the page's address names, asked for from here on: true where it is not the one asked for already, so the page
 * reads it. What is on screen stands until it answers.
 */
export function askContentView(view: ContentView): boolean {
  if ((contentOnScreen.view ?? "all") === view) return false;
  contentOnScreen = view === "all" ? {} : { view };
  return true;
}

/**
 * All of Made found by its words, as the Library is (Ruben, 12 Nov 2026: one search, both lists): the words the read asks
 * with, or none, all of it. Answers whether that changed what is asked, for the page to read it again.
 */
export function askContentFind(about: string | null): boolean {
  const words = about?.trim() || undefined;
  if (contentOnScreen.about === words) return false;
  contentOnScreen = words ? { about: words } : {};
  return true;
}

/**
 * The next page of what is shown (what was made, what was found by its words, or a view's lines), after what is there. A read
 * again then asks for all of it, as long as it now is (readAsked).
 */
export async function readMoreContent(): Promise<void> {
  const held = surfaceValue("content")?.dto;
  if (!held?.next) return;
  const { next, view } = held;
  // A search reads on in what it found, as the list reads on in all of it: the same words, from where the page ended.
  const about = held.about ?? undefined;
  const asks = { ...(view === "all" ? {} : { view }), ...(about ? { about } : {}) };
  const more = await read("GET content", { query: queryOf(asks, next) });
  const now = surfaceValue("content")?.dto;
  if (now?.next !== next || now.view !== view || (now.about ?? undefined) !== about) return;
  const joined = joinedPages(now, more);
  contentOnScreen = { ...asks, limit: heldIn(joined) };
  setSurfaceValue("content", { dto: joined, fetchedAt: Date.now() });
  // No read of the surface's own landed, so nothing told its page: its rows did land, and whoever draws them is told.
  surfaceMoved("content");
}

export const contentOverride: SurfaceOverride = {
  key: "content",
  value: "content",
  onDemand: true,
  isStale: () => readAged(surfaceValue("content")?.fetchedAt),
  events: ["surface:content"],
  debounceMs: CONTENT_QUIET_MS,
  maxWaitMs: DEAR_READ_LONGEST_WAIT_MS,
  ...declareReads("content", {
    // Its files, and the reviews its "newest review" idea is offered from (server readers/content.ts ideaFilesOf): a first
    // review landing offers the idea without a press. And, while nothing is kept, where Ask looked for photos and videos
    // (readers/content-sources.ts): the website's read and the ledger's run (brought), the website its settings name
    // (facts) and the linked listing (review), so "Looking" turns into what came the moment it lands. And the Meta link
    // (channel): whether Instagram takes a reel decides what a made video that never went out says (Ready to post, or
    // Ready to save), so connecting it, or its connection lapsing, is said on the tile without a press.
    reads: ["file", "review", "brought", "facts", "channel"],
    fresh: "its-page",
    omit: [
      {
        tables: ["google_connections"],
        why: "an idea is offered where a review says something; the profile's connection is Settings' and the open piece's own read",
      },
      {
        tables: ["lines", "mailboxes", "mailbox_connections", "capability_activations", "business_records"],
        why: "of the channels the page reads the Meta link alone, for whether Instagram takes a reel; a number, a mailbox, an activation and the carriers' record are none of a post's",
      },
    ],
  }),
  apply: async () => {
    const ask = contentOnScreen;
    try {
      const dto = await readAsked(ask);
      if (ask === contentOnScreen) setSurfaceValue("content", { dto, fetchedAt: Date.now() });
    } catch (e) {
      // A read again that failed leaves what is on screen: the tiles stand.
      if (!surfaceValue("content")) setSurfaceValue("content", null);
      throw e;
    }
  },
};
