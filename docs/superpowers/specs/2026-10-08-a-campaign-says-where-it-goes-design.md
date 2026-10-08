# A campaign says where it goes, and is switched on there: design spec

**Status:** Built 8 October 2026, on branch `campaigns/organized-and-on-every-channel` (worktree
`cm-campaigns-2`): Ruben's word is owed on the design and on decision 5. Every local gate is green, and the bundle
budget is raised by the growth measured against main's own build (route JS +901 bytes gzipped, the Campaigns
page +1,198; `docs/debt.md`, Rises).
Written for Ruben after his ask of the same day ("analyze the campaigns page and make it better … a practical UX UI
interface that users can get their campaigns organized and turned on across anywhere applicable, from email to WhatsApp
to SMS text to call"). Written against `origin/main` at `b2271d3a4`, looked at in the real app through a write-safe rig
(`Claude Video/dev-tools/campaigns-rig.mjs`, scenarios `real`, `salon`, `salon-fresh`, `salon-email`), at 1280px and
375px. Companion review and research: `Claude Video/docs/2026-10-08-campaigns-review-and-research.md`.

**As built (differences from the design below, each for a reason met while building):**

- The head's channel line is drawn at the rail's head on a desk (and in the phone's reach tile), not under the page's
  sentence: in Glass a tab's list keeps the frame's head for a screen reader alone (a 1×1 box), so a line there is read
  and never seen, and a door in it is a link a Tab lands on and nobody sees. The frame's head carries no copy of it.
- A mark has four states, not three: `could` (the playbook may go by the channel now and does not tick it) is drawn as a
  hollow dot with its word in the faint ink, the one quiet nudge toward one more channel; a channel it neither keeps nor
  could go by is not drawn at all. A moment that is off carries no marks: what Turn on would tick depends on the message,
  which is the composer's to say. Nor does a playbook that runs nothing here.
- The composer's test file pinned "WhatsApp alone for a new playbook" in eight places; each now pins decision 5.
- Sent's two-line row holds from 641 to 840px of list (the phone's layout holds under 641, five columns from 841, which
  is where a 1280 desk stands); at 820px the name is whole and the split line reads.

**After the review of the same day** (six readers and the wider test runs; the record is
`Claude Video/docs/2026-10-08-campaigns-stack-review.md`):

- One reading of a playbook's channels (contracts `playbookChannelsRead`), asked by the marks, the drawer and the
  composer. The marks had read the workspace's readiness alone: "could also go by Text" of an offer, which no text
  carries, and "on" where the drawer said "waits".
- The drawer sends `{ channels }` alone, and `PUT playbooks/[id]` judges them against the playbook as it stands and
  writes nothing else. The design had the press re-send the playbook whole: a copy of every other field, written over
  whatever had been edited since. A press starts from what the playbook keeps, so a channel that waits is not let go.
- "Can get your messages" counts each person once, on the channel a send would reach them by. Counted under every
  channel that alone reached them, the parts added to more than the count.
- A new playbook's ticks follow the message in view until a switch is pressed. They were set once as the composer
  opened, so a playbook on a list, which has no message of its own, stayed on WhatsApp alone whatever was picked.
- A workspace paused for billing says so at the rail's head; the marks' words stay on a phone; a door is 44px to a thumb.

## 1. Goal

An owner opens Campaigns between clients and can answer, in one glance and without opening anything:

1. which channels the business can send on right now (WhatsApp, text, email), and what stops the others;
2. which channels each campaign goes by;
3. how to turn a campaign on for one more channel, in one obvious place, with one press.

Everything else the page does today stays: the lifecycle rail, the three tiles, the two rooms, the composer.

## 2. What the product does today (measured)

- **The Lifecycle home is built and good** (`surfaces/campaigns/home/`, contracts `playbooks/lifecycle*.ts`, #1374 and
  after): the rail of moments with the yes each needs, Coming up, What came back, Who can hear you, a drawer per moment,
  one composer with "Send once | Every time a moment comes". Every word is contracts' (`LIFECYCLE_WORDS`,
  `campaignsHomeOf`). The code layers are unified across channels: a message has a version per channel, a playbook and a
  broadcast carry `channels`, each recipient is reached once on one channel (`reachFor`), readiness is read per channel
  (`ChannelsReady`), the Send by row and the Library's version tabs exist.
- **But the page never says a channel's name.** On the home, the rail's moments, the strips under it, the head's
  sentence, Coming up and the drawer say nothing of channels. A playbook that goes by WhatsApp and email reads exactly like
  one that goes by WhatsApp alone. The only places a channel is named: the composer's Send by row (three switches, their
  reasons on hover, or as a line under the row on a phone) and the Library's `WhatsApp · Email · Text` chips.
- **The business's readiness is invisible here.** "1 of 1 line on" sits in the sidebar's workspace chip. Whether email is
  set up, or texting waits for the carriers, is learned only inside the composer, as a dimmed switch.
- **Turn on opens on ONE channel.** A new playbook ticks the first channel in the product's order that the workspace is
  ready on and the message holds (`cmDefaultChannels`): WhatsApp alone for a salon with email ready and an email version
  on file. Reaching a person is once, on their best channel, whatever is ticked (spec 24 Sep, decision 1), so a second
  tick never doubles a message; it only widens who is reached.
- **Sent and the drawer say the split nowhere but the run's report**: a run's row says "6 of 6 · 6 delivered · 1 reply";
  `sentByWords` ("4 on WhatsApp, 2 by email") is drawn in the report alone.
- **Who can hear you** counts over any channel (`reachCountsOf` over `canReceive.messages`): "3 can get your messages"
  does not say by which channel, so "who can I reach by email?" has no answer on the page.
- Two defects seen while looking: Sent's rows lose their names under ~900px of page (the name column collapses to
  "Br…", the state and the time stay); Coming up's "A run is waiting for your approval" wraps to three lines at 375px.
- The head's lede ("What goes out on its own as a customer reaches a moment, and what you send yourself.") is an
  explanation that is read every visit and says, on a desk, the same "N of 4 moments" the rail's head says.

## 3. Decisions

Ruben delegated the calls ("in any area you best suggest"); each is taken as recommended and can be undone by a word.

1. **Evolve, never replace.** The Lifecycle home keeps its structure, words, tokens and Glass. The change is a layer of
   channel facts on what is there (Ruben, 27 Sep: a redesign keeps the current calm vibe).
2. **One spelling per channel.** The page says a channel only through contracts' words: `VERSION_CHANNEL_WORDS`
   (WhatsApp, Email, Text), `CONSENT_CHANNEL_WORDS` (on WhatsApp, by text, by email), `CHANNEL_WORDS` (why one is closed),
   and the colours Reports already gives each (`RPT_CHANNEL_COLORS`). No new vocabulary.
3. **A quiet indicator, not a control, on the rail.** A moment's card gets one line of channel marks; the switches live
   in the drawer, one press away. Controls in a list of five would crowd the rail and invite a wrong press on a phone
   (Ruben, 22 Sep: smart indicators and subtle badges, minimal on mobile).
4. **The drawer switches channels in place.** The Send by row the composers draw (`parts/send-by.tsx`, the kit's
   Switch) is drawn in the playbook's drawer too; a press re-sends the playbook as the composer does (the PUT re-checks the
   whole playbook) with the new ticks, and a toast says it. Pause/Resume stays as it is.
5. **Turn on ticks every channel it can.** A new playbook opens with every channel the workspace is ready on and the
   message holds, not the first one (`cmDefaultChannels`). A broadcast keeps its rule (it goes now, on what can send now).
   The month's allowance and "texts carry no offers" keep holding where they hold today. **The one call Ruben may want
   back:** email and text cost Chanlytics; ticking them by default spends the allowance sooner.
6. **Readiness is said once, at the head, in words.** "Sending on WhatsApp and by email · Text waits for the carriers",
   each closed channel's words a door to Settings › Connections. The lede sentence goes (the rail's head keeps the
   "N of 4 moments covered" count; the head's sentence keeps "N of M people can hear from you").
7. **Who can hear you learns its channels.** The "Can get your messages" rung's meter is split by channel (the people
   reached on WhatsApp, by text, by email, in the channel colours), from a count made in contracts beside
   `reachCountsOf`, with the words in the meter's label and on hover.
8. **Sent's rows say the split** where a run went by more than WhatsApp alone ("4 on WhatsApp, 2 by email",
   `sentByWords`), under the row's figures; the report keeps its own.
9. **No new AI surface.** The page's one smart nudge ("Turn on · 7 tomorrow") stays, "Draft with Chanlytics" stays in
   the template composer, Ask keeps its propose tools. Nothing is generated on the home.
10. **No migration, no new route, no new table.** Every fact drawn is already on the wire (`channels` on playbooks and
    broadcasts, `sent_by` on counts, `ready` on both surfaces, the rows' reach facts).
11. **Out:** a "by channel" lens or filter on the home; the Library reordered by stage; an email-only workspace's first
    run (its home draws what it can today); the two cross-cutting items the 6 Oct audit lists (email offers dark until
    the campaigns domain, "a STOP is not a reply").

## 4. Design

### 4.1 The head

- The sentence under "Campaigns" becomes two quiet lines of facts, both contracts' (`campaignsHomeOf` → `head`):
  - **channels:** `channelsStandingLine(ready)` in a new `contracts/broadcasts/channels-standing.ts`: the open channels
    as one clause ("Sending on WhatsApp and by email"), then each closed one with its reason in the fewest words
    ("Text waits for the carriers", "Email is not set up"), each a `{ channel, open, words, door }` part so the page draws
    a dot in the channel's tone and the closed ones as a `LinkButton` to `admin/integrations`. Where the read could not
    say (`ready` null), nothing is said of channels, as the composer says nothing. Where the workspace is paused, the
    paused line the head already has stands alone.
  - **people:** the existing "N of your M people can hear from you", unchanged.
- The lede sentence is removed from the head. The phone already hides it; the desk now says facts there instead.

### 4.2 The rail

- Each moment's card (`LifecycleStage`) gains `channels: LifecycleChannelMark[]` (`{ channel, word, state: "on" |
  "waits" | "could" | "off" }`), made in `lifecycle.ts` from the playbook's `channels` (WhatsApp alone where it names none)
  crossed with the workspace's readiness: a kept channel the workspace cannot send on yet is `waits` (the composer's word:
  "It goes by it once it can"); an open channel the campaign does not tick is `could`. An OFF moment carries none.
- Drawn as one line beside the state: the channel words, "WhatsApp · Email", each with a 7px dot in the channel's colour
  (`RPT_CHANNEL_COLORS`), a `waits` mark hollow with "waits" after it, a `could` mark hollow in the faint ink, an `off`
  mark not drawn. On a phone the dots stay and the words hide (the badges' rule), the sentence staying for a screen
  reader ("Goes by WhatsApp and Email; Text waits; could also go by Email"). The strips under the rail (the month's offer,
  a list playbook, a reach-out) take the same marks after their words.
- The rail's head keeps "N of 4 moments covered", and on a desk takes the channel line at its right (4.1).

### 4.3 The drawer

- `PlaybookPane` (`playbooks/card-detail.tsx`) draws a **Goes by** row under the sentence: `CmVia` with the playbook's
  ticks (`cmViaTicks(p.channels, ready, { purpose, about }, true)`, the same function the composer calls), each switch live
  for a role that may edit (`canAct`), read-only for a viewer. A press calls `playbooks.update(id, bodyOf(p) + channels)`,
  the body the composer sends (`composer-acts.ts`), and the toast says "Visit reminder goes by WhatsApp and email now"
  (contracts `LIFECYCLE_TOAST.channels`). The reasons a channel is closed read as they do in the composer (tooltip on a
  desk, a line under the row on a phone).
- The sentence gains the clause the Coming up row already knows: "7 of 7 will get it · 4 on WhatsApp, 3 by email"
  where the pool's `by_channel` is known (`readingFor`), as `reachByWords` says it.

### 4.4 Coming up and What came back

- Coming up: no new facts. Its row's layout on a phone is fixed: the when-column keeps its width, the why wraps under the
  name at full width (a two-row grid on `[data-phone]`), so "A run is waiting for your approval" is one line.
- What came back: under the funnel, one line "84 on WhatsApp · 48 by email" from the report's `by_channel` (0030) where
  more than one channel sent, in the quiet ink; nothing where one did.

### 4.5 Who can hear you

- Contracts: `reachCountsOf` keeps its four numbers and gains `byChannel: Record<ConsentChannel, number>` for the
  "messages" rung, counted with `reachFor(row, "conversational", { channels: [c], ready, about: "theirs" })` per channel
  (a person counts under each channel they could be reached on; the rung's number stays the any-channel count).
- The rung's meter becomes the kit `Meter` with one part per channel in the channel colours over the any-channel share,
  the rest in the hairline; its label says "Can get your messages: 24 of 29 · 17 on WhatsApp, 12 by email". The offers
  rung stays one colour (offers go by WhatsApp, and by email once the domain is on).

### 4.6 Sent

- A run's row: where `counts.sent_by` names more than one channel, the figures' second line ends with `sentByWords`
  ("4 on WhatsApp, 2 by email") in the dim ink. A scheduled run says its ticks' words instead where it has them.
- The name column: under 900px of page the row keeps its name (a two-row subgrid: name + state above, the figures and the
  acts below), the state pill beside the name. The defect seen at ~800px.

### 4.7 The composer

- Decision 5 only: `cmDefaultChannels` returns every ready-and-held channel for a playbook. The Send by row is unchanged.
  The broadcast composer keeps its own default (WhatsApp alone, since it goes now).

### 4.8 The phone

- The rail's rows and the strips show the marks as dots after the state words; the drawer's Goes by row is the same
  switches at 44px; the head's channel line is one line under the people line, the closed channels' words truncating
  before the open ones do.

## 5. What does not change

The send path, consent, `reachFor`, the allowance, the gates; the composer's rows and words besides decision 5; the
Library and the version editor; the run report; Ask's tools (their fixtures freeze their bytes); the routes and addresses;
the kit (no new component: Switch, Meter, LinkButton, StatePill as they are).

## 6. Parts (one local branch, one PR when Ruben says)

T1. Contracts words and facts: `channels-standing.ts` (`channelsStandingLine`), `LifecycleChannelMark` on stages and
    strips, `head.channels`, `reachCountsOf.byChannel`, `LIFECYCLE_TOAST.channels`, the results' by-channel line. Tests
    beside `lifecycle.test.mjs` (every state of readiness; a playbook naming no channels; a kept channel that waits).
T2. The home: head lines, rail marks (desk and phone), strips, Who can hear you's split meter, What came back's line,
    Coming up's phone layout. `campaigns-home.test.mjs` pins the marks and the head; `campaigns-glass.test.mjs` if the
    stylesheet's measures move.
T3. The drawer: Goes by row, the save, the toast; `playbook-composer.test.mjs`-style page test over the stub React for
    the press and the refusal; the composer's default (decision 5) with its test.
T4. Sent: the split line and the narrow row; `broadcasts.test.mjs` pins the words.
T5. Specs: `e2e/campaigns/playbooks.spec.ts` reads the marks and the Goes by row on the nightly workspace;
    `e2e/phone.spec.ts` the phone's marks. The rig scenario `salon` for the look (not in the repo).
T6. Docs: `docs/system-prd.md` §Campaigns, glossary ("goes by"), this spec's status block, the bundle budget raised with
    its Rises row if the route grows past the band.

## 7. Tests

- Contracts: the standing line for the eight combinations of three channels; marks for on/waits/off; the by-channel
  count agrees with `reachFor` per channel; the toast's words.
- Page: the rail draws a mark per channel in order; the drawer's switch sends the composer's body with the new ticks and
  draws the toast; a viewer sees read-only switches; the head draws doors only for closed channels.
- Database: none (no migration).
- Browser: the salon scenario on the rig, desk and phone, every state (`real`, `salon`, `salon-fresh`, `salon-email`).

## 8. Risks

- The drawer's save re-checks the whole playbook: a playbook whose message was since hidden or whose list was archived
  is refused by the server's own words; the toast says them and the switch returns.
- Decision 5 raises email and text spend for a workspace that turns moments on without looking at Send by; the composer's
  allowance line and the head's "from half used" line stand, and the row's reasons stay.
- The Campaigns route's JS and CSS budgets (`baselines/bundle-budget.json`): the marks are a few hundred bytes; the split
  meter reuses the kit's. Measured at the end, raised with a Rises row only if needed.
