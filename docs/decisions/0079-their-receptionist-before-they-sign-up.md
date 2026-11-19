# 0079 · Their receptionist, before they sign up

**Status:** Decided by Ruben on 30 October 2026, built on 31 October 2026 (#1968, migration 00497 on production; its
spend guards #1971) and switched on in production that day (`LEAD_PREVIEWS=on`). The design brief was approved with its
spend ("Approve, write spec"). Spec `docs/superpowers/specs/2026-10-30-their-receptionist-before-they-sign-up-design.md`, plan
`docs/superpowers/plans/2026-10-30-their-receptionist-before-they-sign-up.md`, lane
`leads/their-receptionist-before-they-sign-up`. Written against main's `5d7e3d533` (#1960), and verified against the
code at it.

## Context

A cold email asks a business to imagine the product: step one carries no link (0056), and step two describes what the
product does. Every part that would show a business its own receptionist instead is built, and each is keyed on a
workspace:

- **Try it:** the eval door, `apps/edge/lib/receptionist/eval.ts`. It writes nothing, sends nothing, answers a
  workspace with no line as its chat would, and says what the live turn would do with each reply.
- **The browser call:** the rehearsal door, `apps/edge/lib/voice/rehearsal-call.ts`. It makes the agent before any
  number and counts the free minutes.
- **The first receptionist from a listing:** contracts `firstReceptionistOf`.
- **The website read (0073) and the look it wears (0075).**

The dashboard asks the edge with `user: null` for a call about no person (`apps/dashboard/src/server/edge.ts:119`). A
workspace's delete erases it whole: 83 of 87 foreign keys to `tenants` cascade, and the other four set null.

## Decision

1. **A preview is a workspace with the status `preview` and no member,** built from a lead the workspace marked `ours`
   (00469) is writing to: its listing through `firstReceptionistOf`, its website read and worn, and prices never
   quoted. It is left out where `test` is, has no public pages and no billing row, and is counted apart in the Console.
2. **A sequence carries it in one new slot, `{{their preview}}`,** the eleventh, from step two on.
   - It is the step's one link, and its email signs with the Signed line.
   - A send that names it for a lead with none makes the preview and waits for it (`preview_building`, a hold). One
     whose preview could not be made skips that lead's email (`no_preview`).
3. **The page is `/preview/<token>`:** the business's own receptionist in its look, with Text it (Try it's door), Call
   it (the rehearsal's door), What it knows (each fact's source, with Not right), and Make it mine. It answers 20
   messages and six minutes of calls (three at most in one), and lasts 30 days from the first email that carried it.
   Then its agent, its workspace and its words are erased, and its counts are kept.
4. **Make it mine is the sign-up page with the preview's link for an invite code** (`/preview/<token>/mine`, sign-up's
   screen with the preview read on the server).
   - The claim seats the claimer as owner, makes the workspace active and opens its first run where it stands.
   - The first claim wins.
   - The lead becomes converted (`claimed`), and its sequences end with why `made_it_theirs`.
5. **The sender sees it on the lead:** opened, tried, what they said was not right, made theirs. Today raises a lead who
   tried theirs.
6. **The edge's `LEAD_PREVIEWS` switch** builds nothing until it is on.

## Shape

- **The database:** one migration.
  - `tenants_status_check` takes `preview`.
  - A new table, `lead_previews`, on the sender's workspace, read by its members.
  - The doors `preview_make`, `preview_built`, `preview_sent`, `preview_opened`, `preview_said`, `preview_called`,
    `preview_not_right`, `preview_claim` (the claimer's) and `preview_end`.
  - `slug_for_workspace` is lifted out of `create_workspace_for`.
  - `lead_convert_by` takes `claimed`.
  - The job kind `preview_build`, and the hourly `previews-sweep`.
- **Contracts:**
  - `previews/`: `leadAsListing`, the page's and the line's view models, the starters, the words
  - `imports/found-adds.ts`: Found for you's adds, shared with the build
  - the slot
  - the rehearsal's preview window
  - `hasPublicPages` and the Console's verdict
  - sign-up's preview token
  - Today's row
- **The edge:**
  - the build job
  - `readWebsite`, lifted out of the website reader
  - the sweep and Retell's two deletes
  - the sender's hold
  - the rehearsal's window and its end's count
- **The dashboard:** the page and its four public routes, the claim route, the sender's lead route, sign-up's preview,
  the lead sheet's line, Today's read and row, the step editor's slot, and one line in Ask's drafter.

## Steps

One pull request, in the plan's order:

1. L1, preview workspaces and their build
2. L2, the page
3. L3, Call it
4. L4, Make it mine
5. L5, the slot and what the sender sees

The migration is applied to production before the merge (`land --applied`), and `LEAD_PREVIEWS` is set on the edge
after it.

## Tests

The spec's "What proves it". In short:

- The adapter, the views and the slot are pure tests.
- The doors are a database suite: make, say up to 20, claim once under a race, end.
- The build, the sweep and the sender's hold run over fakes.
- The page and its routes run over stub React and a fake database.
- Sign-up's preview runs under each posture.
- One walk in the real app: made, texted, called, claimed, first run.

## Risks

- **A link is a capability:** whoever holds it may claim. It is only ever sent to the business's own checked address,
  is unguessable (128 bits), is unindexed, and sends no referrer. The claim still asks for a code sent to the address
  the claimer gives.
- **Spend:** at most about $1.10 a preview, platform-paid. Expected $15 to $45 a month at ten step-two emails a day.
  The switch turns it off.
- **A preview's facts can be wrong:** a lead's hours that don't read whole are left out, prices are never quoted, and
  "Not right" reaches the sender.

## Open questions

- Retell's delete paths for an agent and its LLM, read against its API reference at the build.
- Whether a partner's workspaces make previews, credited at claim (0016): a later step.

## Amended, 14 November 2026: their first minute

Ruben's canvas of 11 November ("Their receptionist: heard in one press, theirs in a minute") put the page's first
minute second in its build order. This part of it is built:

- **It follows the visitor's device.** The page opened dark for every business, because a device that has chosen
  nothing wears the app's default and a business owner's has chosen nothing. A page a stranger opens from an email
  (`/preview/` alone, contracts shell/chrome/theme.ts) is now drawn in the device's theme, light where the device
  cannot say, whatever this device keeps for the app (the theme's boot script, before first paint).
  The booking page and the other public pages keep the app's rule for now.
- **It is theirs on sight.** Their Google photo (the lead's `image_url`, drawn only from Google's own host) across the
  top with their mark over it, and their name alone as the heading.
- **Hear it first.** Calling it comes before texting it.
- **It speaks first.** The chat opens on its greeting as their business, which always says it is the automated
  assistant (decision 0051's rule); the greeting is shown, never stored or counted.
- **Only questions it can answer.** The starters come from what it knows (a service it lists, a day it is closed or its
  hours, where it is) and fall back on "Can someone call me back?". Never a price, which it refuses, and never a visit
  time, since many businesses come to the customer.

Not yet: the greeting as a recording heard with no microphone asked. The phone's voice (MiniMax's Tamsin, through
Retell) has no source for a clip in the same voice, and a clip in another would not sound like the call.

## Amended, 18 November 2026: one page, the call read back, and what they would get

Ruben's canvas of 17 November ("Their preview, redesigned") rebuilt the page end to end, on four tests run against
production first (a typed answer in under four seconds; a call live in under four; an emailed code that makes a
preview theirs; the call's own client tells the browser none of its words). What is built:

- **One page shaped like AI's home.** Call it leads until they have tried it, then Make it mine does. What it knows is
  up front as its facts, one it lacks among them, each put right in place (the not-right door, which puts a fact right
  in the preview's record where they say what is right). One field under one conversation: a customer's question, or,
  where an answer would have come to the business, a thing they tell it (the tell door). A call and a thing told are
  lines of that conversation for the visit they happen in.
- **A call's words, read back.** The call tells the browser nothing of what is said, so the page reads the rehearsal's
  own turns, which the call's webhook writes as the call goes: `POST /api/v1/previews/<token>/heard` with the call's
  name (the rehearsal's id its call door answered), every two seconds while the call is live. The call's screen shows
  the last two lines; the call's line in the conversation keeps them all behind Read it. Public as its siblings are:
  the token is the authority, the call is found in the preview's own workspace alone, and the read has a bucket of
  its own per network (`preview_heard_ip`).
- **What you'd get.** Once a call has ended the same door answers the card a real call would leave in their Inbox:
  how it ended, what the caller wanted, the to-do and what the caller gave, in the words every surface says a call in
  (contracts `previews/heard.ts` over `voice/call-words.ts`). The write-up is the provider's own analysis of the call,
  read by a new edge door, `POST /api/admin/previews/after-call`, and kept nowhere: a rehearsal's webhook still takes
  its analysis for an end only, since a preview's call is nobody's customer. It is waited for two minutes past the
  call's end, and the provider is asked only inside them. A call nobody asked anything on says so; a write-up that
  never comes leaves the call's line and its words, and nothing is said to have failed.
- **Either deploy order.** A dashboard that deploys first is answered a 404 by an edge without the door, which it
  reads as no write-up; an edge that deploys first is knocked on by nobody.
- **Make it mine's sign-up.** The way back to the preview, whose AI is waiting, and what comes with it, counted from
  the preview's own record (what it read, then what they told it; the conversation on its page and its calls are the
  preview's, and are not promised). The emailed code leads, since it asks nothing to be chosen, and Google stands
  under it. Someone who leaves for Google from that screen comes back signed in and the preview is theirs with no
  second press: the tab remembers leaving, for a quarter of an hour, and a link alone never says so, so a person
  already signed in who opens Make it mine is still asked the one press.

- **Drawn as the canvas draws it** (the same day, after the first build carried its order and not its look). On a
  desk their card and the conversation are two panes of the look's glass, each the window's height, what it knows down
  the card with each fact put right in place; on a phone one screen on the lit ground, the facts in a row that slides,
  the field a capsule of the control layer's glass held at the screen's foot. What it knows whole is the kit's sheet
  over the page, loaded as See all is first pressed, so a stranger's first load carries no sheet. The call's screen
  says whose turn it is, Speaking or Listening, from the call client's own events.
- **"From what you told it."** An answer is marked so, and kept so with its turn, only where it carries a figure one
  of the things told holds, or a run of five of its words (`server/previews/taught-answer.ts`): the page never credits
  them with an answer the record would have given anyway. Nothing is asked of the model for it.
- **It's yours.** A claim leaves the sign-up screen on the moment itself: that it is theirs, what came with it,
  counted from its record (its services, the things they told it; never its calls, which are not promised), and
  Continue. Its setup opens by itself six seconds later, and the card says what that setup leaves out for what they
  did on the preview (`previewFirstRunMarks`).

Not drawn from the canvas, by choice: the coloured dot before a fact's source (the app's colours say a state, never
where a fact came from, so a source is said in words).

Not yet, as of that build: a call's line and its card on a later visit; the sender's own read of what a lead said on
a call; the greeting as a recording, as before. The review below takes the first half of the first.

## Amended, 18 November 2026: the review of the page as it stood live

Ruben asked for the live page to be reviewed (its look, its light and dark, how intelligent it reads, its motion), and
approved every finding "as you best suggest". What changed, each with why:

- **It greets once.** The page speaks first, as their business, and no row keeps that line, so the model took the first
  question for a conversation's first and greeted again. The message door now gives the model the page's own first
  line as turns it reads, a customer's "Hi" and then the greeting (`server/previews/doors.ts greetedTurnsOf`), inside
  the eval door's twelve. Nothing is stored for it, and a preview whose name cannot be read is asked as before.
- **An answer is written out.** One that comes on this visit is let in word by word, in about a second and a half, and
  what stands under it comes once it has been; a line of this visit rises into its place. This is how the answer is
  drawn, never how it was made: it comes whole from the receptionist's own door, the door every customer's answer comes
  from, and that door is not changed for a preview's feel. Every word is in the document from the first, for a screen
  reader and for the page's height, and a device that asks for less motion shows it at once (`written.tsx`).
- **Light or dark is theirs to choose.** A stranger's page still opens as their device is set. A press in the top bar
  puts it in the other, and this device keeps that for a stranger's page alone, beside the member's own theme and never
  in its place (`bridge/device-prefs.ts keepStrangerTheme`, read by `themeBootScript`), so the next visit and Make it
  mine open as they left it.
- **Nothing is read through the field's bar.** It stands on the page's paper whole, the paper fading in above it, where
  it faded in under the questions' label and an answer read through it. A row that slides fades at an edge only where
  more waits past it, so nothing is chopped at the left once it has slid (`slide.tsx`).
- **Their name stands once, and the bar has no edge.** The bar says whose page it is only once their head has
  scrolled away. It lays the page's own ground where the window lays it, so at rest it is no strip over the light, and
  once the page has scrolled its paper falls away beneath it over a run, so what passes under dims into it. Their
  photo, as light behind the head, rises from nothing under the bar and is fainter on the dark ground.
- **One coral.** The page wears the app's own colours. The business's colour (0075), which coloured its links and the
  call's "Speaking" beside the app's coral, no longer reaches this page: the business is its face and its name.
- **What it took from them is lit.** The message door keeps, with the mark, where in the answer it says a thing they
  told it: the figure with its sign, or the run of their words (`taught-answer.ts taughtSpansOf`, at most eight
  stretches, read back defensively by `previewTurnsOf`). The page lights each in the fill their own words wear.
- **A call stays on a later visit.** The page's read carries the preview workspace's newest ended calls
  (`listEndedRehearsalCalls`, three at most), which stand after the messages, since a call keeps no place among them;
  each is read once for its words. Its card is still the provider's to write and is asked for only inside two minutes
  of the call's end, so a later visit shows the call and its words and not the card: keeping the card needs a place of
  its own in storage, and is not built.
- **The call's screen.** Its two presses are round at 68px, as the canvas draws them: they stood 44 wide and 68
  tall. The screen arrives, and the page arrives back from it. The mark that moves with the voice is built and not
  switched on: the call client can give the voice's audio (its own option, `bridge/rehearse/call.ts onLevel`), and
  the mark swells with how loud it is, but reading that audio taps the call's own sound, and the call is the page's
  first proof. So the preview asks the call for nothing it did not ask before, and the mark keeps its pulse while AI
  speaks, until the tap has been heard on a real call, on an iPhone among them.
- **Hear its voice.** Beside Call it, by its name, the provider's own recording of the voice this preview speaks
  with, as the first run plays it (`bridge/rehearse/voice-sample.ts`): no call, no microphone, nothing spent, and a
  browser that can give no microphone still hears it. It says the provider's words, not their greeting.
- **What stands under an answer comes as its last word does,** however short or long the answer is, holding its room
  until then, so nothing moves as it comes.
- **It's yours arrives.** Its mark grows in, the tick is drawn, and what came with it lands after.

Not built, each a change to how a preview is made or answered and so a change of its own: an answer streamed from the
model as it is written (the receptionist's shared door); their greeting spoken in their business's name (a recording
made per preview, which spends); a call's card on a later visit (above); the sender's own read of what a lead said on
a call, as before. The first questions written for their trade are the next amendment's.

## Amended, 18 November 2026: its first questions are written for the business

Ruben's review of the live page (18 November) approved this with the rest: the questions under "Try asking" were the
same for every trade, filled in from the record (a service, a day closed or the hours, where it is, a call back). An
emergency plumber's page offered "Where are you located?", where its customer writes "My basement is flooding, can
someone come now?". They are now written for the business as its preview is built.

- **Written by the model, once, at the build.** After the receptionist is made and its site worn, the smallest model
  is asked for three first messages a customer of this business would send, in that customer's words
  (`apps/edge/lib/previews/starters.ts`; the registry's `preview_starters` route: Haiku 5.5, its thinking off, 300
  tokens at most). It is told the listing's kind, whether the business goes to its customers, and what the
  receptionist was just given to know (its hours, its services by name, its rules, the things its site answered), in a
  fence, since a site's words are someone else's.
- **A call of the preview's own, not a part of the website's read.** That read (`imports/website-read.ts`) asks the
  same model already, and adding the questions to it would cost nothing more. It was weighed and left alone for three
  reasons. It is every customer's first run and monthly read too, so its shape and its words are not a preview's to
  change. A lead with no site, or one whose site could not be read, has a kind and a listing to write from, and those
  are the pages the old questions served worst. And the questions are held to what the receptionist knows, which is
  settled only once the listing and the site are put together.
- **The rule stays, and is held in code.** Never a price, which it refuses, and never a time to come in, since many
  businesses go to the customer and it sees no calendar; a question it would pass on to the business is fine. The
  model is told so, and its answer is read by `previewStartersWrittenOf` (contracts `previews/starters.ts`), which
  leaves out a line that asks a price or a time to come in, one that holds a link, and one too long to be a first
  message. The same reading is made of the list as it is kept, so a list written under an older rule is held to
  today's.
- **Kept with the preview, in its workspace's settings.** A section of their own, `preview.starters`, written in the
  one write that writes the receptionist. Weighed against a column on `lead_previews`: the settings are read by the
  page already and written by the build already, so nothing new is read, written or migrated; they go when the
  preview's workspace is erased, as its words do; and a build from before the section leaves it out and keeps
  answering. Never a key of `brain`: nothing in it is told to the receptionist. A workspace someone makes theirs keeps
  the section, unread by anything but a preview's page.
- **Today's questions are the fallback.** With none written (no model, no time left in the build, a refusal, a
  preview built before this), the page offers the ones it makes from the record, as before. With one or two kept, the
  record's own follow them up to three. Writing them never fails a build.
- **Either deploy order.** A dashboard from before this leaves the section out and offers the record's own; an edge
  from before it writes none. The ledger's purpose is the one thing with an order: `ai_usage.purpose` takes
  `preview_starters` (00642), applied before the edge that asks. An edge that asks first still gets its answer, and
  only the ledger's row is refused.
- **What it costs.** One more call a preview: about 750 to 1,000 tokens in and 40 to 50 out for a business with a
  dozen services and a few notes, about a hundredth of a cent at Haiku 5.5's list price ($0.10 and $0.50 a million);
  under four hundredths of a cent for the longest record at the answer's cap; under a cent where the fallback
  (Sonnet 5.5) answers. Computed from the call's own text at three to four characters a token, not yet measured: the
  first preview built writes the real figure on the ledger, under its own purpose.

Not yet: a real model's questions read for a real lead (nothing was spent to try it); the questions written again
when the business tells it something or puts a fact right; previews built before this are left with the record's own.

## Amended, 18 November 2026: the light behind their head is the look's own

Ruben, of the live page in both themes (18 November): the ground behind the head was ugly in light and still too strong
in dark. It was their Google photo, blurred and faint (the canvas's D7, kept by the review above). A real listing's
photo is pipes, a van, a storefront or a collage, and blurred to colour alone it read as a grey smudge on the light
ground and a muddy band on the dark one, whatever its opacity: the page could not say what it would be.

- **Their photo is their face alone.** Their mark, else their photo, else their initials, in the circle, as before.
  Nothing else on the page draws or fetches it.
- **Behind the head, the look's own light.** The page's three pools (`--pool-a-tint`, `--pool-b-tint`,
  `--pool-c-tint`, tokens.css), gathered round their face: the cool one over it, the lilac a little to its right, the
  warm one behind their name, each easing out to nothing and the whole falling away under Call it, so it has no edge
  and no band over the facts. The same on every preview, a step quieter on the dark side, and inside their card on a
  desk. It is a light, not a colour of the legend: it says nothing, as the pools say nothing on every other page.
- **The bar lays no ground at rest.** The light runs up under it, so the head and the bar are lit as one. Once the
  page has scrolled the bar lays the page's own ground, and the same picture runs on under its foot and falls away,
  so what passes beneath dims into the page with no line where the bar ends (the fall of flat paper met the lit bar on
  one, plainest on the dark side).
- **AI's disc on their face is the raised ground**, not the control layer's glass: on the dark side that glass is
  nearly clear, and over their photo the three went into the picture.

Seen on the stand-in walk (the page's own modules and stylesheets in a browser, every request answered by the walk),
at a phone, a short phone and a desk in both themes, with the plumber's own photo; not yet in the real app.
