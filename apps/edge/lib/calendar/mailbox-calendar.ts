/**
 * The calendar a connected mailbox's grant reads (decision 0073, R20), as the workspace's calendar feed: every calendar
 * of the account (channels googleCalendarIds, graphCalendarIds) over the window a read asks for, each occurrence apart,
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
  googleCalendarIds,
  googleEvents,
  grantHolds,
  graphCalendarIds,
  graphEvents,
  type CalendarEvent,
  type EventsPage,
} from "../packages/channels.js";
import { DAY_MS, UUID, parseTenantConfig, seasonHorizon, type FeedHorizon } from "../packages/contracts.js";
import { getTenantConfig, mailboxConnectionOf, type Database } from "../packages/db.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { tokenFor } from "../email/mailbox/mailbox-credentials.js";
import { markSignedOut } from "../email/mailbox/mailbox-wire.js";
import { logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** Pages of one calendar a read takes at most: a busy salon's half year is a few pages; past this the log says so. */
const PAGES_PER_CALENDAR = 20;

/**
 * The grant's calendars over the window, as one iCal feed; null when they cannot be read now. Every calendar's events
 * are asked page by page; one calendar that cannot be read leaves the feed unread rather than half, since a feed missing
 * a calendar would offer its taken times as open.
 */
export async function mailboxCalendarText(
  db: Db,
  tenantId: string,
  mailboxId: string,
  window: FeedHorizon,
): Promise<string | null> {
  const L = logger({ tenant_id: tenantId });
  const row = await mailboxConnectionOf(db, tenantId, mailboxId);
  if (!row || row.state === "removed" || row.state === "reconnect") return null;
  const provider = row.provider === "microsoft" ? "microsoft" : "google";
  if (!grantHolds(provider, row.scopes ?? [], "calendar")) {
    L.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: "not_granted" });
    return null;
  }
  const t = await tokenFor(db, row, Date.now());
  if (!t.ok) {
    if (t.why === "signed_out") await markSignedOut(db, row, L, Date.now());
    L.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: t.why });
    return null;
  }
  const ids = provider === "microsoft" ? await graphCalendarIds(t.token) : await googleCalendarIds(t.token);
  if (!ids.ok) {
    L.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: "calendars", status: ids.reply.status });
    return null;
  }
  const span = { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() };
  const events: CalendarEvent[] = [];
  for (const id of ids.ids) {
    let page: string | null = null;
    for (let i = 0; i < PAGES_PER_CALENDAR; i++) {
      const got: EventsPage =
        provider === "microsoft"
          ? await graphEvents(t.token, id, span, page)
          : await googleEvents(t.token, id, span, page);
      if (!got.ok) {
        L.warn("mailbox_calendar_unreadable", { mailbox: row.id, why: "events", status: got.reply.status });
        return null;
      }
      events.push(...got.events);
      page = got.next;
      if (!page) break;
      if (i === PAGES_PER_CALENDAR - 1)
        L.warn("mailbox_calendar_truncated", { mailbox: row.id, events: events.length });
    }
  }
  return calendarIcs(events);
}

/** The most of the calendar the dashboard may ask for in one read: a season back and a year ahead. */
const FEED_SPAN_MAX_MS = 550 * DAY_MS;

/**
 * POST /api/admin/calendar/feed: the calendar a workspace reads through its mailbox's grant, as iCal, for the dashboard,
 * which holds no grant (the Calendar, a person's visits, Ask's openings: server/ask/openings.ts loadFeed). The window is
 * the caller's (a season's, clamped), else the season; only the grant the workspace's settings name is read.
 */
export async function grantFeedFor(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string; from: number; to: number }>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const cfg = parseTenantConfig((await getTenantConfig(db, tenantId))?.config ?? null);
  const mailboxId = cfg?.calendar_grant?.mailbox_id;
  if (!mailboxId) return refuse(404, "not_connected", "this workspace reads no calendar through a mailbox");
  const season = seasonHorizon(new Date(), cfg?.brain?.profile?.booking_rules?.max_days_ahead ?? 0);
  const from = typeof body.from === "number" && Number.isFinite(body.from) ? body.from : season.from;
  const to = typeof body.to === "number" && Number.isFinite(body.to) && body.to > from ? body.to : season.to;
  const text = await mailboxCalendarText(db, tenantId, mailboxId, { from, to: Math.min(to, from + FEED_SPAN_MAX_MS) });
  if (text === null) return refuse(502, "unreadable", "the calendar could not be read through the mailbox now");
  return json(200, { ok: true, text });
}
