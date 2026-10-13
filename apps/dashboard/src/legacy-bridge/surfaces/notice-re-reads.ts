/**
 * What a kept row of the bell is about, and so which surfaces its news makes old (docs/decisions/0047, the wiring plan's task 1.2).
 *
 * The edge rings the bell for the changes it most wants an owner to see, and each row's button opens the page that is about it.
 * Some of those changes are written to tables the live feed does not tell a workspace of (a held booking email, the people a calendar
 * read made, a mailbox's offers pause), so the page the button opens was drawn from a read that never heard them. The row is the one
 * signal there is: the bell's own surface (notifications.ts) calls this for each row it has not seen before, and the surfaces a kind
 * names are read where their page is on screen and kept for their page elsewhere (surface-registry.ts whereDrawn). A template's status
 * is on the feed now (templates, realtime.ts WATCHED), so its rows are decided by the page that hears it, like the other kinds'.
 *
 * Every kind the edge keeps (SERVER_NOTIFICATION_KINDS) is decided here, by the compiler: it names its surfaces, or it says which page
 * hears the table behind it already, so a kind added without a decision does not build. Beside refresh-map.ts, which does the same for
 * a write made in this tab.
 */
import type { NotificationDto, ServerNotificationKind } from "@chanlytics/contracts";
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { calendarOverride } from "@/surfaces/calendar/surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { peopleOverride } from "@/surfaces/people/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import type { SurfaceOverride } from "../surface-data";
import { whereDrawn } from "../surface-registry";
import { refreshSurfaces } from "../surface-runner";

/** What a row's news makes old. The surfaces are named when asked, so this module is no part of an import cycle. */
interface About {
  surfaces: () => readonly SurfaceOverride[];
}

/** What a row says of itself that its kind may need. */
type Row = Pick<NotificationDto, "kind" | "route">;

/**
 * A template approved, blocked, paused or disabled by WhatsApp is written to `templates` and rung on the bell. The feed tells it
 * (templates, realtime.ts WATCHED) to the settings read, the one read of the templates, in every open tab at once; the Library draws it,
 * and the Inbox's reply box, the New conversation sheet and both composers are made of it when it is published, so the row reads
 * nothing: a second read of Settings, the heaviest there is, would only follow the first.
 */
const TEMPLATE_HEARD =
  "Settings, the one read of the templates, hears templates on the feed; the Library, the Inbox's reply box and both composers draw from its read.";

/**
 * A booking tool's email held for a look is a row of `appointment_notices` and writes no appointment, so the Calendar's read, which
 * carries the held list the board's card and Settings > Business both draw, never heard it.
 */
const HELD_EMAIL: About = { surfaces: () => [calendarOverride] };

/** The hourly calendar read put people in People, which is not on the live feed: their list never heard it. */
const PEOPLE_MADE: About = { surfaces: () => [peopleOverride] };

/**
 * A customer asked to stop (decision 0048): an unsubscribe, a complaint or a carrier's report writes the person and no message, so the
 * pages that count them never heard it, and the bell's row is the one signal there is. People's list and its Offers column, the Inbox's
 * composer for the thread, and the audience counts of Campaigns' composers and moments are read again.
 */
const PERSON_STOPPED: About = {
  surfaces: () => [peopleOverride, inboxOverride, broadcastsOverride, playbooksOverride],
};

/**
 * The gates paused offers by email (a mailbox's `offers_paused_at`, on no feed): the composers' head line and their Send by tick read
 * the pause beside the channels when they were last read. The resume is not told yet (OFFERS_NOTICE_WORDS), so nothing reads it.
 */
const OFFERS_PAUSED: About = { surfaces: () => [playbooksOverride, broadcastsOverride] };

/** The pause's row opens Campaigns' home (`outbound`, before it was called that). */
const OPENS_CAMPAIGNS = /^(outbound|campaigns)(\/|$)/;

/**
 * Each kind the edge keeps: the surfaces it is about, or the reason none is read (which page hears the table behind it already). A
 * function when the row's route tells a kind's rows apart: a sweep row is a connected mailbox held or signed out (Connections)
 * or offers paused.
 */
export const NOTICE_ABOUT: Record<ServerNotificationKind, About | string | ((row: Row) => About | string)> = {
  template_ready: TEMPLATE_HEARD,
  template_blocked: TEMPLATE_HEARD,
  booking_notice: HELD_EMAIL,
  calendar_people: PEOPLE_MADE,
  opted_out: PERSON_STOPPED,
  sweep: (row) =>
    OPENS_CAMPAIGNS.test(row.route ?? "")
      ? OFFERS_PAUSED
      : "A connected mailbox held or signed out opens Connections, which hears mailbox_connections.",
  // Heard by the page the row opens (the trace of N2): nothing is read on arrival.
  handoff: "The Inbox, which the row opens, hears the escalation and the message.",
  deadman: "The Inbox, which the row opens, hears the hold it raised.",
  number: "Connections, which the row opens, hears tenant_channels and lines.",
  billing: "Billing, which the row opens, hears billing_accounts.",
  review: "The Reviews lens, which the row opens, hears google_reviews.",
  broadcast_sent: "Sent, which the row opens, hears broadcasts.",
  broadcast_stopped: "Sent, which the row opens, hears broadcasts.",
  playbook: "Campaigns, which the row opens, hears playbooks and broadcasts.",
  leads_ready: "Leads, which the row opens, hears leads and lead_rounds.",
  leads_question: "Leads, which the row opens, hears leads and lead_rounds.",
  reach_out_replied: "The thread the row opens hears reach_out_replies and the message.",
  note_for_you: "People hears person_notes, and the person's page reads again with it.",
  booking: "The Calendar, which the row opens at the appointment, hears appointments.",
  member_joined: "Settings, which the row opens at Team, hears memberships and invitations (00408).",
  // Not traced to the depth the others were (N2 says so): no read is owed until one is found to be.
  call: "Its page, the calls, is not traced to the depth the others were; the call's note lands in the thread.",
  job_failed:
    "Its door is the page the failed job's work lives on (JOB_WORK); not traced to the depth the others were.",
  alert: "It opens Today, which hears messages, escalations, calls and lead rounds; not traced further.",
  reach_out_day: "Campaigns' Reach-outs read their own numbers where they are on screen; not traced further.",
};

/** What a new kept row is about, or null when its page already hears the table behind it (or it is a kind this tab does not know). */
export function aboutNotice(row: Row): About | null {
  const entry = NOTICE_ABOUT[row.kind as ServerNotificationKind];
  const about = typeof entry === "function" ? entry(row) : entry;
  return typeof about === "string" || about === undefined ? null : about;
}

/**
 * Rows the bell has just found for the first time: read the surfaces they are about where their page is on screen, and keep them for
 * their page elsewhere. The read is not waited for: the bell draws at once.
 */
export function readWhatTheyAreAbout(rows: readonly Row[]): void {
  const abouts = rows.map(aboutNotice).filter((a): a is About => a !== null);
  if (!abouts.length) return;
  const surfaces = [...new Map(abouts.flatMap((a) => a.surfaces()).map((o) => [o.key, o])).values()];
  const now = whereDrawn(surfaces);
  if (now.length) void refreshSurfaces(now);
}
