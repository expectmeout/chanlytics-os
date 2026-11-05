# 0097 · Anthropic is told whom a call is for

**Status:** Built on the lane `cm-model-profiles` (`ai/model-profiles`), 4 November 2026, from section 5 of
`Claude Video/docs/2026-11-04-pictures-in-chanlytics-safety.md`. Written against main's `219e073414`. It merges dark:
`ANTHROPIC_PROFILES` is unset, so no profile exists and no request carries one until Ruben sets it. Migration 00544. Nothing
here has met Anthropic's real API: the wire is written to its documentation, read 4 November 2026.

## Context

Every call Chanlytics makes to Claude arrives under one organization, and none says which customer it is for
(`packages/channels/src/models/anthropic.ts` `headersFor` sent the key, the version and the betas). Anthropic's page on user
profiles says what that costs: "Without a profile on the request, one end customer can trigger an enforcement action that
applies to your whole organization." One customer's flagged traffic would stop Ask and the receptionist for every customer.

The port is already one door. Every purpose asks through `callModel` or `streamModelCall` in `apps/edge/lib/model.ts`, and only
those two reach `askModel` and `streamModel`, so the change has one place to stand.

## Decision

1. **Whom a call is for is decided once, per purpose.** `MODEL_ROUTES[purpose].attributed` is required, and
   `modelSubjectOf` in `packages/contracts/src/ai/anthropic-profiles.ts` is the one predicate.

   | Traffic                                                                                          | Subject              | Profile                                                          |
   | ------------------------------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
   | Ask, the drafts a member presses, a rehearsal's review, the fix router                           | the person signed in | one per signed-up user, `application`, `entity_type: individual` |
   | The receptionist, reply drafts, the lead judge, notes, a reach-out's check, every read and sweep | the workspace        | one per workspace, `application`, `entity_type: business`        |
   | A call with no workspace and nobody                                                              | ours                 | none, by decision                                                |

2. **The receptionist and background traffic go under the workspace's own profile. This is our reading, and Anthropic has
   not confirmed it.** Its page names a signed-up user and a resold company, and neither is a business's customer writing to
   its receptionist with nobody signed in. The other readings lose:
   - _The owner's profile:_ a stranger's words would pause a person who wrote none of them, and every other workspace that
     person runs. It also has no answer when the owner leaves.
   - _One profile per customer of a business:_ no sign-up, no details we may send, no way to erase it, and a stranger could
     mint them against a rate-limited endpoint.
   - _`passthrough`:_ it means a company we resell API access to, and we resell none. If Anthropic prefers it, `access_type` is
     replaced by an update, with no new profile.
   - _No profile:_ the gap itself.

   The question is written for Anthropic's account team in `Claude Video/docs/2026-11-04-anthropic-user-profiles-letter.md`.

3. **A paused subject's calls do not leave.** `enforcement_status` of anything but `unrestricted` holds them here (`held`, no
   call and no ledger row). Anthropic's reference says a restricted end user "may still be served in part", and we give that
   up for one plain state a member can be told. A paused subject is never sent on with no id, or under another's: that would
   hand their traffic back to the whole organization. Holding also means less flagged traffic from us while it stands.

4. **A profile is made once.** `POST /v1/user_profiles` is not idempotent, so nothing creates without winning
   `anthropic_profile_claim` (00544): one row per subject on a unique index, and the details only to the caller that made it.
   A create that made nothing (a refusal, a 429) lets the claim go. One whose answer never came may have made one, so the claim
   stays and nothing creates again: the sweep finds it by its `reference_id`, or lets it go once a whole listing shows none.

5. **A new sign-up has theirs by their first call.** The first call makes it, inside three seconds, because the first thing a
   bad actor does is the thing we want attributed. A create that fails sends that call unattributed and logs it
   (`model_call_no_profile`), as every call went before this: a customer's reply is not refused for a registration. The health
   sweep makes five more a tick for those who have not called.

6. **We read Anthropic's status off its list, unfiltered.** Its webhook is in beta and "Event delivery isn't live", so the
   health sweep lists every profile twice an hour. The guide's filter names `restricted` and `banned`; the API's reference adds
   `pending`, and Anthropic may add more, and a filter would miss them. A value we do not know reads `restricted`, as its page
   asks. An answer with no status at all changes nothing: a shape we did not expect must not pause every customer. A status
   changes only where a listing says so, so a short listing clears nothing.

7. **Whichever way a subject goes, its profile goes.** `anthropic_profiles.user_id` and `tenant_id` are `on delete set null`,
   so `delete_my_account`, `delete-tenant.mjs` and a hand in the database all leave a row with no subject, which the sweep
   deletes at Anthropic and then here. A workspace whose last member left (`left_empty_at`) goes the same way. A failed delete
   is tried on the next tick, and a 404 means it went. This runs with the switch off.

8. **What Anthropic is told is the least that serves.** `reference_id`, `entity_type`, `onboarded_at`, and for a person
   `email_hash` (sha-256 of the trimmed lowercase address), so it can see a banned person sign up again. No name and no
   address. No `account_status`, which we would have to keep current. No country, which we do not know reliably.

9. **Paused is said plainly, and no reason reaches a member.** Ask answers "Ask is paused on your account" (403 `model_paused`).
   The shell's line says "Your receptionist is paused". The platform is paged once, and Health's Model calls tab and its needs-a-look
   list show who, why and whether an identity check can clear it.

## Shape

- `packages/contracts/src/ai/anthropic-profiles.ts`: the subject, the statuses, Anthropic's words read, the member's words.
- `packages/channels/src/models/anthropic.ts`: `ModelAsk.attribution` is required and sets `anthropic-user-profile-id`; a request
  without it is refused before it leaves (`no_attribution`). `models/anthropic-profiles.ts`: create, delete, list.
- `packages/db/src/anthropic-profiles.ts` over `anthropic_profiles`, which is the service role's alone.
- `apps/edge/lib/anthropic-profiles/attribution.ts` answers before a call, `keep.ts` keeps the rest from the health sweep.

## Steps

Each is Ruben's word, in this order.

1. Apply 00544 and merge. Nothing changes for anyone: the switch is off.
2. Send the letter. Its page asks to hear before a customer base is registered. On 4 November that base is 8 people and 6
   workspaces, 14 profiles, so this is a courtesy more than a queue, but the answer to its first question can change the
   receptionist's shape, and that is cheapest to change before any exist.
3. Set `ANTHROPIC_PROFILES=on` on the edge's Vercel project and redeploy. `docs/runbook.md`, "Turn on Anthropic's user
   profiles", says what to read after.
4. Move our own use to a second organization (below).

**Internal use belongs in a separate organization.** Its page: "Keep the traffic you send for your end customers in one
organization and your own internal usage in another", and "separate workspaces in one organization aren't enough". Three of
the six live workspaces are ours, on the production key, and `tooling/scripts/evals/reply-intents.mjs` and `reply-signers.mjs`
read `ANTHROPIC_API_KEY` when run by hand. Until they move, our workspaces take workspace profiles like anyone's, so a flagged
nightly case pauses that workspace and not the organization. Which organization `ANTHROPIC_EVAL_KEY` sits in is not something
this repo can say: Ruben checks it in the Console.

## Not built

- `metadata.user_id` on a receptionist's turn, an opaque id for the one customer writing. It could separate one abusive
  customer from the business, and the letter asks whether Anthropic wants it. Nothing else depends on it.
- An identity check's link. A `verify` action says a person can clear it, but `POST /v1/user_profiles/{id}/action_urls` documents
  only `enroll_end_user`. Health says so, and the letter asks how.
- `name`, `country`, `account_status`, each its page's option, none needed for attribution.
- A rename or a suspension pushed to a profile: with none of those fields sent, there is nothing to keep current.
- Erasing a business's customer (`eraseContact`) touches no profile, because they have none.

## Tests

`tooling/scripts/tests/anthropic-profiles/`: every purpose through the real `callModel` with the header it sends; the switch off
reads nothing and sends nothing; a request with no attribution never leaves; a syntax-tree check that only `lib/model.ts` asks
the port, only the port names the API, and nothing imports the SDK; a paused subject sends nothing, under any id; concurrent
first calls create once; every create outcome; the sweep's read, delete, adoption and pacing. The type test beside the port
holds the compiler's half. `anthropic-profiles.db.test.mjs` holds the claim and the cascade on the stack, in CI alone.

## Risks

- **The first real answer may differ from the documentation.** No test has met the real API, and creating a profile is Ruben's
  word. `GET /v1/user_profiles?limit=1` before the switch proves the key, the endpoint and the shape, and creates nothing.
- **A profile works only under the organization that made it.** Its page: any other "gets the same 400". Moving
  `ANTHROPIC_API_KEY` to another organization would fail every call that names a stored id, and rightly so: the port never
  drops the id to get an answer. The second organization takes our own use, never this key.
- **Voice is outside this.** The phone receptionist's model runs on Retell's own account (`RETELL_MODELS`), which we do not send
  and cannot attribute.
- **A person who deletes their account ends Anthropic's open actions on that profile**, as its page says of any delete, and the
  same address signing up again gets a new one. `email_hash` is how Anthropic can link the two. We hold nothing against the new
  one. The letter asks whether it should.
- **Up to half an hour between Anthropic's pause and ours.** Calls in between carry the right id and are refused by the API, so
  they fail as any model failure does. Nothing goes unattributed for it.

## Open questions

In the letter: the workspace reading, `metadata.user_id`, the pace of registration, our own workspaces, what a refused call
looks like, how an identity check is passed, and a deleted profile's successor.
