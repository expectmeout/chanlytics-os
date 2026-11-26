/**
 * Every surface the frame reads, in the order it starts them (bridge/boot/installs.ts hears them before React draws;
 * FrameApp starts them in its first effect, and joins the live feed for them). The list the tests read is this one, by
 * import, and the route tracer reads it by name (tooling/scripts/trace-routes.mjs registeredOverrides), so no test keeps
 * a copy of it.
 */
import { workspaceOverride } from "../surface-data";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { todayOverride } from "@/surfaces/today/override";
import { settingsOverride } from "../surfaces/settings";
import { channelsOverride } from "@/surfaces/channels/surface";
import { peopleOverride } from "@/surfaces/people/surface";
import { reportsOverride } from "@/surfaces/reports/surface";
import { reportsHeadlineOverride } from "@/surfaces/reports/headline";
import { reviewsOverride } from "@/surfaces/reports/reviews-surface";
import { receptionistOverride } from "@/surfaces/reports/receptionist-surface";
import { reportsPeopleOverride } from "@/surfaces/reports/people-surface";
import { reportsCampaignsOverride } from "@/surfaces/reports/campaigns-surface";
import { liveOverride } from "@/surfaces/live/surface";
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { audiencesOverride } from "@/surfaces/campaigns/broadcasts/audiences-surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { calendarOverride } from "@/surfaces/calendar/surface";
import { calendarRunsOverride } from "@/surfaces/calendar/runs-surface";
import { todayPinsOverride } from "@/surfaces/today/pins-surface";
import { askMorningOverride } from "@/surfaces/today/ask-morning-surface";
import { replyDraftsOverride } from "@/surfaces/today/need-you/drafts-surface";
import { askMemoryOverride } from "@/surfaces/settings/memory/surface";
import { filesOverride } from "@/surfaces/files/surface";
import { contentOverride } from "@/surfaces/campaigns/content/surface";
import { weekOverride } from "@/surfaces/campaigns/content/week/surface";
import { notificationsOverride } from "../surfaces/notifications";
import { personOverride } from "@/surfaces/people/people-detail";
import { leadsOverride } from "@/surfaces/leads/override";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/override";
import { sequencesOverride } from "@/surfaces/campaigns/sequences/surface";
import { repliesOverride } from "../reach-out/replies";
import { setupOverride } from "@/surfaces/setup/override";
import { googleOverride } from "../google";
import { billingOverride } from "@/surfaces/settings/billing/surface";
import { alertsOverride } from "@/surfaces/settings/notifications/surface";
import { partnerOverride } from "@/surfaces/settings/partner/surface";

// leadsOverride rides beside peopleOverride: Leads is the other scope of that page.
export const FRAME_SURFACES = [
  workspaceOverride,
  conversationsOverride,
  inboxOverride,
  todayOverride,
  settingsOverride,
  // The channels the workspace is reached on, read once for Connections, the Library, Live and the composers (surfaces/channels).
  channelsOverride,
  peopleOverride,
  leadsOverride,
  reportsOverride,
  // Today's week line and Ask found's leaks: one small read of the period Reports shows (surfaces/reports/headline.ts).
  reportsHeadlineOverride,
  // The Reviews lens's own read, folded once: its figures, its cards and its head (surfaces/reports/reviews-surface.ts).
  reviewsOverride,
  // The Receptionist lens's own read, as the route gave it: the page folds it (surfaces/reports/receptionist-surface.ts).
  receptionistOverride,
  // The People lens's own read, as the route gave it: the page folds it (surfaces/reports/people-surface.ts).
  reportsPeopleOverride,
  // The Campaigns lens's own reads, each as its route gave it: the page folds them (surfaces/reports/campaigns-surface.ts).
  reportsCampaignsOverride,
  liveOverride,
  broadcastsOverride,
  playbooksOverride,
  // Who each audience a broadcast offers reaches, read where a composer is drawn (surfaces/campaigns/broadcasts/audiences-surface.ts).
  audiencesOverride,
  // A reach-out's chains and their emails (Part 4 PR 8): Playbooks' rows and Templates' email rows.
  reachOutsOverride,
  // Campaigns › Sequences (decision 0060): its list, read where its view is drawn (surfaces/campaigns/sequences/surface.ts).
  sequencesOverride,
  repliesOverride,
  // The partner's account (0012): on the person, read once, beside the rest.
  partnerOverride,
  // What reaches this member's phones: read where Settings › Notifications is drawn (ROUTE_DRAWS).
  alertsOverride,
  // Campaigns over the Calendar's days, read where the Calendar draws them (surfaces/calendar/runs-surface.ts).
  calendarRunsOverride,
  // The counts of the lists pinned to Today, read where Today draws them (surfaces/today/pins-surface.ts; R10).
  todayPinsOverride,
  // Ask's morning, read where Today draws its ideas in Need you, and what Ask remembers, where Settings › Memory is drawn (decision 0070).
  askMorningOverride,
  askMemoryOverride,
  filesOverride,
  // What Ask made, read where Campaigns › Content is drawn (surfaces/campaigns/content/surface.ts).
  contentOverride,
  // The Week, read where it or Settings › Content is drawn (surfaces/campaigns/content/week/surface.ts).
  weekOverride,
  // The drafts Ask kept for the rows of Need you, read with Today's own first reads (surfaces/today/need-you/drafts-surface.ts).
  replyDraftsOverride,
  calendarOverride,
  notificationsOverride,
  setupOverride,
  googleOverride,
  billingOverride,
  // A person's page: the one person on screen, read again when what the page draws of them changes (people-detail.ts).
  personOverride,
];
