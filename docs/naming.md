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
  the table it references, so `tenant_id` and `contact_id` stay for ever. Tables are never renamed, with one exception:
  decision 0060 moved what sends on its own to the `sequence_*` tables (00440); the views it left under the old names
  went in 00452, once nothing read them. Review holds it.
  The wire still says tenant in a few answers (a `tenant_id` or `tenantId` in `GET workspaces`, the partner's
  workspaces, a lead search and the back office) and in the back office's `platform/tenants/[id]`; each moves with
  its domain, as the wire's camelCase does.
- **A provider's word stays in its adapter.** Retell's agent, Twilio's campaign and Meta's template category live in
  `packages/channels` and the edge door that speaks to them, never in a product word. Review holds it.
- **The API and the pages say the product's nouns.** A new route segment is a glossary word (`people`, `lists`,
  `reach-outs`), never an old noun extended. The glossary's table of names that do not agree yet lists every old one
  still in use. `repo/names/route-words.test.mjs` fails a segment that is neither a glossary word nor an action on one,
  and a storage name or a path that table cites and that does not exist; the segments said before it are listed by name.
- **A word many names use is one a newcomer has to learn.** A word in a hundred names has a row in the glossary, with the
  term other codebases use beside it, or it is plain English (`repo/names/plain-words.json`). The `house-words` measure
  holds it.

## Casing

- **The wire is snake_case.** Every JSON name a route or an edge door takes or answers, at any depth, is snake_case,
  as the database and the providers are ([decision 0022](decisions/0022-the-wire-says-snake-case.md)).
  `routes/wire-casing.test.mjs` reads every `/api/v1` route's shape with the type checker, six levels down, and fails
  a name that is not snake_case; the `wire-casing` measure holds those the wire still says, and may only fall. A field typed
  `unknown`, `Json` or `any` hides the names under it (a stored JSON column such as a message's `meta` or a list's
  `rule`, an answer relayed from the edge): decision 0022 lists them, and the test fails a route whose whole body or
  answer is one. The edge's doors are not read yet: a check of their own is owed (decision 0022, step 5).
- **Memory is camelCase.** A view model, a command, a port, a local. A value crosses between the two in a named
  mapping (`toConversationDto`, `toTodayVM`), never through a generic converter.
- **The suffix says the side.** `…Row` (a table's row), `…Dto` (the wire) and `…Body` (a request's body) are
  snake_case; `…VM`, `…Command`, `…Ports` and `…Context` are camelCase; no type mixes them. A line on a page is a
  `…Line`, not a `…Row`. The `type-casing` measure holds it. A `…Dto` that says camelCase is on the wire, and moves with
  its domain, as `wire-casing` says.
- **Identifiers.** Types PascalCase with no `I`; functions and variables camelCase (a component PascalCase, a route's
  `GET`); constants and closed sets CONSTANT_CASE; no `enum`: a closed set is an `as const` array.
  `@typescript-eslint/naming-convention` in `eslint.config.mjs`, a warning check:debt holds until the last one goes.
- **Files** are kebab-case and say what they hold, never `utils`, `helpers`, `common` or `constants`; `index.ts` only
  lists a folder's names; PascalCase only for a component's file; a leading underscore only for a test helper, at the
  tests' root or in a domain's test folder. A file's kind may follow its name: `.test.mjs`, `.db.test.mjs`,
  `.type-test.ts`, `.generated.ts`, `.config.ts`, Supabase's `database.types.ts`, Metro's `widget.ios.ts`. A role a folder
  repeats keeps one name in every folder: `surface.ts` (a surface's data, decision 0015), `verbs.ts` (what its page or
  domain does), `ports.ts` (a core verb's world, `packages/core/src/conversations/ports.ts`), `sample.ts` (its seed),
  `types.ts` (its types), and since decision 0105 `words.ts` (its sentences), `vm.ts` (its view model), `dto.ts` (its wire shapes), `schemas.ts` (what it parses), `sweep.ts` (its clock) and `ops.ts` (its operator's doors). A framework's own names are its own: Next's `route.ts`, `page.tsx`, `[id]` and `(os)`, Expo
  Router's `_layout.tsx`, `(tabs)` and `+native-intent.tsx`. CSS tokens and classes are kebab-case.
  `tests/docs/file-names.test.mjs` holds the files.
- **A file does not repeat its folder.** The path says it already: `mailbox/gmail.ts`, not `mailbox/mailbox-gmail.ts`. A
  folder's main module may share its name (`leads/leads.ts`), as Go's `ring/ring.go` does. The `file-repeats-folder`
  measure holds it.

## Closed sets

- **A set of names is declared once and tested both ways**: everything used is declared, everything declared is used.
  The activity log's kinds are `EVENT_KINDS` (`repo/event-kinds.test.mjs`) and the edge's log names `LOG_EVENTS`
  (`repo/log-events.test.mjs`); the dashboard's server names are `DASHBOARD_LOG_EVENTS`
  (`apps/dashboard/src/server/shared/log.ts`), held by the same test, and a line names its workspace `tenant_id`, never
  `tenant`. Event kinds are `domain.verb`; job kinds, log events and notification kinds are snake_case, the domain first
  (`lead_round_start`). A log or event name never changes once it ships: alerting greps for it, so the four `a2p.*`
  log events keep theirs.
- **An error code is a code.** It is snake_case and names the failure (`not_found`, `rate_limited`,
  `line_retry_taken`). The app plane answers `ERROR_CODES`; the edge answers `EDGE_ERROR_CODES` as
  `{ ok: false, error, detail? }`, a set `edge/error-codes.test.mjs` holds both ways. One code per error; the words go
  in `detail`, never in `error`.

## Names that say what they hold

- **A function that reaches outside starts with its verb,** so a reader can tell a database call from a pure helper by its
  name (decision 0105). A read says `list` for many, `find` for one or null, `get` for one or it throws; anything else says
  its own action (`send`, `draft`, `settle`). A pure function may be named for what it returns (`idsOf(rows)`,
  `toTodayVM(dto)`), as Swift's API guidelines have it. The `async-verb-first` measure holds it, reading the verbs from
  `repo/names/_names.mjs`; a product verb joins that list in the change that first needs it.
- **No one-letter name in an API**: a property, an exported name, a parameter of an exported function. A coordinate's
  `x` and `y` are their own names. A short name is fine in a scope of ten lines or fewer, and never as a capital alias: `log`,
  not `L`. The `short-names` measure holds all three, by file (`::api`, `::long`, `::capital`).
- **A value is named for what it holds,** not for what happened to it or the question it answers: `reason`, not `why`;
  `recipient`, not `who`; `sentence`, not `said`. The `value-names` measure holds its locals and parameters. A property
  on the wire keeps its name until its domain moves.
- **A boolean is a state or a question** (`paid`, `archived`, `can_connect`), with no `is_`, and it never shares its name
  with a count or a record. The `boolean-names` measure holds it.
- **An exported name means one thing inside a package or an app.** Two apps may each have their own `logger`. The
  `exported-twice` measure holds it.

## SQL

A new table is plural snake_case; a foreign key is named for its table; a new function is
`<domain>_<verb>[_<object>]` (`lead_set_stage`, `reach_out_claim`); a trigger's function is named for its table and
what it does (`messages_guard`); every name is under 63 bytes, where Postgres truncates. An applied name is never
renamed, so today's exceptions stay: singular tables (`tenant_config`, `waitlist`, `lead_platform`, `sweep_status`, and
`erasure_keying`, added by 00263 the day after this rule was written: one row that says whether the erased digests
have been re-keyed, applied in production, and a table is never renamed),
functions that start with their verb (`create_person`, `set_contact_consent`, the `trigger_*_sweep` clocks), and
`sequence_steps.list_id`, which references `segments`. `repo/names/sql-names.test.mjs` reads the schema a replay builds
(`supabase/schema.sql`), so it runs with no stack, and holds today's exceptions by name;
`database/migrations.test.mjs` holds the file names.

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
  being rotated out (`UNSUBSCRIBE_SECRET_PREVIOUS`). `repo/env-manifest.test.mjs` holds each app's list to what it
  reads.

## The shell

The frame and its stylesheets keep a few old names (hash routes, `*_STORE`, `window.__*`, `cl-` classes) until decision 0015
ends each. Their tests stop those names growing (the `window-globals` measure, `repo/shell-names-are-published.test.mjs`).
`apps/dashboard/mockup`, the standalone mockup, keeps its own, and nothing on this page applies inside it.

**Nothing that runs is called legacy** (decision 0105). A name in that word is a format the code still reads on purpose, listed by
name in `repo/names/names-that-lie.test.mjs`.
