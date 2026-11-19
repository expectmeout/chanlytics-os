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

Any account, any ad, any token. Nothing here was seen on a real account.
