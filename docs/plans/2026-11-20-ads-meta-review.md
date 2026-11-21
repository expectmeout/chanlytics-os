# Ads: Meta's review, the pack

20 November 2026. Step 3 of [the Ads plan](2026-11-18-ads.md): what to send Meta so a business other than Ruben's can
connect and use Ads, and everything that must be true before each press. **Nothing here has been sent to Meta, and
nothing was changed at Meta to write it.** What Meta's own pages said is on
[the checks page](2026-11-18-ads-meta-checks.md), under "20 November 2026 · Meta's App Review pages".

No id, token, address of a person or password is kept here: the repository is public. The review workspace's name and
the review account's sign-in are kept with the Instagram review's notes, outside the repository
(`Claude Video/docs/2026-11-08-content-canvas/meta-review/submission-checklist.md`).

## Where it stands

| What | Stands |
|---|---|
| Ads on Ruben's own workspace | Live since 19 November: Connect, the card, the page, Pause and Resume, Reports › Ads. New ad drafts; Turn on is open as #2483 |
| The first submission: `ads_read`, `pages_show_list`, `pages_read_engagement` | **Written below. Waits for one ad on the page** (see "What the first recording needs") |
| The second submission: `ads_management`, `pages_manage_ads` | **Written below, waiting** for Turn on and the first live ad |
| The higher tier (Full access) | Its own request, once 500 calls in 15 days are logged: about 4 December |
| The reviewer's way in (G14) | Decided below, and written into the plan |
| What Meta must find set | Checked against the code below: three settings at Meta and two on the edge are Ruben's |
| Sent to Meta | Nothing |

## What the first recording needs

Meta asks the `ads_read` recording to show "ads performance data, such as Impressions, Conversions, Spend, Clicks, and
Reach" in the app. On Ruben's account today the page shows no ad at all: the paused-ad check's ad was removed on
20 November, and the page lists a finished ad only while it spent something or brought someone. So the recording
needs one ad standing on the page first. Two ways, both Ruben's word:

- **A paused ad left standing (recommended, now):** the paused-ad check again, its ad left paused instead of removed. It
  costs nothing, Meta reviewed the last one without a word, and the drawer shows Meta's numbers for it: $0.00 spent,
  shown 0 times, 0 taps. Zeros are true, and the recording's job is to show where the numbers appear. The reviewers
  test on their own accounts in any case.
- **The first live ad, after its first full day:** real numbers, at the end of step 4. That is also what the second
  submission waits for, so waiting means sending both together, later.

Reading is what another business needs first, so the paused ad is the better trade: the first submission goes now, and
the second shows real numbers when it goes.

## The reviewer's way in (G14, decided)

Meta's reviewers "test your app using our own test accounts", follow the recordings, and turn a permission down when
they cannot test what it is for. They most likely have no WhatsApp number linked to a Page. So every permission needs
a path a reviewer can walk, and none may be a path that only reviewers see.

**What the reviewer is given:** Chanlytics' address and a sign-in made for the review: an owner in the review workspace
alone, never Ruben's own sign-in and never a customer's workspace. It is the workspace Instagram's review uses. The
review workspace is added to the edge's `ADS_WORKSPACES`, so Connect shows there as it does on Ruben's. It needs a
service and the business's address, so New ad's first missing thing there is the real one, WhatsApp.

**What the reviewer sees, and why each step works:**

| Step | What they see | Needs a WhatsApp number? |
|---|---|---|
| Campaigns › Ads, nothing connected | The coral Connect, and who Meta charges | No |
| Connect, in Meta's window with their test account | Meta asks for the permissions; they pick an ad account and a Page | No |
| Back in Chanlytics | The card: Connected, the ad account, the Page the ads run as, its three checks | No |
| The page | Every ad in their account that is on, paused, or ran in the last 30 days, made anywhere, with Meta's spend; the drawer has Meta's numbers beside Chanlytics' count | No |
| Reports › Ads | The same ads, Chanlytics' count beside Meta's spend | No |
| Pause and Resume (second submission) | On any of their ads, made anywhere | No |
| + New (second submission) | "First, WhatsApp": an ad here opens a WhatsApp chat AI answers, and the workspace has no number | **Yes** |

**Why New ad gets no reviewer-only path.** Chanlytics makes one kind of ad: one that opens a WhatsApp chat AI
answers. Meta itself needs the Page linked to that WhatsApp number to run it. A reviewer's test Page has none, so no
honest change on our side lets a reviewer make one. A review-only shortcut (an ad that opens the Page's own number, or
a website) would be a path no business has, which is what a review is meant to catch. So the reviewer sees what any
business with no WhatsApp number sees, the one thing missing, and the second submission's note says why, with the
recording showing the whole flow on Ruben's own Page.

Meta decides each permission on its own, so if `pages_manage_ads` comes back "could not test", `ads_management` still
stands. The mend then is Meta's reply box, saying the precondition again. If Meta still refuses, the next road is an ad
for a business with no WhatsApp number, as a plan of its own: that is a product change, not a review fix.

**Built for the reviewer's path (this change):**

- **The card, for a sign-in that may read and not change ads.** Between the two submissions, Meta lets a business
  grant only the approved permissions, so its sign-in reads and cannot pause. The card said "You can see this ad
  account, but not run ads on it. Its admin can let you run ads", a cause that is not the cause, with "Use another ad
  account". It now says "Chanlytics can show these ads, not change them yet. Meta hasn't approved Chanlytics to pause
  or make ads yet. Your ads and what they cost show here meanwhile.", calmly, with no act, since connecting again
  would ask the same and get the same. A reviewer of the first submission may see exactly this.
- **The privacy policy and the deletion page now name Facebook ads:** what the connection reads, what it changes and
  only on the owner's press, that Chanlytics never tells Meta who wrote or booked, where the access is kept, and how it
  ends on either side. They answered 200 before, and said nothing about Meta's ads data.

## What Meta must find set

Checked on 20 November against the code and the live hosts, with no sign-in. Each change at Meta is Ruben's own press,
in his own Chrome, never the app's built-in browser.

| What | Checked | Stands | Ruben's |
|---|---|---|---|
| Privacy policy URL (`app.chanlytics.com/privacy`) | Answers 200 | Set at Meta (19 Nov). The text now names Facebook ads, once this change is live | Nothing at Meta |
| Terms URL (`/terms`) | Answers 200 | Set | Nothing |
| Data deletion instructions URL (`/data-deletion`), App settings › Basic | Answers 200 | Set. Meta takes this URL or a deletion callback; the instructions URL is enough | Nothing |
| Deauthorize callback URL, Facebook Login for Business › Settings | The edge's `/api/ads/deauthorize` is live: a call with no signature is refused (401), a signed one marks every ad account that sign-in connected as signed out | **Empty at Meta** | Set it to the edge's address, `https://chanlytics-messaging.vercel.app/api/ads/deauthorize`. Without it, the hourly read still finds a removed sign-in within the hour |
| Ad Account notices, Webhooks › Ad Account | The edge's `/api/ads/meta` is live: Meta's check is refused until its token is set (403), a notice with no signature is refused (401) | **Not subscribed.** `META_ADS_VERIFY_TOKEN` is not set on the edge | 1. Set `META_ADS_VERIFY_TOKEN` on the edge (a long random word, his to make). 2. At Meta: callback `https://chanlytics-messaging.vercel.app/api/ads/meta`, the same token, then subscribe `in_process_ad_objects` and `with_issues_ad_objects`, the two whose names say an ad's standing moved (Meta's reference lists the fields by name alone). Leave the rest off: nothing reads them |
| The review workspace on the edge's `ADS_WORKSPACES` | Read in `apps/edge/lib/ads/account-ops.ts`: Connect shows only where that list names the workspace | **Not listed**: only Ruben's workspace is | Add its id, comma-separated beside his. For the second submission `ADS_WRITES` is already `live` (presses reach Meta only in a listed workspace) |
| App icon, category, App Purpose, primary contact | Set for the WhatsApp review (5 Sep) | Looked right on 19 Nov | Confirm App Purpose reads **Clients** in the submission's "Complete App Settings" |
| Business verification | Verified | Done | Nothing |
| Data handling questions | Meta may ask them at the submission | The WhatsApp review (5 Sep) and the Data Use Checkup (26 Aug) passed | His, in the form |
| A successful call with each permission, inside 30 days | Hourly reads since 19 Nov (`ads_read`), the Page read daily (`pages_read_engagement`) | `pages_show_list` is asked only where Meta's description of the sign-in names no Page, so its count may be 0 | Read each count on App Review › Permissions and Features first (Meta logs a call within 2 days). Any at 0: one call in Meta's Graph API Explorer with that permission, his press |

The notices are not needed for the review. They make the page hear a change at once instead of within the hour.

## The first submission: reading

For `ads_read`, `pages_show_list` and `pages_read_engagement`. Each permission has its own description and its own
recording. Meta's walkthrough: "Each permission and feature must have its own description. Do not copy and paste."

### Before Submit

- [ ] One ad on Ruben's page (see "What the first recording needs").
- [ ] This change live: the card's calm line, and the privacy and deletion pages naming Facebook ads.
- [ ] The review workspace on `ADS_WORKSPACES`, with a service and an address; the review account an owner there.
      Signed in as it, Campaigns › Ads shows Connect.
- [ ] Each of the three permissions shows a call count above 0 on App Review › Permissions and Features, inside 30
      days of submitting.
- [ ] The Deauthorize callback URL set (above). Not required by Meta's pages, and a reviewer may look.
- [ ] The three recordings made (scripts below), each an `.mp4`.

### How to record, for all three

Meta's screen-recording guide (read 20 November): English, the browser window alone, 1080 or better and no wider than
1440, the mouse rather than the keyboard, the cursor enlarged, no sound. Start each recording signed out of
everything ("from logged-out to logged-in"). Captions are worth adding where a screen is not obvious: Meta recommends
annotations for every permission.

- Use a fresh Chrome profile (or a guest window) of Ruben's own Chrome, so nothing else of his shows and every sign-in
  is on camera.
- His workspace is connected, and Connect is only offered on a workspace with nothing connected. So before recording:
  Campaigns › Ads › the card › Disconnect, off camera. Disconnect forgets Chanlytics' sign-in; what the ads brought
  stays. If an ad is running then, Disconnect asks whether to pause it first: leave it running.
- Go through Meta's window in one go: the sign-in it starts lasts minutes.
- Type the password off camera, or let the field's dots show. Meta's second step, if it asks, is fine off camera.

### `pages_show_list`

**Description (paste):**

> Chanlytics is an AI receptionist for small service businesses, such as salons, clinics and trades. In Campaigns, Ads,
> a business owner connects their own Meta ad account by pressing Connect and signing in with Facebook Login for
> Business. We use pages_show_list to see which Facebook Pages the owner shared with Chanlytics at that sign-in, and
> which Pages the ad account's ads run from, so Chanlytics can name the one Page their ads run as. The owner sees that
> Page on the ad account's card, under "Runs as". We never list or read any Page the owner did not share, and the list
> is shown only inside the business's own workspace. pages_show_list is also what pages_read_engagement, which we ask
> for in this submission, depends on.

**Recording (about 60 seconds):**

1. app.chanlytics.com, signed out. Sign in to Chanlytics.
2. Campaigns › Ads: nothing connected. The card says what connecting does, and that Meta charges the owner's card.
3. Press **Connect**. Meta's window opens, signed out of Facebook: sign in.
4. Meta lists what Chanlytics asks for. Hold on the permissions for two seconds.
5. Choose the business portfolio, the ad account, and **the Page**: this list is what `pages_show_list` serves. Finish.
6. Back in Chanlytics: the card reads **Connected**. Open it: **Runs as** names the Page that was picked.

### `pages_read_engagement`

**Description (paste):**

> Chanlytics shows a business owner their own Facebook ads, from the ad account they connect in Campaigns, Ads with
> Facebook Login for Business. An ad shows as a Facebook Page, so we use pages_read_engagement to read the Page the
> owner chose at that sign-in: its name and its metadata. The ad account's card names that Page under "Runs as", and
> its check for the Page reads ready once the Page is read, which a new ad needs. We read nothing posted by the Page's
> followers, and the Page's details are shown only inside the business's own workspace.

**Recording (about 45 seconds):** the sign-in of the first recording, then:

1. The card, opened: **Runs as** and the Page's name, read from the Page. Hold on it.
2. The card's checks: the Page's reads ready.

**The risk on this one.** Meta's own list for this permission asks the recording to show "a post's content" from the
Page. Chanlytics' use is the Page's name and metadata, which Meta's allowed usage also lists ("Get metadata about your
Page"), and nothing here reads a post. If Meta turns it down for that, it goes again in the second submission, beside
`ads_management`, which Meta's table names as depending on it.

### `ads_read`

**Description (paste):**

> Chanlytics shows a small business what each of its Facebook ads cost and what it brought. After the owner connects
> their ad account in Campaigns, Ads, we use ads_read to read the account's ads (name, status, budget and dates) and
> Meta's numbers for each ad by day: amount spent, impressions and link clicks. The Ads page lists each ad with what
> Meta says it spent, and its drawer shows Meta's numbers beside the people that ad brought who wrote to the business
> on WhatsApp and booked, as Chanlytics counts them. Reports, Ads shows the same numbers over time. Without ads_read the
> owner would have to read Ads Manager and match it by hand to their bookings. The data is shown only inside the
> business's own workspace, and we never send Meta anything about who wrote or booked.

**Recording (about 75 seconds):** the sign-in of the first recording, then:

1. Campaigns › Ads: the list of ads, each with its state and what Meta says it spent. Hold on the list.
2. Open an ad. The drawer: **Meta's numbers · last 30 days**: Spent, Times shown, Taps. Beside it,
   **Counted by Chanlytics**: the people the ad brought. Hold for three seconds.
3. Close the drawer. Reports › Ads: the same ad, Chanlytics' count beside Meta's spend.

### The reviewers' field ("App Verification Details")

Set "Can users log into your app using Meta's authentication solutions" to Yes. Then:

> Sign in at https://app.chanlytics.com with the email address and password below. They are for this review alone, an
> owner of one test workspace, and are not a Meta account. Then:
>
> 1. Open Campaigns, then Ads, and press Connect. Sign in with your own Meta test account in the window that opens,
>    allow the permissions, and choose an ad account and a Facebook Page.
> 2. Back in Chanlytics, the ad account's card says Connected and names the Page ("Runs as"). Open it to see its
>    checks. (pages_show_list, pages_read_engagement)
> 3. The Ads page lists every ad in that account that is on, paused, or ran in the last 30 days, with what Meta says it
>    spent. Open one: its drawer shows Meta's numbers. Reports, then Ads, shows the same. An ad made in Ads Manager
>    after you connect appears within the hour. (ads_read)
>
> The recordings show the same steps on our own business.

Ruben writes the address and password into the field himself.

## The second submission: changes (waiting)

**Waits for:** Turn on on main (#2483), the first live ad on Ruben's account, and the first submission's answer. For
`ads_management` and `pages_manage_ads`. The calls each needs inside 30 days: Pause and Resume (20 November) and the
paused-ad check's ad and its creative, so a fresh call is needed after about 20 December; the first live ad makes them.

### Before Submit

- [ ] The first live ad has run at least a day, so the page shows real numbers, and it is still on to pause.
- [ ] Each of the two permissions shows a call count above 0, inside 30 days.
- [ ] The review workspace still on `ADS_WORKSPACES`; `ADS_WRITES` is `live`.
- [ ] The two recordings made.

### `ads_management`

**Description (paste):**

> Chanlytics lets a small business owner run their Facebook ads from where they answer their customers. With
> ads_management we do three things, each only when the owner presses for it: pause an ad, turn a paused ad back on,
> and turn on a new ad the owner made in Chanlytics (its campaign, ad set and ad, made paused, checked by Meta's own
> dry run, read back, then switched on). We also subscribe the owner's ad account to Meta's ad account webhooks, so a
> change Meta makes to an ad, such as a rejection, shows on the page at once. Nothing is changed at Meta without the
> owner's press, and AI never turns an ad on by itself. The owner's own card pays Meta directly.

**Recording (about 90 seconds):** signed out, the sign-in as in the first submission, then:

1. Campaigns › Ads: the live ad, on, with what it spent. Open it: Meta's numbers.
2. Press **Pause**. The drawer reads Paused once Meta confirms it.
3. Wait 30 seconds (Meta takes one change to an ad every thirty seconds), then **Resume**. It reads on again.
4. Open Ads Manager in a second tab: the same ad, on again.

### `pages_manage_ads`

**Description (paste):**

> A Chanlytics ad is an ad for the owner's Facebook Page that opens a WhatsApp chat with the business, where
> Chanlytics' AI answers the person who tapped it. We use pages_manage_ads to create that ad for the owner's Page: the
> ad names the Page and the business's WhatsApp number, and Meta shows it as the Page. The owner sees the ad on
> one screen before anything is made, with its words, picture, area, amount and end date, and presses Turn on. We
> create ads only for the Page the owner shared with Chanlytics, and only on that press.

**Recording (about 120 seconds):** signed out, the sign-in, then:

1. Campaigns › Ads › **+ New**. The one screen: the service, the picture, the words AI wrote, the area, the most it can
   cost and its end date.
2. Press **Turn on**, read the amount it names, confirm. The page shows the ad being made, then on.
3. Open the Page in Facebook, or Ads Manager: the ad, as the Page, with the WhatsApp button.
4. Optionally, tap the ad's button on a phone: WhatsApp opens to the business's number.

### The reviewers' field, added

> To pause or resume an ad: open any ad on the Ads page and press Pause, then Resume, 30 seconds later.
> (ads_management)
>
> To make an ad: press + New on the Ads page. A Chanlytics ad opens a WhatsApp chat that the business's AI answers, so
> it needs the business's WhatsApp number connected in Settings, then Connections, and linked to its Facebook Page,
> which is Meta's own requirement for an ad that opens WhatsApp. Without one, + New says so and makes nothing. If your
> test business has a WhatsApp Business number linked to its Page, connect it there and + New drafts the ad. Turn on
> spends from the connected ad account's own payment method. The recording shows the whole flow on our own business.
> (pages_manage_ads)

## After each answer

- **The first approved:** add each business's workspace to `ADS_WORKSPACES` as it is let in, Ruben's word each time.
  Its card reads "Chanlytics can show these ads, not change them yet" until the second is approved.
- **The second approved:** a business that connected before it holds a sign-in that cannot pause, and must connect
  again for one that can. Nothing tells them yet: a line for them is to build then.
- **The higher tier**, about 4 December: App Review › Permissions and Features › Marketing API Access Tier ›
  "+Upgrade", once Meta counts 500 calls in 15 days with under 15% errors.
- **Turned down:** Meta's reason, answered in its reply box or mended and sent again. No business but Ruben's depends on
  it until it passes.

## Not done here, and why

- **The drawer's line where a member cannot press:** it says "Only the owner can pause an ad or turn one back on." for
  every cause, an owner whose sign-in may only read included. Turn on (#2483) changes the same drawer, so this waits
  for it to land, in its own change.
- **The privacy policy says nothing about Instagram,** which the Meta link uses today. That belongs to Instagram's
  review pack.
