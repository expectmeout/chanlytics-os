# 0125 · Content is a view of Campaigns

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, build it"), and built the same day as its first slice. No migration. Written against main at `caaf73ca8d`.

## Context

Ask makes two kinds of thing for a business: a post from a photo (decision 0099, step 3) and a video from its clips (decision 0122). Each showed in three places and nowhere together: Files under Made by Ask, the card in the conversation that asked for it, and the bell. Ruben, 11 November 2026: "we made a generation but I think we are not yet at the stage where we updated the ux ui to display the creatives." He was right: no page drew them as a set, and none said where a piece stood once it was made.

The content canvas of 8 November drew that page as a view of Campaigns (Sequences · Messages · Content · Ads) with a rail of views, numbers from the business's accounts and a plan for the week. Most of it has no record behind it yet. This note is the part that has.

## Decision

1. **Content is a fourth view of Campaigns**, at `campaigns/content` (contracts `CONTENT_ROUTE`), kept on Campaigns' one mount beside the other three (`apps/dashboard/src/surfaces/campaigns/home/route.tsx`), between Messages and Ads on the strip.
2. **It is drawn only where the workspace's switch is on** (`features.content_preview`, contracts `contentPreviewOf`). The switch already offered Connect Meta (decision 0117); it now means "this workspace has Content": the connection and the view. One reader of it, in contracts, which the edge and the dashboard both ask. Where it is off there is no tab, and the address is Sequences, as Ads' is.
3. **Files stays the library, and a made piece is the same row wherever it is drawn.** The view draws Files' own tile and opens a piece where it already opens, in Files, with Back coming home. It keeps no copy and writes nothing.
4. **One read, over records that exist.** `GET content` (`apps/dashboard/src/server/readers/content.ts`) answers what is being made (00613 `pieces`: the ones being made, and the ones not made in the last seven days), a page of what was made here, newest first (`files` whose source is `made`), each with its posts at every place (00611 `posts`), and two counts. Every read is a page or a count, by an index that is there.
5. **Where a piece stands is one rule** (contracts `contentMarkOf`), from its newest post at each place: stuck (held or refused) before going (on its way), before posted, before ready. A piece can be up on Google and held on Instagram at once, and its tile says the one thing that matters most: what needs the owner, then what is working, then what is done.
6. **A video is ready and no more.** A reel has no road to Instagram from here yet (decision 0121), so a made video's line never offers a post it cannot make.
7. **It stays current without a press.** The feed tells a page of a file's change, so a video that lands is drawn. A video still being made and a post on its way are told to no page (00613, 00611), so while one moves the page asks again every five seconds, and rests after ten minutes: the bell says what lands.

## What it does not do

Each of these is on the canvas, and each waits for a record:

- **Needs you.** A piece Ask proposed lives only in the conversation that proposed it until Make it is pressed. Nothing lists proposals.
- **Scheduled.** `posts.scheduled_for` is there, and nothing in the app offers a time.
- **The rail of views with its counts.** Paging "posted" apart from "not posted" at a full library needs a function in the database: a migration, and a slice of its own.
- **Plays, what is working, the accounts' counts, what to film next, the goal line.** Nothing reads a business's accounts or plans from its week yet.
- **The file's sheet opening over Content.** The sheet is Files' own; this slice uses the door that exists.
- **A Google post made before placements were kept** (decision 0121) is not read as posted: it is an event, and the view reads placements.
- **Try again on a video that was not made.** A member's read of `pieces` holds no card key, so the press stays on Ask's card; the tile says why it was not made.

## Deploy order

Either. A new route and a new view; nothing the two apps share changes shape. The edge reads the switch through the same function it read it by.

## Held by

`tests/content/the-content-view-has-an-address.test.mjs` (the address and the switch), `tests/content/a-made-piece-says-where-it-stands.test.mjs` (the rule and its words), `tests/content/the-content-page-is-read.test.mjs` (the read, through its route over a database in memory), `tests/content/the-content-page-is-drawn.test.mjs` (every state of the page, and the strip's tab), and the tables' own tests in `tests/shell/surfaces/` (what the address opens on, hears, and which writes move it).
