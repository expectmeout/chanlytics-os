/**
 * What a write can leave stale of People, a person's threads and the campaigns that reach them: the rows, the audiences,
 * the composers, the runs and the chains, each where its page is drawn. refresh-map.ts's tables name them.
 */
import { broadcastsOverride } from "@/surfaces/campaigns/broadcasts/surface";
import { audiencesOverride } from "@/surfaces/campaigns/broadcasts/audiences-surface";
import { calendarOverride } from "@/surfaces/calendar/surface";
import { conversationsOverride } from "@/surfaces/inbox/conversations-surface";
import { inboxOverride } from "@/surfaces/inbox/surface";
import { peopleOverride } from "@/surfaces/people/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { reportsPeople as reportsPeopleLens } from "@/surfaces/reports/people-surface";
import { todayOverride } from "@/surfaces/today/override";
import type { SurfaceOverride } from "../surface-data";
import { drawnHere, whereDrawn } from "../surface-registry";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/override";
import { calendarRunsIfDrawn, headlineIfDrawn, ifDrawn, receptionist, reportsCampaigns } from "./lenses";

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
