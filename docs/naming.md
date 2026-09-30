# Names

How this repository names things, and what holds each rule. `docs/glossary.md` has the words; this page has the
grammar. A rule whose check is not written yet says so, with the check's name and "owed" beside it: it is the rule
all the same, and review holds it until the check lands. A rule no check reads says "review holds it". Where today's
code does not keep a rule everywhere yet, the rule says where, and what holds those exceptions.

## The words

- **One word per thing, the glossary's.** A new name uses the glossary's word for its concept. A word that already
  means two things (thread, step, policy, campaign, contact) is used only in the senses the glossary gives it, and a
  sense it does not give yet is written there first. Review holds it.
- **Storage keeps its words; everything above it says the product's.** Two concepts have a storage word, and the
  glossary gives each its rule. Storage says _tenant_, and everything a person or the API sees says _workspace_.
  Storage's existing names say _contact_, and every new name, SQL included, says _person_. A foreign key is named for
  the table it references, so `tenant_id` and `contact_id` stay for ever. Tables are never renamed. Review holds it.
  The wire still says tenant in a few answers (a `tenant_id` or `tenantId` in `GET workspaces`, the partner's
  workspaces, a lead search and the back office) and in the back office's `platform/tenants/[id]`; each moves with
  its domain, as the wire's camelCase does.
- **A provider's word stays in its adapter.** Retell's agent, Twilio's campaign and Meta's template category live in
  `packages/channels` and the edge door that speaks to them, never in a product word. Review holds it.
- **The API and the pages say the product's nouns.** A new route segment is a glossary word (`people`, `lists`,
  `reach-outs`), never an old noun extended. The glossary's table of names that do not agree yet lists every old one
  still in use. A glossary test (owed) fails a segment that is neither a glossary word nor a row of that table, and a
  storage name the glossary cites that does not exist.

## Casing

- **The wire is snake_case.** Every JSON name a route or an edge door takes or answers, at any depth, is snake_case,
  as the database and the providers are ([decision 0022](decisions/0022-the-wire-says-snake-case.md)).
  `routes/wire-casing.test.mjs` reads every `/api/v1` route's shape with the type checker, six levels down, and fails
  a name that is not snake_case unless `baselines/wire-casing.json` holds it; that bank may only fall. A field typed
  `unknown`, `Json` or `any` hides the names under it (a stored JSON column such as a message's `meta` or a list's
  `rule`, an answer relayed from the edge): decision 0022 lists them, and the test fails a route whose whole body or
  answer is one. The edge's doors are not read yet: a check of their own is owed (decision 0022, step 5).
- **Memory is camelCase.** A view model, a command, a port, a local. A value crosses between the two in a named
  mapping (`toConversationDto`, `toTodayVM`), never through a generic converter. Review holds it until the two checks
  below hold its types and identifiers.
- **The suffix says the side.** `…Row` (a table's row), `…Dto` (the wire) and `…Body` (a request's body) are
  snake_case; `…VM`, `…Command`, `…Ports` and `…Context` are camelCase; no type mixes them. A line on a page is a
  `…Line`, not a `…Row`. `baselines/type-casing.json` (owed).
- **Identifiers.** Types PascalCase with no `I`; functions and variables camelCase (a component PascalCase, a route's
  `GET`); constants and closed sets CONSTANT_CASE; no `enum`: a closed set is an `as const` array.
  `@typescript-eslint/naming-convention` in `eslint.config.mjs` (owed).
- **Files** are kebab-case and say what they hold; `index.ts` only lists a folder's names; PascalCase only for a
  component's file; a leading underscore only for a shared test helper at the tests' root. A framework's own names
  are its own: Next's `route.ts`, `page.tsx`, `[id]` and `(os)`, Expo Router's `_layout.tsx`, `(tabs)` and
  `+native-intent.tsx`. CSS tokens and classes are kebab-case. A file-name test (owed).

## Closed sets

- **A set of names is declared once and tested both ways**: everything used is declared, everything declared is used.
  The activity log's kinds are `EVENT_KINDS` (`repo/event-kinds.test.mjs`) and the edge's log names `LOG_EVENTS`
  (`repo/log-events.test.mjs`); the dashboard's server names are `DASHBOARD_LOG_EVENTS`
  (`apps/dashboard/src/server/log.ts`), held by the same test, and a line names its workspace `tenant_id`, never
  `tenant`. Event kinds are `domain.verb`; job kinds, log events and notification kinds are snake_case, the domain first
  (`lead_round_start`). A log or event name never changes once it ships: alerting greps for it, so the four `a2p.*`
  log events keep theirs.
- **An error code is a code.** It is snake_case and names the failure (`not_found`, `rate_limited`,
  `line_retry_taken`). The app plane answers `ERROR_CODES`; the edge answers `EDGE_ERROR_CODES` as
  `{ ok: false, error, detail? }`, a set `edge/error-codes.test.mjs` holds both ways. One code per error; the words go
  in `detail`, never in `error`.

## Names that say what they hold

- **No one-letter name in an API**: a property, an exported name, a parameter of an exported function. A short name is
  fine in a scope of ten lines or fewer. `baselines/short-names.json` (owed).
- **A boolean is a state or a question** (`paid`, `archived`, `can_connect`), with no `is_` on the wire, and it never
  shares its name with a count or a record. `baselines/boolean-names.json` (owed).

## SQL

A new table is plural snake_case; a foreign key is named for its table; a new function is
`<domain>_<verb>[_<object>]` (`lead_set_stage`, `reach_out_claim`); a trigger's function is named for its table and
what it does (`messages_guard`); every name is under 63 bytes, where Postgres truncates. An applied name is never
renamed, so today's exceptions stay: singular tables (`tenant_config`, `waitlist`, `lead_platform`, `sweep_status`, and
`erasure_keying`, added by 00263 the day after this rule was written: one row that says whether the erased digests
have been re-keyed, applied in production, and a table is never renamed),
functions that start with their verb (`create_person`, `set_contact_consent`, the `trigger_*_sweep` clocks), and
`playbooks.list_id`, which references `segments`. `database/names.db.test.mjs` (owed) reads the catalog and holds
today's exceptions by name; `database/migrations.test.mjs` holds the file names.

## History

- **A pull request's title is the squash commit's subject**: one sentence saying what is now true, at most 100
  characters, not ending in a period; what moved goes in the body. CI checks the title
  (`tooling/scripts/checks/pr-title.mjs`, in `.github/workflows/ci.yml`); a pull request opened before 29 September
  2026 is exempt.
- **Migrations** are `NNNNN_what_changed.sql` and **decisions** `NNNN-what-is-decided.md`, one number each, every
  decision listed in `docs/decisions/README.md` with the status its note says. `database/migrations.test.mjs`,
  `history/decisions.test.mjs`.
- **Branches** are `<kind>/<topic>` (`fix/`, `docs/`, `design/`, `perf/`, `scale/`) or a program's name
  (`ask-rewired/…`). Nothing checks them: a branch is deleted on merge.
- **Environment variables** are SCREAMING_SNAKE_CASE, the provider first (`RETELL_API_KEY`), `_PREVIOUS` for the one
  being rotated out (`COLD_REPLY_DOMAIN_PREVIOUS`). `repo/env-manifest.test.mjs` holds each app's list to what it
  reads.

## The shell

`apps/dashboard/src/legacy` keeps its own names (hash routes, `*_STORE`, `window.__*`, `cl-` classes) until
decision 0015 moves each surface. Its tests stop those names growing (`baselines/window-globals.json`,
`repo/shell-names-are-published.test.mjs`); nothing on this page applies inside it.
