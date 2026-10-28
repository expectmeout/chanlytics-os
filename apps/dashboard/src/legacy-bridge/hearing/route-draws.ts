/**
 * What each route draws beside its own surface, and what its first draw waits for, as tables: the registry's
 * (surface-registry.ts re-exports them, and reads them in routeDrawsFor and routeSurfaces), kept in a module of their own
 * beside what each page hears (page-hears.ts), because each is data a review reads row by row and a change to it is one row.
 */

/** A person's page, as ROUTE_DRAWS names it. */
export const PERSON_ROUTE = "clients/person";

/**
 * What a page draws from surfaces other than its own, in the order the page
 * draws them, so a boot on that page reads them right after its own surface
 * (surface-runner.ts screenRank) rather than in the runner's fixed order.
 *
 * Today draws the day beside its queue from the calendar, the queue's runs from
 * broadcasts, the card's period line and Worth a look from the reports headline (one small read, never the whole report), the day's
 * playbook rows, the bell's rows for While you were away, a call in progress
 * from live, the card's Setup and Google lines, and from People the day card's
 * needs-someone flag and channel glyphs and Worth a look's people -- last,
 * because contacts is the heaviest read; the bands that read it draw without it
 * and again when it lands (surface:clients). Measured on the salon
 * (22 Sep 2026): the calendar was read eleventh, behind Settings, People and
 * Leads that nobody was looking at, so the day popped in 1.6 s after the queue
 * beside it. The Calendar draws its campaign marks from their own span read. A
 * route absent here draws only its own surface.
 */
export const ROUTE_DRAWS: Record<string, readonly string[]> = {
  // What the first draw waits for comes first (ROUTE_WAITS, below), in the same order: the boot reads these four at a time,
  // and one behind a read of the stream's second tier (People, the playbooks: up to two seconds) held the page for it.
  // Setup first: what is left to set up is drawn ABOVE the queue (surfaces/today/pages/setup-card.tsx TodaySetup), and read seventh it
  // landed after the queue and pushed it down (Ruben, 24 Sep: "does not load properly like the rest of the page").
  today: [
    "setup",
    "calendar",
    "broadcasts",
    // A reply to a reach-out, read: its queue row and the bell's door (Reach out Part 5, PR 8).
    "reach_out_replies",
    "google",
    // The drafts Ask kept for the rows of Need you, read with the page so each row draws with its words (surfaces/today/
    // need-you/drafts-surface.ts; decision 0071).
    "reply_drafts",
    "reports_headline",
    "playbooks",
    "notifications",
    "live",
    "people",
    // The line and the runs' number: Live's strip and Sent's are made of the channels read (surfaces/channels/surface.ts).
    "channels",
    // The counts of the lists pinned here, read on their own (surfaces/today/pins-surface.ts; R10): People's are as of its
    // last read, which nothing on Today reads again.
    "today_pins",
    // Ask's ideas in Need you: the member's morning with Ask, read on its own (surfaces/today/ask-morning-surface.ts; decision 0070).
    "ask_morning",
  ],
  // The Calendar's campaign marks (surfaces/calendar/runs-surface.ts): their own span read, on demand. It read People's whole
  // book here for one pill and the deal beside a visit; the visit's person now carries those facts on the board's own read
  // (contracts calendar-person-facts.ts), so a cold Calendar reads no People.
  calendar: ["calendar_runs"],
  // The first run's receptionist card fills in from the settings read: the brain and the resolved numbers. Try it
  // watches the Live page's calls for the test call (first-run-try.ts).
  start: ["settings", "live"],
  // A person's page reads its own person (people-detail.ts), which the document's head started and which names them in the
  // crumbs; People's rows come after it, for where they stand in the list ("‹ 4 of 24 ›") and what their row says of them.
  // People read first was everyone's every page ahead of the one person drawn: half a second of the database's for 330
  // people (the People load review, 28 Oct 2026). The person surface is the page's own read, heard there.
  [PERSON_ROUTE]: ["person", "people"],
  // Get their yes, a sheet over People's list (`clients/get-yes`, the Campaigns wiring review's lane 7): the number and the
  // opt-in its code carries are Sent's read (campaigns/broadcasts/surface.ts), beside People's own.
  "clients/get-yes": ["people", "broadcasts"],
  // A reply to a reach-out, read: the Inbox's strip, composer line and row chip (Reach out Part 5, PR 7). A call in a
  // thread is drawn from the calls Conversations reads (surfaces/inbox/thread/call.tsx tlCallFor), the same door as the Inbox's own.
  // And Sent's runs: the Needs-you rows and the badge say the runs waiting for your word (needs-you.ts), on the Inbox. Their own
  // read, nothing of People, started from the document's head with the Inbox's (the Inbox's run review, 18 Oct 2026).
  inbox: ["reach_out_replies", "conversations", "broadcasts"],
  // A reach-out's chains are Playbooks' rows, and their emails Templates' email rows (Part 4 PR 8): the reach-outs
  // surface, read beside each page's own.
  // And the number a moment goes out on, its standing and its opt-in: the channels read, which the composers are made of.
  outbound: ["reach_outs", "channels"],
  // Campaigns is Sequences' list (decision 0060): its own address, a group's (`in:<group>`) and a campaign's (`moment:<id>`)
  // land there, and draw what Sequences draws beside its list, the settings read. The sheets it opens over the list draw
  // theirs at their own addresses (below), so a landing reads none of them (the Sequences phone review's Reads on landing).
  campaigns: ["settings"],
  // Sequences (0060) draws its own list, read as the view comes on screen (onDemand), and the settings read: its preview's
  // switch, and the messages a step may send (offered-templates.ts).
  "campaigns/sequences": ["sequences", "settings"],
  // A run at its home under its sequence (`campaigns/sequences/<id>/runs/<run>`, the Campaigns wiring review's lane 2): its
  // screen is the run's pane, made of Sent's runs (where it sits among those waiting, its acts), the playbook it is a day of
  // and its template's message (the playbooks and settings reads), the channels read its sheet names the number by, and who
  // each audience reaches (Send it again), last and never waited for.
  "campaigns/sequences/runs": ["sequences", "settings", "broadcasts", "playbooks", "channels", "audiences"],
  // The one New beside Sequences' list (`campaigns/sequences/new…`, decision 0065): its own list and the settings read, as
  // Sequences draws, and Campaigns' moments, lists and their counts (the playbooks read, made with the channels read), which
  // its who sheet and its starts offer. It reads the searches whose leads are ready itself, as it opens.
  "campaigns/sequences/new": ["sequences", "settings", "playbooks", "channels"],
  // Messages says which playbooks send each message, and its number notice and a message's drawer are the channels read's.
  messages: ["reach_outs", "playbooks", "channels"],
  "campaigns/messages": ["reach_outs", "playbooks", "channels"],
  // Sent's sheets stand beside Sequences' list (decision 0060, D3), and a run's names its playbook. Send it again on a run that
  // went offers its list where it can still be sent to: who each audience reaches, last, since it is every page of People, and
  // never waited for (the sheet draws from Sent's runs alone, and the button joins it once that is in).
  broadcasts: ["sequences", "playbooks", "channels", "audiences"],
  // Live's line, its number and its switch: the channels read, which Live is made of beside its calls.
  live: ["channels"],
  // The Reviews, Receptionist, People and Campaigns lenses draw their own reads beside Reports' (surfaces/reports/reviews-surface.ts,
  // receptionist-surface.ts, people-surface.ts, campaigns-surface.ts): no other lens of Reports does, and the Pipeline's row says so
  // (an empty one), or it would fall to the page's.
  "reports/reviews": ["reports_reviews"],
  "reports/receptionist": ["reports_receptionist"],
  "reports/people": ["reports_people"],
  "reports/campaigns": ["reports_campaigns"],
  "reports/pipeline": [],
  // The Ads lens (a demo session's, from the Ads sample) reads nothing of its own: an empty row, or it would fall to the Overview's
  // read of the Campaigns lens.
  "reports/ads": [],
  // The Overview draws the Campaigns lens's reads for one fact, which campaign drew the most replies (the page makes it from
  // `campaigns.sources`): the page's own row, which the Overview and a lens with no row of its own fall to. It is read as the
  // Overview comes on screen and again when it has aged, never for each burst of messages (campaigns-surface.ts heardOnTheLens).
  reports: ["reports_campaigns"],
  // Settings' Connections pane draws Google's listing and its connection beside the settings read, as Today's card draws its
  // review line (`google` is read where one of the two is on screen, legacy-bridge/google.ts): no other pane of Settings does.
  // Its WhatsApp and phone rows are the channels read's (surfaces/channels/surface.ts).
  "admin/integrations": ["google", "channels"],
  // Settings' Notifications pane draws what reaches the member's own phones beside the settings read (decision 0040).
  "admin/notifications": ["alerts"],
  // Settings' Memory pane draws what Ask remembers and its journal beside the settings read (decision 0070).
  "admin/memory": ["ask_memory"],
};

/**
 * What a page's first draw waits for besides its own surface: a band drawn ABOVE the page's own content, which would
 * push that content down if it landed after it. Today draws what is left to set up above its queue. A wait that
 * failed is over (the band says so where it would be, or draws nothing), and a wait never makes a page unavailable:
 * that is its own surface's to say, and a page whose own surface is in draws after ROUTE_WAIT_MS whatever else is
 * still out (surfaces/frame/app-shell.tsx).
 */
export const ROUTE_WAITS: Record<string, readonly string[]> = {
  // And everything else that stands above the queue or in it: the strip over the page (the calendar's weeks), Going today
  // above the queue and the seat a run takes in it (Sent's runs), a row read as a reach-out's reply, a review to answer
  // (Google's) and the words of each row (the drafts Ask kept). Each landed after the queue on a cold load and moved it: the
  // strip in 18 of 41 phone loads, the runs and reviews 400 to 600 ms after it, the drafts after the queue had drawn, 181
  // and 397 px each on a desk (the Today load review, 27 Oct 2026). Each is a small read the head starts with Today's own
  // (contracts PREFETCH_READS); People's book, read last, is waited for by none of it.
  today: ["setup", "calendar", "broadcasts", "reach_out_replies", "google", "reply_drafts"],
  // The Inbox's rows of the runs waiting for your word stand above its threads: landing after them, four pushed them 330px down
  // on a phone (18 Oct 2026). Sent's runs read nothing of People and leave from the document's head with the threads.
  inbox: ["broadcasts"],
  // Reports' strip of lenses is decided from the workspace list (the role of who is looking: a lens is shown from its
  // rung up) and draws above the page's body, so a list that landed after it would add a tab to a strip already drawn.
  reports: ["workspace"],
};
export const ROUTE_WAIT_MS = 3000;
