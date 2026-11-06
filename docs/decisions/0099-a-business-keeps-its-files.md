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

## What it costs

- The look: about $0.50 per 1,000 files, on the workspace's usage.
- A picture Ask opens: a cent or so on Opus the first time, under Ask's own day budget.
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

## What is left to prove

- A real iPhone: what it hands over when asked for HEIC too, and sending from one on a weak line, in Files and in the Line.
- That a real phone reuses the cached redirect.
- The file_purge a start leaves itself, a day on: `file_never_filed` in the logs for bytes that never became a file.
- A real Google profile's media list and a real listing's photos, on the first real connection. Whether Places names the business
  as the author of the owner's own photos is unverified: where it does not, a listing brings nothing, and a connected profile still
  brings them all.
- A photo name from a listing can expire, so nothing here re-reads by a listing's `source_ref` once it is kept.

## Not here

Making pictures (steps 3 and 4) and video (step 5).
