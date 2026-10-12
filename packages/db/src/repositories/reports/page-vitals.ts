/**
 * Field data's functions (00255, 00408, decision 0053), the one place each is called by name: a load's reports kept,
 * and the back office's reads of them (the 75th percentile of page loads, where the pages' time goes, the elements that
 * cost the most). All are the service role's alone: a row names a page and a number, no person and no workspace.
 *
 * Thin: each answers what the call answered, its rows or its error, and the dashboard's reader
 * (`apps/dashboard/src/server/platform/vitals.ts`) says what an error means. A report that could not be kept is a number
 * lost, never an error for a page that is closing; a read that fails leaves the back office's other cards standing.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;
type Fns = Database["public"]["Functions"];

/** How far back a read looks, and how many of the latest reports it takes at most. */
interface PageVitalsWindow {
  days: number;
  most: number;
}

/** What a call answered: its rows, or the error that stood in for them. */
interface PageVitalsAnswer<T> {
  data: T | null;
  error: PostgrestError | null;
}

/** One load's reports, with its device and build where it said them: answers how many rows took them. */
export async function notePageVitals(
  db: Db,
  load: { page: string; vitals: Json; device?: string; build?: string },
): Promise<PageVitalsAnswer<number>> {
  const { data, error } = await db.rpc("note_page_vitals", {
    p_page: load.page,
    p_vitals: load.vitals,
    ...(load.device ? { p_device: load.device } : {}),
    ...(load.build ? { p_build: load.build } : {}),
  });
  return { data, error };
}

/** The 75th percentile of the browser's five over page loads, over every page and over each. */
export async function pageVitalsP75(
  db: Db,
  window: PageVitalsWindow,
): Promise<PageVitalsAnswer<Fns["page_vitals_p75"]["Returns"]>> {
  const { data, error } = await db.rpc("page_vitals_p75", { p_days: window.days, p_most: window.most });
  return { data, error };
}

/** Where the pages' time goes: the 75th percentile by page, part, how it was reached, device and held rows. */
export async function pageSpeed(
  db: Db,
  window: PageVitalsWindow,
): Promise<PageVitalsAnswer<Fns["page_speed"]["Returns"]>> {
  const { data, error } = await db.rpc("page_speed", { p_days: window.days, p_most: window.most });
  return { data, error };
}

/** The elements whose interactions, paints and shifts cost the most, by page. */
export async function pageSpots(
  db: Db,
  window: PageVitalsWindow,
): Promise<PageVitalsAnswer<Fns["page_spots"]["Returns"]>> {
  const { data, error } = await db.rpc("page_spots", { p_days: window.days, p_most: window.most });
  return { data, error };
}
