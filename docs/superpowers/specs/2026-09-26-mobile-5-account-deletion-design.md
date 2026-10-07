# The phone app, PR 5: a person deletes their own account, and the version gate, design

**Date:** 26 Sep 2026 · **Owner:** Ruben · **Status:** proposed under Ruben's "merge it and continue working and
merging until complete" · **Checked against:** `origin/main` after PR 4. PRD M8 and the hardening row of PR 5.

## The problem

App Store 5.1.1(v): an app with accounts must let a person delete theirs, in the app. The data-deletion page says
"write to us", which Apple does not accept. And a shell in the store outlives the site it wraps: one day a page will
no longer fit an old app, and nothing tells that app so.

## The design

1. **One definer door, `delete_my_account()` (00190).** The caller's own account only. The only owner of a
   workspace that has other members is refused by name (`sole_owner`): they make someone else an owner first. A
   person who is a workspace's only member leaves it with nobody in it; its data stays for the business until the
   platform erases it, so a deleted account never takes a business's conversations with it by accident. Their
   phones, bell marks and memberships go, then the auth user; the rest cascades.
2. **`DELETE /api/v1/me`**, account-scoped, on the name-change bucket. The refusal is a conflict in the door's own
   words; success ends the session too, and the page walks to the sign-in.
3. **The row on Settings, Profile**, web and app alike: "Delete my account", two steps (a sentence saying what
   goes and what stays, then the one button), and the door's refusal shown where it happened.
4. **The version gate.** `/api/version` gains `min_app` from `MIN_APP_VERSION`; the app compares its own version on
   every foreground and stands an "Update Chanlytics" screen over everything when it is older. Unset, every
   version is welcome.
5. **The data-deletion page** now says a member deletes their account from Settings, and keeps the address for a
   customer of a business, whose data is the business's.

## What this PR does not do

A crash reporter (a new dependency the PRD named; not this PR); erasing a workspace nobody is left in (the
platform's, with a decision note when it comes).

## Decisions

1. **The sole owner is refused, not cascaded.** M8 asked Ruben to confirm; refusing is the reversible choice, and
   the words say what to do instead.
2. **A memberless workspace is kept.** Its data is a business's, and deletion of a person is not deletion of a
   business; the platform erases it on its own rule, later.
