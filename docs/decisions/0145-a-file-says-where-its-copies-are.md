# 0145 · A file says where its copies are

**Status:** Decided by Ruben, 22 November 2026 (calls A13 and A14 of the archive plan, with its requirements at
version 1.1). Step 1, the ground, is built with this note on the lane `files/a-file-says-where-its-copies-are`
(migration 00686), waiting for his word to push; the steps after it are not. Written against main at `64b1bbef7e`.
Builds on 0099 (a business keeps its files) and the footage sources plan's "each Google key opens one door".

## Context

- Everything a business keeps lives in Chanlytics alone: pictures in Storage, every video at the video platform. A video
  the app makes never gives up its place there, so each one holds its minutes of the sixty a workspace has until it is
  deleted, and nothing a business makes reaches its own Google Drive.
- The one way in from Drive is a watched folder, which needs Google's wide read of the whole Drive
  (`drive.readonly`, a restricted scope under Google's review). A business that wants three photos for one post has no
  lighter way.
- A first design kept a standing copy of everything in the owner's Drive and let a video step aside behind that copy.
  Google's Drive API terms, read on 22 November 2026, do not allow the API to be used, without Google's written
  consent, for backing an app's or its users' content up to Drive. A copy an owner saves where they choose is not
  that; a standing copy the app then depends on is.
- Giving a Google grant back ends every key the account gave the project. The rule that holds a grant while another
  connection rides it is `apps/edge/lib/shared/google/give-back.ts`, and it counts rows by id.

## Decision

1. **A Google key opens one door, and a connection's row says which** (`source_connections.door`, 00686). `watch`
   reads a folder the business chose, with the wide read. `save` reaches only the files the business picks in Google's
   picker or the app itself makes, with the narrow scope (`drive.file`). One row a door for an account in a workspace:
   connecting, reconnecting or disconnecting one never touches the other, and the give-back rule already keeps the
   grant while the other door's row stands.
2. **The narrow key is never a wide one.** Its sign-in asks for who the account is and the narrow scope alone, with no
   earlier grant folded in; a grant that comes back holding the whole Drive is not kept.
3. **Nothing is saved to a business's Drive but on its owner's own press.** No question at connect, no standing switch,
   nothing saved because a file was made or added, nothing tried again by a clock.
4. **A saved copy is the owner's, and is never read back.** A video comes back from Chanlytics' own shelf (a made video
   as it was made, a phone video as the copy that plays) or from the owner's own Drive file that a pick or a watched
   folder brought in. `file_archives.origin` says which a copy is: `saved`, `picked` or `shelf`; only the last two give
   a copy back.
5. **A copy is checked whole before anything leans on it**: its size and a whole checksum, kept beside the fingerprint
   of 0099, which still finds twins and never stands in for a check.
6. **A copy's record outlives the connection.** A disconnect clears the connection on a copy's row and on the folder's
   and keeps the Google account, so the same account connected again finds its files. A file purged takes its copies'
   rows; what is in the owner's Drive stays there, and Chanlytics deletes nothing in it.
7. **Every reader of a video's copy still asks one door.** Its purposes are one declared list
   (`packages/contracts/src/files/copy.ts`): a post set for later and an ad ask as Play does; AI's early fetch of a
   clip its card names asks too and never says the clip was used.

## What step 1 builds

The `door` column and its key; the folder a press saves into, a copy of a file and a copy's pieces as three tables
with their rules, read by members (a piece's shelf key and checksums aside) and written by the service role alone; the
closed sets; the narrow sign-in; connect per door; the copy door's purposes. No screen, route, job, clock, word or
notice. No `save` row can be written by anything a person can reach.

## What it does not change

- A watched folder, its sign-in to the letter, its screens and its disconnect.
- The fingerprint, the limits, and when a watched clip's copy is let go and brought back.
- Who a grant is given back for: the one rule, unchanged.

## Not in this change

- The shelf itself, its doors and a made video stepping aside behind it; the picker; the press to save; the words a
  screen says of any of it.
- `files_copy_shape` still lets only a watched folder's clip be anything but here: the step that shelves a video widens
  it.
- `source_connections_one_account`, the key of three columns, stays so the code live before 00686 keeps writing over
  its own row; with every row `watch` it still holds. The step that first writes a `save` row drops it.

## Deploy order

00686 is applied before the code that reads it; the code live before it runs on it unchanged. After that, either app
first: the edge reads a connect that names no door as a watched folder's, which is every connect the dashboard makes.
