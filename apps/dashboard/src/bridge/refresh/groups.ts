/**
 * The reads a write can leave stale, by the surface each belongs to: refresh-map.ts's tables name a write's groups, and
 * a group names its surfaces, the lenses and pages that read over days among them only where they are drawn.
 */
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { audiencesOverride } from "@/surfaces/campaigns/broadcasts/audiences-surface";
import { calendarOverride } from "@/surfaces/calendar/surface";
import { calendarRunsOverride } from "@/surfaces/calendar/runs-surface";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { peopleOverride } from "@/surfaces/people/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { sequencesOverride } from "@/surfaces/campaigns/sequences/surface";
import { forgetReports, reportsOverride } from "@/surfaces/reports/surface";
import { headline } from "@/surfaces/reports/headline";
import { reportsPeople as reportsPeopleLens } from "@/surfaces/reports/people-surface";
import { reportsCampaigns as reportsCampaignsLens } from "@/surfaces/reports/campaigns-surface";
import { receptionist as receptionistLens } from "@/surfaces/reports/receptionist-surface";
import { forgetReviews, reviews as reviewsLens } from "@/surfaces/reports/reviews-surface";
import { settingsOverride } from "../surfaces/settings";
import { todayOverride } from "@/surfaces/today/override";
import { todayPinsOverride } from "@/surfaces/today/pins-surface";
import { askMemoryOverride } from "@/surfaces/settings/memory/surface";
import { filesOverride } from "@/surfaces/files/surface";
import { contentOverride } from "@/surfaces/campaigns/content/surface";
import { weekOverride } from "@/surfaces/campaigns/content/week/surface";
import { askMorningOverride } from "@/surfaces/today/ask-morning-surface";
import { replyDraftsOverride } from "@/surfaces/today/need-you/drafts-surface";
import type { SurfaceOverride } from "../surface-data";
import { billingOverride } from "@/surfaces/settings/billing/surface";
import { googleOverride } from "../google";
import { leadsOverride } from "@/surfaces/leads/override";
import { setupOverride } from "@/surfaces/setup/override";
import { drawnHere, ownsTheScreen, whereDrawn } from "../surface-registry";
import { routeOnScreen } from "../workspace";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/override";

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
export const receptionist = ifDrawn(receptionistLens);
// What the Campaigns lens says is made wrong by a yes or a stop (the people it counts as answers), a reply or a resolved escalation
// ("replies waiting on you"), a run approved, skipped or made ("runs waiting" and the funnel), a number connected or its standing ("your
// number") and the zone (its days). Its page is the lens, or the Overview, which draws it for one fact (the feed hears the lens's tables
// only on the lens, and tells it of none of these writes).
export const reportsCampaigns = ifDrawn(reportsCampaignsLens);
// What Today's week line and Ask found's leaks say goes wrong with a reply or a resolved escalation (one unanswered fewer each), a
// visit marked, and the calendar link or the zone saved (the booking pair, and the Booking gap line it makes). Today draws it.
export const headlineIfDrawn = ifDrawn(headline);
// The counts of the lists pinned to Today (surfaces/today/pins-surface.ts; R10), where Today is on screen, and left for it elsewhere:
// a write the feed does not tell (a person erased takes their messages) moves them.
const pinsIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([todayPinsOverride]) : []);
// What Ask remembers (settings/memory/surface.ts; decision 0070), where Settings › Memory is on screen: a line kept, changed or
// forgotten there, or by a card's Undo in the Line. Elsewhere the pane reads it as it comes on screen, once it has aged.
export const memoryIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([askMemoryOverride]) : [];
// A business's files (files/surface.ts; decision 0099), where the pane is drawn: nothing else a page draws reads them.
export const filesIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([filesOverride]) : []);
// What Ask made (campaigns/content/surface.ts), where Campaigns › Content is drawn: a made file's change, a post sent or stopped.
const contentIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([contentOverride]) : []);
export const filesAndContentIfDrawn = (): SurfaceOverride[] => [...filesIfDrawn(), ...contentIfDrawn()];
// The Week (campaigns/content/week/surface.ts), where it or Settings › Content is drawn: a week asked for, approved, a slot
// set, a claim or what posts are for kept; and Made beside it, which a week's making fills.
export const weekIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([weekOverride]) : []);
export const weekAndContentIfDrawn = (): SurfaceOverride[] => [...weekIfDrawn(), ...contentIfDrawn()];
export const postMoved = (): SurfaceOverride[] => [...contentIfDrawn(), ...calendarRunsIfDrawn()];
// Ask's morning (today/ask-morning-surface.ts; decision 0070; its cards rows of Need you, 0071), where Today is on screen: a card of the morning's turn
// pressed in the Line, or on Today itself, leaves the cards Today offers, so none is drawn with a press it no longer takes.
export const morningIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([askMorningOverride]) : [];
// The drafts Ask kept for Need you's rows (today/need-you/drafts-surface.ts; decision 0071), where Today is on screen: read again behind a
// draft written, so what the surface holds, and the cache with it, is what the rows show, and a reload draws the new words at once.
export const draftsIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([replyDraftsOverride]) : [];
// The Sequences list counts a batch's replies by their messages (0060): a person erased takes theirs with them. Read where it
// is drawn, left for its page elsewhere.
export const sequencesIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([sequencesOverride]) : [];
// One held email answered moves its run and its lead, never its chain (the row's counts are its report, read on open), and
// the Needs you of its sequence where the Sequences page is drawn; its rewrite's check, now, and its Undo the same (00505).
export const heldEmailMoves = () => [broadcastsOverride, playbooksOverride, leadsOverride, ...sequencesIfDrawn()];
// What the Reviews lens says of a review's reply mode (whether its composer asks the receptionist for a draft) is made wrong by a mode
// saved, which is saved on Autonomy or from a chip, never from the lens: read where the lens is on screen, forgotten elsewhere
// (the wiring's second audit, W-review-facts-rules-9: a mode saved read the lens nobody had open).
export const reviewsIfDrawn = ifDrawn(reviewsLens);
// What the Reports overview says (the report, its booking line and its Deals section) is made wrong by a deal recorded, the zone saved
// and a visit marked, and not by a message, which the feed tells it of while it is open. Made from Reports it is read again at once;
// from anywhere else it is forgotten, and Reports reads it as it comes on screen, as the lenses are.
export const reportsIfDrawn = (): SurfaceOverride[] => {
  forgetReports();
  return typeof window !== "undefined" && ownsTheScreen("reports", routeOnScreen()) ? [reportsOverride] : [];
};
export const thread = () => [
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
export const reportsPeople = ifDrawn(reportsPeopleLens);
export const peopleRead = () => [peopleOverride];
// A note may be a step, and the lens counts the steps overdue and due today: written, done, removed or decided, they move the lens too.
export const notes = () => [peopleOverride, ...reportsPeople()];
// People's rows where the page on screen draws them (drawnHere: People's pages, a person's, Today), and left for the next page that
// draws them elsewhere, read once as it comes on screen; the feed tells every other tab by table. A name edit, a yes, a Settings save
// or a mailbox's rename read every page of the book behind it, wherever it was pressed (the wiring's second audit, S4-6).
export const peopleIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([peopleOverride]) : [];
// What a thread says of its person: their name, number, address and proposal link, and whether they said yes or asked
// to stop (thread-dto.ts `contact`). An edit of those re-reads the threads, and People where it is drawn.
export const personAndThreads = () => [...peopleIfDrawn(), ...thread()];
// Who each audience a broadcast offers reaches (audiences-surface.ts), where a composer is drawn: left for those pages elsewhere. It is
// every page of People.
const audiencesIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([audiencesOverride]) : []);
// A campaign saved (a playbook, a sequence and its steps): the playbooks, the Campaigns lens's funnel and the Calendar's forecast,
// where the Calendar is drawn; and who each audience reaches where a composer is drawn, since a person's row names the campaign
// that follows them up. Not Sent's runs, which read no campaign: a run it makes is a write of its own (runs, below).
export const campaignSaved = () => [
  playbooksOverride,
  ...audiencesIfDrawn(),
  ...reportsCampaigns(),
  ...calendarRunsIfDrawn(),
];
// A run approved, skipped or made moves what the Campaigns lens says of the runs waiting on you and its funnel: its read goes with them.
// And the Calendar's marks, where the Calendar is drawn (a run waiting is its one amber; a campaign saved moves its forecast). And who
// heard from a run this week, which the composers leave out of a send, where one is drawn. And Sent's runs, wherever the tab is: the
// badge, Today's queue and the Inbox's rows are drawn from them.
export const runs = () => [
  playbooksOverride,
  broadcastsOverride,
  ...audiencesIfDrawn(),
  ...reportsCampaigns(),
  ...calendarRunsIfDrawn(),
];
// Campaigns' two composers, where the page on screen draws them: the playbooks (Campaigns' moments, the Library's "sent by", Today's day
// strip and its "N people"), and Sent's runs (Sent, the home's send-once composer, Today's queue, the Inbox's runs waiting) with who
// each audience reaches (the composer's). The playbooks and the audiences count over everyone in People. A write made where none is
// drawn leaves them for the pages that do draw them, read once as one comes on screen (drawnHere); it used to read them behind every
// yes, visit and save in the writer's tab, and the press waited for them (the wiring's second audit, S10-6). The feed tells every other
// tab, and this one, of what moves them, each on its own page.
export const composersIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([playbooksOverride, broadcastsOverride, audiencesOverride]) : [];
// Who a campaign reaches is counted from people's answers and from who exists: the composers' audience counts and a
// playbook's "N will get it" (audiences, playbooks). A write that moves either re-reads them where they are drawn, and leaves them for
// the pages that draw them elsewhere, or a yes recorded and New message opened showed the audience as it was before. Not Sent's runs,
// which count nobody: a yes moves no run.
export const audiences = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([playbooksOverride, audiencesOverride]) : [];
// A yes or a stop recorded, for one person or many: the one list, so the four writes cannot drift apart. Their row and
// their threads say it (personAndThreads, which carries the Campaigns lens's read: it counts the yeses and stops after a campaign, once),
// the audiences count by it, and the People lens counts them too (and the two records made one, whose answers may change). The
// report's own read no longer counts them: the campaigns are the lens's.
export const consentWrite = () => [...personAndThreads(), ...audiences(), ...reportsPeople()];
// A person added or imported is on an audience or off it, as one deleted is, and is in the book the People lens counts or not.
export const peopleAndAudiences = () => [...peopleIfDrawn(), ...audiences(), ...reportsPeople()];
// A person added from the Calendar's sheet ("Add to People": a read of the board adds nobody, 0047 lane 6) is the person the board then
// matches that visit to: the board is read again where it is drawn (the Calendar, the Business pane, Today's day card), and left for
// those pages elsewhere. The people the hourly sweep adds reach an open board only on its own five-minute read (the calendar_people bell
// row re-reads no surface).
export const calendarIfDrawn = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? drawnHere([calendarOverride]) : [];
// The Calendar's campaign marks (runs-surface.ts), where the Calendar is drawn: left for it elsewhere.
function calendarRunsIfDrawn(): SurfaceOverride[] {
  return typeof window !== "undefined" ? drawnHere([calendarRunsOverride]) : [];
}
// People's rows, on People's own pages: kept for them elsewhere, where the feed's notice of the same write reaches it by table (a rule's
// mode, which its follow-up column says) and its pages read it once as they come on screen. Its read walks every page of the book.
export const peopleIfOwned = (): SurfaceOverride[] =>
  typeof window !== "undefined" ? whereDrawn([peopleOverride]) : [];
// A playbook made, changed or removed moves what People's rows say of it (their `follow_up`, 0006), with its own pages.
export const runsAndPeople = () => [...runs(), peopleOverride];
// What also moves a reach-out's row (Part 4 PR 8): its chain's pause and resume are the playbook's own door on its
// first step, and its run waiting (the row's "next run") is approved or skipped as any run is. The chains' read scans
// no audience (reach-outs.ts), so reading it behind a door that moved an ordinary playbook costs little.
export const runsAndChains = () => [...runs(), reachOutsOverride];
// A campaign saved that makes no run and takes no one out: its chain's row moves (Part 4 PR 8), not Sent's runs.
export const savedAndChains = () => [...campaignSaved(), reachOutsOverride];
// What the composers and People's reach read of the workspace's channels (server/campaigns/channels-ready.ts): the number's
// health, the text line, the mailbox and its offers pause, and the postal address an offer by email names. A write that
// changes one of them moves the Send by row, the count of who each campaign reaches and People's own reach, so it
// re-reads all three, or a channel just opened stays closed on the composer until something else reads it again: each where it is
// drawn, and left for the pages that draw it elsewhere (composersIfDrawn, peopleIfDrawn; S4-6).
export const readiness = () => [...composersIfDrawn(), ...peopleIfDrawn()];
// A channel opened or closed (a number connected, a line got or filed, the mailbox made or changed) moves who can receive offers too, which
// the People lens counts against the same channels (`ChannelsReady`): its read goes with the three. So does a settings save (settingsWrite),
// whose postal address is the one an offer by email names. The Campaigns lens says the connected number's health ("your number"):
// its read goes with them too.
export const channelChange = () => [...readiness(), ...reportsPeople(), ...reportsCampaigns()];
// A template written here is read again by Settings, the one read of the templates (every row with its status, what sends each and
// how many went out). The pages that offer a message, the Inbox's reply box and the New conversation sheet, Broadcasts' composer
// and Playbooks' composer, and Campaigns' home with its call's text and Library count, draw from that read and are made of it
// again when it is published (surfaces/offered-templates.ts), so none is named here and none reads GET templates, GET playbooks
// or GET broadcasts again for it: a second read of them would only follow the first.
export const templateWrite = () => [settingsOverride];
// An email or text version, written or taken away: the one list, so the two writes cannot drift apart. The composers' Send by row and
// preview are drawn from the settings read (the messages it holds, with the versions each has), so it is the read that moves them. The
// playbooks are read again for the server's side of it: a message with no WhatsApp row takes its category from its own versions
// (contracts campaignMessagesOf, rule 4), and the count of a playbook whose message is stricter than its moment is made by that
// category. Not Leads: a lead's row carries nothing of a chain's words (the held sends are the runs', and a lead's stage is its own
// write), so a version moves no row it reads.
export const versionWrite = () => [settingsOverride, reachOutsOverride, playbooksOverride];
export const leadsRead = () => [leadsOverride];
// A lead's stage written (said no, not a fit, contacted, converted), in one or many, or such a write undone, sets or clears the
// lead's closed reason: the Reach-outs part of the Campaigns lens counts Said no from it, as it stands now. Its read goes with the
// Leads page's, forgotten and read as the page that draws it comes on screen (reportsCampaigns).
export const leadsAnswered = () => [leadsOverride, ...reportsCampaigns()];
export const setup = () => [setupOverride];
// What Setup's rows count and say of the people and their messages (who can receive an offer, whether the first WhatsApp message has
// arrived), where those rows are drawn (Start, Today's card, Connections' calendar row, Leads' reach-out sheet): left for them
// elsewhere (the wiring's second audit, S4-3).
export const setupIfDrawn = (): SurfaceOverride[] => (typeof window !== "undefined" ? drawnHere([setupOverride]) : []);
export const setupAndReadiness = () => [setupOverride, ...channelChange()];
// A person erased takes their messages, calls and threads with them (erase_contact deletes the rows, which the feed is not told
// of): the counts the report and Setup's rows make of them fall, where those are drawn. The one list for Delete person and Not a
// person (00483), which deletes as it does, so the two cannot drift apart.
export const erased = () => [
  ...personAndThreads(),
  // Their messages too: what Sent's runs count of them (their replies, the month's), where the runs are drawn.
  ...composersIfDrawn(),
  ...reportsPeople(),
  ...reportsIfDrawn(),
  ...setupIfDrawn(),
  ...pinsIfDrawn(),
  ...sequencesIfDrawn(),
];
// The listing and its reviews are the Reviews lens's read too, and the lens is never the page a link, a refresh or a disconnect is made from
// (Settings' Connections pane, the first run's Find): its read is forgotten, as a template written is for the Inbox, and read as the lens
// comes on screen, not read from there. Settings too: whether the listing has a review link is a fact of its read, by which the Library
// offers the review ask and both composers fill the review-link slot (offered-templates.ts), and a link made, refreshed or dropped here
// moves it (the wiring's second audit, S1-4). The sweep's rare link of an older listing waits for Settings' next read.
export const google = () => {
  forgetReviews();
  return [googleOverride, setupOverride, settingsOverride];
};
export const billing = () => [billingOverride, setupOverride];
export const settingsRead = () => [settingsOverride];
// A visit marked kept, missed or cancelled: what counts visits, in the writer's tab. The Calendar shows the word (and Today's queue,
// which asks "Did they come?" of yesterday's unmarked visits, reads its blocks); People's rows (and the Inbox's chip, drawn from them, and
// the person's page, which reads People: its History and Coming up say the word and ask the same presses) say the next and last visit and
// "missed a visit"; the playbooks' and the audiences' pools leave a visit that is missed or cancelled, read where they are drawn (Today's day
// strip prints each visit playbook's count) and left for those pages elsewhere; Today's headline, Reports' overview and the People and
// Receptionist lenses count the booked ones, read where they are on screen and forgotten elsewhere. A teammate's mark, a booking email
// and the hourly calendar read reach the same pages through the appointments the live feed tells of (their surfaces' rules).
export const visits = () => [
  calendarOverride,
  peopleOverride,
  ...audiences(),
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
export const settingsWrite = () => [
  settingsOverride,
  calendarOverride,
  setupOverride,
  ...channelChange(),
  ...receptionist(),
  ...headlineIfDrawn(),
];
