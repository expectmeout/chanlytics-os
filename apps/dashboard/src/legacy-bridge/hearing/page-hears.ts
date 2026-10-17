/**
 * What each page hears, as a table (decision 0058): the registry's (surface-registry.ts re-exports it, and reads it in
 * ownsTheScreen, ownsTable and drawsTheScreen), kept in a module of its own because it is data a review reads row by row and a
 * change to it is one cell, with the goldens beside it (tooling/scripts/tests/baselines/hearing/).
 */
import type { RecordKind } from "@chanlytics/contracts";

/**
 * What each page hears (decision 0058, amending 0047 point 4): for each family of addresses, the surfaces whose page it is, so a
 * change to a record they hear only on their page (`fresh: "its-page"`, onlyOnItsPage) is read there and kept for their page
 * elsewhere. A surface's own kinds (`always`) and a surface that is `live` are heard on every page; this says where the rest are.
 *
 * A page's hearing is a row anyone can read, a change to it is one cell, and the goldens (tooling/scripts/tests/baselines/hearing/)
 * say what each cell costs in reads for every notice the feed sends. A family is what routeFamilyOf (surface-registry.ts) makes of an address:
 * a person's page is one family whatever the person and the tab, a Reports lens one family over any days, a Settings pane one
 * family with any row after it.
 *
 * A cell is every kind the surface hears only on its page (`true`), or some of them (`["person", "facts"]`): a page that draws
 * part of what a surface counts hears what moves that part, and leaves the rest to the surface's own page (ownsTable).
 *
 * Every family the registry names has a row, and every row is a family (hearing/page-hears.test.mjs); a page's own surface is on
 * its row; an address of no family hears nothing on its page alone (a demo page, a word nobody wrote).
 */
/** A surface's cell on a page's row: every kind it hears only on its page (`true`), or these alone, the rest left to its own page. */
export type PageCell = true | readonly RecordKind[];

export const PAGE_HEARS: Readonly<Record<string, Readonly<Record<string, PageCell>>>> = {
  // Today owns the headline its period line and Worth a look are printed from, and the replies to a reach-out its queue draws:
  // the headline moves with a message, a call or a visit while Today is open, a long wait later (surfaces/reports/headline.ts).
  // And the setup band drawn above the queue, as the first run's own page does (surfaces/setup/surface.ts): what a row states is
  // heard here, the templates, the facts and rules, a visit, a person's answer and the first WhatsApp message (S4-3). It does not
  // own the rest of what it draws (the day, the runs, the playbooks, the bell, a call, Google's line, People): People's pages of
  // contacts are the heaviest read there is, and a message on Today re-reads the three that draw messages and nothing else, and
  // Setup only while the first WhatsApp message is awaited (shell/surfaces/message-fan-out.test.mjs). What it leaves is read once as
  // its own page comes back.
  // And the counts of the lists pinned here (surfaces/today/pins-surface.ts; R10): what the lists are made of moves them, heard
  // here, where they are drawn.
  // And People's person: its rows are the steps due here and the names Worth a look gives (contracts yoursToFollowUp), so a
  // customer who says STOP, is renamed, merged or erased is read again here, where a follow-up named them as someone to send to
  // until People was opened (the wiring's second audit, W-visit-deal-5). A message or a hold on Today reads none of People.
  today: {
    today: true,
    reports_headline: true,
    reach_out_replies: true,
    setup: true,
    today_pins: true,
    people: ["person"],
  },
  inbox: { inbox: true },
  conversations: { conversations: true },
  live: { live: true },
  // The Calendar owns the campaign marks it draws over its days (surfaces/calendar/runs-surface.ts): a run made, approved or done,
  // a campaign saved or a class's mode changed is read again while the Calendar is open, and once as it comes back elsewhere.
  calendar: { calendar: true, calendar_runs: true },
  // Campaigns is Sequences' list (decision 0060), where its addresses land: it hears what Sequences hears, its own list and
  // the settings read, and none of the surfaces of the sheets it opens over the list, which hear at their own addresses.
  campaigns: { sequences: true, settings: true },
  // The composer Campaigns opens over Sequences' list (`campaigns/new…`), whole, made of four surfaces: the playbooks'
  // moments, Campaigns' own 30 days (campaign_results), the reach-outs' chains and the settings read's templates. Sent's runs
  // are drawn in it too: who can hear you, the pause on offers, the send-once composer and its Send by ticks. It hears here
  // what moves those (a person's answer, the business's facts, the rules, a channel, the plan, a visit the audiences leave, a
  // list To offers), and leaves to Sent's sheets what moves a run's replies (a message, a thread, a hold), so a message here
  // never re-reads the broadcasts and every page of People behind them (W-review-facts-rules-2).
  "campaigns/new": {
    sequences: true,
    playbooks: true,
    campaign_results: true,
    reach_outs: true,
    settings: true,
    broadcasts: ["person", "facts", "rules", "channel", "billing", "visit", "list"],
  },
  // A message in its drawer over Sequences' list (`campaigns/message:<name>`): the settings read's templates it is drawn
  // from, and the playbooks surface whose library names the call's text (W-campaign-run-template-reachout-2).
  "campaigns/message": { sequences: true, playbooks: true, settings: true },
  // The composers fill a review-link slot only where the listing keeps one, which the settings read says (parts/channels.ts
  // cmBusinessOf): the listing linked, read or dropped is heard for Settings where a composer is drawn (S1-4).
  outbound: { playbooks: true, settings: ["review"] },
  // Campaigns › Sequences (decision 0060): its own list, whole, and the settings read its step editor offers messages from.
  "campaigns/sequences": { sequences: true, settings: true },
  messages: { settings: true },
  // Sent's sheets, beside Sequences' list (decision 0060, D3), whole.
  broadcasts: { broadcasts: true, sequences: true, settings: ["review"] },
  clients: { people: true },
  segments: { people: true },
  // A person's page waits for who is looking and hears its own person (people-detail.ts personOverride): a rename, a stop, a
  // hold, their rules and business, read for the one person on screen. People's rows are drawn beside it (their name in the
  // crumbs while the person's read is out) and are not its own here: its whole book is not read again for one person.
  "clients/person": { workspace: true, person: true },
  "clients/leads": { leads: true },
  // The retired address of Leads, which lands on its scope (SURFACE_RETIRED): its own surface, as its scope's.
  leads: { leads: true },
  start: { setup: true },
  // Reports owns the Campaigns lens's read on its Overview, for the one fact it draws from it (which campaign drew the most
  // replies): the read's own rule asks for the lens and keeps what the Overview heard for it (keepForItsPage,
  // surfaces/reports/campaigns-surface.ts), read once as either comes on screen.
  reports: { reports: true, reports_campaigns: true },
  // Each lens owns the read it names, heard while that lens is on screen and on no other lens or page of Reports: a review seen for
  // the first time moves the Reviews lens's, a message, an escalation or a call the Receptionist lens's, a message, a call or a
  // note the People lens's, and a message, a conversation, an escalation or a run the Campaigns lens's.
  "reports/reviews": { reports: true, reports_reviews: true },
  "reports/receptionist": { reports: true, reports_receptionist: true },
  "reports/people": { reports: true, reports_people: true },
  "reports/campaigns": { reports: true, reports_campaigns: true },
  "reports/pipeline": { reports: true },
  "reports/ads": { reports: true },
  // Settings: a pane it does not list opens Profile, which the settings read feeds.
  admin: { settings: true },
  "admin/profile": { settings: true },
  // The Business pane lists the booking emails held for a look and states the calendar link's last read from the Calendar's read
  // (settings/business/open-bookings.tsx, open-calendar.tsx): a held email's bell row opens it, so a read of the Calendar is due
  // there, as it is on the board. Settings with no pane is this pane (SURFACE_DEFAULT_PARAM).
  "admin/workspace": { settings: true, calendar: true },
  "admin/team": { settings: true },
  "admin/autonomy": { settings: true },
  "admin/notifications": { settings: true },
  // Connections draws Setup's calendar row (the booking tool and the visits read from it) beside its lines and mailbox, which
  // Setup hears on every page: a settings save or a visit read there repaints it (the wiring's second audit, S4-3).
  "admin/integrations": { settings: true, setup: ["facts", "visit"] },
  "admin/billing": { settings: true },
  "admin/memory": { settings: true },
  "admin/activity": { settings: true },
  "admin/platform": { settings: true },
  "admin/partner": { settings: true },
  // An address that moved (ROUTES_MOVED: Setup is the first run now) draws nothing, so nothing is heard for it.
  "admin/setup": {},
};
