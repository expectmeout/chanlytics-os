# 0073 · The first run is five steps, and connected means filled

**Status:** Decided 25 October 2026, and built on the lane `onboarding/rewired-end-to-end` from main's `4b19a8457`
(#1821), with decision 0069 (lanes 1 and 2) carried in, and merged with it in #1829 on 25 October 2026 (its migrations
00477 to 00480; 0069's is 00476). These are lanes 3 to 7 of the onboarding rewiring plan (21 Oct 2026, "Hear it, fix
it, go live", Version 5), and Version 23 of the onboarding canvas's copy is what each screen draws. Ruben, 25 October:
"continue locally … until fully complete all lanes in full with all bells and whistles nothing missed". Where this note
and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

- **The first run is four steps** (`business`, `phone`, `try`, `live`; first-run-route.ts). The number is bought in the
  middle of the second, before the owner has heard the receptionist, and the third is a real call on the real line.
  Decision 0069 built the browser call, the review and the fix, and left the first run's own Rehearse step to this lane.
- **Choosing and spending are one press.** The phone step's button starts the plan and buys the number; the owner's
  choice lives in the tab, and in their saved view only for a number kept or moved (`views.setup.phone`).
- **Nothing is brought in.** After the steps People is empty, the Inbox has no past and Connections reads Not connected
  on everything but the line: the clients' file is People › Add people only (CSV, three columns), the calendar link
  keeps 90 days, the mailbox reads from "now", reviews stop at 250, and WhatsApp starts empty.
- **How it sounds is one text field and a voice.** Tone is free text; pace, a name and walk-ins have no field.
- **Pay leaves the app** (Stripe's hosted Checkout), and the first run's trial is 0 days (Ruben, 25 Sep 2026).

## Decision

### The order (R8)

1. **Five steps:** `business` (Your business), `receptionist` (Your receptionist), `rehearse` (Rehearse), `channels`
   (Where it answers), `live` (Go live). The phone's line says "2 of 5 · Your receptionist". Each step is done when:
   - **Your business:** a receptionist is set up (Setup's `check.receptionist`), from Find, Connect Google (R17) or the
     basics. Check's rows move to step 2.
   - **Your receptionist:** the facts row is ready (a name, hours, services) and the owner went on from it ("Rehearse it
     now", `RECEPTIONIST_MET` in their put-off list), or calls already answer. Going on asks the edge for the
     workspace's agent (R1, `POST receptionist/agent` → `ensureVoiceAgent`), so the first call starts at once; a
     deployment with no voice provider goes on without one.
   - **Rehearse:** a conversation reviewed (Setup's `rehearsal.reviewed`), or skipped after one nudge
     (`REHEARSE_SKIPPED`), or calls already answered before this lane.
   - **Where it answers:** a calls choice saved (the saved view's `phone`, now keep, move or new with the number picked),
     or a line already there or asked of a person. On a deployment that sells no numbers (no lines provider, Setup's
     `numbersHere` false) there is nothing to choose: the owner's going on is the step (`CHANNELS_SEEN`), and a mark kept
     from such a day never stands in for the choice once numbers can be bought. Go live then says a person sets the line
     up, and names as going live now only what is connected (WhatsApp's number, a mailbox), never what is not.
   - **Go live:** the plan runs (or the workspace pays directly), the line answers, no forwarding is owed, and a call
     came in or the check was put off (`TRY_SKIPPED`).
     Nothing is stored but the member's own put-off list and saved choice, as before: the step is worked out from Setup.
2. **Where it answers chooses, Go live spends.** Step 4 saves the owner's choices (calls, the forwarding mode, WhatsApp,
   the booking tool's link and its clients, the mailbox) and buys nothing; step 5 pays, buys the number in the area the
   choice names, shows the forwarding code, and listens for the owner's own call as the proof (the test window that
   exists), then asks who a caller who wants a person is put through to (Try it's question, kept).
3. **The real call is Go live's "Check my line"**, not a step of its own.
4. **Today's card** says, while a step is open, where the owner left off and what is kept ("Kept for you": the
   business, the voice, what it was taught, the rehearsal); while going live, the rows that need the owner first (the
   code, WhatsApp); after, Setup's rows as before.

### How it sounds (R7, and step 2)

5. **Pace** is `profile.phone_pace` (`slower`, `a_bit_slower`, `natural`, `a_bit_faster`, `faster`): each call's
   `agent_override.agent.voice_speed` (0.85, 0.92, 1, 1.08, 1.15), on a real call and a rehearsal alike, as the voice is.
   Absent is the agent's own pace. The converger is untouched.
6. **Personality** is four presets written into `tone` (warm, polished, upbeat, calm: a tone line each, and a sample
   reply the page shows); any other tone is "your own words".
7. **A name** is `profile.assistant_name` (optional, 40 at most): the standard greeting says "I'm Ava, the automated
   assistant" and the prompt's first line names it. Absent, every greeting and prompt is byte for byte what it was. The
   greeting rule (0051) still holds: the automated-assistant clause is said whatever the name.
8. **Walk-ins** is `booking_rules.walk_ins` (`yes`, `room`, `no`), one sentence of the booking rules. Absent, nothing.
9. **The price question** is Settings' own three answers (`PRICE_CHOICES`: the prices written, never, hands it to you),
   not the canvas's "a range", which no field holds.
10. **"Hear it"** plays the provider's own sample of the voice; nothing speaks the greeting but a call, so the rehearsal
    is where it is heard saying it.

### Rehearse in the first run (R5's third place)

11. Step 3 draws decision 0069's parts on a page of their own: Talk (`BtTalk`), Type (`BtTyped`) and How it did
    (`RehearsalReview`), with what it reads from beside the call, the booking link shown and not sent, the free minutes
    said, the microphone and a dropped call. "Looks good, go on" is the step's onward; "Trained: n things" is read from
    Setup's `rehearsal.kept`.

### Pay in the page (R16) and the trial (R9)

12. **The trial from the first run** is `FIRST_RUN_TRIAL_DAYS` in contracts' billing: 0 (Ruben, 25 Sep 2026: a number is
    a cost whether a trial pays or not), read by the edge's checkout and said by every screen, so a screen never says a
    trial the checkout does not give. Fourteen is that one line; it is spend, so it is his call.
13. **Checkout embedded:** the edge's checkout takes `embedded: true` and makes the session with `ui_mode: "embedded"`,
    `return_url` back to `start/live` and `redirect_on_completion: "if_required"`, and answers its `client_secret` and
    the publishable key (`STRIPE_PUBLISHABLE_KEY` on the edge, beside the secret). The page loads Stripe.js from
    js.stripe.com on the step (behind `legacy-bridge/billing/embedded.ts`, the CSP naming it) and mounts it in place;
    the webhook that starts the plan is unchanged. Without the key the hosted page is used, as today.

### Bring your clients (R22), and the record of what was brought (R23)

14. **The clients' file** is People's import sheet, opened from step 4's booking tile and a Today row until done, with
    the named tool's own export steps. The reader takes CSV and Excel (`.xlsx`, read in the browser: the zip opened by
    the browser's own `DecompressionStream`, the sheet by `DOMParser`; no dependency), and finds seven columns: name,
    mobile, email, last visit, visits, birthday, notes.
15. **What the file says of a person** beyond name, number and address is kept on them as before Chanlytics: notes into
    `contacts.notes` where it is empty; last visit, visits and birthday in `contacts.before` (who said it, and those
    three), through `person_before_note` on the member's session, filling only what is empty, and scrubbed when the
    person is erased. The person's page says it in one line ("Before Chanlytics · 12 visits · last Apr 23 · birthday
    Mar 14 · from Vagaro's file"). Never a yes (D16), never counted as today's (D15).
16. **`imports`** holds one row per workspace and source (`google_reviews`, `calendar`, `clients_file`, `mailbox`,
    `contacts`, `whatsapp_contacts`, `whatsapp_history`): its state, counts, how far back it reached, its parts, its last
    error. The jobs and the import route write it through `import_ledger_note` (a definer door); members read theirs.
    Step 4's "Bringing it in", Today's "Brought in" and Connections' sentences read it; a failed part says so on its row,
    with Try again (`POST imports/again`, which starts it again from where it stopped), except what Meta offers once
    (31).

### The call link is honest (R14)

17. On a call the receptionist asks "Do you use WhatsApp on this number?" before it sends the booking link, offers no
    link while the booking-link message is not approved by Meta (the runtime's `known.booking_message`, read beside the
    templates), and the tool waits for the send's own answer (about three seconds, Meta's receipt on the message) so a
    failure is said while the caller is still on the line: delivered, sent, or "it didn't go through, here is the number".

### The mailbox brings six months, its people and its calendar (R13, R19, R20)

18. **One consent, what was ticked.** Connecting Gmail or Outlook asks for the contacts, the other contacts and the
    calendar beside the mail; none is required, and only what the owner left ticked is read (channels `grantHolds`).
    Google keeps one app: every consent adds to the grants already given (`include_granted_scopes`, R18).
19. **Six months of mail from people** are read a page at a time (Gmail's `after:`/`before:`, Graph's
    `receivedDateTime`), as parts of the `history_import` job (00478; a part reads 40 seconds, then hands on). Each
    message goes into its person's thread through `ingest_before`: the person resolved as a client list's would be
    (asserted, an import, so the erased stay erased), the thread made or found and never reopened, the message kept
    once by its provider id, marked `meta.backfill` and handled. Newsletters, receipts and delivery reports are read and
    dropped, and counted. Mail the owner sent to one person is kept as theirs, outbound.
20. **From now on**, the mailbox's sync takes in people's mail outside known threads too (R13). Nothing is sent: each
    email waits in Need you with a reply drafted (decision 0071's drafts ahead, which is R15 built), and the reply goes
    from the mailbox the email came to.
21. **Its people:** Google's contacts and other contacts, Outlook's contacts, into People as a client list's are, never a
    yes.
22. **The calendar by consent (R20):** a mailbox connected with its calendar ticked becomes the workspace's calendar
    (`calendar_grant` in the config, written by `calendar_grant_note`; a grant wins over a link, and removing the
    mailbox takes it away). It is read as a feed made from the provider's events (Google's calendar list and single
    events; Outlook's calendars and calendar view), 180 days back and 90 ahead (`SEASON_BACK_DAYS`), on the calendar
    sweep's clock and once as the mailbox connects; its key is `mailbox-calendar:<provider>:<id>`, and the dashboard's
    openings read it through the edge (`/api/admin/calendar/feed`).
23. **The hosted mailbox** offers no new address: Setup's email row offers connecting the owner's own mailbox, and a
    workspace with a hosted address keeps it. Its inbound webhook and routes stay until Ruben's word (delete nothing).
24. **A booking tool's notices are not read from a connected mailbox:** a copy in a mailbox carries no proof of who sent
    it, so the visits come from the calendar.

### Connect it to Google at step 1 (R17), what the profile and the website say (R10), the line type (R11)

25. **After "That's us"**, an owner on a deployment that connects Business Profiles is asked whether they manage the
    business on Google: Connect Google (Google's window, and back to Your business: the state's `b`), Someone else
    manages it (who can add them), or Not now (`GOOGLE_CONNECT_LATER`, the member's own; Setup's row keeps Connect).
    Back from Google: what came in (every review as the ledger counts it, the hours, the services and prices the profile
    lists, new reviews within the hour on the bell); an account that manages no location of the business: who can add
    them, Try another account, or Go on without it. The connect binds the linked listing's place among the account's
    locations without asking.
26. **The first sync** reads up to 40 pages of reviews (`GBP_REVIEWS_FIRST_PAGES`, 2,000), noted on the ledger's
    `google_reviews` row.
27. **What the profile says** (the location read with a wide mask: hours, holiday hours, phone, website, categories,
    description, services with prices) and **what the website says** (the home page and two pages it links, read by
    Haiku with Sonnet behind it, purpose `website_read`, on the platform's key) are kept in `business_reads` (00479),
    one row each, and offered at Your receptionist as "Found for you": a press each adds a service, a closure, a booking
    rule, an answer or the business's description as a note. Nothing is written without the press. The website is read
    as a listing is linked, as the profile connects, and when the website changes in Settings.
28. **"Your workspace, building"** stands beside Find and Connect Google on a desk: each line a fact the page holds.
29. **The line type (R11):** Twilio Lookup's line type intelligence (`POST lines/lookup`) names the carrier and whether
    the number is a mobile, so Where it answers shows that carrier's forwarding codes.

### WhatsApp keeps the app (R12), and its history comes in (R21)

30. **Keeping the WhatsApp Business app** is offered where the deployment's Embedded Signup configuration offers it
    (`META_ES_KEEP_APP=1`, a v4 configuration made in Meta's dashboard): at Go live, with Meta's steps said before its
    window and what declining to share means, and in Settings' Connections beside Connect. It is Meta's own flow
    (`featureType: whatsapp_business_app_onboarding`); the number is never registered again (registration
    `coexistence`), and the owner's replies in the app arrive as echoes and pause the receptionist, as they did.
31. **As the number connects**, the edge asks Meta for the app's contacts and chats (`smb_app_data`, once each, inside
    the 24 hours Meta allows) as `history_import` parts. What Meta sends arrives on the webhook (`smb_app_state_sync`,
    `history`), which keeps the delivery (the intake ledger) and hands it on by its key; the parts bring it a slice at a
    time: the contacts into People, the chats into their threads through `ingest_before`, as before Chanlytics. The
    ledger's `whatsapp_contacts` and `whatsapp_history` rows count them, the chats in Meta's three parts. A history
    declined in the app (Meta's 2593109), a window passed or a refusal is said on the row with no Try again: Meta offers
    it once. A run Meta goes quiet on is done a day and two hours after it was asked.
32. **Go live** shows the chats in Meta's three parts (5B·i): the day before, back to 90 days, back to six months.

## Consequences

- **Tables:** `imports` and `contacts.before` (00477); `business_reads` (00479). Migrations 00477, 00478, 00479 and
  00480 (the imports ledger, what the profile and the website say, and 0069's rehearsals told to their workspace as every
  watched table is, so "Bringing it in", Found for you and Rehearse move without a reload), after 0069's 00476.
- **Jobs:** `history_import` (the mailbox's mail, its contacts, its calendar, WhatsApp's contacts and chats) and
  `website_read`, each with its handler, its CHECK and its lane; model purpose `website_read`.
- **Doors:** `import_ledger_note`, `person_before_note` (00477); `ingest_before`, `calendar_grant_note` (00478); the
  edge's `/api/admin/rehearsal/agent`, `/api/admin/imports/again`, `/api/admin/calendar/feed` and
  `/api/admin/imports/website-read`; the dashboard's `POST receptionist/agent`, `POST imports/again`, `POST lines/lookup`, and
  `GET google/connect?back=start`; the checkout's `embedded`; the WhatsApp connect's `keep_app`.
- **Environment:** `STRIPE_PUBLISHABLE_KEY` and `META_ES_KEEP_APP` on the edge; the Google pair falls back to
  `GOOGLE_OAUTH_*` for the mailbox's Google consent.
- **Words:** every sentence is contracts' (first-run.ts and its step modules, imports/), as the first run's always were.

## Owed

- His word on the trial (12), and `STRIPE_PUBLISHABLE_KEY` set on the edge for the embedded checkout (13).
- Google's and Microsoft's app filings for the scopes asked (18, R18): Google `business.manage`, `calendar.readonly`,
  `contacts.readonly`, `contacts.other.readonly`, `gmail.readonly`, `gmail.send`; Microsoft `Mail.ReadWrite`, `Mail.Send`,
  `Calendars.Read`, `Contacts.Read`.
- Meta: a v4 Embedded Signup configuration offering the business app, `META_ES_KEEP_APP=1` on the edge, and the app's
  webhook subscribed to `history`, `smb_app_state_sync`, `smb_message_echoes` and `account_update` (30, 31).
- His word on retiring the hosted mailbox's inbound webhook and routes (23).
