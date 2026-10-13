# The lead workbench: decide a pile, add to a reach-out, close the loop

Ruben approved canvas B v2 on 13 Oct 2026 (https://claude.ai/artifact/9WafSeCumGch2fNCEFf4Dy, version 16), with every
call on its Model board, and asked for it built end to end in one lane: "if you find anything along the way that can be
even better ... it will be auto approved". Built on `leads/workbench` from origin/main 38d3f2529, locally, staged per
verified task, pushed once on his word (memory: no commit or push until he says).

## The ten calls, as approved

1. The page word stays **Reach-out** (glossary; Campaigns D19).
2. **A reach-out fed by a list takes more leads.** A list is a search of via `chosen` or `import` (Part 7 J1); appending to
   it is allowed. A finder search never gains a lead it did not find (amends Part 7 J7's last sentence and spec 4.2).
3. **A first-email run of a list-fed reach-out always waits for its owner's say**, not only its first run: every lead in
   it was added by hand.
4. **Same-day adds.** A step's day is stamped only when a run was made (or the step is off), so an add after 9 is planned
   by the next hourly sweep; at most twelve light reads a day for an idle reach-out.
5. **Later** is the pile's soft word, with its glossary row; Skip stays the run page's.
6. **An operator undoes their own** add, later and stage acts; keep, exclude, put back stay with find.
7. **Sending order:** drafts the owner sends (the 4 Oct spec) first; Outlook, then Gmail sending with our reply address,
   follow the 13 Oct mailbox review's lanes.
8. **Companies with people named on them** (kind place or company, source key, facts with people and one addressee);
   each new card is approved by building it, with its source-rights note.
9. **No second reach-out to a lead.** Not now returns as a Back today view; the second email is the owner's, by hand.
10. **Pace defaults** for an own mailbox: one every 20 minutes, 9 to 5 their time, follow-ups first, the review's ramp.

## Lanes, in build order

Each lane is staged when its checks pass. One pull request carries all of them.

### Lane 2 first: the add door (it is the backbone the card needs)

Migration A (working number, claimed at push):
- `reach_out_why_not(tenant, lead_ids[], include_unconfirmed)`: the one predicate for "would this lead be written to,
  and if not why" (gone, closed, customer, suppressed, written, shared, no_email, invalid, checking, unconfirmed).
  `reach_out_audience` is rebuilt on it, so there is one copy of the rule.
- `reach_out_add(root, lead_ids[], dry)`: appends to a list-fed reach-out's search, copying fit, reason and share marks
  from where each lead was found; one `lead_operations` row of kind `add`; event `reach_out.lead_added`. Dry answers each
  lead's why-not with no write.
- `lead_search_members.later_at` and `lead_member_later` (kind `later`, event `lead.later`).
- `lead_undo`: branches for `add` (off the list before any send; a planned or held send in a waiting run is skipped as
  `owner_took_back`, which the audience lets back in; on its way or sent answers so) and `later`; the gate by the act's
  own right (an acting member undoes their own add, later, stage and bulk).
- `leads_page`: the `pile` sort (untouched, later, added; fit; reach; newest) and `later_at`, `chain_id` per row.
- `reach_out_lead_timeline` and `reach_out_search_lines`: a list member with no send yet has its chain and an `added_at`.
- `reach_out_record`: what was asked falls back to where the lead was found; the listing's review spread and claim mark
  ride along for the signals.
- `lead_search_choose` copies reason and share marks (a share-marked lead was slipping into lists).
- `reach_out_plan_run` inserts with a bare `on conflict do nothing`.
- `reach_out_chain_people(tenant, root, group, after, limit)`: the drawer's People list.

Migration B, alone: a unique index on each lead's first send (`CONCURRENTLY`).

Core and edge: `ReachOutStep.fed_by`; `runReachOut` asks for a list-fed first-email run; `run-step` stamps the day
only when a run exists or the step is off.

Dashboard: `POST reach-outs/[id]/leads` (operator, `dry`), `POST leads/[id]/later` (operator), the undo route to
operator, refresh-map rows, route-policy rows, the typed client, docs/api.md.

### Lane 1: the card

Contracts: `reachOutStandingOf` and `reachOutWhenOf` (one standing line, the run never a minute), `reachOutCardEmailOf`
(email 1 with no model call, the opening pending), `leadSignalsOf` (a place's seen reasons), `toLeadCardVM` and
`leadRail` (the card and its three slots for each state, pile mode and role), the pile's words (Later, the end of the
pile, why-not sentences).

Kit: the Sheet's two rests (one height, translated; a handle that is a button; touchSwipe rests), the Rail variant, a
press-at-the-touch hook in its own module, a chip that is its own tip; gallery entries and their specs.

Leads: the phone opens a lead in the workbench sheet (half: the decide card; full: Why, Reach, Emails, About, Activity);
Not a fit's reasons in the rail's place; Later; Add (to the target reach-out, or held for "Write to the N" in a first
pile); Undo in the progress line, three deep; the end of the pile; the desk's three columns when a pile is open; keys in
SHORTCUTS (A, L, N, Z) and drawn nowhere.

### Lane 0: tell the truth

The person page's reach-out line from the standing function (no "still writing" after a reply; automatic replies are not
answers; step N of M; the stop door, confirm first). Inbox's reply strip and Today's reply row name the reach-out and the
email. `previewRefusedWords('missing_value')` says skipped, not wait. Units by the lead's kind.

### Lane 3: who is in it

Campaigns: the drawer's People block (Waiting, Writing, Done; a door per row), the ledger's People cell, the
`moment:<id>:people` address, New message's "Write to leads", the drawer's Add leads, Leads' ReachOutDoor "Add to its
reach-out" for a list-fed one.

### Lane 4: drafts the owner sends

The 4 Oct spec (`docs/superpowers/specs/2026-10-04-reach-out-drafts-the-owner-sends-design.md`), its own migration.

### Lane 5: companies and people

`leads.kind`, `source`, `source_key`, `facts` (people, the addressee, signals); the person slots with fallbacks; the
first new card (people at companies) with its mapper and source-rights note.

### Lane 6: what came of it

Won derived from deals that name their lead (lines, timeline, report); the appointment's lead stamped at a booking;
the outcomes line per search; the Back today view.

### Lane 7: Ask

`leads.lead` returns the standing line; the add door as a step of an approved plan; never approves a run.

## How each part is proved

- Contracts: unit tests in `tooling/scripts/tests/<domain>/` running the functions.
- SQL: db tests on a throwaway stack (memory `reference_throwaway_supabase_stack`), never the shared one.
- Routes: door tests over `_fake-db.mjs`; route-policy, refresh-map, api.md regenerated.
- Pages: the real app on a dev server, phone and desk, both themes; kit gallery entries with their spec.
- Before the push: `corepack pnpm check:local`.
