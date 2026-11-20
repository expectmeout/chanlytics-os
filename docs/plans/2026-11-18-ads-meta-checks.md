# Ads: what Meta showed at each check

Kept beside [the Ads plan](2026-11-18-ads.md), as its section 7 asks. Every check here costs nothing. Each entry says
what was looked at, what it showed, and what it changes. No ids, tokens or names are kept here.

## 19 November 2026 · The app's own set-up at Meta, read in its dashboard

Looked at only. Nothing was ticked, saved or requested. Ruben signed in, and the pages were read through his sign-in.

### What it showed

| Looked at | What it showed |
|---|---|
| The app's saved sign-ins | One, of the WhatsApp sign-up kind. That kind cannot be changed. There is no second one for Pages or ad accounts |
| That sign-in's products | WhatsApp's two are on and fixed. Four more are offered and not on: ads that open WhatsApp, ads that open an Instagram chat, ads that open Messenger, and the Conversions API for business messaging |
| That sign-in's token | It belongs to the business and never expires. Fixed |
| That sign-in's assets | WhatsApp accounts, required. Pages, ad accounts, catalogs, pixels and Instagram accounts can be added |
| That sign-in's permissions | Two are asked today: `whatsapp_business_management` and `whatsapp_business_messaging`. The list it can ask from holds `ads_read`, `ads_management`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`, `business_management` and `whatsapp_business_manage_events` |
| The app's permissions | Advanced access: the two WhatsApp permissions. Standard access, ready, with no review asked: every ads permission above, and `attribution_read` and `read_insights` |
| Marketing API Access Tier | Limited, ready, with no review asked |
| The app's products | Messenger, Instagram, WhatsApp, Webhooks and Facebook Login for Business. The Marketing API tile is not added |
| The WhatsApp sign-up's helper | Version 4 of the sign-up. Meta's three checks for hosting it all pass |

### What it settles

- **D16.** The option is in the app's own set-up, as the plan expected. Nothing needed asking. Whether Meta grants it at
  a sign-up is seen the first time it is turned on, at no cost. Meta's own page still calls it limited.
- **The permissions.** Every one Meta's guide lists is already on the app at the ordinary level. Meta's page says that
  level is asked only of people who hold a role on the app. That is D7: Connect on Ruben's own workspace until the
  review passes.
- **The access tier** is Limited, as section 5.2 of the plan assumes.

### What it changes in the plan

- **Connect needs a saved sign-in of its own.** The plan said Connect reuses the one Instagram uses. The app's only
  saved sign-in is WhatsApp's, and its kind is fixed. Step 2 makes a second, of the general kind, which asks for Pages,
  ad accounts and the ads permissions. Making it is a change at Meta, so it waits for Ruben's word.
- **For a new business,** ads are either added to the WhatsApp sign-in or put on a second WhatsApp sign-in. Which one is
  decided in step 2, on the page itself. The products page says they cannot be changed later, and the four ads
  products on it were not greyed out.
- **The Marketing API tile** is not added. The permissions and the tier show as ready without it. Step 2's first read
  from Meta shows whether it is needed.

### Not looked at

The app's secret, any token, and anything on the two other apps beyond whether they hold a saved sign-in (they hold
none).

## 19 November 2026 · Meta's own pages, read before Connect was built

Read only, on Meta's public pages for developers. No sign-in was used and nothing was asked of Meta. Each line is what
a page says; what an account shows is still to be seen when Connect first runs on Ruben's own.

### What they showed

| Looked at | What it showed |
|---|---|
| An ad account | Its standing is a number Meta lists: active, disabled, unsettled, under review, in a grace period, closing or closed. It names its payment method, or none; with none an ad can be made and is never shown. It says its own spending limit, and none where there is none |
| An ad | One word for whether it runs, of the twelve Chanlytics already reads. Its budget is on the campaign or on the part under it that says who sees it, as a daily amount or a total, with what is left of it. A campaign can also let its parts pass budget between them |
| What an ad opens | Said on the part that says who sees it: WhatsApp, Messenger, an Instagram chat, a website, an app, a form on the ad, or a mix of chats |
| Money | Meta counts some currencies in whole units where the world's own list counts cents (the forint, the rupiah, the Colombian and Costa Rican pesos, the Taiwan dollar), and two in hundredths where the list counts thousandths (the Bahraini and Jordanian dinars) |
| Meta's pace | As the plan reads it: a score of 60 an ad account, a read 1 and a write 3, easing over five minutes; one change to the same ad every 30 seconds; an amount changed four times an hour |
| Notices of a change | Meta sends one when an ad's standing changes, a refusal by its check and a return to running among them. It says which ad changed and not what to: the ad is then read. A notice needs the app to ask for them once, and each ad account to be joined to the app with the business's own sign-in |
| Withdrawing access | Meta's page for the kind of sign-in Chanlytics uses gives an app a way to end a sign-in itself, with its own key and the sign-in it ends. A business can also remove an app in its Business settings, under Integrations |
| Linking a Page to a WhatsApp number | Through Meta's interface it takes a code that Meta sends to the number. It is not one press |

### What it settles

- **Meta's notice covers its check of an ad** (the plan's section 8). The read on a clock stays as the backstop.
- **Chanlytics can ask Meta to withdraw access with its own key** (the plan's C2), on the page. It needs the sign-in
  itself to name what is withdrawn. So after a disconnect the sign-in is kept for that one question, used for nothing
  else, and dropped when Meta confirms.
- **"Link them" opens Meta** in step 2. Chanlytics looks again when the owner comes back, as for every other check.

### What it changes in the build

- **Money is converted where Meta's answers are read,** from Meta's units to each currency's own, and nowhere else.
- **A disconnect asks Meta to withdraw access only where no other connection of the same business would lose it.**
  Whether the sign-in for ads and the sign-in for Instagram are one at Meta is not on any page. Until it is seen on an
  account, a business that also has Instagram connected keeps its sign-in at Meta, and the page says where to remove
  Chanlytics there.
- **Two settings at Meta wait for Ruben's word,** beside the saved sign-in: the address Meta sends an ad account's
  notices to, and the address it calls when a business removes the app.

### Not looked at

Any ad. Until 19 November nothing here was seen on a real account; what the first real Connect showed is below.

### Seen on the first real Connect (19 November)

Ruben's own sign-in, in his workspace, a new ad account made and shared in Meta's window. The edge's log of that
Connect, read the same evening:

- **Answered:** the code traded for the token and Meta's description of the token. No refusal was logged for `/me`'s
  business or for a Page (a Page is read only where one was shared, and the log does not say whether one was).
- **Refused:** the ad account, at its `business{id}` field: "(#100) Requires business_management permission to access
  the field". The five permissions do not reach the business that owns an account, and the ad account's reference page
  says nothing of that. The field is no longer asked; the business is `/me`'s.
- **Not reached yet:** the list of Pages an account's ads ran from (asked only between two accounts), the list of what
  the business shared (asked only where the token's description names nothing), the ads, their days, and joining the
  account to the app's notices.

Meta's reference pages, read again for every call step 2 makes, name a permission for two of them: an account's Pages
(`pages_show_list` and `pages_manage_ads`) and a Page (`pages_read_engagement` and `pages_show_list` for what it owns,
with "the business_management permission may be required" for a business's own user, which is what Chanlytics' token
is: the first real Connect is when that shows). The named ones are among the five. The ad account's page names one only for `funding_source_details`, which is not asked. The pages for
the ad, its creative, an account's days, the shared lists and the notices name none. So what they need beyond the five
is seen only when they are first asked.

### Seen on the first account connected (19 November, the third Connect)

The same owner, the same evening, on the build with both fixes. From the edge's log and the live page:

- **Connected, then read on the clock.** The connect wrote the account and its Page. The first full read ran about two
  minutes later, on the job runner's tick: five calls (the account, its ads, its days, its Page, and joining it to
  Meta's notices), no refusal logged, no ads and no days yet, 2% of Meta's allowance. The clock's sweep then ran every
  five minutes with nothing to read. The read's time was not logged; `ads_read` and `ads_read_failed` now carry `ms`.
  From the tick's own lines, it took under about twelve seconds.
- **The Page needs no more than the five.** It was read and kept, and its check passed, so the Page reference's
  "business_management may be required" did not apply to this sign-in. Instagram's own connection stayed on.
- **An ad account made inside Meta's window can arrive turned off.** This one read as turned off at Connect, and Meta's
  Account Quality said it had restricted it that day under its advertising standards, as made or used with automation
  outside its rules. The owner asked Meta for a review, and about a quarter of an hour later the card's look again read
  it as active and moved on to its next need, a card on file. The cause is not proven: the account was made in a
  browser built into a desktop app, which names itself to every site, on a day a tool drove that browser through the
  owner's Meta settings. Chanlytics never drives Meta's pages for an owner; the card's words for a turned-off account,
  and its look again, were right.
- **The Page's WhatsApp numbers are not Meta's to tell Chanlytics.** Both WhatsApp checks read false, while the Page
  already had a number linked, its primary, before the first Connect. The Page reference says why: its
  `whatsapp_number`, `has_whatsapp_number` and `has_whatsapp_business_number` "can be read with Page Public Content
  Access or Page Public Metadata Access", features Chanlytics' app does not hold, and `whatsapp_number` is one string
  for a Page that may hold fifty numbers, one of them primary ("the default number we'll use for ads, posts, and other
  experiences", Meta's own Page settings). No edge of the Page lists them. So the checks now say a number is linked,
  and is AI's, only where Meta names it; where Meta names none they read "Meta doesn't share this", never "missing",
  and a number named that is not AI's leaves AI's own unknown. `ads_page_read` logs which fields Meta's Page answer
  held, by name, so the next read confirms the field is left out. Whether an ad may name AI's number is for the ad's
  own check (step 4), which names the number.
- **Linking a number to the Page.** AI's number was linked in Meta's Page settings with "Connect another number", in one
  press and with no code, since its WhatsApp account and the Page are in the same portfolio. It was not made primary:
  that moves where the Page's own WhatsApp button sends people, and is the owner's call.
- **The account's own page at Meta.** Meta's pages document only the bare Account Quality page, which lands on Business
  Support Home's overview with no account. Seen on this account, signed in as its owner: Meta's own link from that
  overview opened `business-support-home/<business id>/<ad account id>/?business_id=<business id>` (with more query parts
  of Meta's), which said why the account was restricted and offered the review; once lifted, the same path with only
  `business_id` opened the account again. The turned-off notice's "Open Meta" now opens that path where both ids are
  kept, and the bare page where the business is not. Seen on one account only.
- **Not seen yet:** an ad's own fields, its days and its spend (the account has no ad), and Meta's notices arriving.

### To see on the first real account, found on review (19 November)

- **Days of an ad archived inside the window.** Meta's insights page says a list at the ad level leaves archived and
  deleted ads out unless a filter names them. The read asks for no such filter, so an ad archived inside the thirty
  days may bring no days, and is then not adopted by them. To see: whether its days arrive, and if not, the filter
  Meta's page gives, tried on one call before it is relied on.
- **Who Meta names when a business removes the app.** The address Meta calls names a person. The id kept at Connect is
  the one Meta's description of the token gives, which for a business's own token may be another id. If the two differ
  the call matches nobody, and the next read marks the account all the same, within the hour.
- **The ad account's own "allowed to run ads" list** is not asked for yet: an owner who loses that at Meta sees reads
  fail ("Couldn't update") and not the reason.

## 19 November 2026 · Meta's own pages, read before an ad is made

Read only, for step 4: Meta's public pages for developers, its public Ads Guide and its Music Guidelines. No sign-in
was used and nothing was asked of Meta. Each line is what a page says. What an account does is seen at the paused-ad
check, which waits for the Page to be linked to a WhatsApp number.

### What they showed

| Looked at | What it showed |
|---|---|
| Three versions of the words in one ad | Meta has three ways to put several texts in one ad, and as its pages read none fits an ad that opens WhatsApp. Dynamic Creative takes up to five texts and five headlines, shows any headline with any text, takes one ad for each part that says who sees it, and its page asks for a goal other than conversations. The flexible format is for Sales and App campaigns alone. The rules that pick a text by place or by language list older objectives, messaging not among them |
| What one request can make | A campaign is its own request. An ad can carry its creative inside it. Requests sent together as one batch cannot carry the key that makes a create safe to repeat |
| Where the amount sits | On the part that says who sees it, or on the campaign, never both. A total must have an end. A daily amount is taken only for a run longer than a day. Meta says a total is not passed "unless you change your delivery settings" |
| Meta's least, and the shortest run | The account says its least for a day. The least is set for a day and holds for a total too: Meta counts the run to the hour, from the moment it starts to the end of its last day, and wants more than the least for each part of a day, so a run touches one more calendar day than its length (the paused-ad check, 20 November: a run fourteen days on was refused at fourteen times the least and asked for a little more). No page names a shortest run for a total |
| A new account's daily limit | Not readable. The ad account's page lists the account's own spending limit, what it has spent, its least for a day and its payment method. It lists nothing for a limit Meta itself puts on a new account's day |
| How far a day may pass a daily amount | Two of Meta's pages disagree: its budgets page says a quarter, its page on sharing budget between parts says three quarters |
| Meta's dry run | The campaign, the part that says who sees it, the creative and the ad each take one (`validate_only`): Meta runs its rules, makes nothing, and answers yes or with its own words. The ad's can also ask for Meta's own look at the words and the picture (`synchronous_ad_review`). A thing's dry run names what sits above it, so that must exist first |
| An ad made paused | Still goes through Meta's check, then returns to paused |
| A create sent twice | A create can carry a key of the sender's own. Sent again with the same key inside seven days, Meta answers with what the first made and makes nothing new. A change, a removal and a dry run take no key |
| Meta's pace | Beside the score, an account takes at most 100 creates and changes a second. Nothing says a dry run costs less than a change |
| Where an ad shows | Named on the part that says who sees it. Left unnamed, Meta uses every place it has and "may also automatically consider new positions or platforms". WhatsApp Status is a place of its own: on only when named, only beside Instagram stories, never with Dynamic Creative, and able to reach people whose age WhatsApp does not know unless that is switched off |
| Instagram | An ad that shows on Instagram names an Instagram account. A Page linked to one has it. For a Page with none, Meta can make a hidden one |
| Meta's automatic audience | Since v23 it must be said, on or off. On, Meta may look past what it was pointed at, and never past the area, the least age or the language. On, the least age is 18 to 25 and no most can be set |
| The miles | A circle around a street address or a point, from 0.63 to 50 miles. It reaches people who live there or were there lately. Meta offers no other choice |
| A declared ad | Every campaign says its kind, or says none. Meta's kinds: housing, employment, financial products and services (it replaced credit on 14 January 2025), social issues with elections and politics, and gambling and gaming. A declared kind names its country too. Housing, employment and financial products fix the ages at 18 to 65 and over, take no choice of gender and refuse a circle under 15 miles |
| Meta's own changes to the picture and words | The one switch Meta's guide for these ads uses is retired since v22. Each change is now its own switch, in or out: fitting the picture to a place, touching it up, overlays, a generated background, moving the texts given between text and headline, translating, stickers, a comment under the ad. Music is added only where asked for. Showing the ad beside other advertisers' ads is a switch of its own |
| A picture | Feeds: 4:5 is the shape Meta recommends, and Instagram takes anything from 1.91:1 to 4:5; at least 600 pixels wide; JPG or PNG up to 30 MB. Stories and Reels: 9:16, with the top 14%, the bottom 35% and 6% at each side kept free of words |
| A video | MP4 or MOV up to 4 GB. The Ads Guide gives each place its own longest: 241 minutes in Facebook's feed, 60 in Instagram's feed and stories, 15 in Instagram Reels, 3 in Facebook stories, and from one second. Meta's page for developers still says 3 to 60 seconds for Instagram's feed. A video is never cropped by Meta; a picture can be |
| The words | Text: 125 characters is what Meta recommends, and Reels shows about 44. Headline: 27 characters in Facebook's feed, 40 on Instagram and in stories. Longer words are not refused |
| Licensed music | Meta's Music Guidelines, in force since 26 March 2024: music for commercial purposes is "prohibited unless you have obtained appropriate licenses", and a video without them may be muted, blocked or removed. Meta's page on Reels as ads asks for a reel "free of copyrighted music". The only music its pages for ads offer without a licence of the advertiser's own is music Meta adds itself, where asked |
| Meta's own preview | Given for a creative that is not made yet, and for a made one. Its page asks for a person's sign-in, "not a Page access token" |
| Whose sign-in makes an ad | Meta's guide for these ads asks for a Page's own sign-in, from someone allowed to advertise for the Page. Its page for the preview asks for a person's. Chanlytics holds the business's own. No page settles which of them an ad that opens WhatsApp takes |
| What making a creative leaves | An unpublished post on the Page, which nobody is shown |
| Meta's test ad account | Nothing in today's pages for its ads interface, and its old address answers not found |
| The version | v27.0, out since 4 November 2026, with no end date listed yet. v25.0 ends on 23 February 2027 |

### What it settles

- **Three versions are three ads,** under one part that says who sees it and one total. One ad that holds three texts
  would be Dynamic Creative, which shows a headline with a text nobody approved together, and whose page does not cover
  an ad that looks for conversations.
- **The amount sits where the plan put it,** as a total with an end date, on the part that says who sees it.
- **A dry run exists for every part of an ad.** It cannot all come before anything exists: only the campaign's can.
- **WhatsApp Status can be left out.** It is on only when named.
- **The miles hold as a limit,** with Meta's automatic audience on or off, and so does the least age.
- **A video with licensed music does not run as an ad** without the advertiser's own licence for it.
- **A new account's daily limit cannot be read.**
- **There is no test ad account to plan on.** Meta's own page for an ad says to keep ads paused while testing.

### What it changes in the plan

Each is written into [the plan](2026-11-18-ads.md) in the same change.

1. **An ad made here is three ads at Meta,** one for each version, sharing one total. The owner still sees one ad.
   Meta checks each version by itself, so it can turn down one and run two.
2. **Each dry run comes just before its own make.** A refusal of the campaign leaves nothing. A refusal further down
   leaves a paused, empty campaign, which is removed.
3. **A total is never under the account's least for a day times every calendar day the run touches,** today and its
   last day both counted. That is the "starting amount" too.
4. **The check against a new account's daily limit is Meta's dry run,** not a rule of ours: there is nothing to read.
5. **The first version names where an ad shows:** the feed, stories and Reels, on Facebook, and on Instagram where the
   Page's Instagram account is known. WhatsApp Status, Messenger, Threads and other apps are left out.
6. **Meta's own changes are switched off one by one,** and read back, since the one switch is retired.
7. **"Within 5 miles" means people who live there or were there lately.** The miles can be 1 to 50.
8. **Adults only is the least age of 18,** which Meta keeps with its automatic audience on.
9. **One picture is shown in every place, so it is the feed's shape:** 4:5 or square, which stories and Reels show
   whole. A tall one for stories and Reels alone waits for a way to give each place its own. A video only from 3 to
   60 seconds, inside every place's own limits.
10. **The first ad on a real account is on Ruben's own, paused.** The plan's "first on a test ad account" goes.

### To decide with the job that makes an ad

Meta's key for a create (above) lets a create that got no answer be sent again safely: the same key answers with what
the first made. Decision 0050's call 6 says such a create is never sent again and is found by its tagged name. The key
is the surer of the two for a create and does nothing for a switch, which takes none. The requests carry the key from
now. Whether the job sends again with it is Ruben's to decide, since it changes a decided sentence.

### What the paused-ad check sends, in order

On Ruben's own ad account, with no card on file, so nothing can be charged. Each make is paused, and each is read back.

1. A read of the account's least for a day, and of the Instagram account its Page is linked to.
2. The campaign as a dry run: an ad that opens WhatsApp, declared as no special kind. Then the campaign itself.
3. The part that says who sees it as a dry run: adults within the miles of the address, a total with its end, the
   places named, the Page, and the WhatsApp number AI answers, named itself. Then the part itself.
4. The picture, placed in the account's library.
5. One ad with its creative inside it as a dry run, with Meta's own look at the words asked for. Then the ad itself.
6. One read of all three, compared with what was sent: the amount, the end, paused, no special kind, WhatsApp as where
   it opens, the number AI answers as the one it opens, and none of Meta's own changes on.
7. The ad's own switch on, then paused again, while the campaign above it stays paused.

It leaves a paused campaign, a picture in the account's library and an unpublished post on the Page. It goes through
Meta's check of an ad, so its words and picture are ones the checks of the plan's section 5.1 pass. Where Meta stops
it after the campaign is made, the check deletes that campaign (Meta's DELETE on it, read on its campaign reference on
20 November), so a check either finishes, paused, or leaves nothing. A campaign an earlier check left is removed the
same way, by its id, and only where it is in the owner's account, paused, named as a check names it, with no ad.

What it settles that no page does: whose sign-in Meta takes for an ad that opens WhatsApp; whether a dry run counts
against the account's score; whether Meta refuses a total over a new account's day; the shortest run it takes; that
an address alone, with no country, is enough for the area; that the Instagram account can be read with the sign-in
Chanlytics holds; and that Meta's own preview answers to it.

### Not looked at

Any account, any ad, and any page behind a sign-in. Meta's help pages for advertisers answered a plain reader with
nothing, so the sizes and the music rule are from its Ads Guide and its Music Guidelines, which did.

## 19 November 2026 · A Page that holds two WhatsApp numbers

Reported late on 19 November by the session that works in Meta's own settings on Ruben's word, after it linked the
number AI answers to his Page. It was not seen by the session that built the requests, which opens no page behind a
sign-in. No number is written here.

### What it showed

| Looked at | What it showed |
|---|---|
| The Page's linked WhatsApp numbers | Two. One was already there, marked as the Page's primary number. The number AI answers was added beside it, and is not the primary one. Meta took the link in one press with no code, since the number's WhatsApp account and the Page sit in the same business portfolio |
| What Meta says of a primary number | That it is the default "for ads, posts, and other experiences". A Page can hold up to fifty numbers |
| Meta's guide for these ads | The number an ad opens is named on the part that says who sees it, and the guide marks it optional |

### What it changes

- **An ad made here always names the number AI answers.** Left out, an ad would open the Page's primary number, which
  on this Page is another one, and people would write where AI does not answer. The request is not built without the
  number, and what Meta holds is compared with it before anything is turned on.
- **The paused-ad check's gate is met at Meta:** the Page is linked to the number AI answers.
- **To see on the paused ad:** that Meta takes a number that is linked to the Page and is not its primary one.
- **Not this part's:** the card's own check of the Page's number, which is step 2's and has been told.

## 20 November 2026 · The paused-ad check, run three times on Ruben's own account

Run on Ruben's word, typed in the session that built it, through the owner's route (`POST /api/v1/ads/check`) with
`ADS_WRITES` live on the production edge, with the business's sign-in that Chanlytics holds, in the order above. The
account had no card on file for the first two runs; Ruben added one before the third. No id is kept here.

### What it showed

| Run | Step | What Meta did |
|---|---|---|
| First, $14.00 to a day fourteen days on | The account's least a day, and its Instagram accounts | Read: $1.00 a day; no Instagram account named |
| | The campaign: dry run, then made | Taken. The campaign was made paused |
| | The part that says who sees it, dry run | Refused: "Your ad set budget must be more than $14.48 or your ads may not deliver." |
| | Nothing after it was sent | The paused, empty campaign was left at Meta, and removed later the same day by its id, once the check could |
| Second, $15.00 to the same day, New ad's new proposal | The two reads and the campaign | As the first |
| | The part that says who sees it: dry run, then made | Taken, with a total and its end in the account's zone, adults within 5 miles of the street address alone, Facebook's feed, stories and Reels, and the number AI answers named |
| | The picture, placed in the account's library | Taken |
| | One ad with its creative inside it, dry run with Meta's own look at it | Refused: "Update payment method: Visit the Billing and payment center to add a valid payment method." |
| | What the check made | Removed: the campaign, with the part under it. The picture stays in the library |
| Third, the same draft, with a card on the account | Every step of the second | As the second |
| | One ad with its creative inside it, dry run with Meta's own look at it | Taken |
| | The ad, made | Taken, paused, with its creative made inside it |
| | The read back of the whole campaign | Matches what was sent, on every point compared: the campaign, the part that says who sees it and the ad each paused; no special kind; one part and one ad; a total, no amount a day; the end; the number AI answers; adults; 5 miles; Facebook's three places; the WhatsApp button; none of Meta's own changes on; never beside other advertisers' ads; the words as written |

Between the second run and the third, New ad stopped offering any picture: a Drive folder brought in more files than
it read, and none of them could be offered yet. That was mended in its own change the same evening, and the third run
used the same picture as the second.

### What it settles

- **Meta's least for a total counts every calendar day the run touches,** today and the last day both: fourteen days
  on at $1.00 a day was refused at $14.00 and taken at $15.00. The rule in code is this one since this day.
- **The business's sign-in that Chanlytics holds makes every part:** the campaign, the part that says who sees it, the
  picture, and the ad with its creative inside it. The Page's own sign-in is not needed.
- **Meta's dry run covers every part, the ad's included,** and its own look at the words and the picture answers at
  the dry run: these words and this picture passed it.
- **The part that says who sees it takes the number AI answers,** though it is not the Page's primary one, and the
  ad's button opens WhatsApp.
- **An address alone, with no country, is enough for the area.**
- **The ad account's Instagram accounts can be read** with that sign-in; this one names none, so the ad shows on
  Facebook alone.
- **An ad is not made, not even as a dry run, on an account with no payment method.** So "no card, so nothing can be
  charged" never covers an ad. What keeps a made ad from spending is that it, the part above it and the campaign are
  all paused, and that the read back says so before anything is switched on.
- **What Meta holds is what was sent,** on every point the launch compares (decision 0050, call 4).
- **A check either finishes or leaves nothing:** the second run's removal took, in one call.

### The ad's own switch, through step 2's presses (the same evening)

On Ruben's word, once the account's hourly read had taken the ad in. The Ads page showed it paused, with its whole total
left, nothing spent and no showing, and offered Resume.

| Press | What Meta did | What the Ads page then said |
|---|---|---|
| Resume | Took the change, and said so when the ad was read back | Under review: its own switch on, Meta still checking it. Nothing spent, no showing, since the campaign above it stayed paused |
| Pause, 35 seconds later (Meta takes one change to an ad every thirty seconds) | Took the change, and said so when the ad was read back | Paused, nothing spent |

After the pause, Meta's word for where the ad stands names the pause above it rather than its own, and the Ads page
does not offer Resume: the rule reads that turning the ad on here would start nothing while the campaign is paused,
which is true. Before the first press Meta had named the ad's own pause, and Resume was offered.

### Not settled

Whether a dry run counts against the account's score (the edge's log keeps each call's share, unread here); what
Meta's review of the paused ad comes to (an ad made paused is still reviewed, and while the campaign is paused Meta's
word names that pause, so only a refusal would show); and Meta's own preview.

### What stands at Meta now

On Ruben's account, all paused: one campaign, one part that says who sees it, one ad under Meta's review, the picture
in the account's library, and an unpublished post on the Page that the ad's creative made. With the campaign paused, nothing is shown and nothing is spent.
