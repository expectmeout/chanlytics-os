# Names

How this repository names things, and what holds each rule. `docs/glossary.md` has the words; this page has the
grammar. A rule whose check is not written yet says so, with the check's name and "owed" beside it: it is the rule
all the same, and review holds it until the check lands.

## The words

- **One word per thing, the glossary's.** A new name uses the glossary's word for its concept. A word that already
  means two things (thread, step, policy, campaign, contact) is used only in the senses the glossary gives it, and a
  sense it does not give yet is written there first.
- **Storage keeps its words; everything above it says the product's.** Two concepts have a storage word, and the
  glossary gives each its rule. Storage says _tenant_, and everything a person or the API sees says _workspace_.
  Storage's existing names say _contact_, and every new name, SQL included, says _person_. A foreign key is named for
  the table it references, so `tenant_id` and `contact_id` stay for ever. Tables are never renamed.
- **A provider's word stays in its adapter.** Retell's agent, Twilio's campaign and Meta's template category live in
  `packages/channels` and the edge door that speaks to them, never in a product word.
- **The API and the pages say the product's nouns.** A new route segment is a glossary word (`people`, `lists`,
  `reach-outs`), never an old noun extended. The glossary's table of names that do not agree yet lists every old one
  still in use. `repo/glossary.test.mjs` (owed) fails a segment that is neither a glossary word nor a row of that
  table, and a storage name the glossary cites that does not exist.

## Casing

- **The wire is snake_case.** Every JSON name a route or an edge door takes or answers, at any depth, is snake_case,
  as the database and the providers are ([decision 0022](decisions/0022-the-wire-says-snake-case.md)).
  `routes/wire-casing.test.mjs` reads every `/api/v1` route's shape with the type checker, six levels down, and fails
  a name that is not snake_case unless `baselines/wire-casing.json` holds it; that bank may only fall. The edge's
  doors are not read yet (owed).
- **Memory is camelCase.** A view model, a command, a port, a local. A value crosses between the two in a named
  mapping (`toConversationDto`, `toTodayVM`), never through a generic converter.
- **The suffix says the side.** `…Row` (a table's row), `…Dto` (the wire) and `…Body` (a request's body) are
  snake_case; `…VM`, `…Command`, `…Ports` and `…Context` are camelCase; no type mixes them. A line on a page is a
  `…Line`, not a `…Row`. `baselines/type-casing.json` (owed).
- **Identifiers.** Types PascalCase with no `I`; functions and variables camelCase (a component PascalCase, a route's
  `GET`); constants and closed sets CONSTANT_CASE; no `enum`: a closed set is an `as const` array.
  `@typescript-eslint/naming-convention` in `eslint.config.mjs` (owed).
- **Files** are kebab-case and say what they hold; `index.ts` only lists a folder's names; PascalCase only for a
  component's file; a leading underscore only for a shared test helper at the tests' root. CSS tokens and classes are
  kebab-case. `repo/file-names.test.mjs` (owed).

## Closed sets

- **A set of names is declared once and tested both ways**: everything used is declared, everything declared is used
  (`repo/event-kinds.test.mjs`, `repo/log-events.test.mjs`). Event kinds are `domain.verb`; job kinds, log events,
  notification kinds and error codes are snake_case, the domain first (`lead_round_start`). A log or event name never
  changes once it ships: alerting greps for it, so the four `a2p.*` log events keep theirs.
- **An error code is a code.** The app plane answers `ERROR_CODES`; the edge answers `EDGE_ERROR_CODES` (owed) as
  `{ ok: false, error, detail? }`. One code per error; the words go in `detail`, never in `error`.

## Names that say what they hold

- **No one-letter name in an API**: a property, an exported name, a parameter of an exported function. A short name is
  fine in a scope of ten lines or fewer. `baselines/short-names.json` (owed).
- **A boolean is a state or a question** (`paid`, `archived`, `can_connect`), with no `is_` on the wire, and it never
  shares its name with a count or a record. `baselines/boolean-names.json` (owed).

## SQL

Tables plural snake_case; a foreign key named for its table; a function `<domain>_<verb>[_<object>]`
(`lead_set_stage`, `reach_out_claim`); a trigger's function named for its table and what it does (`messages_guard`);
every name under 63 bytes, where Postgres truncates. An applied name is never renamed. `database/names.db.test.mjs`
(owed) reads the catalog; `database/migrations.test.mjs` holds the file names.

## History

- **A pull request's title is the squash commit's subject**: one sentence saying what is now true, at most 100
  characters, not ending in a period; what moved goes in the body. CI checks the title
  (`tooling/scripts/checks/pr-title.mjs`, in `.github/workflows/ci.yml`).
- **Migrations** are `NNNNN_what_changed.sql` and **decisions** `NNNN-what-is-decided.md`, one number each, every
  decision listed in `docs/decisions/README.md` with the status its note says. `database/migrations.test.mjs`,
  `repo/decisions.test.mjs` (owed).
- **Branches** are `<kind>/<topic>` (`fix/`, `docs/`, `design/`, `perf/`, `scale/`) or a program's name
  (`ask-rewired/…`). Nothing checks them: a branch is deleted on merge.
- **Environment variables** are SCREAMING_SNAKE_CASE, the provider first (`RETELL_API_KEY`), `_PREVIOUS` for the one
  being rotated out (`COLD_REPLY_DOMAIN_PREVIOUS`). `repo/env-manifest.test.mjs` holds each app's list to what it
  reads.

## The shell

`apps/dashboard/src/legacy` keeps its own names (hash routes, `*_STORE`, `window.__*`, `cl-` classes) until
decision 0015 moves each surface. Its tests stop those names growing (`baselines/window-globals.json`,
`repo/shell-names-are-published.test.mjs`); nothing on this page applies inside it.
