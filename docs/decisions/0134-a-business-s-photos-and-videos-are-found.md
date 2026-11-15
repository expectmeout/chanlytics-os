# 0134 · A business's photos and videos are found, and say where from

**Status:** Accepted by Ruben, 14 November 2026 ("Yes, build it", on the plan `docs/2026-11-14-content-found-photos-and-videos-plan.md`
outside the repository, and its canvas "Content empty state"), with the plan's six calls at their first answers, and built.
Written against main at `e40c45927f`, in one lane, shipped as one pull request with migration 00626.

## Context

An empty Campaigns › Content said "Add a few to start" while nothing told the owner that Ask can look for their photos
itself. It already could, for photos (decision 0099): a website read at the first run found the large photos its pages show,
a linked Google listing gave the ones the business posted, a connected profile filed its own; each waited in the Library for a
Keep. On production it had brought none, and reading why (14 November) found no fault: the only website reads were made before
that road shipped, or were a lead's preview, which looks for no photos on purpose. The finder itself, run on three real sites,
found 12, 12 and 9.

What it could not do was a video. Ruben's word: "we work both photos and videos, so the extract should download videos as well,
as we did in the tests with a salon customer". A website's videos were never looked at (a salon's site played six reels, and their
posters were kept as photos instead), a connected profile dropped its videos, nothing read an Instagram, and the video platform
was only ever handed a browser's own upload.

## Decision

1. **A found video comes in as an upload does.** The video platform fetches it from its address (`POST /stream/copy`), so its
   bytes never pass through us, and the row is made at once (00626 `file_video_found`): its road's status (it waits for a Keep,
   or is filed for a connected profile), the 1,000 files and the 60 minutes held as an upload's are, a twin known by its road's
   name for it (its bytes are never ours to fingerprint), and one a person let go never brought back. The platform's word
   finishes it, and Ask watches and listens to it then, as it does every video. A workspace that takes no videos is passed over.
2. **A website's read looks for its videos.** Each `<video>` and `<source>` whose address is a file, six a site at most, beside
   its photos; a video's poster is no longer kept as a photo of its own; a YouTube or Vimeo player is counted, never fetched. What
   the pages showed is kept with the read (`business_reads.facts.media`), so the page can say what came of it.
3. **Instagram is a road.** A pasted account is read through the scraping platform's Instagram actor (`instagram_read`, one step
   a run: started, asked after, and its posts handed on), its newest 50 posts at most, the account's own only; a post's picture,
   each slide of a carousel and each reel go to `file_fetch` the moment they are read, since their addresses expire within hours.
   Platform-spent, about $0.12 a read. The actor runs at its latest build: a pin is the operator's, read with the key.
4. **The empty page says what Ask looked at.** While nothing is kept, Content's read says where Ask looked for photos and videos
   and what came of each (contracts `content/sources.ts`): its website, its Google listing, its Instagram, a line each, the card's
   one state over them (nothing known, looking, found, looked and found nothing and why), on Made and on the Library. The import
   ledger carries a website's and an Instagram's run (`website_media`, `instagram`), so the card says "Looking" while one runs.
5. **One line to Ask, never a button a place.** The card's input hands the owner's words to Ask, which reads the link in code
   (contracts `content/bring-in.ts`: a website, an Instagram account, or a player, a Drive folder, one post or another social page,
   each refused in words) and proposes a card, `bring_in`, whose press brings it in (POST content/bring-in, the edge's
   `files/bring-in` door). A partner's, as the Library's Keep is.
6. **Made has something before there are photos.** The review idea names the review ("Rosa's 5 stars, as a post"), and the
   website's read, in the model call it already makes, writes three shots to film for a video, which the card shows on Made.

## Left out, each on the plan's calls

- A connected Google profile's videos: Google's media list gives a video's preview image, not the video (its `googleUrl` is "a
  preview image with an overlaid play icon"), so there is nothing to fetch.
- A Google Drive or Google Photos folder (D2): it needs Drive's own access. Ask says so.
- A post of the business's prices with no photo (D5).
- Reading the two real workspaces' websites again on production (D6): after the merge, on Ruben's word.
