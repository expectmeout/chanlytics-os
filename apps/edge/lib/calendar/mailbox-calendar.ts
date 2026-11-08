/**
 * The calendar a connected mailbox's grant reads (decision 0073, R20), as the workspace's calendar feed: every calendar
 * of the account (channels listGoogleCalendarIds, listGraphCalendarIds) over the window a read asks for, each occurrence apart,
 * written out as iCal (channels calendarIcs) so the openings, a caller's visits and the hourly sweep read it as they read
 * a link (availability.ts fetchFeed hands this text where the feed's key is a grant's: contracts mailboxCalendarOf).
 *
 * A grant that cannot be read now (signed out, its calendar unticked, the provider down) is a feed that cannot be read:
 * null, logged, and said where a link's failures are said; a signed-out grant is the mailbox's reconnect, said once.
 *
 * The history import's calendar part (imports/calendar-part.ts) asks for one read at once when the mailbox connects, so
 * the visits are in People and the Calendar while the owner goes on, rather than at the next hour's sweep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calendarIcs,
  listGoogleCalendarIds,
  listGoogleEvents,
  grantHolds,
  listGraphCalendarIds,
  listGraphEvents,
  type CalendarEvent,
  type EventsPage,
} from "@chanlytics/channels/email";
import { DAY_MS, parseTenantConfig, seasonHorizon, type FeedHorizon, isTenantId } from "@chanlytics/contracts";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { findMailboxConnection } from "@chanlytics/db/email";
import type { Database } from "@chanlytics/db/types";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { getToken } from "../email/mailbox/credentials.js";
import { markSignedOut } from "../email/mailbox/wire.js";
import { logger } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** Pages of one calendar a read takes at most: a busy salon's half year is a few pages; past this the log says so. */
const PAGES_PER_CALENDAR = 20;

/**
 * The grant's calendars over the window, as one iCal feed; null when they cannot be read now. Every calendar's events
 * are asked page by page; one calendar that cannot be read leaves the feed unread rather than half, since a feed missing
 * a calendar would offer its taken times as open.
 */
export async function findMailboxCalendarText(
  db: Db,
  tenantId: TenantId,
  mailboxId: string,
  window: FeedHorizon,
): Promise<string | null> {
  const log = logger({ tenant_id: tenantId });
  const row = await findMailboxConnection(db, tenantId, mailboxId);
  if (!row || row.state === "removed" || row.state === "reconnect") return null;
  const provider = row.provider === "microsoft" ? "microsoft" : "google";
  if (!grantHolds(provider, row.scopes ?? [], "calendar")) {
    log.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: "not_granted" });
    return null;
  }
  const token = await getToken(db, row, Date.now());
  if (!token.ok) {
    if (token.why === "signed_out") await markSignedOut(db, row, log, Date.now());
    log.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: token.why });
    return null;
  }
  const ids =
    provider === "microsoft" ? await listGraphCalendarIds(token.token) : await listGoogleCalendarIds(token.token);
  if (!ids.ok) {
    log.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: "calendars", status: ids.reply.status });
    return null;
  }
  const span = { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() };
  const events: CalendarEvent[] = [];
  for (const id of ids.ids) {
    let page: string | null = null;
    for (let index = 0; index < PAGES_PER_CALENDAR; index++) {
      const result: EventsPage =
        provider === "microsoft"
          ? await listGraphEvents(token.token, id, span, page)
          : await listGoogleEvents(token.token, id, span, page);
      if (!result.ok) {
        log.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: "events", status: result.reply.status });
        return null;
      }
      events.push(...result.events);
      page = result.next;
      if (!page) break;
      if (index === PAGES_PER_CALENDAR - 1)
        log.warn("mailbox_calendar_truncated", { mailbox: row.id, events: events.length });
    }
  }
  return calendarIcs(events);
}

/** The most of the calendar the dashboard may ask for in one read: a season back and a year ahead. */
const FEED_SPAN_MAX_MS = 550 * DAY_MS;

/**
 * POST /api/admin/calendar/feed: the calendar a workspace reads through its mailbox's grant, as iCal, for the dashboard,
 * which holds no grant (the Calendar, a person's visits, Ask's openings: server/calendar/openings.ts loadFeed). The window is
 * the caller's (a season's, clamped), else the season; only the grant the workspace's settings name is read.
 */
export async function grantFeedFor(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string; from: number; to: number }>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const cfg = parseTenantConfig((await getTenantConfig(db, tenantId))?.config ?? null);
  const mailboxId = cfg?.calendar_grant?.mailbox_id;
  if (!mailboxId) return refuse(404, "not_connected", "this workspace reads no calendar through a mailbox");
  const season = seasonHorizon(new Date(), cfg?.brain?.profile?.booking_rules?.max_days_ahead ?? 0);
  const from = typeof body.from === "number" && Number.isFinite(body.from) ? body.from : season.from;
  const to = typeof body.to === "number" && Number.isFinite(body.to) && body.to > from ? body.to : season.to;
  const text = await findMailboxCalendarText(db, tenantId, mailboxId, {
    from,
    to: Math.min(to, from + FEED_SPAN_MAX_MS),
  });
  if (text === null) return refuse(502, "unreadable", "the calendar could not be read through the mailbox now");
  return json(200, { ok: true, text });
}
