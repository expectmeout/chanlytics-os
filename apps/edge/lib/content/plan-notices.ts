/**
 * A week of posts, told where the owner is (the content loop PRD's 12.5, call 24): with every rung at "AI asks first" a
 * week nobody opens never posts, so a week ready is a row on the bell, the phone told, and one mail as the business
 * chooses (plan_ready); what the week asks to be filmed is a row and the phone, once a week at most, never a mail
 * (footage_ask). Each is told once: asked again (a job tried again) it finds its row and tells nobody twice.
 *
 * Never a failed job: a notice that cannot be told is logged and let go; the Week says the same, and Today's point too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTENT_WEEK_ROUTE,
  WEEK_WORDS,
  creativesOf,
  dayInZone,
  weekDaysSaid,
  weekSizeSaid,
  type TenantId,
} from "@chanlytics/contracts";
import type { DraftedSlot } from "@chanlytics/core";
import type { Database } from "@chanlytics/db/types";
import { notifyOnce } from "../shared/alerts/notify.js";
import { errField, logger } from "../shared/log.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";
import type { WeekGoes } from "./week-go.js";

type Db = SupabaseClient<Database>;

/** The week that was written, as its notices read it. */
interface WeekWritten {
  tenantId: TenantId;
  planId: string;
  weekOf: string;
  zone: string;
  slots: readonly DraftedSlot[];
  asks: number;
  /** Whether the rung let AI approve it (00712): held to 8:00 AM, or going now; else it waits for the owner. */
  held?: WeekGoes | undefined;
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
          body: (week.held === "held"
            ? WEEK_WORDS.readyBodyHeld
            : week.held === "sent"
              ? WEEK_WORDS.readyBodySent
              : WEEK_WORDS.readyBody)(size, weekDaysSaid(live.map((s) => dayInZone(week.zone, Date.parse(s.at)).key))),
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
