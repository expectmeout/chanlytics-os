/**
 * What Ask made for the business, for Campaigns › Content: `GET content`, read only where the view is drawn, again when what
 * it holds has aged, and when the feed says a file changed, so a video that lands shows without a press. A video still being
 * made and a post on its way are told to no page (00611, 00613): the page asks again while one moves (page.tsx).
 *
 * The value is the seam's (`useSurface("content")`): undefined until read, null when the read failed. This module rides the
 * route every page loads, so it holds the read and the one move that changes what it asks.
 */
import type { ContentPageDto, ContentView } from "@chanlytics/contracts";
import { CONTENT_MAX, SECOND_MS } from "@chanlytics/contracts";
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
 * The view of Made asked for, and how far down a person has read. All, from its top, asks with no query at all, which is the
 * read the document's head started (contracts route-prefetch). A new object each move, so a read that answers after a newer
 * move is known by it.
 */
let contentOnScreen: { view?: ContentView; limit?: number; about?: string } = {};

const readAsked = ({ view, limit, about }: typeof contentOnScreen) =>
  view || limit || about
    ? read("GET content", {
        query: { ...(view ? { view } : {}), ...(limit ? { limit } : {}), ...(about ? { about } : {}) },
      })
    : read("GET content");

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
 * The next page of what is shown (what was made, or a view's lines), after what is there. A read again then asks for all of it
 * at once, as long as it now is.
 */
export async function readMoreContent(): Promise<void> {
  const held = surfaceValue("content")?.dto;
  if (!held?.next) return;
  const { next, view } = held;
  const more = await read("GET content", { query: { before: next, ...(view === "all" ? {} : { view }) } });
  const now = surfaceValue("content")?.dto;
  if (now?.next !== next || now.view !== view) return;
  const pieces = [...now.made, ...more.made];
  const lines = [...now.lines, ...more.lines];
  // A read again asks for what is held, up to the most one read answers (the route refuses more): past it, the newest stand
  // fresh and Show more reads on from there, where asking for all of it would fail every read after.
  const limit = Math.min(Math.max(pieces.length, lines.length), CONTENT_MAX);
  contentOnScreen = { ...(view === "all" ? {} : { view }), limit };
  // What is being made is the first page's: a later page answers none, so what stands is kept.
  setSurfaceValue("content", { dto: { ...more, making: now.making, made: pieces, lines }, fetchedAt: Date.now() });
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
    // review landing offers the idea without a press.
    reads: ["file", "review"],
    fresh: "its-page",
    omit: [
      {
        tables: ["google_listings", "google_connections"],
        why: "an idea is offered where a review says something; the listing and the profile's connection are Settings' and the open piece's own read",
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
