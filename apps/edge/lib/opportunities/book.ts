/**
 * Why to post now, as the edge reads it (the content loop PRD's 10.1): the one read of a workspace's reasons, shared by
 * Campaigns' paced offer and the week's plan, so the book's open time is worked out once. A paced offer keeps to the
 * book's room (D39 of the answers canvas); the plan reads the same busy blocks day by day (core opportunitiesFrom).
 */
import {
  BOOKING_DEFAULTS,
  calendarFeedKeyOf,
  DAY_MS,
  freeWindows,
  parseTenantConfig,
  roomOf,
  shiftKey,
  type OwnerClaim,
  type TenantId,
} from "@chanlytics/contracts";
import { freshFilesOf, type OpportunityFacts } from "@chanlytics/core";
import { listNewReviews, listWeekFootage } from "@chanlytics/db/files";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { readBookBusy } from "../calendar/availability.js";

type Db = SupabaseClient<Database>;

/** The business's own day facts, as its config keeps them. */
type Profile = NonNullable<NonNullable<ReturnType<typeof parseTenantConfig>>["brain"]>["profile"];

/**
 * How much room the book has now, for a paced offer's run, by the one count (contracts roomOf): null where it could not be
 * read, and a run then keeps the pace it was given, never guessing a full book.
 */
export async function readBookRoom(
  tenantId: TenantId,
  at: { url: string; tz: string; now: Date; daysAhead: number; profile: Profile | undefined },
): Promise<{ open: number; days: number } | null> {
  if (!at.profile) return null;
  try {
    const busy = await readBookBusy(tenantId, at);
    if (!busy) return null;
    const free = {
      hours: at.profile.hours,
      closures: at.profile.closures,
      tz: at.tz,
      rules: at.profile.booking_rules ?? null,
      now: at.now,
    };
    const room = roomOf(freeWindows({ ...free, busy }), free, at.daysAhead);
    return { open: room.by_day.reduce((n, d) => n + d.open, 0), days: room.days };
  } catch {
    return null; // a run with no room said keeps its pace: the sweep is never failed for a calendar it could not read
  }
}

/** How far back footage, reviews and what went out are read for a week. */
const FRESH_DAYS = 14;
/** How far back the footage a week could be made from is read. */
export const FOOTAGE_DAYS = 90;

/** What the reader is handed of the workspace: its zone, its config as stored, its claims and its new services. */
interface WorkspaceRead {
  tenantId: TenantId;
  zone: string;
  config: unknown;
  claims: readonly OwnerClaim[];
  newServices: readonly string[];
}

/** The reasons' facts for a window of days (PRD 10.1): the book's busy time, new reviews, fresh footage, claims. */
export async function readOpportunityFacts(
  db: Db,
  workspace: WorkspaceRead,
  window: { from: string; to: string; nowMs: number },
): Promise<OpportunityFacts> {
  const parsed = parseTenantConfig(workspace.config);
  const profile = parsed?.brain?.profile;
  const url = calendarFeedKeyOf(parsed);
  const now = new Date(window.nowMs);
  const daysAhead = Math.max(
    profile?.booking_rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead,
    Math.ceil((Date.parse(`${shiftKey(window.to, 1)}T00:00:00Z`) - window.nowMs) / DAY_MS),
  );
  const since = new Date(window.nowMs - FRESH_DAYS * DAY_MS).toISOString();
  const [busy, reviews, files] = await Promise.all([
    url && profile
      ? readBookBusy(workspace.tenantId, { url, tz: workspace.zone, now, daysAhead })
      : Promise.resolve(null),
    listNewReviews(db, workspace.tenantId, since),
    listWeekFootage(db, workspace.tenantId, since),
  ]);
  return {
    zone: workspace.zone,
    nowMs: window.nowMs,
    from: window.from,
    to: window.to,
    hours: profile ? { hours: profile.hours, closures: profile.closures, rules: profile.booking_rules ?? null } : null,
    busy,
    reviews,
    files: freshFilesOf(files),
    claims: workspace.claims,
    newServices: workspace.newServices,
  };
}
