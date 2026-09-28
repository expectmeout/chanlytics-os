# 0022 · The wire says snake_case

**Status:** decided by Ruben on 28 September 2026 (the naming review's D1), and held from the change this note ships
with. Written against `4bc3e49a7` (main, 28 September 2026, after #1263); where this note and the code disagree, the
code wins. Numbered 0022 because 0018 to 0021 are held by notes merged or in open pull requests (#1205, #1244, #1206,
#1253).

## Context

- **The wire can be read.** Every `/api/v1` handler carries what it takes and answers as a phantom type,
  `Shape<I, O>` (`apps/dashboard/src/server/route.ts`), and the typed client's registry names each one
  (`apps/dashboard/src/client/routes.generated.ts`). So a route's JSON names are its types' property names, which the
  type checker can list.
- **It is snake_case almost everywhere.** Read that way at `4bc3e49a7`, the 196 routes take and answer 1,046 distinct
  names, and 992 are snake_case (a single word included). The other 54 are camelCase, in 26 routes: 53 in answers
  (`GET team` answers `isMe` and `userId`, `GET broadcasts` answers `heardAny`, `GET setup` answers `bookingLink`) and
  one in a body (`POST ask/warm` takes `askedAt`). Sixteen routes answer both casings in one payload.
- **Everything the wire meets is snake_case too.** The database, Stripe, Meta and Retell. No generic converter exists:
  where a route answers something other than a row, a named function builds it (`toConversationDto`), which is what
  makes a rule checkable.
- **A route that reads its body by hand is invisible.** Its input is `undefined` to the typed client, so neither the
  compiler nor a test sees its names. `PUT /api/v1/policies` read five dials that way, in camelCase (`replyDelayMs`,
  `minConfidence`, `maxTokensDay`, `maxRepliesDay`, `pauseHours`).
- **The wire is about to be published.** The phone app's native screens will read the API; once they do, a renamed
  field waits for every installed app to read the new name, or for `MIN_APP_VERSION` (`/api/version`'s `min_app`) to
  turn the older ones away. A rename is cheapest now.
- **Practice elsewhere differs, and agrees on one thing.** Google's AIP-140 names fields in lower_snake_case, JSON:API
  recommends camelCase members, Stripe answers in snake_case. The shared rule is one casing per API.

## Decision

1. **Every JSON name a route or an edge door takes or answers, at any depth, is snake_case.** camelCase lives only in
   memory: a view model, a command, a port, a local. A value crosses between the two in a named mapping, never through
   a generic converter at the client or the server.
2. **The names camelCase today are banked, and the bank may only fall.** A route that renames one banks the fall; no
   route adds one.
3. **A rename keeps both spellings for one release where something reads the old one.** An open tab keeps the page's
   old code until it reloads, and the shell's JSX is outside the compiler, so a field a page or the phone app reads is
   answered in both spellings for a release, and a body the route takes is read in both.
4. **Where a stored name exists, the wire says it.** One word per thing: a dial is taken under the name its row keeps
   it by and `GET` answers it with.
5. **A program in flight renames its own.** Ask Rewired's four routes and the partner program's five keep their names
   in the bank until those programs close; the other 17 routes are renamed a domain at a time.

## Consequences

- The typed client's names are the wire's names, the database's and the providers': a reader translates once, at a
  named mapping, and never between two casings in one payload.
- 54 names in 26 routes are owed a rename, each with every reader, and the shell's readers are found by a search, not
  by the compiler.
- A route that reads its body by hand stays outside the rule until it declares its `input`. Declaring it is how it
  comes under the rule, as `PUT /api/v1/policies` does with this note.
- A reader who expects Google's JSON mapping or JSON:API finds snake_case instead; this note is why.

## Shape

- `tooling/scripts/tests/routes/wire-casing.test.mjs` builds a program over the registry with the dashboard's own
  compiler options and walks each handler's `Shape<I, O>` six levels down, through unions, arrays and a record's
  values. A name that is not snake_case fails unless `tooling/scripts/tests/baselines/wire-casing.json` holds it, one
  entry per route and name (`GET team answers isMe`). The measure is `_measures.mjs`'s, beside the others, and
  `docs/debt.md` prints the bank's two numbers: 54 names in 26 routes.
- `PUT /api/v1/policies` declares its body: `class`, `mode`, and the dials by the names the row keeps them under,
  `reply_delay_ms`, `min_confidence`, `max_llm_tokens_day`, `max_replies_day` and `pause_hours`. It reads the old
  camelCase names too, for one release; a body that says both is read by its snake_case name. The bridge's
  `setPolicy` sends snake_case, turning the pages' camelCase dials into it in one named mapping.
- `docs/naming.md`, Casing, says the rule; `README.md`, Conventions, points to it.

## Steps

1. **This change**: the rule, the test and its bank, and `PUT /api/v1/policies`. Either deploy order: the route reads
   both spellings, so a page from before this deploy is answered, and the page speaks only through the route.
2. **The bank drains, a domain at a time**: team, workspaces, metrics, leads, Today and the WhatsApp signup; then
   Setup, Settings and the back office; then playbooks, broadcasts and templates. Each renames in the type and every
   reader, answers both spellings for a release where a field decides something, and banks the fall.
3. **A release later, the old spellings go**: the policies route's old names once Ask's autonomy card
   (`packages/contracts/src/ask-proposals/workspace.ts`, which sends `minConfidence`) says `min_confidence`.
4. **Ask's and the partner program's routes** when those programs close. The bank is then empty, its file is deleted,
   and the test holds the wire with no bank.
5. **The edge's doors** get a check of their own; nothing reads them yet.

## Tests

- `routes/wire-casing.test.mjs`: the ratchet over the registry; every handler in the registry carries a shape the
  checker can read, so one it cannot resolve does not read as clean; the walk on a registry written for it (a union's
  names, an array's, a record's values and never its keys, six levels and no further, a brand, a `Date` and a
  `Response` passed over); what snake_case is.
- `workspace/settings-routes.test.mjs`: `PUT /api/v1/policies` with the new names, with the old ones, with both (the
  new one read), and a refusal in its dial's words under either name.

## Risks

- **A name below six levels is not read.** At `4bc3e49a7` four sit deeper (`label`, `value`, `priority` in Setup's
  checklist, `warn` in an Ask thread), all snake_case; a route that nests deeper than that raises the depth.
- **A rename the compiler passes can break a page.** The shell reads JSON the compiler never sees: search
  `apps/dashboard/src/legacy` for every old name before it goes.
- **A hand-read body hides its names** until it declares its `input`.

## Open questions

None for this note. Whether `/api/v1/contacts` and `/api/v1/segments` become `people` and `lists` is a decision of its
own.
