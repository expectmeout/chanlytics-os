/**
 * The reader's mark, carried into the rows it is about.
 *
 * A surface's value is the server's last word, and the tab's cache paints it on the next load
 * (legacy-bridge/surface-cache.ts); the mark a person's opening makes re-reads nothing (refresh-map.ts), so every person
 * opened since a surface's last read was painted unread again on a reload, until the read landed, and one put back was
 * painted read (20 Oct 2026). The door's answer is the server's own word on the person, so it goes into each surface's
 * rows as it lands, by the read's own rule (contracts readingOf), and the cache follows as it does a saved view.
 *
 * A leaf on purpose, importing the contracts and the values store alone: a surface says how it carries a mark as it is
 * evaluated (carriesMark), and the store that makes the marks (seen.ts) reaches the client, the cache and through the
 * address's routes the surfaces themselves, so a page that imported the store first entered a surface while the store
 * was still loading (people/attention-strip.test.mjs, 20 Oct 2026: "cannot access 'carriers' before initialization").
 * This module is whole before any surface can call it, whatever was imported first.
 */
import { readingOf, type SeenOf, type SeenReading } from "@chanlytics/contracts";
import { onSurfaceValue, type SurfaceKey } from "./surface-values";

/** How a surface takes a mark into its rows: true when what it holds changed, and was published. */
type MarkCarrier = (personId: string, mark: SeenOf) => boolean;

/** What a carrier's surface is published and cached under (legacy-bridge/surface-data.ts SurfaceOverride). */
interface CarrierOf {
  key: string;
  value?: SurfaceKey;
  globals?: string[];
  events?: string[];
}

/** The surfaces that draw the dot, each with how it carries a mark (carriesMark). */
const carriers = new Map<string, { of: CarrierOf; carry: MarkCarrier }>();
/** The marks the door stamped for this tab, by person, the latest of each: handed to a surface again as it publishes. */
const carriedMarks = new Map<string, SeenOf>();
/** How a surface a mark changed is kept for the next load: the tab's cache, installed by the store (seen.ts keepsCarried). */
let keep: (of: CarrierOf) => void = () => {};

/** The store says how a surface that changed is kept for the next load (surface-cache.ts resnapshotSurface). */
export function keepsCarried(fn: (of: CarrierOf) => void): void {
  keep = fn;
}

/** One surface handed one mark: what changed is kept, and its rows are said to have moved. */
function carryInto(of: CarrierOf, into: MarkCarrier, personId: string, mark: SeenOf): void {
  if (!into(personId, mark)) return;
  keep(of);
  for (const e of of.events ?? []) window.dispatchEvent(new CustomEvent(e));
}

/** The door's answer, into every surface that draws the person (seen.ts, as a mark lands). */
export function carryMark(personId: string, mark: SeenOf): void {
  carriedMarks.set(personId, mark);
  for (const { of, carry: into } of carriers.values()) carryInto(of, into, personId, mark);
}

/**
 * A surface says how a mark is carried into its rows, and is handed every mark of this tab's again whenever it publishes:
 * a read that left before the mark and lands after it holds the server's older word, which the next load would paint. A
 * carrier changes nothing where a row carries the mark or a later one made elsewhere (carriedReading).
 */
export function carriesMark(of: CarrierOf, into: MarkCarrier): void {
  carriers.set(of.key, { of, carry: into });
  if (!of.value) return;
  onSurfaceValue(of.value, () => {
    for (const [personId, mark] of carriedMarks) carryInto(of, into, personId, mark);
  });
}

/**
 * A row's reading under a mark carried into it (contracts readingOf, the read's own rule), or null where the row keeps
 * its own: it carries this mark already, or a later one.
 */
export function carriedReading(row: { heardAtMs?: number; markAtMs?: number }, mark: SeenOf): SeenReading | null {
  const reading = readingOf(row.heardAtMs ?? 0, mark);
  return (row.markAtMs ?? 0) >= reading.markAtMs ? null : reading;
}
