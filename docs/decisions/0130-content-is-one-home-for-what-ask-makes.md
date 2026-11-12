# 0130 · Content is one home for what Ask makes, and what it is made from

**Status:** Accepted by Ruben, 11 November 2026, stage by stage ("Yes, plan stage 1", "Build all five", "Yes, begin stage 2",
"Yes, begin stage 3"), and built the same day in three stages. One migration, 00616. Written against main at `21381aaa86`.
Amends 0125's third point: the library is Content's now, not Settings'.

## Context

0125 made Content a view of Campaigns: one page of what Ask made and where each piece stands, drawn with Files' tile, a piece
opening in Files' sheet. Ruben, the same day: it "feels like a proof of concept"; he asked for it redesigned end to end
(the redesign canvas, and its review across Chanlytics). The canvas's answer was one home: everything Ask makes, and the
library it makes it from, in one place, each piece opened where it stands, with the things a piece needs done next to it.

## Decision

**Stage 1, the page.**

1. **A tile keeps its shape** (`apps/dashboard/src/surfaces/campaigns/content/model/tiles.ts`): a story is tall, a square post square, dealt into two to six
   columns by the page's width. A piece being made is the first tile, its first clip dim under Ask at work.
2. **A piece opens in Campaigns' own pane** (`CmSplit`/`CmPane`), as a sequence's record does: beside the grid on a desk,
   the whole screen on a phone. Its address is `campaigns/content[:view]:<file id>`, so Back closes it and a link opens it.
   Arrow keys and a swipe walk the pieces. Its foot holds one coral next step (`pieceNextOf`): post it, post it to the next
   place, try again, keep it, make a post, or save it.
3. **One composer posts to both places** (`post-both.tsx`): a pressed row per place that can take it, one set of words, a
   time, and one press through each place's own door. A place that refused stays on, with why.
4. **Made has five views** (All, Needs you, Being made, Scheduled, Posted), each counted on every read (`GET content?view=`),
   the last three as lines; on a desk, the grid or the kit's table.

**Stage 2, one home.**

5. **The library is Content's** (`campaigns/content:library`): Files' own library, whole, in Content's list pane, its own
   chunk, read only where it is drawn. Settings › Files, its tab, its old links, the bell's rows, Ask's cards and pages, a
   file's record and the Ads composer all land there (contracts `retiredRouteOf`), and a link to one file opens it in
   Content's pane, in Made or the Library as the file is. A library file opens like a piece: keep it, or make a post.
6. **A video's words can be made again**: More › Change it on a video Ask made opens its lines, its end card and its language
   from the plan it was drawn by, and Make it again asks for a new video from the same moments. The first stays.

**Stage 3, what a piece needs next.**

7. **Undo a delete.** A delete hides the file at once and its bytes go ten minutes later (00616 `file_remove`); Undo
   (`file_restore`) brings it back while they wait.
8. **Google keeps a time.** A Google post set for later waits, queued, and its own job (`post_google`) asks Google at its time,
   after the same recheck Instagram's send has. Don't post takes it back until then.
9. **A still from a video.** Five moments across a video, each the picture a post from it would be drawn from, and the one
   kept becomes a photo of the library.
10. **The bell says what moved on its own**: a post set for its time that went up (`post_up`), or one held at its time
    (`post_stopped`). A post sent at a press is seen where it was pressed; a failure is the job's own line, as before.
11. **Today says one line of Content** where it has something to say (what needs the owner, then what is being made, then
    the next post), at the page's foot, from its own small read (`GET content/note`).
12. **The Calendar draws posts** at their times, under Show's own Posts switch, read with the campaigns' span.

## What it does not do

- **A reel.** A video still has no road to Instagram from here (decision 0121).
- **Numbers per post** (plays, reach): nothing reads them yet.
- **Approve or Not now** on a piece Ask proposed by itself: Ask proposes in the conversation it was asked in.
- **Settings' Files tab** stays, and forwards to the Library.
- **The Ads composer's tiles** are its own, not Content's.

## Deploy order

00616 first, then either app. The edge writes the bell's two new kinds only after the database takes them, and a write it
cannot make is logged and let go, so a post is never failed by its line on the bell. Old addresses of Settings › Files keep
landing where they should, whichever app deploys first.
