import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NOTHING_WAITS_KNOWN,
  runDaysAt,
  type NotificationDto,
  type RunDays,
  type WhatWaits,
} from "@chanlytics/contracts";
import { heldNoticeKeys, reviewsNamed, runsNamed, type Database } from "@chanlytics/db";
import { log } from "@/server/log";

/**
 * What still waits on the owner of what the kept notices are about, read on the server for Ask's read of the notices (the
 * wiring's second audit, R13 X5-1). The bell closes a notice whose subject no longer waits (contracts closeSettledNotices,
 * over what the tab's surfaces hold: the runs Sent holds, the booking emails the Calendar holds, the reviews Google's read
 * holds), and Ask listed the same rows as waiting and counted them unread: a run approved, a booking email dismissed, a
 * review answered. These are the same subjects, read where the server reads: the runs the notices name, every held booking
 * email, and the reviews the notices name, each as of now. A hold and a lead's question the server closes itself when they
 * end (00421), so neither is read here.
 *
 * A subject that cannot be read settles nothing (null), as a surface not yet read settles nothing on the bell.
 */
export async function noticeWaitsOf(
  db: SupabaseClient<Database>,
  tenantId: string,
  notices: readonly NotificationDto[],
  now: Date,
  zone: string | null,
): Promise<WhatWaits> {
  const named = (type: string) => [
    ...new Set(notices.flatMap((n) => (n.subject_type === type && n.subject_id ? [n.subject_id] : []))),
  ];
  const runIds = named("broadcast");
  const reviewIds = named("review");
  const asked = (what: string) => (e: unknown) => {
    log.error("ask_notice_waits_failed", {
      tenant_id: tenantId,
      what,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  };
  const [runs, heldEmails, reviews] = await Promise.all([
    runIds.length ? runsNamed(db, tenantId, runIds).catch(asked("runs")) : Promise.resolve(null),
    notices.some((n) => n.subject_type === "booking_notice")
      ? heldNoticeKeys(db, tenantId).catch(asked("booking emails"))
      : Promise.resolve(null),
    reviewIds.length ? reviewsNamed(db, tenantId, reviewIds).catch(asked("reviews")) : Promise.resolve(null),
  ]);
  // Read now: every kept row is older than this, so each is judged by it (contracts notice-closes heldFor).
  const readAt = now.getTime();
  return {
    ...NOTHING_WAITS_KNOWN,
    runs: runs ? { readAt, held: new Map(runs.map((r) => [r.id, r])) } : null,
    days: runs?.length ? runDaysOf(zone, now) : null,
    heldEmails: heldEmails ? { readAt, held: heldEmails } : null,
    reviews: reviews ? { readAt, held: reviews } : null,
  };
}

/** The business's days a waiting run is judged by; none where the zone is not known, or the clock cannot say. */
function runDaysOf(zone: string | null, now: Date): RunDays | null {
  if (!zone) return null;
  try {
    return runDaysAt(zone, now);
  } catch {
    return null;
  }
}
