# @chanlytics/relay

The relay: a Cloudflare Worker that answers one clip of a business's Google Drive to whoever holds its ticket, so
Cloudflare Stream fetches a video by its address and the bytes never pass through the app (footage sources, plan v4,
"Taking a file in"). It is the repository's only Worker. It runs in the Cloudflare account that holds Stream, and
nothing in CI or on Vercel deploys it.

**Deployed to production by hand on 19 November 2026** as `chanlytics-footage-relay` (the default environment below);
Cloudflare lists a change of its secrets a minute after the upload. The account that holds Stream is on Workers Paid ($5 a month, bought on 20 November 2026 by
Ruben's word): Workers Free allows 10 ms of CPU a request, and the proof's busiest request reached it. The plan's proof
(P1) measured the relay on real accounts on 17 and 18 November 2026: a clip of 57, 255 and 455 MB arrived whole, in one
download, and a broken download went on from its last 4 MiB. Until the edge holds its own three values (Production,
below), a watched folder's photos come in and its videos wait.

## What it answers

`GET` and `HEAD` at `/clip/<item>?ticket=<ticket>` (or `/clip/<item>/clip.<ext>`, for a fetcher that reads a type off a
name). For each request it:

1. reads the ticket: signed by the app, naming one item, ended within a day at most (`src/ticket.ts`). A ticket that has
   ended, was not signed by the app, or names another item is a 403, and nobody else is asked;
2. trades the ticket at the app's key door for an hour's Drive key and the one file's id: a `POST` of
   `{ticket, method, range}` under the app's key, answered `{access_token, file_id}`. The door is told the method and
   the range so the app can count each download where Google's units are spent. **Said exactly, since a reviewer will
   ask where a key travels:** Google has no key for one file. The key is the account's own read key (the scope the
   owner granted, `drive.readonly`), good for an hour, and for that hour it could read anything the account can. The
   relay uses it for the one file the ticket names and for nothing else: it is handed a file id with the key and asks
   Drive for that id only, it holds the key in the memory of the one request, and it never stores or logs it. It is
   never the refresh token, which does not leave the app's vault;
3. asks Drive: a `HEAD` reads the file's record for its size and type (5 units), a `GET` downloads with the caller's
   own `Range` (200 units), and Drive's bytes are passed straight through, never held;
4. passes Drive's refusals on as they are: the same status (403, 404, 429 and the rest), Drive's one-word reason, its
   `Retry-After`. Never Drive's sentence, which can name the file.

It holds nothing between requests, and it writes nothing to a log: an address carries a ticket, and a key must never be
written anywhere. `wrangler.toml` turns Cloudflare's own logs and traces off for the same reason. Leave them off.

## The shelf

A second thing it answers, on a road of its own (the archive plan's B2, `src/shelf.ts`): a private R2 bucket where a
video Chanlytics made keeps a copy of its own, so its copy at the video platform can be let go and fetched again. The
bucket has no public address; its bytes leave only here, under a ticket.

| Ask                        | Ticket                            | Answer                                                                                                                        |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `HEAD /shelf/<file>/video` | `?ticket=`, a read                | 200 with `content-length`, `x-shelf-sha256`, `etag`, `accept-ranges`; 404 where it holds none                                 |
| `GET` the same (`.<ext>`)  | the same                          | 200 whole, 206 for one range, 416 for a range past the end or a list of ranges: what the video platform fetches by            |
| `POST /shelf/<file>/video` | `authorization: Bearer`, a put    | `{ "from": "<address>" }`: the file is pulled in and held to the ticket's bytes; 201 `{ bytes, sha256 }` from what was stored |
| `DELETE` the same          | `authorization: Bearer`, a delete | 204, also where it held none                                                                                                  |

- **Its ticket is its own** (`v2`, `src/ticket.ts` `readShelfTicket`): it says it is the shelf's, whose workspace and
  which file, what may be done, when it ends, and for a put the very bytes (their size and SHA-256). A clip's ticket
  (`v1`) opens nothing here, and this one no clip.
- **The object's key is `<workspace>/<file>/video`**, built from the ticket's own claims and from nothing a request
  says, so a ticket for one workspace's file reaches no other's.
- **A file is pulled, never pushed.** The address must begin, whole, as one of `SHELF_FROM`'s does (https, the host,
  no port, the path's start); a redirect is not followed. The bucket itself holds the upload to the ticket's SHA-256
  (R2 answers other bytes with its code 10037, read in one place), so only a file's own bytes can ever sit under its
  key, and a second pull writes the same bytes.
- **A pull's pipe is cut a minute after it began**, so a put has ended by then, stored whole or not at all, and
  nothing can arrive later. The app leans on that: it removes nothing within two minutes of a put's start.
- A Worker bound to no bucket answers 503 `off` to a ticket that holds, and 403 to one that does not.

Rehearsed in Cloudflare's own runtime on a laptop on 23 November 2026 (`wrangler dev`, its local bucket, one public
file of the dashboard's own as the source): a pull stored the bytes in 148 ms and said their SHA-256; a pull under
another checksum was refused as `mismatch` and stored nothing; another length was `size`; `HEAD`, a whole `GET`, a
range, an open range and a suffix range gave the right bytes and headers; a range past the end and two ranges were
416; another workspace's ticket found nothing; a delete was 204 twice. Not rehearsed there, and held by the tests
alone: a source cut short, and the cut at a minute. No real bucket has been asked yet.

## What is where

- `src/relay.ts`: the whole rule, as one function over a fetch and a clock. `src/ticket.ts`: a ticket signed and read
  (Web Crypto only, so a Node script signs with the same module), and the shelf's ticket read beside it.
  `src/shelf.ts`: the shelf's whole rule, over a bucket, a fetch and a clock. `src/index.ts`: the Worker's entry,
  which sends a path under `/shelf/` to the shelf and every other to the clip's road.
- `proof/`: what exists for P1 only, deleted when the proof is done.
  - `key-door.ts`: a second Worker that stands in for the app's key door until the app's own tables and sign-in are
    live. It holds no Google grant: the proof's runner leaves it one file and an hour's key at a time, and it writes
    down each question the relay brings, which is how a clip's requests are counted.
  - `breaks.ts` and `relay-with-breaks.ts`: the proof's relay, the same handler able to break one download off part-way
    when the proof's door says so. Production's bundle holds none of it.
- `wrangler.toml` (the relay; its `proof` environment is the proof's copy) and `proof/wrangler.toml` (the proof's door).

## What it may import

Nothing: no package of ours, no dependency, no Node. The web's own `fetch`, `Request`, `Response` and Web Crypto are
all a Worker has here, and all it needs.

## Deploy

By hand, with Cloudflare's Wrangler at the version this was rehearsed with (it is not a dependency of the repository),
from this folder, signed in to the account that holds Stream (`npx wrangler@4.164.0 login`).

**The proof (P1).** The door first, since the relay is bound to it by name; each takes the same two secrets, from the
file the runner's `keys` step writes:

```bash
npx wrangler@4.164.0 deploy --config proof/wrangler.toml
npx wrangler@4.164.0 secret bulk <folder>/worker-secrets.json --config proof/wrangler.toml
npx wrangler@4.164.0 deploy --env proof
npx wrangler@4.164.0 secret bulk <folder>/worker-secrets.json --env proof
```

Each deploy prints the Worker's address. The runner is `tooling/scripts/ops/files/footage-proof.mjs`; its first lines
say what each step takes. When the proof is done, both Workers are deleted, and their secrets go with them:

```bash
npx wrangler@4.164.0 delete --env proof
npx wrangler@4.164.0 delete --config proof/wrangler.toml
```

**Production.** The app's key door is the edge's `POST /api/sources/key` (`apps/edge/lib/files/takes/key-door.ts`):
it opens for the relay's knock, a ticket the app signed, and a clip being taken right now. Three values, set once on
the Worker, and the same two keys with the relay's address on the edge:

| The relay (Cloudflare)                           | The edge (Vercel)                                   |
| ------------------------------------------------ | --------------------------------------------------- |
| `TICKET_KEY`                                     | `FOOTAGE_TICKET_KEY`, the same value                |
| `KEY_DOOR_SECRET`                                | `FOOTAGE_KEY_DOOR_SECRET`, the same value           |
| `KEY_DOOR_URL`: `https://<edge>/api/sources/key` | `FOOTAGE_RELAY_URL`: the address this deploy prints |

```bash
npx wrangler@4.164.0 deploy --env=""
npx wrangler@4.164.0 secret put TICKET_KEY --env=""
npx wrangler@4.164.0 secret put KEY_DOOR_SECRET --env=""
npx wrangler@4.164.0 secret put KEY_DOOR_URL --env=""
```

Until all three are set on the edge, a watched folder's photos come in and its videos wait; nothing fails.

**The shelf.** Once, by hand, in the same account: R2 switched on, a bucket named `chanlytics-shelf` (standard
storage, nothing public set on it), and where a pull may read from. `wrangler.toml` binds the bucket as `SHELF` to
production's relay alone; the edge needs nothing new, since the shelf's tickets are signed with the same key.

```bash
npx wrangler@4.164.0 r2 bucket create chanlytics-shelf
npx wrangler@4.164.0 deploy --env=""
npx wrangler@4.164.0 secret put SHELF_FROM --env=""
```

`SHELF_FROM` is the address the project's signed file links begin with, to its files bucket and no further
(`https://<project>.supabase.co/storage/v1/object/sign/files/`), ending in its slash; several are separated by commas.
It is set as a secret because this repository is public. Deploy the relay before the edge that asks the shelf: an edge
ahead of it only finds no shelf, and a made video then keeps its place at the video platform. After the deploy, a
`HEAD` at `/shelf/<any id>/video` under a ticket that holds answers 404, not 503, and a clip's `HEAD` answers as before.

## Run and test

- `node tooling/scripts/checks/test.mjs tests/files/relay/drive-passes-through.test.mjs`: the relay's own handler
  over a key door and a Drive in memory.
- `node tooling/scripts/checks/test.mjs tests/files/relay/the-proof-keeps-count.test.mjs`: the proof's door and the
  forced break, and the relay running against that door.
- `node tooling/scripts/checks/test.mjs tests/files/takes/a-clip-arrives-through-the-relay.test.mjs`: the relay's
  handler with the app's real key door behind it and a Drive in memory, a clip arriving whole after a forced break.
- `node tooling/scripts/checks/test.mjs tests/files/relay/the-shelf-keeps-and-gives.test.mjs`: the shelf's handler
  over a bucket in memory that holds a put to its SHA-256, and `tests/files/shelf/the-shelf-s-ticket-is-one-format.test.mjs`:
  the app's signer and the relay's reader held to one format, and a clip's ticket and the shelf's held apart.
- `npx wrangler@4.164.0 deploy --dry-run --env=""` (and `--env proof`, and `--config proof/wrangler.toml`): Wrangler
  bundles a Worker and checks its settings without uploading it.
- `npx wrangler@4.164.0 dev --config proof/wrangler.toml` beside `npx wrangler@4.164.0 dev --env proof` runs both in
  Cloudflare's own runtime on a laptop, with `--var` for the two keys and `--var DRIVE_API:<address>` for a stand-in
  Drive. Rehearsed so on 17 November 2026, with no account: a HEAD, ranges, a whole clip, each refusal, the count, and
  a forced break. What no rehearsal shows is how Stream itself fetches, which is the proof's to measure.

One thing the runtime taught: a download handed on by a Worker is not stopped by stopping its fetch. The relay's bound
on Drive (`askWithin`) therefore ends at Drive's first line and never cuts a clip's bytes, and the proof's break cuts
the pipe instead.
