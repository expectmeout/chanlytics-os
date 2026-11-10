# 0099 · A business keeps its files, and each is looked at once

**Status:** Built on the lane `cm-files` (`files/a-business-keeps-its-files`), 5 November 2026, as step 1 of
`Claude Video/docs/2026-11-05-ask-sees-its-files.md`. Migration 00551. The look's model call and the Files API were measured on
real pictures on 5 November 2026 ($0.0451, all uploads deleted). The Google photo reads are written to Google's documented
shapes and have not met a real account.

## Context

A business's pictures had nowhere to live. Ask can only suggest a post from a photo it has seen, and a person can only correct
what a page shows them. So a picture needs one place, one name and a written record of what it shows, whichever road it came by.

## Decision

1. **One row a file, one folder a file.** `public.files`, and the private bucket `files`, at `<tenant>/<file>/original.<ext>`.
   Everything a file ever has lives in its folder, so a purge empties the folder whole. A row lives only from its bytes proven
   until they are gone: where a file's bytes are comes from its id and its kind, so no path is stored.
2. **Four roads, one door.** `file_found` keeps every file, whichever road brought it, and answers kept, here or full.
   - An upload and a connected profile's photos land filed: the owner put them there. An upload is the owner's word for a twin that
     waited, and a profile takes over from what a listing offered.
   - A public listing's photos land in the Inbox, and only those whose author is the business itself. Linking a listing proves
     nothing: an owner can pick the wrong one of five results, and a customer's photo of the place is not the owner's to use. When
     the listing changes, or the profile has come in, what it offered and nobody touched goes to Set aside.
   - A website's photos land in the Inbox, since a page may show pictures that are not the business's. A booking platform's page is
     read for its words only, as its pictures are the platform's.
3. **Each is looked at, by the small model.** The `file_look` job reads a copy at most 1568 pixels on its long side, and answers in
   a fixed shape: a sentence, a name, a shelf, who is in it, the words in it, what hurts its use. The answer is read in code
   (`contracts/files/look.ts`), so a model's words reach a row only through a closed shape. Words in a picture are data: the prompt
   says so, and they are never carried into another prompt here. It costs about $0.0005 a file. It runs in the bulk lane: an
   import's 200 must not hold a customer's send. An import's looks are paced two seconds apart, as a row past due by two minutes
   pages Health, and an upload's is due at once.
4. **The owner's word stays over the model's.** A name a person gave and a shelf a person chose are marked (`owner_named`,
   `owner_shelved`), and `file_look_keep` leaves them when the look runs again. `who_in_it` is a person's word alone: no one, or they
   agreed. What the look counted stays on `look.people` (how many, and how many could be recognized), and `whoStandsOf` reads the
   two: a person is asked only where someone could be recognized, or the look could not say. "Agreed" is on the record, with who and
   when, as the `file.changed` event. The rule for Ask is that it uses what is filed, so there is no second switch for that.
5. **A look can come back.** A failed try on a file with a look stamps when it was tried and nothing else, a name is given only by a
   first look, and a refusal moves a file to the Inbox only on a first look. So reading a file again is safe. The sweep tries a look
   that failed or was lost a day on while the file is under a week old, reads again what a lower `FILE_LOOK_EDITION` read, and asks
   again for a removal that has not finished. A hash in `the-look-is-read.test.mjs` fails rules that change without their edition.
   A call that may not go (a paused workspace, a banned person) is no failure of ours: it costs nothing, says it wasn't read, and
   comes back with the sweep. A workspace resumed after a week stays unread until the edition moves, which is accepted.
6. **The model reads by id.** A copy goes to Anthropic's Files API for 90 days, and is sent as a `file_id`, because Ask replays a
   conversation byte for byte and an id never serves other bytes. Files are visible to every key in the workspace they were
   uploaded in, so an id is read only from the row of the workspace asking, is never shown to a member, and is never taken from
   a person, a page or a tool's input. Member sessions cannot select `claude_copy` or `fingerprint`. A look is on the ledger, and
   under the profile, of whoever added the file (decision 0097); an import's is the workspace's. The upload to Anthropic carries no
   profile, as the header is documented only for inference.
7. **A member's bytes go straight to storage.** A function could not carry 25 MB. `POST files/start` checks the door and signs an
   upload address, with no row: nothing holds a name for a photo that never arrives. `POST files/[id]/done` proves what arrived from
   its first bytes, on the server: an image of the kind it claimed, large enough to use and small enough to resize. Where the head
   can't say (a HEIC, a JPEG with more metadata than the read), Storage's own decoder is asked for a small copy: its plain no refuses
   the photo while the person is still looking, and anything else files it for the look to try. Only the service role can then
   make it a file, so nothing the browser says about a file is taken as true. `done` deletes no bytes, so a lost answer can be asked
   again: the `file_purge` its start put on the ledger empties, a day on, a folder that never became a file, and logs it.
8. **A removed file stays removed, and leaves almost nothing.** `file_remove` hides it at once and writes its fingerprint to
   `files_let_go` at the press, so an import in the gap does not bring it back. `file_purge` lets go of its bytes and Anthropic's copy
   and then deletes the row, so nothing that later steps add to it can be forgotten. A person may add it again. A fingerprint is the
   sha256 of a file's first MiB and its size.
9. **Resizing is Storage's.** A page's picture is a signed transform, at one of three widths, behind `GET files/[id]/view`. Storage's
   CDN keeps a copy per signed address, so the address lasts a week and the browser keeps being sent to it for six days: a fresh one
   each hour would be a fresh resize for every picture on every device. The cost is that a cached link outlives a removed member, or a
   sign-out at the same browser, by up to six days, for anyone holding that file's address. Deleting the file ends it for everyone
   within a minute. No image library is taken on this step.
10. **A name is the file's one key, in any language.** Lower case, hyphens, in any script, and refused by the table if it holds
    anything that means something on a page or in a path. A page says it as words (`fileSaidOf`), and what a person types goes back
    through `fileNameOf`.

11. **Ask knows what exists, reads what the look wrote, and opens the pixels.** Three levels, the way a person works from an index
    (step 2). One line in the facts every turn (contracts `filesLineOf`), about 40 tokens, which changes only when the library
    does. The `files` read answers one line a file to choose by (`list`) or the whole note (`get`), and `view` and `compare` put
    the pictures themselves in the tool's result as image blocks. Ask opens a picture before it proposes or judges one, and is told
    never to describe what it only read the note on. Names go in and ids stay out: an id reaches only the image block, never words
    the model reads, a member or a tool's input. The edge makes the copies (`POST /api/admin/files/copies`), since it holds the key,
    and sends no picture the model refused, which can refuse a whole request. A live chain replays its picture by the same id, and a
    picture Anthropic no longer holds gives the replay up for the words, once. The rule for Ask is that it uses what is filed, and
    someone recognizable whom no one has said agreed is the owner's to answer for.
12. **A question can come with files, and "this photo" means the one on screen.** The Line's + (the camera or the library on a phone),
    a paste and a drop each send a photo up by the one door, so it lands in the library and Ask sees it in that turn. Send waits
    until they have arrived. The pictures go in ahead of the words, each named just before it, and a photo alone is a question. A
    thread keeps the files' ids and nothing else of them, so the name a later turn reads is the one that opens the file now, a removal
    takes its note and its tile with it, and no description of a file outlives it in a person's thread. A later cold turn carries the
    name and the note, and Ask opens the file again if it needs to. A scope of kind `file` reads that file by its id with its
    picture, from the sheet's Ask about this photo or from the sheet's address (`?do=file:<id>`); a thread keeps its scope, so a
    live chain that already holds the picture is not sent it again.
13. **A post is made from a photo by code, and it is a file.** No model touches the pixels (decision 0075's rule), so it costs
    nothing, and Ask's card shows the real picture (`POST files/post/preview`) with one press. sharp does the pixels, and satori lays
    the words out as paths, which sharp also draws, so one library less than the plan and no font on the server. The photo softens
    under the words as well as darkening, since a sign behind them read through a scrim alone. The words are held where it is known
    who said what, in Ask's act (contracts `postWordsProblem`): a price, a number, money or a promise must be in the owner's
    questions in that thread or their Settings, or the model is told to use theirs or ask. The band's number is the published one
    (`resolveFacts`), written by code. Once they press Save the words are theirs, so the routes hold them only to what can be drawn. A
    Save stores a shape each in the file's folder (`original.jpg` is the portrait) and keeps the row through `file_made`, so the
    library lists it, Ask can open it, and deleting it lets them all go. No look runs on it: what it says is written at once, and who
    is in it is the photo's. Someone recognizable whom no one has said agreed waits for the owner's word in the thread, which goes on
    the photo at Save. Save and Undo are the partner's, as adding a photo is. A Save calls `file_start` first, as an upload does, so
    a library at its cap is told before anything is drawn, and a function that dies between storing the shapes and `file_made` leaves
    nothing for good: the purge empties that folder a day on.
14. **A kept post is one piece, wherever it is looked at** (`surfaces/files/post-shapes.tsx`, in Ask's card and the Files
    sheet): the picture in the shape chosen, the shapes, and what to do with that one. Share opens the device's own sheet, which is
    how a picture reaches Instagram, and on an iPhone how it reaches Photos, since a download lands in Files there. Safari opens that
    sheet only inside the tap, and one that waits on the network first works or not by how fast the network is, so the picture comes
    before the tap. Whether Share stands is asked of the device, never of how wide it is. There is no public address for a post, and
    none is needed yet: the sheet takes the bytes. When a post is published for its owner, Instagram and Google each fetch from a
    public address, and a short-lived signed link to that one shape should do. A post is never resized: it is drawn at its own size,
    and about 60 KB.
15. **A post is changed where it stands, for nothing.** Whoever may save it can change its words, its layout, its type and where the
    words stand, on the card. A pause in the typing draws again (`POST files/post/preview`, on a limit of its own), a newer change lets
    the last request go, and what the tab has drawn comes back at once (`surfaces/files/post-drawn.ts`, a few dozen pictures, the oldest
    let go). The picture stands until the next is read whole, then gives way to it (`post-frame.tsx`), and saved, the same picture stays
    on screen, so a press never answers with an empty frame. What was pressed rides with the card's outcome, so a reload says the words
    that were saved, not the ones proposed. Four layouts: over the photo, from the margin over it, on a band of the business's colour,
    or under it in a frame. Words over a photo stand on the scrim; words on a colour take black or white, whichever reads, and of those
    two one always passes 4.5:1. The process holds a photo for a few minutes, since a file's bytes never change and most of a picture's
    time was reading it; its row is read first each time, under the caller's RLS, so a file removed is never drawn from memory.
16. **A photo makes a post in one press.** A kept photo's sheet says Make a post, where a person who may save one can use it: not on a
    post, nor on what isn't kept yet, nor on a picture with a design of its own (`postPhotoWont`, one reading the model and a person
    hear in their own words), and not until the sheet's own question of who is in it has been answered, since a press would pay a
    model to ask the same. It asks Ask in a conversation of its own, in the language Ask last spoke, with the photo already open: the
    scope brings the picture, so the turn skips the list and the view, and asked only for a post the model proposes plain words at
    once, since the card can change them for nothing. Ask's chips say the same sentence where it opens on a photo.
17. **A kept post remembers how it was made.** Its sheet says which photo it came from, a door to that photo while it is here, and
    New version starts from what the post was asked to be and keeps another file, the first left as it was (`GET files/[id]`,
    `surfaces/files/post-version.tsx`). A member's session has no grant on `made`, so the service role reads it, after the caller's own
    read of the row. Beside a picture opened, Ask reads how the newest post looks (`last_post`: its type, its layout, its number), and
    keeps that unless it is asked for something else. It is told rather than held to it by code: before the first post the model
    chooses from the business, and it can only know there is none by being told.
18. **A shelf comes a page at a time, and the server says how the library stands.** `GET files` answers sixty of one shelf, newest
    first, and a tally of every file, so the page's counts and its shelves are true whichever page it holds. The next page starts just
    past the last by its time and id, so a file kept while a person scrolls moves nothing past them, and two kept at one instant still
    have an order. A read again asks for what is on screen, so a shelf chosen and what was scrolled through stay put when the feed says
    something changed. The Inbox comes whole, since its one press covers all of it and it empties. A shelf is asked of the database
    by `shelfFilterOf`, which a test holds equal to `shelfOf` over every file there can be. A tally still reads a small row per file:
    Ask's line and a page's head read four short columns where they read every look, and a count in SQL would need a migration for a
    read that is a few KB at the cap.
19. **A kept post goes on the business's Google profile, on a person's press.** A kept post's sheet offers it where the Business
    Profile is connected and the photo it came from is still here: the picture as Google shows it, drawn at 4:3 from what the post was
    asked to be, the words that go under it, and one press. It is public as soon as Google has looked at it, so nothing does this by
    itself, and Ask has no tool for it. The picture is kept in the file's own folder, so the purge that empties a file empties it, and
    Google is sent a day's address to fetch it. The ledger keeps Google's name for the post (`file.posted`, `file.unposted`), which is
    how the sheet knows it is up, and how it comes down; a name that isn't this connection's takes nothing down. Campaigns' ads are
    still a mock, so Google is the first place a post goes.

20. **A picture is shown with its size beside its name, and a box is named in those pixels** (Ask's eyes, 6 Nov 2026: Ruben,
    "the fundamentals that the ask can see/digest images and videos the same way you can"). The edge's copies door answers each
    copy's width and height with its id (`apps/edge/lib/files/copies.ts`), and a picture opened, or attached to a question, is
    labelled `The file x (1568×1176):` (`tools/context.ts openedPicture`). Anthropic's own advice: Claude works best with absolute
    pixel coordinates on the image it was sent, and our copies fit its tier unchanged, so a box maps one to one. `get` says a
    photo's size too.
21. **`files` has `zoom`: one box of a picture, cut from the photo itself and enlarged, held for the turn.** How a small sign, a
    price or a face is read, the way a person leans in. The box comes in the pixels of the size the picture was shown at; the cut
    is made in the dashboard with sharp from the original where the code can read it, and from Storage's largest copy (2,500 px)
    for a HEIC or an original past 12 MB (`server/files/zoom.ts`); a point is widened to a region, a small cut is enlarged to
    read and never more than four times, and the long edge stops at the size a picture is shown at. The bytes go to the edge's
    copies door as a picture made for one turn, kept at Anthropic for a day (`FILE_PICTURE_KEEP_S`), past any live chain, and
    written on no row. About a cent a zoom.
22. **Once a picture is open, the rounds after it think at the draft's effort** (`effort.ts lookHarder`), by the effort message
    that already raises a draft, appended after the results, so the cache holds; a question that came with pictures, the scope's
    photo or one attached, is raised from its first round, at its first request (`open`). Judging what it sees is the work the low
    effort was never meant for. Once a turn, as a draft is, and never
    on a spoken turn.
23. **An answer's history line says what Ask opened in that turn**, by the name that opens it now (`[Opened: storefront-dusk (A
shopfront at dusk.)]`, contracts `withFilesOpened`), as a question's says what it came with, and a rule tells it that a
    picture from an earlier turn is not in front of it until it opens it again. The pixels of a live chain last as long as its
    cache (`LIVE_WINDOW_MS`); the words last.
24. **Ask looks at the post before it offers it, and code holds it to that.** The first call of `propose_post` draws the post as
    its card would, shows it to the model (`The post drawn from x (1080×1350):`) with a `look_key` that is the plan whole, and
    makes no card; an answer written beside that look is set aside (`turn-end.ts besideActs`). Only a second call carrying the
    key makes the card, and a plan changed since the look is refused back to be drawn again. A drawn post the edge could not hold
    still makes its card on the key, with the model told to say it could not check the picture. One round more on every post:
    estimated three to five cents and three to four seconds, to be measured on the first real turn.

## What it costs

- The look: about $0.50 per 1,000 files, on the workspace's usage.
- A picture Ask opens: about 2.5 cents on Opus the first time (about 2,400 tokens written to the cache), under Ask's own day budget.
- A post made from a photo: nothing. Code draws it, in about 0.9 s on production (2.7 s cold), and a Save takes about 2.5 s.
- A press of Make a post: $0.36 on a cold cache, in one round and 5.7 s, measured once on production on 6 Nov. Typed, with Ask finding and opening the photo itself, the same post took four rounds and $0.52. A warm cache has not been measured.
- A question about a photo from its sheet, with a zoom and a post: $0.49 on a cold prefix, of which $0.30 is the prefix the sheet's
  warm writes, and $0.19 past it; three rounds, 14.5 s, the card at 17 s, measured once on production on 7 Nov.
- A listing's photo: about $0.007 from Google Places, at most ten a link, on the platform.
- Storage's transforms: billed per source image past Pro's allowance, on the platform.

## Deploy order

The migration first, on Ruben's word, then the code. The job kinds and the door only exist once the migration has run; nothing
starts them until the code is deployed. A dashboard ahead of the edge shows the tab, and a photo added waits for its look.

## What the first real upload proved

On production, 5 November 2026, through real Storage and the deployed edge, in the test workspace. Each look cost about $0.0005.

- A portrait JPEG and a portrait HEIC stored on their side with an orientation flag came back upright, so the look's box is right.
- A signed upload address used twice answers HTTP 400 with `"statusCode":"409"` in its body, so a retry that goes on to the proof is
  right, and Try again signing a fresh one is too.
- A file Storage cannot decode answers 500 in the status and the body, the same as an outage, so it is kept: its tile says its name,
  its look fails, and its owner can delete it. Refusing on a 500 would refuse every HEIC while Storage was down.
- A repeat view of a resized picture is a CDN hit, which is what the week-long address is for. No browser cache header comes back on
  it, so the browser asks the CDN again and the redirect is what it keeps.
- Storage's client encodes a download's name twice, so it is put on the address in the code, encoded once.

## What the first real Ask turn proved

On production, 6 November 2026, in the test workspace, one question over three test pictures. Ask listed the catalog and opened all
three, and read out words on their signs and the colours of their walls, none of which is in a note, so the pixels reach it.

- It cost $0.58 in all: $0.31 for the cold first round, which is what any first round costs (the average is the same); $0.15 for the
  round that read Today and the catalog; and $0.12 for the last, of which the three pictures were about $0.07.
- So a picture itself costs cents, about 2,400 tokens written to the cache. A turn about pictures is priced by the turn.

The same day, one question with a photo attached, a HEIC to begin with: one round, no reads, $0.34. Ask said what colour stood above
the sign and which side the light window was on, neither of which is in the note.

## What the first real post proved

On production, 6 November 2026, in the test workspace.

- sharp's native code and the font files reach Vercel's function with no setting of ours. A picture took 2.7 s cold and about 1 s
  warm, a Save 2.4 s, and the three shapes read back at 1080 by 1350, 1080 by 1080 and 1080 by 1920. Deleting one left no row and no
  object.
- A real turn on "make a post from our storefront photo saying we're open this Saturday" took four rounds and $0.52. Ask found the
  tool, listed the files, opened the picture and proposed. Its first card said "Saturday, November 7", and the check refused the 7
  because the owner had not said it, so it took the line off and proposed again. The date was true, read from the clock: if owners
  want dates on posts, code should print them.
- It warned, unasked, that the sign in the picture read another business's name and that Files flags it as possibly stock, and it
  asked for the hours and did not guess them.

## What the first turn with eyes proved

On production, 7 November 2026, in the test workspace, on a drawn shopfront of 1,600 by 1,200 whose window sign is 12 px and its
fine print 9.5 px: from the photo's sheet, Ask about this photo, and one question asking for the hours and the small print exactly,
then a post saying we're open Saturdays. Three rounds, 10.8 s, the card on screen at 13.3 s; $0.76, of which the look was $0.0006.

- The label said the size, `(1568×1176)`, and the box Ask named, `[262, 560, 624, 705]`, is the sign to the pixel against the
  drawing: the copy maps one to one, as the docs say. The cut, 369 by 148 of the original shown at 1,000 by 401, reads every line
  of the fine print.
- The effort rose after the round that opened pictures (`draft.by: picture`), and the raise cost the cache nothing: the two rounds
  after it read 40,156 and 43,350 tokens from it.
- The two beats worked as drawn: the first call drew "Now open Saturdays" and showed it; Ask looked, changed the line to the owner's
  own words, "We're open Saturdays", drew again, and only then made the card, with the key, in 7 ms. Its band sits under the photo,
  clear of the sign. Two rounds more than a one-call post here, one for the look and one because it changed what it saw; a round
  about 2 s and 5 cents, as estimated.
- `opened` is on the answer's row, so a cold follow-up will know what it looked at.

Two things were wrong, both small:

- The owner's question went unanswered. The card's call was the turn's last message, and nothing was written beside it, so the
  turn's end said only that there was a card to review. The note under a drawn post ended "Say nothing to the person until it is
  [made]", and Ask read it as say nothing at all. The note has to say where the answer goes: beside the call that makes the card,
  since that call ends the turn. Fixed the same day: the note and the tool's description say the call that makes the card ends the
  turn, so the answer to the rest of what they asked goes beside it, in the same message, and that nothing written beside the look
  reaches them (which code holds: `besideActs` sets it aside).
- The first round ran at the turn's own effort, though the photo was in the question from its first byte: it came by the sheet (the
  "about" chip), not as an attachment, and only an attachment raised the effort from round one. At that effort Ask called the zoom
  and the post in one breath, before it had read the sign. The scope's picture is known once the first reads are in, before the
  first request, so the raise belongs there. Fixed the same day: `effort.open` is told whether the question's pictures are there
  (`questionPictures`, the scope's or attached) and raises before the first request; an attachment alone decided it before.

The first $0.30 of the $0.76 is the cold prefix written twice: the sheet's warm fires as Ask opens, and the script typed its
question inside a second, before the warm had written. A person typing for ten seconds reads it, and the turn costs about $0.49.

## What the second turn with eyes proved

On production, 7 November 2026, after #2174, in the test workspace: the same drawn shopfront, the same question from the photo's
sheet, typed ten seconds after the sheet's Ask opened, as a person types. Three rounds, 14.5 s, the card on screen at 17.1 s;
$0.49, of which the warm's cold prefix was $0.30 and the turn past it $0.19 (the look $0.0006).

- The question is answered beside the card: the sign word for word (WELCOME; Open Monday to Saturday; 7:15 am to 3:30 pm; Closed
  Sunday), the small print exactly, and the post in a paragraph, written through the answer tool in the message that made the card.
- The first round ran raised: in the request as it went out, the effort message stands after the question and before the first
  assistant message, and the rounds show it. Round one was the zoom alone, the post was drawn in round two and the card made in
  round three with the answer: two `propose_post` calls where the first turn took three, and round one thought longer (5.1 s
  against 3.8).
- The ten seconds paid: round one read the warm's 29,689 tokens from the cache and wrote 3,449, where the first turn wrote 33,060
  again. A question about a photo from its sheet costs about $0.49 on a cold prefix and about $0.19 on a warm one.

## What is left to prove

- A real iPhone: what it hands over when asked for HEIC too, and sending from one on a weak line, in Files and in the Line. Share
  from a post, twice on one page, to Instagram and to Save Image; and a post from a photo the camera just took.
- A zoom of a HEIC, which cuts Storage's 2,500 px copy, and of a photo over 12 MB.
- That a real phone reuses the cached redirect.
- The file_purge a start leaves itself, a day on: `file_never_filed` in the logs for bytes that never became a file.
- A real Google profile's media list and a real listing's photos, on the first real connection. Whether Places names the business
  as the author of the owner's own photos is unverified: where it does not, a listing brings nothing, and a connected profile still
  brings them all.
- A photo name from a listing can expire, so nothing here re-reads by a listing's `source_ref` once it is kept.

## Stage B: a business keeps its videos

Built 7 November 2026 against `Claude Video/docs/2026-11-07-stage-b-video-prd.md` (v3, D1–D23), behind the workspace's
`features.video_preview` (contracts `videoPreviewOf`, the flag registry's `video_preview`). Nothing is applied or deployed:
migration 00556 goes on production on Ruben's word, before the code that needs it merges.

- **The row.** `files.kind` (image or video), `media_ref` (Stream's id, unique: the webhook knows nothing else),
  `media_status` (uploading, processing, ready, failed), `media_error`, `ready_at`, `seconds`, `sound` (contracts
  `FileSound`) and `sound_said`; the bucket takes `audio/mp4`. A video still `uploading` is no file to any page or to Ask:
  every member read leaves it out.
- **The doors** (00556): `file_video_begin` (the row with every fact the browser gave, a twin, the workspace's files or its
  minutes), `file_media_processing` (done, the one a member calls, with the settings permission), `file_media_ready` and `file_media_failed` (found by
  `media_ref`, finishing a row whether or not done came), `file_upload_lapsed` (a video whose bytes never arrived, a day on)
  and `file_sound_keep` (one part of what was heard at a time), each else the service role's. The member's `file_start` is unchanged: the permission, the
  cap and the purge a day on, which now also lets a lapsed upload's reservation go.
- **The road.** `files/start` (a video's facts besides) → the edge's `admin/files/video-start` (the switch read there, since a member may not read the config; a tus reservation at Stream,
  `requiresignedurls`, four hours, `maxDurationSeconds`, then the door; a twin or no room lets the reservation go) → the
  browser's own tus sender (`surfaces/files/video-send.ts`: HEAD, PATCH, resume from where Stream stands, the address kept on
  the device by the clip's fingerprint) → `done` → Stream's webhook (`api/stream-webhook`, its HMAC checked) or the sweep's
  read of Stream two minutes on → `video_digest`, one step a run: the sheet (48 frames, sharp, 2,576 px, the edge's copy at
  Anthropic), the sound kept as `audio.m4a`, the words (the ear's one call, or Scribe), the note, then `file_look` with the
  sheet, the words and the note, and the poster cut again at the frame it chose. Delete lets the video go at Stream first.
- **Ask.** A video opens as its sheet, named a video of its length, with how its frames are laid out and what was heard after
  it, fenced, every part named by who heard it; `zoom` takes `at`, `at` with `box`, or `from` and `to`; `listen` puts a
  question about a stretch to the ear; `propose_post` and the sheet's Make a post refuse a video in words. The Line's + takes a
  video and Send waits for it to be made ready, two minutes at most.
- **The page.** A tile is the poster with its length, "Getting it ready" until then, "Couldn't be prepared" for one Stream
  could not read; the sheet holds Stream's player (a token for an hour, the poster ours, captions in the language spoken), what
  is said and how it sounds. The CSP names Stream's frame and upload hosts. Health is paged from 80% of the account's minutes.

Where the build parts from the PRD, and why:

- **Gemini's `generateContent`, not the Interactions API**: the Interactions API keeps what it is sent 55 days by default, and
  nothing here needs its state. Gemini 3.5 Transcribe is not wired: its answer's shape is not documented yet, so the words'
  shapes are the one-call ear (the default) and Scribe, by `VIDEO_WORDS_MODEL`.
- **Scribe is sent the sound's bytes** (its `file` part), not a signed address of ours, and answers in the same request; its
  asynchronous webhook is not wired, since ten minutes of sound is inside a step's run.
- **No tus-js-client**: its last release (January 2025) is outside decision 0054's year, and it brings seven packages; tus's
  core (HEAD, PATCH, the offset) is a few dozen lines of ours.
- **sharp on the edge needed the build to carry it**: the edge's functions are esbuild bundles, which cannot hold a `.node`
  file, so `tooling/scripts/edge-functions.mjs` keeps a native module external and copies it, and what it needs, beside each
  function that loads it (`NATIVE_MODULES`). The times on a sheet are drawn as segments, so no font need be on the machine.
- **The doors take Stream's id alone, not the workspace** (`file_media_ready(p_media_ref, …)`): the webhook knows nothing
  else, and Stream's ids are the account's, so `files_media_ref` is unique across workspaces rather than within one.
- **A clip re-picked after a lost upload takes the dead upload's place** (`file_video_begin`): a twin still `uploading` is
  removed and purged, and the new reservation goes on; a reload within the address's life resumes instead.
- **Permissions-Policy is left as it is**: fullscreen, autoplay, picture-in-picture and encrypted-media are not denied there,
  so the player's `allow` delegates them; naming Stream's host would take a wildcard origin some browsers read as none.
- **Health is paged, not drawn**: the account's minutes are read each health sweep and paged from 80%, as the page reader's
  credits are, so they show in Health's "What paged us"; there is no line of their own on the Console.
- **The ear writes in English**, as the look does: Ask says it in the person's language.
- **The sweep asks Stream only after videos still waiting** (uploading or processing), at most fifty a pass: a ready video
  deleted at Stream by hand is not found by it, and its sheet says it can't play. Reading every ready video would spend the
  account's 1,200 calls in five minutes, which every Cloudflare product shares.
- **Stream's two one-time calls** (the webhook and the signing key, §16.3) are `tooling/scripts/ops/files/stream-setup.mjs`: a dry
  run by default, the webhook as it stands written as a backup first, and the three values written to a file of their own,
  never printed.

What is left to prove is the PRD's §13 trial, on Ruben's word and the accounts' own keys (a script in the scratchpad), before the
switch goes on: the thumbnail's time precision, an iPhone clip, processing times, tus from a phone with a reload, the bill, the
ear's two models, the sheet at 2,576 against 1,568, and the words' shapes. The Gemini key is made on a billed project. The
nightly's video journey (`e2e/settings/files.spec.ts`) runs where the e2e workspace takes videos.

## A library of clips: what Ask reaches, and a post from one moment

A read of the whole chain on 9 November 2026, against a business whose library is mostly clips, found what such a library would
meet before any video is made for it. This is what needed no migration.

- **A list is read a page at a time** (`files` action list, `page`). It answered its newest forty and nothing after them, so most
  of a long shelf was out of Ask's reach unless a search word happened to find it. It says `more` and the `next_page` to ask for.
- **A search reads what is said.** `about` read a file's name, its look's line, the words seen in it and its sound's few words. It
  reads the words spoken in each video too (`listVideosHeard`), only when a search asks; a workspace's hour of video bounds it.
- **The moment a video's look chose is said** (`stands_at`, where a video is read and where it is opened). The look names the
  frame that stands for the clip, and only the poster used it.
- **A post is drawn from one moment of a video** (`propose_post` with `at`, kept as `PostPlan.at`). A video was refused whole, so a
  library of clips made no post at all. The edge cuts the moment whole, at the clip's own size, and keeps it in the video's folder
  (the copies door's `frames`, contracts `fileFramePathOf`); the dashboard then draws from Storage as it does from a photo, so the
  card's picture, its Save, a new version and Google's wide picture all read the same still, and it goes when the folder does. A
  video not ready yet makes none, the moment is held inside the clip, and no model is sent the frame by this road.
- **A video's length asked of Stream is kept** (`keepVideoSeconds`). Known to one run of the digest alone, the page said no length
  and every closer look was refused as past the clip's end.
- **A video that is ready and has no sheet to show is said as not opened**, where it was said to be still on its way.

Left, each a migration's and so a change of its own: who may add a file (every write is an owner's or a partner's, where the
content plan has the people who film adding their clips); a clip's own date (its row holds only when it was added, so "oldest
first" cannot be said); and a failed video's fingerprint holding its twin out until the failed one is deleted
(`file_video_begin`). The pictures a site or a listing showed before 00551 are brought by one `website_read` for the workspace:
nothing reads them again by itself. Nothing here has met a real clip; the trial above still stands first.

## Not here

Making pictures with a model (step 4): Claude Video/docs/2026-11-06-ask-eyes-fundamentals.md says the order.
