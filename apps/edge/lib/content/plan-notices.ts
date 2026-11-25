/**
 * A week of posts, told where the owner is (the content loop PRD's 12.5, call 24): with every rung at "AI asks first" a
 * week nobody opens never posts, so a week ready is a row on the bell, the phone told, and one mail as the business
 * chooses (plan_ready); what the week asks to be filmed is a row and the phone, once a week at most, never a mail
 * (footage_ask). Each is told once: asked again (a job tried again) it finds its row and tells nobody twice.
 *
 * And how AI's approval of a held week ended (the Week review of 25 Nov 2026, C2), one notice an ending: approved, with
 * how many go up and how many were left out, or not approved and why. Its words are contracts weekEndingSaid's, which
 * the Week's head and Today's point say too. It rides the week's own kind (plan_ready), so it opens the Week and reaches
 * the owner as the week's news does.
 *
 * Never a failed job: a notice that cannot be told is logged and let go; the Week says the same, and Today's point too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTENT_WEEK_ROUTE,
  WEEK_WORDS,
  creativesOf,
  dayInZone,
  slotWhenSaid,
  weekDaysSaid,
  weekEndingSaid,
  weekSizeSaid,
  type TenantId,
  type WeekEnding,
} from "@chanlytics/contracts";
import type { DraftedSlot } from "@chanlytics/core";
import type { Database } from "@chanlytics/db/types";
import { notifyOnce } from "../shared/alerts/notify.js";
import { errField, logger } from "../shared/log.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";

type Db = SupabaseClient<Database>;

/**
 * How a ready week goes, as its notice says it: held to its time (which the notice names, with its day), sent now,
 * waiting for the owner's press, or waiting because AI is paused (nothing is promised to go up by itself).
 */
export type WeekGoes = { is: "held"; goesAt: string } | { is: "sent" | "asks" | "paused" };

/** The week that was written, as its notices read it. */
interface WeekWritten {
  tenantId: TenantId;
  planId: string;
  weekOf: string;
  zone: string;
  slots: readonly DraftedSlot[];
  asks: number;
  /** Whether the rung let AI approve it (00714): held to its time, or going now; else it waits for the owner. */
  held?: WeekGoes | undefined;
}

/** The ready notice's body, as the week goes: held names its day and time, in the business's zone. */
function readyBodyOf(week: WeekWritten, size: string, days: string): string {
  const goes = week.held;
  if (goes?.is === "held") return WEEK_WORDS.readyBodyHeld(size, days, slotWhenSaid(goes.goesAt, week.zone));
  if (goes?.is === "sent") return WEEK_WORDS.readyBodySent(size, days);
  return goes?.is === "paused" ? WEEK_WORDS.readyBodyPaused(size, days) : WEEK_WORDS.readyBody(size, days);
}

/** The week ready, and what to film for it, each told once. */
export async function notifyWeek(db: Db, week: WeekWritten): Promise<void> {
  const log = logger({ tenant_id: week.tenantId });
  try {
    const target = { tenantId: week.tenantId, ...(await loadTenantNotifications(db, week.tenantId)) };
    const live = week.slots.filter((s) => s.state === "proposed" || s.state === "blocked");
    const about = { type: "content_plan", id: week.planId };
    if (live.length > 0) {
      const size = weekSizeSaid(creativesOf(live));
      await notifyOnce(
        target,
        {
          kind: "plan_ready",
          subject: WEEK_WORDS.readySubject,
          body: readyBodyOf(week, size, weekDaysSaid(live.map((s) => dayInZone(week.zone, Date.parse(s.at)).key))),
          route: CONTENT_WEEK_ROUTE,
          about,
          onceKey: `plan_ready:${week.planId}`,
        },
        { db },
      );
    }
    if (week.asks > 0) {
      const asks = week.slots.filter((s) => s.state === "needs_footage" && s.ask);
      await notifyOnce(
        target,
        {
          kind: "footage_ask",
          subject: WEEK_WORDS.askSubject(asks.length),
          body: asks.map((s) => `${s.ask?.what ?? ""}.`).join(" "),
          route: CONTENT_WEEK_ROUTE,
          about,
          // At most once a week, whatever the week is asked again for.
          onceKey: `footage_ask:${week.tenantId}:${week.weekOf}`,
        },
        { db },
      );
      log.info("footage_asked", { plan_id: week.planId, asks: asks.length });
    }
  } catch (e) {
    log.error("plan_untold", { plan_id: week.planId, error: errField(e) });
  }
}

/**
 * How AI's approval of a held week ended, told once (the Week review of 25 Nov 2026, C2). `when` is the time the week
 * was to go ("8:00 AM"). An ending with nothing to ring for (the owner's own stop, which they pressed) tells nobody.
 */
export async function notifyWeekEnding(
  db: Db,
  week: { tenantId: TenantId; planId: string; when: string },
  ending: WeekEnding,
): Promise<void> {
  const bell = weekEndingSaid(ending, week.when).bell;
  if (!bell) return;
  try {
    const target = { tenantId: week.tenantId, ...(await loadTenantNotifications(db, week.tenantId)) };
    await notifyOnce(
      target,
      {
        kind: "plan_ready",
        subject: bell.subject,
        body: bell.body,
        route: CONTENT_WEEK_ROUTE,
        about: { type: "content_plan", id: week.planId },
        // Once a week and an ending: the job tried again rings no second time.
        onceKey: `week_ended:${week.planId}:${ending.is}`,
      },
      { db },
    );
  } catch (e) {
    logger({ tenant_id: week.tenantId }).error("plan_untold", { plan_id: week.planId, error: errField(e) });
  }
}
