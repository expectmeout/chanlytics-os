# 0122 · A business makes a video from its clips

**Status:** Accepted by Ruben, 10 November 2026 ("Yes, build it", after the timed test and the quality test of the same day),
and built as the video maker's first slice: one shape, no sound, no posting. Migration 00613. Written against main at
`2670f17b33`. The renderer's licence, left open here, is settled (below, "What is taken"), and a video is made of blocks
since decision 0126, which reads this note's one shape as a plan of clip blocks.

## Context

A business keeps its clips in Files (decision 0099, stage B), and Ask sees them as sheets of frames. Until now the only thing
made from a clip was a still: a post drawn from one moment. The short videos that do the work for a local business (the result
first, then how it got there, then where to book) were cut by hand outside the app.

Two tests on 10 November 2026 settled whether the app could make them. The timed test drew a real plan on a machine started
from a saved image in 13 to 19 seconds for about a cent. The quality test put videos planned the way Ask would plan them
beside the ones cut by hand from the same clips: with bare limits Ask's plans failed (a covered face, a moment that said
nothing), and with seven choosing rules and a look at a storyboard before any card they held up in English and in Spanish.
Ruben judged them better than the hand cuts.

## Decision

1. **One shape, held by one checker.** "Hook first" (`hook_cut`): two to five moments of the business's own clips, each a
   second and a half to four seconds, eight to fifteen seconds together, one or two short opening lines, an end card in the
   business's look, upright at 1080 by 1920. A plan (contracts `PiecePlan`) says which seconds of which clip, the words,
   whether they sit high or low and whether they stay. `compilePiece` is the one place a plan is checked and turned into a
   timeline, and three callers run it: Ask's tool, the press, and the job as it starts. A video made here is never a clip
   another is cut from.
2. **Ask looks before it offers.** `propose_piece` makes no card on its first call: it draws the storyboard (the first frame of
   each moment, with the words' backing where the video will draw it), shows it to the model with a key, and tells it what to
   check, a covered face first. The card is made by the second call, which carries the key; a plan changed since the look is
   looked at again. The tool's description carries the choosing rules the quality test found, and the words are held to what
   the owner said.
3. **The card shows what will be made, one press makes it, and then it follows its video.** The card's stills are the same
   storyboard, drawn by the server from the plan the press will send (`POST files/video/preview`), each moment a still of its
   own. Make it (`POST files/video`, the settings permission, a partner's card) checks the plan afresh, keeps the business's
   look as it stands, and writes the video's row and its job's first step together (`piece_begin`), once by the card's key.
   Three being made is a workspace's most. Once pressed the card reads the video's own row (`GET files/video/[id]`) and says
   where it stands, in the content canvas's states: being made (starting, waiting on its clip, cutting, putting it in Files),
   ready with Open, not made with why and Try again, or no longer in Files. Ready is the moment the video can be played, when
   the bell rings too: the card first waited some 13 seconds more for Ask's look, saying "Ask is checking" after the bell had
   said it was ready, and Ruben chose "Ready when playable" (11 November 2026). The look comes after, as for any file, and what
   it notes is on the video's page; a card with its stills shows the first of them, the video's own first frame, and one drawn
   afresh later shows the poster. Try again is the same press: `piece_begin` takes a video that was not made up again under the
   same key, so a card never makes a second row.
4. **A machine that exists for that one video.** `piece_make` runs one step a run in the lane of someone waiting. `start`
   reads each clip's full-size playback copy for the parts its moments need, starts a machine from the saved image for the
   template's edition, and hands it the addresses to fetch and the timeline to draw. `wait` asks after the drawing; done, it
   reads the bytes, reserves exactly that many at the video platform, begins the video's row as a file made here, keeps its
   own file in its folder, sends the bytes and says they went (`piece_sent`). A drawing that fails, vanishes or is still going
   after three minutes is started once more on a fresh machine; a second such end is the video's. The row says where the
   making is at (`pieces.stage`, `piece_stage`): a clip whose full-size copy is still being made ready can hold a video up to
   twenty minutes, and its card says so rather than "making it". Two runs that finish at once do not both send: the one that
   did not begin the file leaves it alone for two minutes (`piece_sender_elsewhere`), and only then ends a video nobody sent.
   A video whose bytes are a file already kept follows that file, is told as it stands, and deletes nothing of another's.
5. **A made video is a file like any other.** It lands in Files under Made by Ask as a video, is looked at and named as any
   clip is, and plays in the same player. Who is in it is what its clips say: agreed where its plan or any clip says so, no one
   where every clip says so, and otherwise not asked. It is made when the video platform says it can be played
   (`file_media_ready`), which rings the bell (`video_ready`): the row opens the video itself (`admin/files?do=file:<id>`,
   "Watch it"), and Files opens what its address names whichever page the press came from, the router's late address and a
   move on the page itself included (`followFileAsked`). One that could not be made says why in the owner's words (its
   clips, the drawing, keeping it, or unknown): its card over Try again, its bell with what to do and a door that says
   Files. After its bytes went, only the platform's word ends it: no later run can throw a sent video away.
   The look judges a made video as one ready to post: its opening words, end card and silence are its own, and what it notes
   is only what would stop it being posted (contracts `fileVideoLookAsked`, `made`; a clip a member sent is asked as before).
6. **Its own file is kept, so it can be downloaded.** The video platform plays a video and gives no file back. A clip a member
   sent stays with them; a video made here exists nowhere else, so its mp4 is kept in its folder (the `files` bucket takes
   `video/mp4`) and its sheet has Download.
7. **The template is an edition with an image.** The template (`tooling/video`) is bundled into a machine image that never
   expires. `PIECE_TEMPLATE` names the edition and the hash of everything the image is made of; a test fails a template
   changed without a new hash, and `piece_images` says which image each edition is drawn on, written by a script a person runs
   (`tooling/scripts/ops/files/piece-image.mjs`, dry-run by default). The storyboard and the template read the same drawing numbers
   (`piece-frame.ts`), so what a person agreed to is what is drawn. The encoder is held to ten megabits a second, so the
   longest video the shape allows fits the 25 MB its folder takes.
8. **The switch is the one videos already have.** `features.video_preview`: a workspace that keeps no videos is offered none.

## What is taken (decision 0054)

| Dependency                                                                                                                      | Its job here                                                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vercel/sandbox` 3.9.1 (Apache-2.0)                                                                                            | Start a machine from an image, run a command on it, read a file back | **Taken**, in `packages/channels`, behind `files/machine.ts` (`startRender`, `readRender`, `readRenderBytes`, `stopRender`); the edge alone calls it. The platform the edge already runs on, so no new account. Loaded where a machine is used. A machine is started not to persist and is deleted when its video is read, so nothing is left to pay for                                                                                                                                                                                                                                                                                          |
| Remotion 4.0.542 (`remotion`, `@remotion/media`, `@remotion/transitions`; its bundler and `@remotion/vercel` to build an image) | Draw a timeline of clips, words and an end card to an mp4            | **Taken for the template alone**, in `tooling/video`, which is not part of the workspace: installed by `npm ci` where an image is built, never imported by either app, nothing added to CI or a build. Its licence is its own and not one the build's list holds: free for a company of three people or fewer, and a paid company licence above that (a cent a video, a hundred dollars a month at the least). **Three people or fewer (Ruben, 11 November 2026): the free licence**, which its terms read that day give "individuals and companies of up to 3 people" with commercial use. A fourth person is the day to buy the company licence |

Not taken: a video library on the edge (the machine draws; the edge only hands it a job), a second picture library (the
storyboard is drawn by the posts' own, `sharp` and `satori`), and a table of each video's source clips (the plan names them).

## What is not in this slice

- **Sound.** Every video is silent. Music a business may use is a decision of its own.
- **Posting it.** A made video is not put on Instagram or Google from here: a reel waits for its road (decision 0121).
- **More shapes.** One shape; a second is a new entry in `PIECE_SHAPES`, a composition and an edition.
- **Metering.** A video costs about a cent and three at once is the cap; no workspace is charged or limited by count yet.
- **A browser journey.** No Playwright spec yet walks the card and the press: the card's states are drawn in a node test, and
  were walked by hand in the running app over a local stand-in for the server, at a desk and a phone width, in both themes.

## Steps

Shippable in either deploy order, the migration first.

1. 00613: `pieces`, `piece_images`, the doors, the job's kind, the bell's kind, the bucket's type.
2. The edge: `piece_make` and the machines. Before any press it does nothing.
3. The dashboard: Ask's tool, the card, the three routes (the stills, the press, the read), Download. A press before the edge
   knows the job's kind waits on the ledger as any unknown kind does.
4. The edition's image on record (`piece-image.mjs --apply`). Until then a start waits, a minute at a time for half an hour,
   then says the video could not be drawn.

## Tests

`tests/content/`: the plan, its checker and its words (`a-video-is-planned`), the template's hash and the image's record
(`the-template-has-its-image`), a clip's parts (`a-cut-is-fetched-by-its-parts`), what a machine says of its drawing
(`a-drawing-is-asked-after`), the job over machines of a test's own (`a-video-is-made`), the tool, the storyboard and the
press (`a-video-is-asked-for`), the card drawn in every state (`a-video-card-says-where-it-stands`), and the doors on a
real database (`pieces.db`). The view route's download is in `tests/files/a-post-is-kept`, the Files page opening what it
is asked for in `tests/files/photos-beside-the-field` and `tests/workspace/workspace-path`, the bell's two rows in
`tests/today/notifications-durable`, and the job's last failure in `tests/jobs/settle-every-ending`.

## Measured (10 November 2026)

A machine starts from the image in about a second, fetches a video's seconds in 1.3 to 3.8 s, and draws 8 to 12 seconds of
video in 13 to 19 s on eight cores, for about one cent. Four cores took 20 to 33 s and stalled once in nine, which is why a
drawing is waited for three minutes and then started again. The image holds its proof: a clip made of nothing, cut and worded
by the template, drawn from the image as it is built.

The edge's own wire was then run against real machines, which the job's tests had only met as fakes: a start in 0.9 to
3.2 s, two videos drawn in 8.0 and 12.7 s and read back to the byte, a clip fetched in two parts, a deleted machine read as
gone. It found one thing no fake had: the platform gives a command started in the background no exit code until it is
waited on, so a finished drawing read as still going for ever. The drawing's own word that it is done now decides
(`renderStateOf`), and the wait for an exit is bounded.

## Risks

- **The machines' platform changes or stalls.** The seam is four functions; a stalled drawing is retried once and then said.
- **A template change without an image.** The test fails it before merge; a deploy whose edition has no image makes no video
  and says so, and the edition before keeps its own.
- **Words over a face.** The checker cannot see a face. The look at the storyboard is Ask's, and the card shows the same
  storyboard to the person who presses.
- **Leftover machines.** A machine that persists leaves a copy of itself each time it stops. Every machine here is started
  not to persist and is deleted; the image built on purpose is the one thing kept.

## Not decided here

Sound, posting as a reel and metering, each named above. More shapes became blocks (decision 0126).
