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
import { broadcastsOverride } from "./surfaces/broadcasts";
import { calendarOverride } from "./surfaces/calendar";
import { conversationsOverride } from "./surfaces/conversations";
import { inboxOverride } from "./surfaces/inbox";
import { liveOverride } from "./surfaces/live";
import { notificationsOverride } from "./surfaces/notifications";
import { peopleOverride } from "./surfaces/people";
import { playbooksOverride } from "./surfaces/playbooks";
import { reportsOverride } from "./surfaces/reports";
import { settingsOverride } from "./surfaces/settings";
import { todayOverride } from "./surfaces/today";
import type { SurfaceOverride } from "./surface-data";
import { billingOverride } from "./billing";
import { googleOverride } from "./google";
import { leadsOverride } from "./leads";
import { setupOverride } from "./setup";
import { refreshSurfaces } from "./surface-runner";
import { reachOutsOverride } from "./reach-out/reach-outs";
import { repliesOverride } from "./reach-out/replies";

const thread = () => [inboxOverride, conversationsOverride, todayOverride];
const people = () => [peopleOverride];
const runs = () => [playbooksOverride, broadcastsOverride];
// What also moves a reach-out's row (Part 4 PR 8): its chain's pause and resume are the playbook's own door on its
// first step, and its run waiting (the row's "next run") is approved or skipped as any run is. The chains' read scans
// no audience (reach-outs.ts), so reading it behind a door that moved an ordinary playbook costs little.
const runsAndChains = () => [...runs(), reachOutsOverride];
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
  // A deal moves People's row and lists, and Reports' Deals section counts it (0004).
  "POST contacts/[id]/deal": () => [peopleOverride, reportsOverride],
  // A note may be a step, and a row carries the next one (00166): the Pipeline, Steps due and Today follow it.
  "POST contacts/[id]/notes": people,
  "POST contacts/[id]/notes/done": people,
  "POST contacts/[id]/notes/remove": people,
  "POST contacts": people,
  "POST contacts/import": people,
  // A list is an audience and a playbook's moment too: the composer's chips and a playbook's count follow it.
  "POST segments": () => [peopleOverride, broadcastsOverride, playbooksOverride],
  "PUT segments/[id]": () => [peopleOverride, broadcastsOverride, playbooksOverride],
  "DELETE segments/[id]": () => [peopleOverride, broadcastsOverride, playbooksOverride],
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
  "POST broadcasts/[id]/approve": runsAndChains,
  "POST broadcasts/[id]/cancel": runsAndChains,
  "POST playbooks": runs,
  "PUT playbooks/[id]": runsAndChains,
  "DELETE playbooks/[id]": runs,
  "POST playbooks/[id]/run": runs,
  // A reach-out is a chain of playbooks over a search's leads (Part 4): its runs are broadcasts, its answers move leads,
  // and its chain is the reach-outs surface (Playbooks' row, and Templates' email rows drawn from it).
  "POST reach-outs": () => [reachOutsOverride, playbooksOverride, broadcastsOverride, leadsOverride],
  "PUT reach-outs/[id]": () => [reachOutsOverride, playbooksOverride, broadcastsOverride, leadsOverride],
  "DELETE reach-outs/[id]": () => [reachOutsOverride, playbooksOverride, broadcastsOverride, leadsOverride],
  // One held email decided moves its run and its lead, never its chain: the row's counts are its report, read on open.
  "POST reach-out-sends/[id]/decide": () => [broadcastsOverride, playbooksOverride, leadsOverride],
  // "Stop writing to them" skips the lead's planned and held emails in their runs (Part 6, H10).
  "POST reach-outs/leads/[id]/stop": () => [broadcastsOverride, playbooksOverride, leadsOverride],
  // "Read as no · undo" moves the reading, the person's consent and the leads the no closed.
  "POST reach-out-replies/[id]/undo": () => [repliesOverride, ...thread(), leadsOverride],
  "POST broadcasts/[id]/recheck": runs,
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
  // The first receptionist is a settings write too, from what is known: the same surfaces read again.
  "POST settings/receptionist": () => [settingsOverride, todayOverride, calendarOverride, setupOverride],
  "PUT policies": settings,
  // The zone is the workspace's, saved through its own route, and the prompt names it: the settings read's preview
  // carries the zone every fold's consequence is resolved with (business-tab.ts), and the prompt card states it. Not
  // re-read, they kept the old zone until something else was saved. How its customers buy is saved there too (0008),
  // and it switches the deal layer: People's lists and column, Reports' Deals section and Today's proposals waiting.
  "PATCH workspaces": () => [settingsOverride, peopleOverride, reportsOverride, todayOverride],
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
  // Forwarding saved: Setup's row, and the settings read's kept number (facts.ts kept_line), which the card shows.
  "POST lines/forwarding": () => [setupOverride, settingsOverride],
  "POST lines/forwarding/test": setup,
  "POST setup/request": setup,
  "PUT business-record": setup,
  // Making the mailbox adds a line, so the count above the work changes with it.
  "POST mailboxes": () => [setupOverride, todayOverride],
  "PUT mailboxes/[id]": setup,
  // A sending domain added, checked or removed: the Email row's block reads again from Setup.
  "POST sending-domains": setup,
  "POST sending-domains/[id]/check": setup,
  "POST sending-domains/[id]/resume": setup,
  "DELETE sending-domains/[id]": setup,
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
