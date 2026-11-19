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
- **A Page not linked to a WhatsApp number** reads false on both WhatsApp checks, so no ad that opens WhatsApp can be
  made on the account until it is. Step 4's check on a paused ad waits for that link.
- **Account Quality's address.** Meta's pages give only the bare page; whether it takes an ad account to land on, as
  the billing page does, is on no page. The notice's "Open Meta" keeps the bare page until an owner's address bar shows
  the shape, and is not tried with a tool (above).
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
