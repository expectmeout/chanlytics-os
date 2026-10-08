/**
 * After a write lands: which surfaces could now be stale.
 *
 * One table, keyed by route, replacing the list each of eleven couriers
 * carried for its own verbs. The lists are the couriers' own, copied as they
 * were: the reply re-reads the inbox, the conversations and Today, which
 * carries the "needs you" count; a template change re-reads settings and the
 * inbox, and tells the broadcasts and playbooks pages, which keep a hook until
 * they read the surfaces directly.
 *
 * Every write is in one of two tables: AFTER, the surfaces it re-reads, or
 * REFRESHES_NOTHING, with the reason nothing on screen moves (a draft, a
 * search, a redirect, a page that reads its own rows again).
 * refresh-coverage.test.mjs fails a write in neither, so a new route is
 * decided when it is added, never left out by default: 43 of 141 writes were
 * in neither on 29 September, and a contact's new name stayed stale on every
 * thread with them.
 */
import type { RouteKey } from "../client/api";
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { calendarOverride } from "@/surfaces/calendar/surface";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { forgetInboxTemplates, inboxOverride } from "@/surfaces/inbox/surface";
import { liveOverride } from "@/surfaces/live/surface";
import { notificationsOverride } from "./surfaces/notifications";
import { peopleOverride } from "@/surfaces/people/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { reportsOverride } from "@/surfaces/reports/surface";
import { reportsHeadlineOverride } from "@/surfaces/reports/headline";
import { forgetReviews, reviewsOverride } from "@/surfaces/reports/reviews-surface";
import { settingsOverride } from "./surfaces/settings";
import { todayOverride } from "@/surfaces/today/surface";
import { workspaceOverride, type SurfaceOverride } from "./surface-data";
import { billingOverride } from "@/surfaces/settings/billing/surface";
import { partnerOverride } from "@/surfaces/settings/partner/surface";
import { googleOverride } from "./google";
import { leadsOverride } from "@/surfaces/leads/surface";
import { setupOverride } from "@/surfaces/setup/surface";
import { refreshSurfaces } from "./surface-runner";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/surface";
import { repliesOverride } from "./reach-out/replies";

const thread = () => [inboxOverride, conversationsOverride, todayOverride];
const people = () => [peopleOverride];
// What a thread says of its person: their name, number, address and proposal link, and whether they said yes or asked
// to stop (thread-dto.ts `contact`). An edit of those re-reads the threads with People, as a delete always did.
const personAndThreads = () => [peopleOverride, ...thread()];
const runs = () => [playbooksOverride, broadcastsOverride];
// Who a campaign reaches is counted from people's answers and from who exists: the composers' audience counts and a
// playbook's "N will get it" (broadcasts, playbooks). A write that moves either re-reads them, or a yes recorded and
// New message opened showed the audience as it was before.
const audiences = () => [broadcastsOverride, playbooksOverride];
// A yes or a stop recorded, for one person or many: the one list, so the four writes cannot drift apart. Their row and
// their threads say it (personAndThreads), the audiences count by it, and Reports counts the yeses and stops.
const consentWrite = () => [...personAndThreads(), ...audiences(), reportsOverride];
// A person added or imported is on an audience or off it, as one deleted is.
const peopleAndAudiences = () => [peopleOverride, ...audiences()];
// A playbook made, changed or removed moves what People's rows say of it (their `follow_up`, 0006), with its own pages.
const runsAndPeople = () => [...runs(), peopleOverride];
// What also moves a reach-out's row (Part 4 PR 8): its chain's pause and resume are the playbook's own door on its
// first step, and its run waiting (the row's "next run") is approved or skipped as any run is. The chains' read scans
// no audience (reach-outs.ts), so reading it behind a door that moved an ordinary playbook costs little.
const runsAndChains = () => [...runs(), reachOutsOverride];
// What the composers and People's reach read of the workspace's channels (server/campaigns/channels-ready.ts): the number's
// health, the text line, the mailbox and its offers pause, and the postal address an offer by email names. A write that
// changes one of them moves the Send by row, the count of who each campaign reaches and People's own reach, so it
// re-reads all three, or a channel just opened stays closed on the composer until something else reads it again.
const readiness = () => [broadcastsOverride, playbooksOverride, peopleOverride];
// A template written here is read again by the Inbox at once, not when its kept read goes stale (inbox/surface.ts).
const templates = () => {
  forgetInboxTemplates();
  return [settingsOverride, inboxOverride];
};
// An email or text version, written or taken away: the one list, so the two writes cannot drift apart.
const versionWrite = () => [settingsOverride, reachOutsOverride, playbooksOverride, broadcastsOverride, leadsOverride];
const leads = () => [leadsOverride];
const setup = () => [setupOverride];
const setupAndReadiness = () => [setupOverride, ...readiness()];
// The listing and its reviews are the Reviews lens's read too, and the lens is never the page a link, a refresh or a disconnect is made from
// (Settings' Connections pane, the first run's Find): its read is forgotten, as a template written is for the Inbox, and read as the lens
// comes on screen, not read from there.
const google = () => {
  forgetReviews();
  return [googleOverride, setupOverride];
};
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
  "DELETE contacts/[id]": () => [...personAndThreads(), ...audiences()],
  // Two records became one (0028): the kept person's page and People, the threads that folded, and every count by
  // consent, Reports' included: the merge may change an answer, as a consent write does.
  "POST contacts/[id]/merge": consentWrite,
  "PUT contacts/[id]/receptionist": people,
  "PUT contacts/[id]/consent": consentWrite,
  "PUT contacts/[id]/marketing-consent": consentWrite,
  "PUT contacts/consent": consentWrite,
  "PUT contacts/marketing-consent": consentWrite,
  "PUT contacts/receptionist": people,
  "PUT contacts/notes": people,
  // Their details carry the email address a campaign by email goes to: the audiences count by it.
  "PUT contacts/[id]/details": () => [...personAndThreads(), ...audiences()],
  // A deal moves People's row and lists, and Reports' Deals section counts it (0004).
  "POST contacts/[id]/deal": () => [peopleOverride, reportsOverride, ...audiences()],
  // A note may be a step, and a row carries the next one (00166): the Pipeline, Steps due and Today follow it.
  "POST contacts/[id]/notes": people,
  "POST contacts/[id]/notes/done": people,
  "POST contacts/[id]/notes/remove": people,
  // A receptionist's suggestion kept becomes a note, perhaps a step: the same rows move.
  "POST contacts/[id]/notes/decide": people,
  // Not the same (0034 step 4): the pair leaves the person's page, which reads itself again; People's rows are as they were.
  "POST contacts/[id]/doubts/dismiss": people,
  "POST contacts": peopleAndAudiences,
  // A conversation begun from the Inbox: their thread is new or moved, and their row on People says so.
  "POST people/[id]/message": personAndThreads,
  "POST contacts/import": peopleAndAudiences,
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
  // A list of your own (00242) is a search: the rail and the leads read again.
  "POST lead-searches/import": leads,
  "POST lead-searches/chosen": leads,
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
  // A broadcast made moves the month's emails and texts both composers say before a send, and Playbooks' composer reads
  // them from its own surface: both are read again, as approving or cancelling a run reads them.
  "POST broadcasts": runs,
  "POST broadcasts/[id]/approve": runsAndChains,
  "POST broadcasts/[id]/cancel": runsAndChains,
  "POST playbooks": runsAndPeople,
  "PUT playbooks/[id]": () => [...runsAndChains(), peopleOverride],
  "DELETE playbooks/[id]": runsAndPeople,
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
  // An email or text version of a message (One message, every channel, step 1): the Templates page reads them with the
  // settings surface, and both composers read them too: the Send by row closes a channel the message has no version on,
  // and the preview draws a person on the channel they are reached on as that version reads. No hook is told: the
  // composers read their surfaces, which this re-reads. A reach-out's email is written by this route too (step 5),
  // through its chain's save, so what a chain's edit moves moves with it: its words, the runs its held sends are in, and
  // its leads. Taking a version away moves the same surfaces as writing one: the channel it was on closes.
  "POST templates/versions": versionWrite,
  "DELETE templates/versions/[id]": versionWrite,
  // Settings and the team.
  // Settings FIRST: it carries the version the next save has to send. Today
  // states the workspace's facts; hours, closures, rules and services are the
  // Calendar's too.
  // Name, hours, services, the hand-off number and the calendar feed are Setup rows too. The business's postal address is
  // saved here as well, and an offer by email is closed without it: the composers' Send by row and People's reach follow.
  "PUT settings": () => [settingsOverride, todayOverride, calendarOverride, setupOverride, ...readiness()],
  // The first receptionist is a settings write too, from what is known: the same surfaces read again.
  "POST settings/receptionist": () => [
    settingsOverride,
    todayOverride,
    calendarOverride,
    setupOverride,
    ...readiness(),
  ],
  // A booking email held for a look, read again or dismissed (00345): the Calendar's read carries the held list and its
  // count, which the Business tab's fold and the board's card both draw from, so the list says what is left at once.
  "POST calendar/notices/[id]/read-again": () => [calendarOverride],
  "POST calendar/notices/[id]/dismiss": () => [calendarOverride],
  // A class's mode is what lets a playbook send by itself, ask, or never: People's rows say it of the follow-up (0006), and the Reviews
  // lens's, of a review, whether its composer asks the receptionist for a draft.
  "PUT policies": () => [settingsOverride, peopleOverride, reviewsOverride],
  // The zone is the workspace's, saved through its own route, and the prompt names it: the settings read's preview
  // carries the zone every fold's consequence is resolved with (business-tab.ts), and the prompt card states it. Not
  // re-read, they kept the old zone until something else was saved. How its customers buy is saved there too (0008),
  // and it switches the deal layer: People's lists and column, Reports' Deals section and Today's proposals waiting. The zone
  // is also where Today's period line counts its days from: the headline is read again too, and the Reviews lens's read, which
  // counts a review on the day it was written in the zone, is forgotten and read as the lens comes on screen.
  "PATCH workspaces": () => {
    forgetReviews();
    return [settingsOverride, peopleOverride, reportsOverride, reportsHeadlineOverride, todayOverride];
  },
  "POST team/invite": settings,
  "PATCH team/[id]": settings,
  "DELETE team/[id]": settings,
  // Connections repaints, and so does the Setup row that said "Connect".
  // The number connected is the one a broadcast goes out on: the composers' WhatsApp tick and who it reaches follow.
  "POST channels/whatsapp/connect": () => [settingsOverride, setupOverride, ...readiness()],
  // What Meta holds about the number is kept on the channel's config, which the settings read carries: Connections' row repaints.
  "POST channels/whatsapp/standing": () => [settingsOverride],
  "PUT notifications": () => [notificationsOverride],
  // Setup, lines, billing, Google.
  "POST capabilities/[kind]": setup,
  "DELETE capabilities/[kind]": setup,
  // The text line is a channel a campaign goes by once it is active (its state is what the composers' Send by row reads):
  // getting one, resuming it and filing it with the carriers each move that state, so the composers read it again.
  "POST lines/buy": setupAndReadiness,
  "POST lines/retry": setupAndReadiness,
  "POST lines/register": setupAndReadiness,
  // Forwarding saved: Setup's row, and the settings read's kept number (facts.ts kept_line), which the card shows.
  "POST lines/forwarding": () => [setupOverride, settingsOverride],
  "POST lines/forwarding/test": setup,
  "POST setup/request": setup,
  "PUT business-record": setup,
  // Making the mailbox adds a line, so the count above the work changes with it, and opens the email channel to a campaign.
  // And the Calendar: its read carries the workspace's address, which the Booking tool row offers to make and then
  // tells the owner to send booking emails to (settings/business/open-bookings.tsx).
  "POST mailboxes": () => [setupOverride, todayOverride, calendarOverride, ...readiness()],
  // The mailbox's own facts are what email's readiness reads (its offers pause among them), so a save of it re-reads them.
  "PUT mailboxes/[id]": setupAndReadiness,
  // A sending domain added, checked or removed: the Email row's block reads again from Setup.
  "POST sending-domains": setup,
  "POST sending-domains/[id]/check": setup,
  "POST sending-domains/[id]/resume": setup,
  "DELETE sending-domains/[id]": setup,
  "POST billing/resume": billing,
  "POST billing/sync": billing,
  // The plan starting now ends the trial: the pane's rows and Setup's billing row.
  "POST billing/start-now": billing,
  "POST google/link": google,
  "DELETE google/link": google,
  "POST google/refresh": google,
  "POST google/locations": google,
  "DELETE google/connection": google,
  // A reply posted is a review answered, from the Reviews lens: it counts the answers and lists the reviews that wait (the live feed is
  // told of a review's first sight only, so a reply moves nothing there on its own). Its read publishes Google's own beside it.
  "POST google/reviews/[id]/reply": () => [reviewsOverride],
  // A partner joining a workspace (0020): the switcher's list, so the workspace just joined is there to open, and the
  // partner's count. It was a second path, read by hand in partner.ts.
  "POST partner/invitations/[id]/accept": () => [workspaceOverride, partnerOverride],
};

/**
 * The writes that re-read no surface, each with why nothing on screen moves. Kept beside AFTER so a new write is
 * decided, not forgotten: refresh-coverage.test.mjs holds every write in `routes.generated.ts` to one of the two.
 */
export const REFRESHES_NOTHING: Partial<Record<RouteKey, string>> = {
  // Ask keeps its own thread and its cards; a card's own call goes through its verb's route, and that route's refresh.
  "POST ask": "a question: Ask draws its answer from the turn it streams",
  "POST ask/warm": "a warm read of the page before a question; it changes nothing",
  "POST ask/warm/model": "the model's cache, written before a question; it changes nothing a page shows",
  "POST ask/speech": "a clip of the words the page already shows, read aloud in Ask's voice; nothing on screen moves",
  // The spoken conversation (ask-spoken design, §3): its row and the vendor's session are the Line's own state; what it
  // writes into the thread arrives through the turn's own stream, as a typed question's does.
  "POST ask/voice": "a conversation minted: the mic's state, held by the Line; the thread fills from the turns",
  "POST ask/voice/page":
    "where the page went, kept on the session's row for the next spoken turn; nothing on screen moves",
  "POST ask/voice/end": "the end of a conversation, kept on its row; the Line already shows the mic at rest",
  "POST ask/messages/[id]/proposals/[pid]": "a card's outcome, kept on Ask's own message; the card's call refreshed",
  "DELETE ask/threads/[id]": "one of Ask's own threads, which Ask's list drops itself",
  // The reader's own mark on a person (00349). The rows that say it are drawn from the tab's own word at once
  // (surfaces/seen.ts), and the next read of each list carries the mark: three lists read again on every thread
  // opened would be three requests to say what the screen already does.
  "PUT contacts/[id]/seen": "the reader's own mark; the tab already draws it, and the next read carries it",
  // A draft, a preview, a search: nothing stored that a surface shows.
  "POST calendar/preview": "a preview of what a change to the calendar would do",
  "POST google/reviews/[id]/draft": "a draft of a review's answer, shown in the sheet that asked",
  "POST google/search": "a search for the business on Google",
  "POST leads/[id]/draft": "a draft; the lead moves when the owner says it was sent, which is a stage",
  "POST people/[id]/draft": "a draft of a message or of a call's brief, shown in the sheet that asked",
  "POST lines/search": "a search for numbers to buy",
  "POST reach-outs/preview": "a preview of a reach-out's email",
  "POST segments/draft": "a draft of a list's rule",
  "POST templates/draft": "a draft of a template's words",
  "POST leads/check-again": "the checks are scheduled; each row moves as its check lands, through the live feed",
  // Somewhere else: the page leaves, or the provider's page opens.
  "POST billing/checkout": "Stripe's checkout opens; the return reads Billing again (billing.ts outcome)",
  "POST billing/portal": "Stripe's portal opens",
  "POST workspaces/create": "the tab switches to the new workspace, which boots",
  "POST handovers/[id]/accept": "the tab switches to the workspace handed over, which boots",
  "POST handovers/[id]/decline": "the handover leaves the screen asking, and the app opens as it would have",
  "DELETE me": "the account is gone and the tab goes to sign in",
  // Kept by the page that made them, or nothing a page shows.
  "PUT me": "the name, laid on who is looking at once (identity.ts setName, me:changed)",
  "PUT me/devices": "this device's push registration",
  "DELETE me/devices": "this device's push registration",
  "PUT views/[page]": "the member's saved view, which the page already shows",
  "POST vitals": "the page's field data, kept for the back office",
  "POST client-errors": "an error a boundary caught, told to the server's log; nothing on screen moves",
  // The partner's own pane and the team's partner card read their rows themselves, again after each act.
  "POST partner": "the partner's account, published from the answer at once (settings/partner/surface.ts become)",
  "PATCH partner": "the partner's letters, published from the answer at once (settings/partner/surface.ts setLetters)",
  "POST partner/workspaces": "the workspace set up, which the tab switches to when its invitation went",
  "POST partner/workspaces/[id]/resend": "an invitation sent again; the row says so from the answer",
  "POST partner/invitations/[id]/decline": "the invitation leaves the pane's own list, which it reads again",
  "POST team/partner": "the team's partner card reads the workspace's partner again (settings/partner/team-card.tsx)",
  "DELETE team/partner": "the team's partner card reads the workspace's partner again (settings/partner/team-card.tsx)",
  // The back office reads its own lists on demand (platform.ts): no surface holds them.
  "POST platform/jobs/requeue":
    "no pane shows the ledger: a support session asks, and the job runs on the next heartbeat",
  "POST platform/lines/refile": "the back office's lines, read again by its pane",
  "POST platform/lines/release": "the back office's lines, read again by its pane",
  "POST platform/lines/replace": "the back office's lines, read again by its pane",
  "POST platform/lines/retry": "the back office's lines, read again by its pane",
  "POST platform/partners/payout": "the back office's partners, read again by its pane",
  "POST platform/partners/second-factor": "the back office's partners, read again by its pane",
  "POST platform/partners/standing": "the back office's partners, read again by its pane",
  "POST platform/partners/status": "the back office's partners, read again by its pane",
  "POST platform/waitlist/invited": "the back office's waitlist, read again by its pane",
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
