# 0079 · Their receptionist, before they sign up

**Status:** Decided by Ruben on 30 October 2026, built on 31 October 2026 (#1968, migration 00497 on production; its
spend guards #1971) and switched on in production that day (`LEAD_PREVIEWS=on`). The design brief was approved with its
spend ("Approve, write spec"). Spec `docs/superpowers/specs/2026-10-30-their-receptionist-before-they-sign-up-design.md`, plan
`docs/superpowers/plans/2026-10-30-their-receptionist-before-they-sign-up.md`, lane
`leads/their-receptionist-before-they-sign-up`. Written against main's `5d7e3d533` (#1960), and verified against the
code at it.

## Context

A cold email asks a business to imagine the product: step one carries no link (0056), and step two describes what the
product does. Every part that would show a business its own receptionist instead is built, and each is keyed on a
workspace:

- **Try it:** the eval door, `apps/edge/lib/receptionist/eval.ts`. It writes nothing, sends nothing, answers a
  workspace with no line as its chat would, and says what the live turn would do with each reply.
- **The browser call:** the rehearsal door, `apps/edge/lib/voice/rehearsal-call.ts`. It makes the agent before any
  number and counts the free minutes.
- **The first receptionist from a listing:** contracts `firstReceptionistOf`.
- **The website read (0073) and the look it wears (0075).**

The dashboard asks the edge with `user: null` for a call about no person (`apps/dashboard/src/server/edge.ts:119`). A
workspace's delete erases it whole: 83 of 87 foreign keys to `tenants` cascade, and the other four set null.

## Decision

1. **A preview is a workspace with the status `preview` and no member,** built from a lead the workspace marked `ours`
   (00469) is writing to: its listing through `firstReceptionistOf`, its website read and worn, and prices never
   quoted. It is left out where `test` is, has no public pages and no billing row, and is counted apart in the Console.
2. **A sequence carries it in one new slot, `{{their preview}}`,** the eleventh, from step two on.
   - It is the step's one link, and its email signs with the Signed line.
   - A send that names it for a lead with none makes the preview and waits for it (`preview_building`, a hold). One
     whose preview could not be made skips that lead's email (`no_preview`).
3. **The page is `/preview/<token>`:** the business's own receptionist in its look, with Text it (Try it's door), Call
   it (the rehearsal's door), What it knows (each fact's source, with Not right), and Make it mine. It answers 20
   messages and six minutes of calls (three at most in one), and lasts 30 days from the first email that carried it.
   Then its agent, its workspace and its words are erased, and its counts are kept.
4. **Make it mine is the sign-up page with the preview's link for an invite code** (`/preview/<token>/mine`, sign-up's
   screen with the preview read on the server).
   - The claim seats the claimer as owner, makes the workspace active and opens its first run where it stands.
   - The first claim wins.
   - The lead becomes converted (`claimed`), and its sequences end with why `made_it_theirs`.
5. **The sender sees it on the lead:** opened, tried, what they said was not right, made theirs. Today raises a lead who
   tried theirs.
6. **The edge's `LEAD_PREVIEWS` switch** builds nothing until it is on.

## Shape

- **The database:** one migration.
  - `tenants_status_check` takes `preview`.
  - A new table, `lead_previews`, on the sender's workspace, read by its members.
  - The doors `preview_make`, `preview_built`, `preview_sent`, `preview_opened`, `preview_said`, `preview_called`,
    `preview_not_right`, `preview_claim` (the claimer's) and `preview_end`.
  - `slug_for_workspace` is lifted out of `create_workspace_for`.
  - `lead_convert_by` takes `claimed`.
  - The job kind `preview_build`, and the hourly `previews-sweep`.
- **Contracts:**
  - `previews/`: `leadAsListing`, the page's and the line's view models, the starters, the words
  - `imports/found-adds.ts`: Found for you's adds, shared with the build
  - the slot
  - the rehearsal's preview window
  - `hasPublicPages` and the Console's verdict
  - sign-up's preview token
  - Today's row
- **The edge:**
  - the build job
  - `readWebsite`, lifted out of the website reader
  - the sweep and Retell's two deletes
  - the sender's hold
  - the rehearsal's window and its end's count
- **The dashboard:** the page and its four public routes, the claim route, the sender's lead route, sign-up's preview,
  the lead sheet's line, Today's read and row, the step editor's slot, and one line in Ask's drafter.

## Steps

One pull request, in the plan's order:

1. L1, preview workspaces and their build
2. L2, the page
3. L3, Call it
4. L4, Make it mine
5. L5, the slot and what the sender sees

The migration is applied to production before the merge (`land --applied`), and `LEAD_PREVIEWS` is set on the edge
after it.

## Tests

The spec's "What proves it". In short:

- The adapter, the views and the slot are pure tests.
- The doors are a database suite: make, say up to 20, claim once under a race, end.
- The build, the sweep and the sender's hold run over fakes.
- The page and its routes run over stub React and a fake database.
- Sign-up's preview runs under each posture.
- One walk in the real app: made, texted, called, claimed, first run.

## Risks

- **A link is a capability:** whoever holds it may claim. It is only ever sent to the business's own checked address,
  is unguessable (128 bits), is unindexed, and sends no referrer. The claim still asks for a code sent to the address
  the claimer gives.
- **Spend:** at most about $1.10 a preview, platform-paid. Expected $15 to $45 a month at ten step-two emails a day.
  The switch turns it off.
- **A preview's facts can be wrong:** a lead's hours that don't read whole are left out, prices are never quoted, and
  "Not right" reaches the sender.

## Open questions

- Retell's delete paths for an agent and its LLM, read against its API reference at the build.
- Whether a partner's workspaces make previews, credited at claim (0016): a later step.
