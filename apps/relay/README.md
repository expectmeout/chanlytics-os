# @chanlytics/relay

The relay: a Cloudflare Worker that answers one clip of a business's Google Drive to whoever holds its ticket, so
Cloudflare Stream fetches a video by its address and the bytes never pass through the app (footage sources, plan v4,
"Taking a file in"). It is the repository's only Worker. It runs in the Cloudflare account that holds Stream, and
nothing in CI or on Vercel deploys it.

**Not deployed to production yet.** The plan's proof (P1) measured it on real accounts on 17 and 18 November 2026: a
clip of 57, 255 and 455 MB arrived whole, in one download, and a broken download went on from its last 4 MiB. The app's
side (the take and its key door) is built; the production Worker is deployed by hand, on Ruben's word, and until then
only the proof's copy exists.

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

## What is where

- `src/relay.ts`: the whole rule, as one function over a fetch and a clock. `src/ticket.ts`: a ticket signed and read
  (Web Crypto only, so a Node script signs with the same module). `src/index.ts`: the Worker's entry.
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

## Run and test

- `node tooling/scripts/checks/test.mjs tests/files/relay/drive-passes-through.test.mjs`: the relay's own handler
  over a key door and a Drive in memory.
- `node tooling/scripts/checks/test.mjs tests/files/relay/the-proof-keeps-count.test.mjs`: the proof's door and the
  forced break, and the relay running against that door.
- `node tooling/scripts/checks/test.mjs tests/files/takes/a-clip-arrives-through-the-relay.test.mjs`: the relay's
  handler with the app's real key door behind it and a Drive in memory, a clip arriving whole after a forced break.
- `npx wrangler@4.164.0 deploy --dry-run --env=""` (and `--env proof`, and `--config proof/wrangler.toml`): Wrangler
  bundles a Worker and checks its settings without uploading it.
- `npx wrangler@4.164.0 dev --config proof/wrangler.toml` beside `npx wrangler@4.164.0 dev --env proof` runs both in
  Cloudflare's own runtime on a laptop, with `--var` for the two keys and `--var DRIVE_API:<address>` for a stand-in
  Drive. Rehearsed so on 17 November 2026, with no account: a HEAD, ranges, a whole clip, each refusal, the count, and
  a forced break. What no rehearsal shows is how Stream itself fetches, which is the proof's to measure.

One thing the runtime taught: a download handed on by a Worker is not stopped by stopping its fetch. The relay's bound
on Drive (`askWithin`) therefore ends at Drive's first line and never cuts a clip's bytes, and the proof's break cuts
the pipe instead.
