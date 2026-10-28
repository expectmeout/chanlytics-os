/**
 * The searches whose leads are ready (GET reach-outs/sources, 00426), one of New's starts: kept in the tab by workspace
 * (read-cache.ts `tab`), so New paints its starts from the last answer and reads again behind; read ahead as a door to New
 * is reached for; and, where the tab opens on New, waited for by its first draw, so the starts it draws hold the search's
 * row. Read afresh as New opened, its starts drew a panel of what to set up first and swapped it 200 ms later for the row
 * the search gave, on every open (the Campaigns load review, 28 Oct 2026). Its own module, apart from the reach-outs'
 * verbs (surface.ts), since Sequences' surface and its doors, which the frame loads, read it.
 */
import type { ReachOutSourceDto } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { firstDrawWaitsFor } from "@/legacy-bridge/surface-status";
import { getActiveWorkspace, routeOnScreen } from "@/legacy-bridge/workspace";

const searchesHeld = readCache<ReachOutSourceDto[]>("reach_out_sources", () => true, { tab: true });

const searchesRead = async () => (await read("GET reach-outs/sources")).sources;

/** What a reach-out could start from, read and kept for the workspace on screen; null when it could not be read. */
export async function readSources(): Promise<ReachOutSourceDto[] | null> {
  try {
    return await searchesHeld.through(getActiveWorkspace() ?? "", searchesRead);
  } catch (e) {
    console.error("reach_out_sources_failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The searches this tab last read for the workspace on screen, or null: what New's first paint draws its starts from. */
export const peekSources = (): ReachOutSourceDto[] | null => searchesHeld.peek(getActiveWorkspace() ?? "");

/** Read them ahead, for a door to New reached for: one held and current reads nothing (read-cache warm). */
export function warmSources(): void {
  void searchesHeld.warm(getActiveWorkspace() ?? "", searchesRead);
}

/** Whether the tab is on New (`campaigns/sequences/new…`); false where there is no page (a node test's stand-in window). */
function newOnScreen(): boolean {
  if (typeof window === "undefined" || typeof window.location?.pathname !== "string") return false;
  return /^campaigns\/sequences\/new(:|\/|$)/.test(routeOnScreen());
}

let searchesAsked = false;

/**
 * Where the tab opened on New, its first draw waits for the searches as it waits for its own surface (surface-status
 * firstDrawWaitsFor): said as Sequences' first read is asked (sequences/surface.ts), so before its gate can open, once a
 * tab. The head started the read with New's own (contracts PREFETCH_READS), so this takes that answer.
 */
export function searchesBeforeNew(): void {
  if (searchesAsked) return;
  searchesAsked = true;
  if (newOnScreen()) firstDrawWaitsFor("campaigns", readSources());
}
