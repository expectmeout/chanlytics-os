/**
 * What a write can leave stale of the workspace's channels, setup, leads and settings: the readiness the composers read,
 * a channel's change, the templates, the Google and billing panes, and the visits. refresh-map.ts's tables name them.
 */
import { calendarOverride } from "@/surfaces/calendar/surface";
import { peopleOverride } from "@/surfaces/people/surface";
import { playbooksOverride } from "@/surfaces/campaigns/playbooks/surface";
import { forgetReviews } from "@/surfaces/reports/reviews-surface";
import { settingsOverride } from "../surfaces/settings";
import type { SurfaceOverride } from "../surface-data";
import { billingOverride } from "@/surfaces/settings/billing/surface";
import { googleOverride } from "../google";
import { leadsOverride } from "@/surfaces/leads/override";
import { setupOverride } from "@/surfaces/setup/override";
import { drawnHere } from "../surface-registry";
import { reachOutsOverride } from "@/surfaces/campaigns/reach-out/override";
import {
  headlineIfDrawn,
  pinsIfDrawn,
  receptionist,
  reportsCampaigns,
  reportsIfDrawn,
  sequencesIfDrawn,
} from "./lenses";
import { audiences, composersIfDrawn, peopleIfDrawn, personAndThreads, reportsPeople } from "./people";

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
