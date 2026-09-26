# The phone app, PR 5: account deletion and the version gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person deletes their own account from Settings, in the app and on the web, by one door with one rule for
a sole owner; an app the site no longer speaks to says so. Spec `2026-09-26-mobile-5-account-deletion-design.md`.

- [x] Migration `00190_a_person_deletes_their_own_account.sql`: `delete_my_account()`.
- [x] `DELETE /api/v1/me`; `route-policy.json`; the typed client regenerated.
- [x] `identity.ts` `__me.deleteAccount()`; Settings, Profile: the two-step row; the data-deletion page's sentence.
- [x] `/api/version` `min_app`; `MIN_APP_VERSION` in the dashboard's env example; the app's `minAppOf`, `isOlderThan`,
      the Update screen.
- [x] Tests: `account-deletion.db.test.mjs` (the stack), `settings-doors.test.mjs` (the row), `deploy.test.mjs`.
- [ ] Squash-merge; then the production `db push` of 00190 (either order: the route without the door answers a
      refusal, never a deletion).

## As built (26 Sep 2026)

- The database suite runs in CI's replay and against a local stack; not from this environment.
- No crash reporter: the PRD named one, the repository forbids a new dependency where it solves nothing yet.
