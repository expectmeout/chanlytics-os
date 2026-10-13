import "server-only";
import type { MemberAlertsDto, NotificationDto, NotificationsDto, PushPlatform } from "@chanlytics/contracts";
import { stamp, type Reader } from "./index";
import {
  BELL_LIST_ROWS,
  BELL_WINDOW_DAYS,
  DAY_MS,
  kindsEndedBy,
  PUSH_PLATFORMS,
  pushOffOf,
  unreadFor,
} from "@chanlytics/contracts";
import { memberAlertsOf, olderUnreadFor } from "@chanlytics/db";

/**
 * GET notifications, as the route answers it: the workspace's kept notifications of the last thirty days by the turn's
 * clock, the newest BELL_LIST_ROWS of them, with this person's own marks on each row, whether the server closed it
 * (closed_at, 00421), when they last opened the bell, and their unread count of the whole window (`unread`): the listed
 * rows' and the older ones', counted by the one count the push job's badge uses (packages/db olderUnreadFor, unreadOfReaders' rule), so the
 * page, the icon and the push agree on a busy month (the wiring's second audit, S6-10). The older rows are read only
 * when the list is full and some of them may be unread (newer than the seen moment). The route's body, moved here whole.
 * A notification is not a row a citation names: none of the thirteen is the bell's.
 */
export const notifications: Reader<undefined, NotificationsDto> = {
  name: "notifications",
  async read(rc) {
    const tenantId = rc.tenantId;
    const since = new Date(rc.now.getTime() - BELL_WINDOW_DAYS * DAY_MS).toISOString();
    const sb = rc.ctx.supabase;
    const [rows, seen] = await Promise.all([
      sb
        .from("notifications")
        .select("id, kind, title, body, route, subject_type, subject_id, created_at, closed_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(BELL_LIST_ROWS),
      sb.from("notification_reads").select("seen_at").eq("tenant_id", tenantId).eq("user_id", rc.userId).maybeSingle(),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    if (seen.error) throw new Error(seen.error.message);
    // The marks for THESE notifications. Read in parallel it could name no ids,
    // so it fetched every mark this person has ever left, in every workspace
    // they belong to -- a row per notification per user, kept for ever, to
    // build a map consulted at most LIMIT times. One more round trip bounds it.
    const ids = (rows.data ?? []).map((r) => r.id);
    const seenAt = seen.data?.seen_at ?? null;
    const oldest = (rows.data ?? []).at(-1)?.created_at ?? null;
    // The older rows, only where the list is full and one of them may be unread: none can be when the seen moment is at or
    // after the oldest row listed, and none older than the seen moment counts, so the read starts there.
    const olderRead =
      ids.length === BELL_LIST_ROWS && oldest && !(seenAt && seenAt >= oldest)
        ? olderUnreadFor(sb, {
            tenantId,
            reader: rc.userId,
            fromIso: seenAt && seenAt > since ? seenAt : since,
            throughIso: oldest,
            leaving: new Set(ids),
            // The holds' threads among them: the bell draws a hold that still waits as its own row (bellOlderOf).
            holdKinds: kindsEndedBy("hold"),
          })
        : Promise.resolve({ unread: 0, holdThreads: [] as string[] });
    const [marks, older] = await Promise.all([
      ids.length
        ? sb
            .from("notification_marks")
            .select("notification_id, read_at, dismissed_at")
            .eq("user_id", rc.userId)
            .in("notification_id", ids)
        : Promise.resolve({ data: [], error: null }),
      olderRead,
    ]);
    if (marks.error) throw new Error(marks.error.message);
    const byId = new Map((marks.data ?? []).map((m) => [m.notification_id, m]));
    const notifications: NotificationDto[] = (rows.data ?? []).map((r) => {
      const m = byId.get(r.id);
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        route: r.route,
        subject_type: r.subject_type,
        subject_id: r.subject_id,
        created_at: r.created_at,
        read: !!m?.read_at,
        dismissed: !!m?.dismissed_at,
        closed_at: r.closed_at ?? null,
      };
    });
    const listedUnread = unreadFor(
      notifications,
      seenAt,
      (marks.data ?? []).map((m) => ({
        notification_id: m.notification_id,
        read_at: m.read_at,
        dismissed_at: m.dismissed_at,
      })),
    );
    const out: NotificationsDto = {
      notifications,
      seen_at: seenAt,
      unread: listedUnread + older.unread,
      ...(older.holdThreads.length ? { older_holds: older.holdThreads } : {}),
    };
    return { data: out, rows: [], stamp: stamp() };
  },
};

/**
 * GET me/alerts, as the route answers it: what this member chose for their phones in this workspace (memberships.push_off,
 * 00372, read leniently by contracts' pushOffOf) and their own phones, never a token. `choosable` is false on a database
 * without 00372: the page then shows what a phone is told and offers no tick (decision 0040).
 */
export const memberAlerts: Reader<undefined, MemberAlertsDto> = {
  name: "member_alerts",
  async read(rc) {
    const row = await memberAlertsOf(rc.ctx.supabase, { tenantId: rc.tenantId, userId: rc.userId });
    const out: MemberAlertsDto = {
      push_off: pushOffOf(row.pushOff),
      phones: row.phones
        .filter((p): p is typeof p & { platform: PushPlatform } =>
          (PUSH_PLATFORMS as readonly string[]).includes(p.platform),
        )
        .map((p) => ({ platform: p.platform, app_version: p.app_version, last_seen_at: p.last_seen_at })),
      choosable: row.choosable,
    };
    return { data: out, rows: [], stamp: stamp() };
  },
};
