/**
 * After a write lands: which surfaces could now be stale.
 *
 * One table, keyed by route, replacing the list each of eleven couriers
 * carried for its own verbs. A key not in it refreshes nothing, which is the
 * right answer for a read, a redirect, a draft, and a search. The lists are
 * the couriers' own, copied as they were: the reply re-reads the inbox, the
 * conversations and Today, which carries the "needs you" count; a template
 * change re-reads settings and the inbox, and tells the broadcasts and
 * playbooks pages, which keep a hook until they read the surfaces directly.
 */
import type { RouteKey } from "../client/api";
import {
  broadcastsOverride,
  calendarOverride,
  conversationsOverride,
  inboxOverride,
  liveOverride,
  notificationsOverride,
  peopleOverride,
  playbooksOverride,
  settingsOverride,
  todayOverride,
  type SurfaceOverride,
} from "./surface-data";
import { billingOverride } from "./billing";
import { googleOverride } from "./google";
import { leadsOverride } from "./leads";
import { setupOverride } from "./setup";
import { refreshSurfaces } from "./surface-runner";

const thread = () => [inboxOverride, conversationsOverride, todayOverride];
const people = () => [peopleOverride];
const runs = () => [playbooksOverride, broadcastsOverride];
const templates = () => [settingsOverride, inboxOverride];
const leads = () => [leadsOverride];
const setup = () => [setupOverride];
const google = () => [googleOverride, setupOverride];
const billing = () => [billingOverride, setupOverride];
const settings = () => [settingsOverride];

/** Exported for the tests that hold a verb to its surfaces by running this, not by reading a courier. */
export const AFTER: Partial<Record<RouteKey, () => SurfaceOverride[]>> = {
  // The thread verbs, and the two that act on a held draft.
  "POST conversations/[id]/take-over": thread,
  "POST conversations/[id]/hand-back": thread,
  "POST conversations/[id]/snooze": thread,
  "POST conversations/[id]/wake": thread,
  "POST conversations/[id]/archive": thread,
  "POST conversations/[id]/reply": thread,
  "POST escalations/[id]/resolve": thread,
  "POST messages/[id]/steer": thread,
  "POST messages/[id]/cancel-send": thread,
  "POST calls/[id]/whisper": () => [liveOverride],
  "POST calls/[id]/end": () => [liveOverride],
  "POST calls/[id]/hand-over": () => [liveOverride],
  // People.
  "DELETE contacts/[id]": () => [peopleOverride, inboxOverride, conversationsOverride, todayOverride],
  "PUT contacts/[id]/receptionist": people,
  "PUT contacts/[id]/consent": people,
  "PUT contacts/[id]/marketing-consent": people,
  "PUT contacts/consent": people,
  "PUT contacts/marketing-consent": people,
  "PUT contacts/receptionist": people,
  "PUT contacts/notes": people,
  "PUT contacts/[id]/details": people,
  "POST contacts": people,
  "POST segments": people,
  "PUT segments/[id]": people,
  "DELETE segments/[id]": people,
  // Leads. Every one of these PATCHES: the surface re-reads the view and keeps
  // the pages, the selection and the cursor the owner already has (leads.ts).
  // `POST leads/[id]/stage` names People too: an Interested call makes a
  // person, and People would otherwise not know until it was read again.
  // A draft is not here on purpose -- it changes no row a surface shows; the
  // lead moves when the owner answers "Did you send it?", which is a stage.
  "POST lead-searches": leads,
  "POST lead-searches/[id]/answer": leads,
  "POST lead-searches/[id]/more": leads,
  "POST lead-searches/[id]/stop": leads,
  "POST lead-searches/[id]/undo": leads,
  "PATCH lead-searches/[id]": leads,
  "DELETE lead-searches/[id]": leads,
  "POST leads/[id]/keep": leads,
  "POST leads/[id]/exclude": leads,
  "POST leads/[id]/put-back": leads,
  "POST lead-operations/[id]/undo": leads,
  "POST leads/bulk": leads,
  "DELETE leads/[id]": leads,
  "PUT lead-suggestions": leads,
  "POST leads/[id]/stage": () => [leadsOverride, peopleOverride],
  // Outbound.
  "POST broadcasts": () => [broadcastsOverride],
  "POST broadcasts/[id]/approve": runs,
  "POST broadcasts/[id]/cancel": runs,
  "POST playbooks": runs,
  "PUT playbooks/[id]": runs,
  "DELETE playbooks/[id]": runs,
  "POST playbooks/[id]/run": runs,
  "POST templates": templates,
  "PUT templates/[id]": templates,
  "DELETE templates/[id]": templates,
  "POST templates/starter": templates,
  "POST templates/sync": templates,
  // Settings and the team.
  // Settings FIRST: it carries the version the next save has to send. Today
  // states the workspace's facts; hours, closures, rules and services are the
  // Calendar's too.
  // Name, hours, services, the hand-off number and the calendar feed are Setup rows too.
  "PUT settings": () => [settingsOverride, todayOverride, calendarOverride, setupOverride],
  "PUT policies": settings,
  "POST team/invite": settings,
  "PATCH team/[id]": settings,
  "DELETE team/[id]": settings,
  // Connections repaints, and so does the Setup row that said "Connect".
  "POST channels/whatsapp/connect": () => [settingsOverride, setupOverride],
  "PUT notifications": () => [notificationsOverride],
  // Setup, lines, billing, Google.
  "POST capabilities/[kind]": setup,
  "DELETE capabilities/[kind]": setup,
  "POST lines/buy": setup,
  "POST lines/retry": setup,
  "POST lines/register": setup,
  "POST lines/forwarding": setup,
  "POST lines/forwarding/test": setup,
  "POST setup/request": setup,
  "PUT business-record": setup,
  // Making the mailbox adds a line, so the count above the work changes with it.
  "POST mailboxes": () => [setupOverride, todayOverride],
  "PUT mailboxes/[id]": setup,
  "POST billing/resume": billing,
  "POST billing/sync": billing,
  "POST google/link": google,
  "DELETE google/link": google,
  "POST google/refresh": google,
  "POST google/locations": google,
  "DELETE google/connection": google,
  "POST google/reviews/[id]/reply": () => [googleOverride],
};

/** Window hooks a few pages still register; they go when those pages read the surfaces directly. */
export const HOOKS: Partial<Record<RouteKey, string[]>> = {
  "POST templates": ["__refreshBroadcasts", "__refreshPlaybooks"],
  "PUT templates/[id]": ["__refreshBroadcasts", "__refreshPlaybooks"],
  "DELETE templates/[id]": ["__refreshBroadcasts", "__refreshPlaybooks"],
  "POST templates/starter": ["__refreshBroadcasts", "__refreshPlaybooks"],
  "POST templates/sync": ["__refreshBroadcasts", "__refreshPlaybooks"],
};

/** The keys the table names, for the test that holds them to writes. */
export const AFTER_KEYS = Object.keys(AFTER) as RouteKey[];

export async function refreshAfter(key: RouteKey): Promise<void> {
  const overrides = AFTER[key]?.() ?? [];
  if (overrides.length) await refreshSurfaces(overrides);
  for (const name of HOOKS[key] ?? []) {
    const fn = (window as unknown as Record<string, (() => Promise<void>) | undefined>)[name];
    if (fn) await fn();
  }
}
