# 0146 · A made video keeps a copy on the shelf

**Status:** Decided by Ruben, 23 November 2026 (the archive plan's step B2, revision 2 of its build plan, with its
requirements at version 1.1). Built with this note on the lane `files/a-made-video-keeps-a-copy-on-the-shelf`
(migration 00695), waiting for his word to push; nothing of it is on production, and the bucket it needs is not made.
Written against main at `462e20d27a`. Builds on 0145 (a file says where its copies are) and 0099 (a business keeps its
files).

## Context

- A workspace's videos hold sixty minutes at a time at the video platform. A watched folder's clip gives up its place
  when nobody used it lately, because its folder can give it back (`file_copies_let_go`, 00654). A video Chanlytics
  made could not: nothing held another copy the platform could fetch, so each one kept its minutes until deleted.
- A made video's own file is kept in Chanlytics' files bucket since #2248 (`fileMadePathOf(tenant, id, "video")`), as
  the bytes the platform was given. It is private, read through a link signed for minutes, and nothing fetches from it.
- 0145 gave a copy a record (`file_archives`, `file_archive_parts`, 00686) with an origin of `shelf`, and no rule
  over it. The relay (`apps/relay`) is the one place a video's bytes pass on their way to the platform, under a ticket.
- The Worker's incoming body is capped at 100 MB by the zone's plan, and one job's call lasts forty seconds
  (`FUNCTION_CEILING_MS` less `CLAIM_FOR_MS`).

## Decision

1. **A video made here keeps a second copy on a shelf of Chanlytics' own**: a private R2 bucket bound to the relay
   and to nothing else, with no public address. The first copy is the file kept since #2248. Two, because they do
   two jobs: the shelf is where the video platform fetches from (ranges, under a ticket, for as long as a fetch
   takes), and the kept file is what the shelf is filled from, the first time and again if the shelf ever holds
   something else.
2. **The relay pulls; nothing is pushed to it.** The app hands it a link to the kept file signed for ten minutes; the
   relay fetches it, with no redirect followed, from an address that must begin, whole, as one the deployment names
   (`SHELF_FROM`). So no body crosses the Worker's cap, and no address a request invents is ever fetched.
3. **Only a file's own bytes can sit under its key.** The ticket for a put names the bytes (their size and SHA-256,
   taken as the video was made); the bucket itself refuses any other (`sha256` on the put). The key is
   `<workspace>/<file>/video`, built from the ticket's claims and nothing a request says.
4. **The shelf's ticket is its own format** (`v2`), signed with the key a clip's ticket uses and read by a reader of
   its own: a clip's ticket opens nothing on the shelf, and the shelf's no clip.
5. **A copy's row and its job are written in one statement of the database's** (`file_shelf_begin`, and
   `file_shelf_again` for a copy put back): never a row left saving with no job. The half-hourly pass is the floor
   under that (`file_shelf_requeue`: saving for an hour, its job written again), and nothing should need it.
6. **A copy is checked before anything leans on it, and again before a video steps aside.** After the pull the app
   reads back what the shelf holds and compares the size and the checksum (`file_shelf_checked`). Before a let-go
   deletes a made video's copy at the platform it asks the shelf again (`askShelf`); where the shelf holds nothing or
   other bytes, the video stays where it is (`file_copy_kept`), the copy is put back from the kept file, and one error
   line says so (`shelf_copy_lost`).
7. **Which video may step aside is one rule, in one place** (`file_copy_shelved`): a checked shelf copy, read by the
   let-go's door, by when room frees and by the minutes each road holds. A made video with no checked copy never
   steps aside, and an upload or a found video never does.
8. **A return from the shelf spends nothing at Google**: no units, none of the platform's bytes a day. The workspace's
   returns a day still bind. It is the same return as a clip's, through the same door and the same job.
9. **No put lands late.** A pull's pipe is cut sixty seconds after it began, so a put has ended by then, stored whole
   or not at all. A purge comes at least ten minutes after a removal, and a workspace's delete waits where a copy is
   being put within the last two minutes.
10. **A removed video leaves nothing on the shelf.** The purge that lets a file's bytes go removes its shelf copy
    first and holds the file's row until the shelf says it did; a workspace's delete counts its shelved videos in the
    dry run, names them in the backup, and removes them through the relay after the rows. An erasure of one person
    reaches no Library file today (a file leaves with its workspace or by its owner's delete), so these are the two
    roads a shelf copy leaves by.
11. **No word of any of it reaches a screen.** A made video that stepped aside is its still with Play and its sound;
    coming back it says "Getting your video ready…". `docs/words.md` holds the rule and
    `tests/files/screens/a-made-video-says-no-storage-word.test.mjs` every sentence.
12. **It is on a switch** (`features.video_shelf`, the flag registry's `video_shelf`), off for every workspace until
    it is set: for the test workspace alone until the later step that pins the numbers.

## Shape

- The relay: `apps/relay/src/shelf.ts` (the shelf's whole rule over a bucket, a fetch and a clock), its ticket in
  `apps/relay/src/ticket.ts`, its road in `apps/relay/src/index.ts`. `HEAD`, `GET` with one range, `POST` (a pull),
  `DELETE`. `apps/relay/README.md` has the table and the deploy steps.
- The app's side of the wire: `packages/channels/src/files/shelf.ts` (`putOnShelf`, `readShelfRecord`,
  `removeFromShelf`, `relayShelfAddress`) under a breaker of its own (`relay`), and the signer beside the clip's
  (`signShelfTicket`).
- The rules: 00695. `file_shelf_begin` answers `none`, `kept`, `full` or `begun`; the shelf holds 300 minutes a
  workspace (`FILE_SHELF_MINUTES_MAX`, a guess until the walk's two numbers are read).
- The job: `file_shelve` (twice, forty seconds a call, thirty-five for the pull), `apps/edge/lib/files/shelf/shelve.ts`.
  A mismatch is pulled once more where the call has the time; a second one fails the copy as `mismatch`, a kept file
  that is gone as `not_found`, a file removed meanwhile as `refused` with whatever reached the shelf taken off.
- Where it is asked: as a video is made (`piece-make.ts`, after the piece is marked sent), before a let-go
  (`copy/let-go.ts`), on a return (`copy/bring-back.ts`), at a purge (`upkeep.ts`), in the half-hourly pass
  (`copy/sweep.ts`).
- By hand: `tooling/scripts/ops/files/let-go-now.mjs` marks a workspace's videos going at once, through the door, for
  a workspace whose switch is on; `tooling/scripts/ops/delete-tenant.mjs` empties a workspace's shelf.

## What it does not change

- A watched folder's clip: when it is let go, how it comes back, its ticket, its words, letter for letter.
- A video's sixty minutes, the returns a day, and who may do what.
- Anything a workspace whose switch is off sees or stores.

## Not in this change

- A phone video, and a video made before the switch was on: the step that fills the shelf for what is already there
  (the plan's B4). It also covers the one gap left here on purpose: a run that ends after a video is marked made and
  before its copy is begun leaves that video with no shelf copy, and it simply never steps aside.
- The press that makes a new version of a video that can't come back (the plan's A7): such a video says so and offers
  nothing. Reaching that state takes the shelf's copy and the kept file both failing.
- The picker, the press to save to Drive, and the owner's own Drive file as a way back (0145's other origins).
- The shelf's room by measured bytes: it counts minutes until the walk reads bytes a minute.

## Deploy order

The bucket is made and the relay deployed with its binding and `SHELF_FROM` first; a relay with no bucket answers 503
to a ticket that holds, and the app then begins no copy. 00695 is applied before the code that reads it; the code live
before it runs on it unchanged. After that, either app first. Nothing happens for any workspace until its switch is
set.

## Tests

`tests/files/relay/the-shelf-keeps-and-gives.test.mjs` (the relay's handler over a bucket in memory),
`tests/files/shelf/` (the ticket's one format across both sides, the app's asks, a video shelved, stepping aside,
coming back, a removed file, the tool by hand; the rules against the real database in
`the-shelf-rules.db.test.mjs`), `tests/console/back-office/delete-tenant.test.mjs`, and the words' test above. The
migration was applied twice on an engine with no stack and its rules asked there before it was written here.

## Risks

- **The shelf's storage is a bill of its own**, small and measured by nothing yet: the walk reads bytes a minute and
  says whether 300 minutes stays.
- **A relay that is down** begins no copy and gives none back: a made video then keeps its place, and one that
  stepped aside says "This video isn't ready just now" until a press finds the relay up. The breaker is the relay's
  own, so it never closes the video platform's.
- **The kept file is the way back for the shelf, and the shelf for the platform.** Both gone is a video that can't be
  played; Health is told at the first of the two.
