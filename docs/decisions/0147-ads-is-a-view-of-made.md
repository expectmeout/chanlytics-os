# 0147 · Campaigns holds three tabs: Ads is the last of Content's Made views

**Status:** Approved by Ruben, 23 November 2026 ("Yes, start Lane A", on the plan "Campaigns in three tabs" v3 and its
canvas, the six calls taken as drawn), and built on one branch, Lane A of the plan. No migration. Written against main at
`90ab862287`. Amends 0125 (Content beside Sequences, where Ads was a tab of its own). Lane B, Forms holding a website's
forms, is the plan's next and is not this note.

The code's comments name this "Campaigns in three tabs" and its calls by the plan's numbers (call 6).

## Context

At `90ab862287` Campaigns' strip read Campaigns · Content · Ads · Forms where Ads was drawn
(`apps/dashboard/src/surfaces/campaigns/routes.ts`, `campaignsViews`), four tabs where every other page holds three at most
(the Inbox's Needs you · Conversations · Live, People's, Reports'). Ads showed pictures and videos Content had made, paid
for, with nothing on either side saying so: a piece made into an ad did not say it ran, and the ad did not say which piece
it was. `ads.approved->>'picture'` already held the piece's file id (`server/content/ad-pictures.ts` follows it when a file
goes). Where Ads was not drawn, an Ads address (a notice, an email, Meta's return) landed on Campaigns' list without a word.

## Decision

1. **Three tabs.** Campaigns · Content · Forms, in every workspace.
2. **Ads is Made's last view**, after a quiet "Paid", where Ads is drawn (`ads/shown.ts`). Its addresses stay
   `campaigns/ads…`, so every link, email and notice that names one still opens it; they light Content, and the crumbs say
   Campaigns › Content › Ads › the ad. Ads keeps its own code, reads and state as a view kept beside the others
   (`home/route.tsx`), and is drawn in Content's own split and list under Content's bar (`ads/content-bar.tsx`: Made lit among
   the lists, Ads among the views), so the bar stands to the pixel where it stands on Made's other views, on a desk and a
   phone. Content and Ads share the strip's place, so the deck slides nothing between them.
3. **Where Ads is not drawn, an Ads address opens Content's Made**, where Ads would be.
4. **One amber signal.** Content's tab counts what needs the owner in Made and in Ads, as each last read it: Made's pieces
   that need them, each ad whose `needs` is set, and an account Meta took back as one (`ads/needs-you.ts`). The Ads choice
   among the views carries the amber dot while one does.
5. **A piece and its ads name each other.** (Amended 24 Nov 2026, Ruben: a piece names its ads once, in the content loop's
   pass 6 line under Where it goes, with its results; the details' "Used in N ads" and the file's `used_in` are gone.)
   A piece's details said "Used in N ads", each a link to the ad with its standing
   in the words its row on Ads says (contracts `AD_STATE_WORDS`, the one table of them); the GET of a file says `used_in`
   only where there are some, asked of the database by the file (`listAdsShowingFile`). An ad made here says "Made from"
   its piece, a link, or "a piece removed from Made". Both follow `ads.approved->>'picture'`, the link a removed
   piece's ads are paused by; an Ads read names its pieces in one files read (`readers/ads-page.ts` `namePictures`).
6. **Ads says what it is.** "Paid · from your Meta account · last 30 days" over its sentence, on a desk and a phone; its
   lens says "Last 30 days · the same days Ads counts".
7. **An ad opens whole on a phone**, at the kit sheet's full rest, with the rest control to make it smaller.
8. **Content reopens where it was left** (call 6, `home/left-at.ts`). From another view Content's tab goes to the place last
   shown in the visit, Ads among Made's views, with the piece or ad left open, as Back would. On a phone the list and view
   are kept on the device as Grid or List is, so the next visit's first press opens there; a piece or an ad is not, since a
   later visit may not hold it. A link or a notice opens the place it names, and the tab pressed on Content or Ads goes to
   Content as it opens, the way out of Ads to Made's other views.
9. **AI and the words.** AI's jump list reaches Forms, and Ads where it is drawn; AI's own words and the privacy and data
   deletion pages say "Campaigns › Content › Ads".

## What it does not change

- **Nothing is read for the amber count.** It is what Content and Ads last read: before Ads has been read in a visit,
  Content's tab counts Made alone. The strip hears both (`SurfaceViews.heard`) and draws the count again as either lands,
  and a count noted in one workspace is never said in another.
- **The bell and Today are as they were.** Today reads no ads; the bell's notices about an ad or the account are the edge's,
  and only their addresses' crumbs change.
- **Ads' code is not moved into Content's.** The plan's A1 drew its parts out of its page first; drawing the page as it is
  in Content's split, under Content's bar, gives the same screen with its reads and its first-read wait untouched.
- **A desk keeps nothing on the device**, and Sequences' and Forms' tabs go to their lists as before.

## Deploy order

Either: the dashboard alone changes. `AdLiveDto.made_from` and the file's `used_in` are new fields the same deploy writes and
reads.

## Tests

`tests/content/the-content-page-is-drawn.test.mjs` (three tabs, an Ads address lights Content, Ads off opens Content),
`tests/ads/ads-foundation.test.mjs` (Ads is no tab), `tests/campaigns/content-reopens-where-left.test.mjs` (call 6), the two
Ask page tests and `tests/ads/make/after-turn-on.test.mjs` for the new words.

## Risks

- **A phone shared by two people** reopens Content on the view the other left: the key holds a list's and a view's name and
  nothing of the business.
- **The way to Ads on a phone is longer by the menus** (More, Campaigns, Content, the views pill, Ads): every other way in
  opens the exact place in one press, and call 6 makes the second visit one press from Campaigns.
