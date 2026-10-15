/**
 * After a write lands: which surfaces could now be stale.
 *
 * One table, keyed by route, replacing the list each of eleven couriers
 * carried for its own verbs. The lists are the couriers' own, copied as they
 * were: the reply re-reads the inbox, the conversations and Today, which
 * carries the "needs you" count; a template change re-reads settings, the one
 * read of the templates, and the pages that offer a message (the Inbox's reply
 * box, both composers, the New conversation sheet) follow its publication
 * (surfaces/offered-templates.ts), with no hook and no read of their own.
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
import { calendarRunsOverride } from "@/surfaces/calendar/runs-surface";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { notificationsOverride } from "./surfaces/notifications";
import { peopleOverride } from "@/surfaces/people/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { forgetReports, reportsOverride } from "@/surfaces/reports/surface";
import { headline } from "@/surfaces/reports/headline";
import { reportsPeople as reportsPeopleLens } from "@/surfaces/reports/people-surface";
import { reportsCampaigns as reportsCampaignsLens } from "@/surfaces/reports/campaigns-surface";
import { receptionist as receptionistLens } from "@/surfaces/reports/receptionist-surface";
import { forgetReviews, reviews as reviewsLens, reviewsOverride } from "@/surfaces/reports/reviews-surface";
import { settingsOverride } from "./surfaces/settings";
import { channelsOverride } from "@/surfaces/channels/surface";
import { todayOverride } from "@/surfaces/today/surface";
import { todayPinsOverride } from "@/surfaces/today/pins-surface";
import { workspaceOverride, type SurfaceOverride } from "./surface-data";
import { billingOverride } from "@/surfaces/settings/billing/surface";
import { partnerOverride } from "@/surfaces/settings/partner/surface";
import { googleOverride } from "./google";
import { leadsOverride } from "@/surfaces/leads/surface";
import { setupOverride } from "@/surfaces/setup/surface";
import { refreshSurfaces } from "./surface-runner";
import { drawnHere, ownsTheScreen, whereDrawn } from "./surface-registry";
import { routeOnScreen } from "./workspace";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/surface";
import { repliesOverride } from "./reach-out/replies";
import { campaignResults as campaignResultsHome } from "@/surfaces/campaigns/home/results-surface";

/** A read that counts over days, held by range (period-surface.ts): a Reports lens, or Today's headline. */
interface PeriodRead {
  override: SurfaceOverride;
  forget(): void;
  outdate(): void;
}
/**
 * The one rule for a read over days that a write made wrong and the live feed does not tell of. Where its page is on screen, nothing
 * else would read it, so it is read again at once; every range it holds is dropped, but the numbers drawn stay until the read that
 * replaces them lands, so a band or a lens does not blank for the length of a read on every reply. Anywhere else it is forgotten, and
 * its page reads it as it comes on screen. Each lens below is named once by each write that moves it, through the composite lists: a
 * list that holds another does not name it twice.
 */
const ifDrawn = (lens: PeriodRead) => (): SurfaceOverride[] => {
  if (typeof window !== "undefined" && ownsTheScreen(lens.override.key, routeOnScreen())) {
    lens.outdate();
    return [lens.override];
  }
  lens.forget();
  return [];
};
// What the Receptionist lens says is made wrong by a verb on a conversation (only the conversation changes, and a reply or a resolved
// escalation moves "waiting on you"), the zone (its days), the hours and the closures ("while you were closed").
const receptionist = ifDrawn(receptionistLens);
// What the Campaigns lens says is made wrong by a yes or a stop (the people it counts as answers), a reply or a resolved escalation
// ("replies waiting on you"), a run approved, skipped or made ("runs waiting" and the funnel), a number connected or its standing ("your
// number") and the zone (its days). Its page is the lens, or the Overview, which draws it for one fact (the feed hears the lens's tables
// only on the lens, and tells it of none of these writes).
const reportsCampaigns = ifDrawn(reportsCampaignsLens);
// What Today's period line and Worth a look say is made wrong by a reply or a resolved escalation (the unanswered count falls by one for
// each), a visit marked and the calendar link or the zone saved (the booking pair, and the Booking gap line it makes). Today is where it
// is drawn.
const headlineIfDrawn = ifDrawn(headline);
// The counts of the lists pinned to Today (surfaces/today/pins-surface.ts; R10), where Today is on screen, and left for it elsewhere:
// a write the feed does not tell (a person erased takes their messages) moves them.
const pinsIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([todayPinsOverride]) : []);
// What the Reviews lens says of a review's reply mode (whether its composer asks the receptionist for a draft) is made wrong by a mode
// saved, which is saved on Autonomy or from a chip, never from the lens: read where the lens is on screen, forgotten elsewhere
// (the wiring's second audit, W-review-facts-rules-9: a mode saved read the lens nobody had open).
const reviewsIfDrawn = ifDrawn(reviewsLens);
// What the Reports overview says (the report, its booking line and its Deals section) is made wrong by a deal recorded, the zone saved
// and a visit marked, and not by a message, which the feed tells it of while it is open. Made from Reports it is read again at once;
// from anywhere else it is forgotten, and Reports reads it as it comes on screen, as the lenses are.
const reportsIfDrawn = (): SurfaceOverride[] => {
  forgetReports();
  return typeof window !== "undefined" && ownsTheScreen("reports", routeOnScreen()) ? [reportsOverride] : [];
};
// What the Campaigns home says of its last 30 days (the sends and what came back, Campaigns' own numbers) is made wrong by a person
// erased, whose messages are deleted with them: read again where Campaigns is drawn, forgotten elsewhere, as the lenses are.
const campaignResultsIfDrawn = ifDrawn(campaignResultsHome);
const thread = () => [
  inboxOverride,
  conversationsOverride,
  todayOverride,
  ...receptionist(),
  ...reportsCampaigns(),
  ...headlineIfDrawn(),
];
// What the People lens counts is who is in the book, what they answered, their steps, the channels and the zone (its days) (the feed
// tells it of messages, calls and notes, not of these writes). A conversation's write, a reply or a hold reaches no one new and moves no
// step: `thread()` does not name it.
const reportsPeople = ifDrawn(reportsPeopleLens);
const people = () => [peopleOverride];
// A note may be a step, and the lens counts the steps overdue and due today: written, done, removed or decided, they move the lens too.
const notes = () => [peopleOverride, ...reportsPeople()];
// People's rows where the page on screen draws them (drawnHere: People's pages, a person's, Today), and left for the next page that
// draws them elsewhere, read once as it comes on screen; the feed tells every other tab by table. A name edit, a yes, a Settings save
// or a mailbox's rename read every page of the book behind it, wherever it was pressed (the wiring's second audit, S4-6).
const peopleIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([peopleOverride]) : []);
// What a thread says of its person: their name, number, address and proposal link, and whether they said yes or asked
// to stop (thread-dto.ts `contact`). An edit of those re-reads the threads, and People where it is drawn.
const personAndThreads = () => [...peopleIfDrawn(), ...thread()];
// A run approved, skipped or made moves what the Campaigns lens says of the runs waiting on you and its funnel: its read goes with them.
// And the Calendar's marks, where the Calendar is drawn (a run waiting is its one amber; a campaign saved moves its forecast).
const runs = () => [playbooksOverride, broadcastsOverride, ...reportsCampaigns(), ...calendarRunsIfDrawn()];
// Campaigns' two composers, where the page on screen draws them: the playbooks (Campaigns' moments, the Library's "sent by", Today's day
// strip and its "N people") and Sent's runs (Sent, the home's send-once composer and who can hear you, Today's queue, the Inbox's runs
// waiting). Each counts over everyone in People. A write made where neither is drawn leaves them for the pages that do draw them, read
// once as one comes on screen (drawnHere); it used to read both behind every yes, visit and save in the writer's tab, and the press
// waited for them (the wiring's second audit, S10-6). The feed tells every other tab, and this one, of what moves them, each on its own
// page.
const composersIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([playbooksOverride, broadcastsOverride]) : [];
// Who a campaign reaches is counted from people's answers and from who exists: the composers' audience counts and a
// playbook's "N will get it" (broadcasts, playbooks). A write that moves either re-reads them where they are drawn, and leaves them for
// the pages that draw them elsewhere, or a yes recorded and New message opened showed the audience as it was before.
const audiences = composersIfDrawn;
// A yes or a stop recorded, for one person or many: the one list, so the four writes cannot drift apart. Their row and
// their threads say it (personAndThreads, which carries the Campaigns lens's read: it counts the yeses and stops after a campaign, once),
// the audiences count by it, and the People lens counts them too (and the two records made one, whose answers may change). The
// report's own read no longer counts them: the campaigns are the lens's.
const consentWrite = () => [...personAndThreads(), ...audiences(), ...reportsPeople()];
// A person added or imported is on an audience or off it, as one deleted is, and is in the book the People lens counts or not.
const peopleAndAudiences = () => [...peopleIfDrawn(), ...audiences(), ...reportsPeople()];
// A person added from the Calendar's sheet ("Add to People": a read of the board adds nobody, 0047 lane 6) is the person the board then
// matches that visit to: the board is read again where it is drawn (the Calendar, the Business pane, Today's day card), and left for
// those pages elsewhere. The people the hourly sweep adds reach an open board only on its own five-minute read (the calendar_people bell
// row re-reads no surface).
const calendarIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([calendarOverride]) : []);
// The Calendar's campaign marks (runs-surface.ts), where the Calendar is drawn: left for it elsewhere.
function calendarRunsIfDrawn(): SurfaceOverride[] {
  return typeof window !== "undefined" ? drawnHere([calendarRunsOverride]) : [];
}
// People's rows, on People's own pages: kept for them elsewhere, where the feed's notice of the same write reaches it by table (a rule's
// mode, which its follow-up column says) and its pages read it once as they come on screen. Its read walks every page of the book.
const peopleIfOwned = (): SurfaceOverride[] => (typeof window !== "undefined" ? whereDrawn([peopleOverride]) : []);
// A playbook made, changed or removed moves what People's rows say of it (their `follow_up`, 0006), with its own pages.
const runsAndPeople = () => [...runs(), peopleOverride];
// What also moves a reach-out's row (Part 4 PR 8): its chain's pause and resume are the playbook's own door on its
// first step, and its run waiting (the row's "next run") is approved or skipped as any run is. The chains' read scans
// no audience (reach-outs.ts), so reading it behind a door that moved an ordinary playbook costs little.
const runsAndChains = () => [...runs(), reachOutsOverride];
// What the composers and People's reach read of the workspace's channels (server/campaigns/channels-ready.ts): the number's
// health, the text line, the mailbox and its offers pause, and the postal address an offer by email names. A write that
// changes one of them moves the Send by row, the count of who each campaign reaches and People's own reach, so it
// re-reads all three, or a channel just opened stays closed on the composer until something else reads it again: each where it is
// drawn, and left for the pages that draw it elsewhere (composersIfDrawn, peopleIfDrawn; S4-6).
const readiness = () => [...composersIfDrawn(), ...peopleIfDrawn()];
// A channel opened or closed (a number connected, a line got or filed, the mailbox made or changed) moves who can receive offers too, which
// the People lens counts against the same channels (`ChannelsReady`): its read goes with the three. So does a settings save (settingsWrite),
// whose postal address is the one an offer by email names. The Campaigns lens says the connected number's health ("your number"):
// its read goes with them too.
const channelChange = () => [...readiness(), ...reportsPeople(), ...reportsCampaigns()];
// A template written here is read again by Settings, the one read of the templates (every row with its status, what sends each and
// how many went out). The pages that offer a message, the Inbox's reply box and the New conversation sheet, Broadcasts' composer
// and Playbooks' composer, and Campaigns' home with its call's text and Library count, draw from that read and are made of it
// again when it is published (surfaces/offered-templates.ts), so none is named here and none reads GET templates, GET playbooks
// or GET broadcasts again for it: a second read of them would only follow the first.
const templates = () => [settingsOverride];
// An email or text version, written or taken away: the one list, so the two writes cannot drift apart. The composers' Send by row and
// preview are drawn from the settings read (the messages it holds, with the versions each has), so it is the read that moves them. The
// playbooks are read again for the server's side of it: a message with no WhatsApp row takes its category from its own versions
// (contracts campaignMessagesOf, rule 4), and the count of a playbook whose message is stricter than its moment is made by that
// category. Not Leads: a lead's row carries nothing of a chain's words (the held sends are the runs', and a lead's stage is its own
// write), so a version moves no row it reads.
const versionWrite = () => [settingsOverride, reachOutsOverride, playbooksOverride];
const leads = () => [leadsOverride];
// A lead's stage written (said no, not a fit, contacted, converted), in one or many, or such a write undone, sets or clears the
// lead's closed reason: the Reach-outs part of the Campaigns lens counts Said no from it, as it stands now. Its read goes with the
// Leads page's, forgotten and read as the page that draws it comes on screen (reportsCampaigns).
const leadsAnswered = () => [leadsOverride, ...reportsCampaigns()];
const setup = () => [setupOverride];
// What Setup's rows count and say of the people and their messages (who can receive an offer, whether the first WhatsApp message has
// arrived), where those rows are drawn (Start, Today's card, Connections' calendar row, Leads' reach-out sheet): left for them
// elsewhere (the wiring's second audit, S4-3).
const setupIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([setupOverride]) : []);
const setupAndReadiness = () => [setupOverride, ...channelChange()];
// The listing and its reviews are the Reviews lens's read too, and the lens is never the page a link, a refresh or a disconnect is made from
// (Settings' Connections pane, the first run's Find): its read is forgotten, as a template written is for the Inbox, and read as the lens
// comes on screen, not read from there. Settings too: whether the listing has a review link is a fact of its read, by which the Library
// offers the review ask and both composers fill the review-link slot (offered-templates.ts), and a link made, refreshed or dropped here
// moves it (the wiring's second audit, S1-4). The sweep's rare link of an older listing waits for Settings' next read.
const google = () => {
  forgetReviews();
  return [googleOverride, setupOverride, settingsOverride];
};
const billing = () => [billingOverride, setupOverride];
const settings = () => [settingsOverride];
// A visit marked kept, missed or cancelled: what counts visits, in the writer's tab. The Calendar shows the word (and Today's queue,
// which asks "Did they come?" of yesterday's unmarked visits, reads its blocks); People's rows (and the Inbox's chip, drawn from them, and
// the person's page, which reads People: its History and Coming up say the word and ask the same presses) say the next and last visit and
// "missed a visit"; the playbooks' and broadcasts' pools leave a visit that is missed or cancelled, read where they are drawn (Today's day
// strip prints each visit playbook's count) and left for those pages elsewhere; Today's headline, Reports' overview and the People and
// Receptionist lenses count the booked ones, read where they are on screen and forgotten elsewhere. A teammate's mark, a booking email
// and the hourly calendar read reach the same pages through the appointments the live feed tells of (their surfaces' rules).
const visits = () => [
  calendarOverride,
  peopleOverride,
  ...composersIfDrawn(),
  ...headlineIfDrawn(),
  ...reportsIfDrawn(),
  ...reportsPeople(),
  ...receptionist(),
];
// Settings carries the version the next save sends, and the Calendar and Setup state the workspace's facts; the hours and the
// closures a save holds are the Receptionist lens's "while you were closed", and the postal address it holds is what an offer by email
// names, so who can receive offers (the People lens's count) moves with it. Today's own five reads (the day's metrics, the
// conversations, the escalations, the calls and the searches) draw no configuration; the headline it owns does, its booking pair read
// from the calendar link and the zone (the Booking gap line), so it is read where Today is on screen and forgotten elsewhere (the
// wiring's second audit, W-visit-deal-4). The one list for the two writes that carry them, so they cannot drift.
// A save that changes the business's name renames the workspace (00439, X4-5): the sidebar and the switcher say it from the
// boot's own list, as they do the logo.
const settingsWrite = () => [
  workspaceOverride,
  settingsOverride,
  calendarOverride,
  setupOverride,
  ...channelChange(),
  ...receptionist(),
  ...headlineIfDrawn(),
];

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
  // People.
  // A person erased takes their messages, calls and threads with them (erase_contact deletes the rows, which the feed is not told
  // of): the counts the report, the Campaigns home and Setup's rows make of them fall, where those are drawn.
  "DELETE contacts/[id]": () => [
    ...personAndThreads(),
    ...audiences(),
    ...reportsPeople(),
    ...reportsIfDrawn(),
    ...campaignResultsIfDrawn(),
    ...setupIfDrawn(),
    ...pinsIfDrawn(),
  ],
  // Two records became one (0028): the kept person's page and People, the threads that folded, and every count by
  // consent, Reports' included: the merge may change an answer, as a consent write does. The bell's lines about the folded thread
  // now name the kept one (their address moves; the feed is told of a line's arrival, not of its change).
  // A merge moves a lead's person to the kept record (Combine, 0052): Leads is read again with People.
  "POST contacts/[id]/merge": () => [...consentWrite(), notificationsOverride, ...leads()],
  "PUT contacts/[id]/receptionist": people,
  "PUT contacts/[id]/consent": consentWrite,
  "PUT contacts/[id]/marketing-consent": consentWrite,
  "PUT contacts/consent": consentWrite,
  "PUT contacts/marketing-consent": consentWrite,
  "PUT contacts/receptionist": people,
  "PUT contacts/notes": notes,
  // Their details carry the email address a campaign by email goes to: the audiences count by it. An address changed clears a stopped
  // one, which the People lens counts.
  "PUT contacts/[id]/details": () => [...personAndThreads(), ...audiences(), ...reportsPeople()],
  // A deal moves People's row and lists, and Reports' Deals section counts it (0004).
  "POST contacts/[id]/deal": () => [peopleOverride, ...reportsIfDrawn(), ...audiences()],
  // A note may be a step, and a row carries the next one (00166): the Pipeline, Steps due and Today follow it, and so does the
  // People lens, which counts the steps overdue and due today.
  "POST contacts/[id]/notes": notes,
  // A call logged (0052): a note, perhaps a step, as above; and, at an open lead, its outcome and stage, as Leads' own call.
  // A call that was the call back hands their thread back (00422): the threads, Today and the badge move with the note.
  "POST contacts/[id]/call": () => [...notes(), leadsOverride, ...thread()],
  "POST contacts/[id]/notes/done": notes,
  "POST contacts/[id]/notes/remove": notes,
  // A receptionist's suggestion kept becomes a note, perhaps a step: the same rows move.
  "POST contacts/[id]/notes/decide": notes,
  "POST contacts": () => [...peopleAndAudiences(), ...calendarIfDrawn()],
  // A conversation begun from the Inbox: their thread is new or moved, and their row on People says so.
  "POST people/[id]/message": personAndThreads,
  // A signer's name used, put back or declined (0052): the name is on every row and thread header that draws them, a greeting
  // counts it (the composers' audiences), and Leads' rows and peek say who the business's person is.
  "POST people/[id]/name": () => [...personAndThreads(), ...audiences(), ...leads()],
  // Linked to a business, or not at it (0052): their row trails the business, and the lead's own rows list its people.
  "PUT people/[id]/business": () => [...personAndThreads(), ...leads()],
  "DELETE people/[id]/business": () => [...personAndThreads(), ...leads()],
  "POST contacts/import": peopleAndAudiences,
  // A list is an audience and a playbook's moment too: the composer's chips and a playbook's count follow it, where they are drawn.
  "POST segments": () => [peopleOverride, ...composersIfDrawn()],
  "PUT segments/[id]": () => [peopleOverride, ...composersIfDrawn()],
  "DELETE segments/[id]": () => [peopleOverride, ...composersIfDrawn()],
  // Leads. Every one of these PATCHES: the surface re-reads the view and keeps
  // the pages, the selection and the cursor the owner already has (leads.ts).
  // `POST leads/[id]/stage` names People too: an Interested call makes a
  // person, and People would otherwise not know until it was read again;
  // a lead converted is a person added, so the book the People lens counts moves.
  // A draft is not here on purpose -- it changes no row a surface shows; the
  // lead moves when the owner answers "Did you send it?", which is a stage.
  "POST lead-searches": leads,
  // A list of your own (00242) is a search: the rail and the leads read again.
  "POST lead-searches/import": leads,
  "POST lead-searches/people": leads,
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
  // Later, in a pass of the pile (00426): the row's later_at, its place in the pile and the progress line.
  "POST leads/[id]/later": leads,
  // Who a company's reach-out writes to (00430): the row's addressee, its address and that address's check.
  "POST leads/[id]/addressee": leads,
  // An add taken back (00426) skips its lead's planned email in a waiting run and takes it off the reach-out's list:
  // the run's counts and the reach-out's people move with the leads.
  "POST lead-operations/[id]/undo": () => [...leadsAnswered(), reachOutsOverride, broadcastsOverride],
  "POST leads/bulk": leadsAnswered,
  // The leads a copy took are marked, so the month is not charged for them twice (§0.2): the rows and the month's count read again.
  "POST leads/export": leads,
  "DELETE leads/[id]": leads,
  "PUT lead-suggestions": leads,
  "POST leads/[id]/stage": () => [...leadsAnswered(), peopleOverride, ...reportsPeople()],
  // Outbound.
  // A broadcast made moves the month's emails and texts both composers say before a send, and Playbooks' composer reads
  // them from its own surface: both are read again, as approving or cancelling a run reads them.
  "POST broadcasts": runs,
  "POST broadcasts/[id]/approve": runsAndChains,
  "POST broadcasts/[id]/cancel": runsAndChains,
  // A playbook named by a starter files its message too (A0): the Library, and every picker that is made of it, move with it.
  "POST playbooks": () => [...runsAndPeople(), ...templates()],
  "PUT playbooks/[id]": () => [...runsAndChains(), peopleOverride],
  "DELETE playbooks/[id]": runsAndPeople,
  "POST playbooks/[id]/run": runs,
  // A reach-out is a chain of playbooks over a search's leads (Part 4): its runs are broadcasts, its answers move leads,
  // and its chain is the reach-outs surface (Playbooks' row, and Templates' email rows drawn from it). Its own save writes the chain,
  // its runs and its words and no lead, and an answer that moves a lead is the lead's own write. Leads draws which reach-out a
  // lead goes with (00426 lead_chain_of: its search's or its list's), so one made or removed re-reads it; a change in place
  // moves no lead from one to another.
  "POST reach-outs": () => [reachOutsOverride, playbooksOverride, broadcastsOverride, leadsOverride],
  "PUT reach-outs/[id]": () => [reachOutsOverride, playbooksOverride, broadcastsOverride],
  "DELETE reach-outs/[id]": () => [reachOutsOverride, playbooksOverride, broadcastsOverride, leadsOverride],
  // One held email decided moves its run and its lead, never its chain: the row's counts are its report, read on open.
  "POST reach-out-sends/[id]/decide": () => [broadcastsOverride, playbooksOverride, leadsOverride],
  // An email its owner said went (00429): its run and its lead, the person it made and the email on their thread, and the
  // reach-out's people; one left out moves the run alone, which the same reads cover.
  "POST reach-out-sends/[id]/said": () => [
    broadcastsOverride,
    playbooksOverride,
    leadsOverride,
    reachOutsOverride,
    ...personAndThreads(),
    ...reportsCampaigns(),
  ],
  // Leads added to a reach-out's list (00426): each row's reach-out and the pile, and the reach-out's people and counts.
  // Nothing is planned until its run is made, so no run moves yet, and the reach-out's own row is not written.
  "POST reach-outs/[id]/leads": () => [reachOutsOverride, leadsOverride],
  // One lead left out of it (00426): off its list, and the reach-out's people and Leads' rows with it. A run that waits
  // reads its skipped email when it is opened (Sent reads no send of a reach-out's).
  "POST reach-outs/[id]/leads/leave": () => [reachOutsOverride, leadsOverride],
  // "Stop writing to them" skips the lead's planned and held emails in their runs (Part 6, H10).
  "POST reach-outs/leads/[id]/stop": () => [broadcastsOverride, playbooksOverride, leadsOverride],
  // What the business wrote back, as its owner says it (00429): a reading, as the reply job's moves the lead, its waiting
  // emails and drafts, the person's consent on a no, and a step on Today.
  "POST reach-outs/leads/[id]/said": () => [
    repliesOverride,
    broadcastsOverride,
    playbooksOverride,
    leadsOverride,
    reachOutsOverride,
    peopleOverride,
    ...reportsCampaigns(),
  ],
  // "Read as no · undo" moves the reading, the person's consent and the leads the no closed.
  "POST reach-out-replies/[id]/undo": () => [repliesOverride, ...thread(), leadsOverride],
  // A recheck moves what a reach-out's run holds for its owner (its sends), which the Calendar's marks never say.
  "POST broadcasts/[id]/recheck": () => [playbooksOverride, broadcastsOverride, ...reportsCampaigns()],
  "POST templates": templates,
  "PUT templates/[id]": templates,
  "DELETE templates/[id]": templates,
  "POST templates/starter": templates,
  "POST templates/sync": templates,
  // An email or text version of a message (One message, every channel, step 1): the Templates page reads them with the
  // settings surface, and both composers are made of that read: the Send by row closes a channel the message has no version
  // on, and the preview draws a person on the channel they are reached on as that version reads. Nothing else is told: the
  // composers follow the settings read's publication (surfaces/offered-templates.ts). A reach-out's email is written by this
  // route too (step 5), through its chain's save, so what a chain's edit moves moves with it: its words (the chains' read) and
  // the playbooks' counts. Taking a version away moves the same surfaces as writing one: the channel it was on closes.
  "POST templates/versions": versionWrite,
  "DELETE templates/versions/[id]": versionWrite,
  // A whole message written at once, from Ask's message card (decision 0055): every channel's version filed and its
  // WhatsApp one submitted. It moves what a message and its versions move: the settings read the Library and both
  // composers are drawn from, and the playbooks (a message's category is its versions'). Not the reach-outs: a message
  // written here is on no chain.
  "POST templates/message": () => [settingsOverride, playbooksOverride],
  // Settings and the team.
  // Settings FIRST: it carries the version the next save has to send. Today
  // states the workspace's facts; hours, closures, rules and services are the
  // Calendar's too.
  // Name, hours, services, the hand-off number and the calendar feed are Setup rows too. The business's postal address is
  // saved here as well, and an offer by email is closed without it: the composers' Send by row and People's reach follow. The hours and
  // the closures are what the Receptionist lens's "while you were closed" counts by, and the address is read by the People lens's
  // "can receive offers" too, so a save forgets that lens's read as well (settingsWrite).
  "PUT settings": settingsWrite,
  // The first receptionist is a settings write too, from what is known (its profile carries the hours): the same surfaces read again.
  "POST settings/receptionist": settingsWrite,
  // A booking email held for a look and dismissed (00345): the Calendar's read carries the held list and its count, which the
  // Business tab's fold and the board's card both draw from, so the list says what is left at once. (Read again is a job: below.)
  "POST calendar/notices/[id]/dismiss": () => [calendarOverride],
  // What a member said became of a visit (0002 step 8): the board's read carries each visit's word, and every page that counts
  // visits reads it from the appointments record (#1551): People's rows and the Inbox's chip over them, the playbooks' and the
  // broadcasts' pools, Reports' booking line and Today's. The one list, so a page that draws a visit cannot be left behind.
  "POST calendar/visits/[id]": visits,
  // A class's mode is what lets a playbook send by itself, ask, or never: People's rows say it of the follow-up (0006), and the Reviews
  // lens's, of a review, whether its composer asks the receptionist for a draft. Campaigns' Resume question says 'It sends on its own'
  // for a class that is Auto, from the modes the playbooks read held (composersIfDrawn). A mode is saved on Autonomy or from a chip:
  // each of these is read where it is on screen and left for its page elsewhere, never read for a page nobody has open (the wiring's
  // second audit, W-review-facts-rules-9). The notice of it is one per save, with no row, so every tab's Settings reads it again for a
  // person's own mode as well: accepted, the person_mode rate holds those writes to a person's pace, and a notice that said its scope
  // would be the way to tell them apart (decision 0058, amended for R7).
  "PUT policies": () => [
    settingsOverride,
    ...peopleIfOwned(),
    ...reviewsIfDrawn(),
    ...composersIfDrawn(),
    ...calendarRunsIfDrawn(),
  ],
  // The zone is the workspace's, saved through its own route, and the prompt names it: the settings read's preview
  // carries the zone every fold's consequence is resolved with (business-tab.ts), and the prompt card states it. Not
  // re-read, they kept the old zone until something else was saved. How its customers buy is saved there too (0008),
  // and it switches the deal layer: People's lists and column, Reports' Deals section and Today's proposals waiting. The zone
  // is also where Today's period line counts its days from: the headline is read again where Today is on screen and forgotten
  // elsewhere, and so is the overview's. The Reviews lens's read, which
  // counts a review on the day it was written in the zone, is forgotten and read as the lens comes on screen; so is the Receptionist
  // lens's, whose days are the zone's too, and the People lens's, whose days (and the day a step falls due) are, and the Campaigns
  // lens's, whose window is counted in it. How its customers buy
  // also shapes Campaigns' journey and the word it says (spec 2026-10-09 §4.8), and Sent's composer offers the proposal lists (who has
  // a proposal out, whose deal is won) only where customers buy by proposal: both composers are read where they are drawn and left for
  // the pages that draw them elsewhere (the wiring's second audit, S4-5: switched to proposal, the composer lacked the lists until a
  // reload). Campaigns' 30 days are counted in the zone, and so are the Calendar's times and its "today", which Today's day card is
  // drawn from too: each is read where it is drawn and left for its pages elsewhere (W-visit-deal-4: a zone changed, the board kept
  // the old one's times for up to five minutes).
  "PATCH workspaces": () => {
    forgetReviews();
    return [
      settingsOverride,
      peopleOverride,
      ...reportsIfDrawn(),
      ...headlineIfDrawn(),
      todayOverride,
      ...composersIfDrawn(),
      ...receptionist(),
      ...reportsPeople(),
      ...reportsCampaigns(),
      ...calendarIfDrawn(),
      ...campaignResultsIfDrawn(),
    ];
  },
  // The workspace's logo (00407) is drawn from the boot's own list: the sidebar's circle, the rail and the switcher read
  // it again from there, so a picture saved or taken away is on screen as the answer lands.
  "PUT workspaces/logo": () => [workspaceOverride],
  "DELETE workspaces/logo": () => [workspaceOverride],
  // Your own name: who is looking (the workspace read carries __ME, which the sidebar and the account menu say), and the roster the
  // Team pane lists and the Inbox's teammate names are drawn from (the settings read), so the old name is not left on either.
  "PUT me": () => [workspaceOverride, settingsOverride],
  "POST team/invite": settings,
  "POST team/invite/[id]/resend": settings,
  "PATCH team/[id]": settings,
  "DELETE team/[id]": settings,
  // Connections repaints (the channels read), and so do the Setup row that said "Connect" and the Business pane's facts the number
  // resolves (the settings read). The number connected is the one a broadcast goes out on: the composers' WhatsApp tick and who it
  // reaches follow.
  "POST channels/whatsapp/connect": () => [channelsOverride, settingsOverride, setupOverride, ...channelChange()],
  // What Meta holds about the number is kept on the channel's config, which the channels read carries: Connections' row, the
  // Library's and the composers' repaint, and the Campaigns lens's "your number" (numberHealthOfConfig reads the same config) is
  // read again where it is drawn.
  "POST channels/whatsapp/standing": () => [channelsOverride, ...reportsCampaigns()],
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
  "POST mailboxes": () => [setupOverride, todayOverride, calendarOverride, ...channelChange()],
  // The mailbox's own facts are what email's readiness reads (its offers pause among them), so a save of it re-reads them.
  "PUT mailboxes/[id]": setupAndReadiness,
  // A connected mailbox paused, set, checked, resumed, tested or removed: the Email row's block reads again from Setup
  // (a connect comes back from the provider to a page that reads it afresh).
  "PATCH mailbox-connections/[id]": setup,
  "POST mailbox-connections/[id]/check": setup,
  "POST mailbox-connections/[id]/resume": setup,
  "POST mailbox-connections/[id]/test": setup,
  "DELETE mailbox-connections/[id]": setup,
  "POST billing/resume": billing,
  "POST billing/sync": billing,
  // The plan starting now ends the trial: the pane's rows and Setup's billing row.
  "POST billing/start-now": billing,
  "POST google/link": google,
  "DELETE google/link": google,
  "POST google/refresh": google,
  "POST google/locations": google,
  "DELETE google/connection": google,
  // A reply posted is a review answered, from the Reviews lens: it counts the answers and lists the reviews that wait. The live feed
  // tells the answer to every tab (00431), and this tab's read here is the one its notice asks for (readAfter), so the writer reads
  // it once, at once. Its read publishes Google's own beside it
  // (publishGoogleRead), where this tab holds Google's, so Today's line (made of it, and gone once its review has a reply) is current
  // without a second read of the same listing. The bell's notices of the review are read by the verb (legacy-bridge/google.ts
  // replyToReview), which writes through the notifications door.
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
  // The ideas for a first search, written where they are due (S11-8): the answer is the ideas themselves, which the Leads surface
  // lays on the view on screen (readSuggestions), as it does a read of them; nothing else draws them.
  "POST lead-suggestions": "the ideas written for a first search: the page lays the answer on its view itself",
  "POST reach-outs/[id]/leads/check":
    "what an add would do (00426, dry): nothing is written; the caller says the answer",
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
  // Got it (canvas A, Up next): the reader's own mark on a note for them; the open person page reads itself again, and no
  // other page draws whether a note was read.
  "POST contacts/[id]/notes/seen": "the reader's own mark on a note for them; the open person page reads itself again",
  // Not the same (0034 step 4): the pair leaves the person's page, which reads itself again with the row gone (hero.tsx); no row of
  // People carries a doubt, so a read of the whole list was for nothing but to tell the open page to reload.
  "POST contacts/[id]/doubts/dismiss":
    "the open person page reads itself again with the doubt gone; no row of People carries a doubt",
  // Live's calls: a press asks the phone provider, which changes the call, and its webhook changes the row; the calls notice
  // (WATCHED calls, 00265) reads Live then. The press changes only the decision it records, and Live reads the calls and the
  // channels, so a read made when the provider has answered, and the call has not yet moved, shows the call as it was.
  "POST calls/[id]/whisper": "a sentence for the receptionist, worked into its next answer; no row Live reads changes",
  "POST calls/[id]/end":
    "the provider ends the call, and its webhook changes the row; the calls notice reads Live then",
  "POST calls/[id]/hand-over":
    "the provider transfers the call, and its webhook changes the row; the calls notice reads Live then",
  // A booking email held for a look, read again: a job is scheduled and reads the email later. The Calendar has nothing new until it
  // has: the visit it makes is an appointment the Calendar hears, and the list says what is left on the next read.
  "POST calendar/notices/[id]/read-again":
    "a job is scheduled to read the email; the appointment it makes is told to the Calendar",
  // A draft, a preview, a search: nothing stored that a surface shows.
  "POST calendar/preview": "a preview of what a change to the calendar would do",
  "POST google/reviews/[id]/draft": "a draft of a review's answer, shown in the sheet that asked",
  "POST google/search": "a search for the business on Google",
  "POST leads/[id]/draft": "a draft; the lead moves when the owner says it was sent, which is a stage",
  "POST people/[id]/draft": "a draft of a message or of a call's brief, shown in the sheet that asked",
  "POST people/[id]/say": "a sheet's fields, filled from what was said; nothing is stored until the sheet's Save",
  "POST lines/search": "a search for numbers to buy",
  "POST reach-outs/preview": "a preview of a reach-out's email",
  "POST segments/draft": "a draft of a list's rule",
  "POST templates/draft": "a draft of a template's words",
  "POST leads/check-again": "the checks are scheduled; each row moves as its check lands, through the live feed",
  // Somewhere else: the page leaves, or the provider's page opens.
  "POST billing/checkout": "Stripe's checkout opens; the return reads Billing again (billing.ts outcome)",
  "POST billing/portal": "Stripe's portal opens",
  "POST workspaces/create": "the tab switches to the new workspace, which boots",
  "POST workspaces/logo/lookup":
    "a look that stores nothing: the Logo row draws the picture it answers, and only a save keeps it",
  "POST me/invitations/accept":
    "the shell makes it as it boots and reads the list of workspaces again itself when it seated someone (invitations/accept.ts)",
  "POST handovers/[id]/accept": "the tab switches to the workspace handed over, which boots",
  "POST handovers/[id]/decline": "the handover leaves the screen asking, and the app opens as it would have",
  "DELETE me": "the account is gone and the tab goes to sign in",
  // Kept by the page that made them, or nothing a page shows.
  "PUT me/devices": "this device's push registration",
  "DELETE me/devices": "this device's push registration",
  "PUT me/alerts": "published from the answer (notifications/verbs.ts)",
  "POST notifications/test": "a test email; nothing moves",
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
  // The member who left is no longer in the workspace: the page takes them out of it, and nothing of it is read again.
  "POST team/leave": "the leaver goes to their workspaces (settings/team), where this one is no longer listed",
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

/** The keys the table names, for the test that holds them to writes. */
export const AFTER_KEYS = Object.keys(AFTER) as RouteKey[];

export async function refreshAfter(key: RouteKey): Promise<void> {
  const overrides = AFTER[key]?.() ?? [];
  if (overrides.length) await refreshSurfaces(overrides);
}
