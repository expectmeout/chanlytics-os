import "server-only";
/**
 * One morning per business (D20 of the answers canvas). Ask's notices were only worked out while somebody had it open; here the
 * clock looks, once a day, at the business's own eight o'clock, reads what stands out by the same code the page uses, and tells
 * the people who can act the one thing most worth saying: a line on the bell, and the phone or browser where they said yes.
 *
 * Manners, as the canvas sets them: one a day, in the business's morning, and the same notice never twice in a week. Urgent things
 * have their own alerts and are not this. A business that is paused is not looked at. No model is called. A due follow-up is
 * told the same way, to the member who set it. What fails for one business is logged and costs only that business's morning.
 */
import {
  DAY_MS,
  dayInZone,
  localHour,
  noticesInOrder,
  type AskNotice,
  type MembershipRole,
  type TenantId,
} from "@chanlytics/contracts";
import {
  insertAskNoticeDay,
  listAskNoticeKeysSince,
  listBusinessesForMorning,
  listOwnerSeats,
  keepNoticeAlert,
} from "@chanlytics/db/ask";
import { scheduleJob } from "@chanlytics/jobs";
import { log } from "@/server/shared/log";
import { serviceDb } from "@/server/shared/service-db";
import { readerContext } from "@/server/shared/reader";
import { newToolContext } from "../tools";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { listNotices } from "./notices";

/** The business's morning, by its own clock. */
const MORNING_HOUR = 8;
/** How many businesses one run looks at, at most, and how many at once: their reads are a page's. Six runs in the hour. */
const BUSINESSES_A_RUN = 100;
const AT_ONCE = 5;
/** A notice is not said again for this long. */
const NOT_AGAIN_DAYS = 7;

/** One business's morning, read as its owner would see it, with the service role. */
async function lookAt(
  tenantId: TenantId,
  timezone: string,
  ownerId: string,
  role: MembershipRole,
  now: Date,
): Promise<string | null> {
  const db = serviceDb();
  const ctx = { supabase: db, userId: ownerId } as unknown as RouteContext;
  const member = { tenantId, role } as unknown as Member;
  const rc = readerContext(ctx, member);
  const t = { ...newToolContext(ctx, tenantId, role, timezone, now, rc), language: "en" } as Parameters<
    typeof listNotices
  >[0];
  const since = dayInZone(timezone, now.getTime() - NOT_AGAIN_DAYS * DAY_MS).key;
  const said = new Set(await listAskNoticeKeysSince(db, tenantId, since));
  const found: AskNotice[] = await listNotices(t, "en", {});
  const first = noticesInOrder(found, (key) => said.has(key)).at(0) ?? null;
  await insertAskNoticeDay(db, tenantId, dayInZone(timezone, now.getTime()).key, first?.key ?? null);
  if (first) {
    const kept = await keepNoticeAlert(db, tenantId, { title: first.says, route: "today" });
    if (kept) await scheduleJob(db, { tenantId, kind: "push_send", dueAt: now, payload: { notification_id: kept } });
  }
  return first?.key ?? null;
}

/** The clock's one tick: the businesses whose morning it is, not yet looked at today, a few a run. */
export async function runMorningSweep(now: Date): Promise<{ looked: number; told: number }> {
  const db = serviceDb();
  const businesses = await listBusinessesForMorning(db);
  const due = businesses.filter((b) => localHour(b.timezone, now) === MORNING_HOUR);
  const waiting = due.filter((b) => b.lastDay !== dayInZone(b.timezone, now.getTime()).key).slice(0, BUSINESSES_A_RUN);
  let looked = 0;
  let told = 0;
  for (let at = 0; at < waiting.length; at += AT_ONCE) {
    await Promise.all(
      waiting.slice(at, at + AT_ONCE).map(async (b) => {
        try {
          const owner = (await listOwnerSeats(db, b.id as TenantId)).at(0);
          if (!owner) return;
          looked++;
          if (await lookAt(b.id as TenantId, b.timezone, owner.user_id, owner.role as MembershipRole, now)) told++;
        } catch (e) {
          log.error("ask_morning_sweep_failed", { tenant_id: b.id, error: e });
        }
      }),
    );
  }
  return { looked, told };
}
