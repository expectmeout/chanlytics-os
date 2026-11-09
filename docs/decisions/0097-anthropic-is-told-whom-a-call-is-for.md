# 0097 · Anthropic is told whom a call is for

**Status:** Built on the lane `cm-model-profiles`, from section 5 of `Claude Video/docs/2026-11-04-pictures-in-chanlytics-safety.md`.
Written against main's `219e073414`, merged dark as #2102 on 5 November 2026, migration 00544 on production. Changed the same day
before any profile existed (Ruben): no letter to Anthropic goes first, only a ban holds a call, and no email hash is sent. On
5 November the production key read the real list (no profiles, shape as documented), and the header was refused when malformed,
on the API version the port sends. No real profile had been created when this was written.

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
   | Ask, the drafts a member presses, a rehearsal's review, the fix router, an upload's look (0099)  | the person signed in | one per signed-up user, `application`, `entity_type: individual` |
   | The receptionist, reply drafts, the lead judge, notes, a reach-out's check, every read and sweep | the workspace        | one per workspace, `application`, `entity_type: business`        |
   | A call with no workspace and nobody                                                              | ours                 | none, by decision                                                |

2. **The receptionist and background traffic go under the workspace's own profile. This is our reading, and Anthropic has
   not confirmed it.** Its page names a signed-up user and a resold company, and neither is a business's customer writing to
   its receptionist with nobody signed in. The other readings lose:
   - _The owner's profile:_ a stranger's words would pause a person who wrote none of them, and every other workspace that
     person runs. It also has no answer when the owner leaves.
   - _One profile per customer of a business:_ no sign-up, no details we may send, no way to erase it, and a stranger could
     mint them against a rate-limited endpoint.
   - _`passthrough`:_ it means a company we resell API access to, and we resell none. If that ever changes, `access_type` is
     replaced by an update, with no new profile.
   - _No profile:_ the gap itself.

   We ask nobody first. The reference's own example is an `application` profile with `entity_type: business`, and the choice can
   be changed by one update per profile. The guide asks to hear before a customer base is registered in bulk; this is about 14
   profiles, at five a half hour.

3. **Only a ban stops a call here.** A banned subject's calls are held (`held`, no call and no ledger row): Anthropic "does not
   plan to serve them there again". A restricted subject's go under its own id, as does one with an identity check under review
   (`pending`) and a status we do not know, which reads restricted. Its reference says a restricted end user "may still be served
   in part", so holding them would stop what Anthropic still serves, and would stay stopped for up to half an hour after a
   restriction lifts. Anthropic refuses what it refuses, call by call. A refusal is no fault to the provider's breaker, so nobody
   else feels it, and it reaches the receptionist's holding reply and hand-over as any refusal does. A banned subject is never
   sent on with no id, or under another's: that would hand their traffic back to the whole organization.

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

8. **What Anthropic is told is the least that serves.** `reference_id`, `entity_type`, `onboarded_at`. No name, no address and no
   hash of one: its page says a detail sent can be replaced and never cleared, and one can be added by an update if it is ever
   needed. No `account_status`, which we would have to keep current. No country, which we do not know reliably.

9. **A member is told plainly, and no reason reaches them.** While a workspace is restricted, the shell's line says "Your
   receptionist is limited". Once it is banned, "Your receptionist is paused", and Ask answers "Ask is paused on your account"
   (403 `model_paused`). The platform is paged when an action opens and again if it becomes a ban, and Health's Model calls tab and
   its needs-a-look list show who, why and whether an identity check can clear it.

## Shape

- `packages/contracts/src/ai/anthropic-profiles.ts`: the subject, the statuses, Anthropic's words read, the member's words.
- `packages/channels/src/models/anthropic.ts`: `ModelAsk.attribution` is required and sets `anthropic-user-profile-id`; a request
  without it is refused before it leaves (`no_attribution`). `models/anthropic-profiles.ts`: create, delete, list.
- `packages/db/src/anthropic-profiles.ts` over `anthropic_profiles`, which is the service role's alone.
- `apps/edge/lib/anthropic-profiles/attribution.ts` answers before a call, `keep.ts` keeps the rest from the health sweep.

## Steps

1. Merge, then apply 00544. Nothing changes for anyone: the switch is off, and it stays off until 00544 is on.
2. Set `ANTHROPIC_PROFILES=on` on the edge's Vercel project and redeploy. `docs/runbook.md`, "Turn on Anthropic's user
   profiles", says what to read after.
3. Move our own use to a second organization (below).

**Internal use belongs in a separate organization.** Its page: "Keep the traffic you send for your end customers in one
organization and your own internal usage in another", and "separate workspaces in one organization aren't enough". Three of
the six live workspaces are ours, on the production key, and `tooling/scripts/evals/reply-intents.mjs` and `reply-signers.mjs`
read `ANTHROPIC_API_KEY` when run by hand. Until they move, our workspaces take workspace profiles like anyone's, so a flagged case
acts on that workspace and not the organization. The evals send no profile, so they must leave first: on 5 November the copy of
`ANTHROPIC_EVAL_KEY` we could read answered from production's organization (`anthropic-organization-id`). GitHub's copy cannot be
read, and the nightly run was skipped then.

## Not built

- `metadata.user_id` on a receptionist's turn, an opaque id for the one customer writing. Its page describes it for a
  `passthrough` profile, so what it does for ours is unknown. Nothing else depends on it.
- An identity check's link. A `verify` action says a person can clear it, but `POST /v1/user_profiles/{id}/action_urls` documents
  only `enroll_end_user`. Health says so.
- Its webhooks, whose page says "Event delivery isn't live", and its Verification Portal, which its page says to skip if you need
  only attribution.
- The official SDK. It has `client.userProfiles` and `user_profile_id`, but nothing here imports the SDK: the port is one hand-written
  door, a test holds that, and a second way to reach Anthropic for three calls is worse than this file. A create there also needs
  `maxRetries: 0`, or its retries can make a second profile. Moving the whole port is its own change.
- `name`, `email_hash`, `country`, `account_status`, each its page's option, none needed for attribution. 00544's claim still
  answers a person's address, which nothing reads now; it goes when that function is next re-created.
- A rename or a suspension pushed to a profile: with none of those fields sent, there is nothing to keep current.
- Erasing a business's customer (`eraseContact`) touches no profile, because they have none.

## Tests

`tooling/scripts/tests/anthropic-profiles/`: every purpose through the real `callModel` with the header it sends; the switch off
reads nothing and sends nothing; a request with no attribution never leaves; a syntax-tree check that only `lib/model.ts` asks
the port, only the port names the API, and nothing imports the SDK; a restricted subject goes under its own id and a refusal touches
nobody else; a banned subject sends nothing, under any id; concurrent first calls create once; every create outcome; the sweep's read, delete, adoption and pacing. The type test beside the port
holds the compiler's half. `anthropic-profiles.db.test.mjs` holds the claim and the cascade on the stack, in CI alone.

## Risks

- **The first real create may differ from the documentation.** No test has created a real profile. `GET /v1/user_profiles?limit=1`
  before the switch proves the key, the endpoint and the shape, and creates nothing. **What a refused call looks like is not
  documented either**: the first one is read off the ledger, and until then it fails as any model refusal does.
- **A profile works only under the organization that made it.** Its page: any other "gets the same 400". Moving
  `ANTHROPIC_API_KEY` to another organization would fail every call that names a stored id, and rightly so: the port never
  drops the id to get an answer. The second organization takes our own use, never this key.
- **Voice is outside this.** The phone receptionist's model runs on Retell's own account (`RETELL_MODELS`), which we do not send
  and cannot attribute.
- **A person who deletes their account ends Anthropic's open actions on that profile**, as its page says of any delete, and the
  same address signing up again gets a new one. With no `email_hash`, nothing links the two, and we hold nothing against the new
  one. If that is ever needed, the hash can be added to a profile by an update.
- **Up to half an hour before a member or the platform hears of an action.** Calls in between carry the right id and are refused
  by the API, so they fail as any model failure does. Nothing goes unattributed for it.
