/**
 * The Leads surface as the frame registers it: its description (what it reads and hears, how its cache is trimmed) here,
 * and its read in surface.ts, with Leads' state and verbs, fetched as the surface is first read. Imported whole, every
 * page's first load carried Leads' rows, peek and words for a surface read only on its page (the loadability review,
 * 19 Oct 2026).
 */
import { SURFACE_VALUE_SLOT } from "@/legacy-bridge/surface-cache";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { surfaceCode } from "@/legacy-bridge/surfaces/code";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { declareSurfaceValue } from "../surface-values";
import type { LeadsSurface } from "./surface-types";

// Ask reads the Leads surface by its old name (legacy-bridge/ask/context.ts, palette.ts) until it moves (decision 0015,
// step 12): one line, deleted with its last reader.
declareSurfaceValue("leads", "__LEADS");

/** The rows the tab's cache keeps of the view: what an instant paint needs. */
const SNAPSHOT_ROWS = 100;

/** Leads' state and read: fetched once, at once where Leads is the page opened (legacy-bridge/surfaces/code.ts). */
const leadsCode = surfaceCode("leads", () => import("./surface"));

export const leadsOverride: SurfaceOverride = {
  key: "leads",
  value: "leads",
  // The tab's cache holds the first hundred rows of the view: all an instant paint needs, and a fifth of what a
  // full page costs to keep and to parse on every boot. The read behind the paint says the rest, so the snapshot
  // offers nothing and has no page after it.
  trimSnapshot: (snap) => {
    const L = snap[SURFACE_VALUE_SLOT] as LeadsSurface | undefined;
    return L
      ? { ...snap, [SURFACE_VALUE_SLOT]: { ...L, rows: L.rows.slice(0, SNAPSHOT_ROWS), next: null, offered: 0 } }
      : snap;
  },
  events: ["surface:leads"],
  // Heard while Leads is on screen, read once as it comes back (PAGE_HEARS): a running search, a page every few seconds, was
  // read in every tab whatever page was open (the wiring's second audit, S10-5).
  // Each row says where its lead stands in a sequence (00459 sequence_places_of): the sequences, batches and replies too.
  ...declareReads("leads", { reads: ["lead", "campaign", "send", "reach_out"], fresh: "its-page" }),
  debounceMs: 800,
  apply: async () => (await leadsCode()).applyLeads(),
};
