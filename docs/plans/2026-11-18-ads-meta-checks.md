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
