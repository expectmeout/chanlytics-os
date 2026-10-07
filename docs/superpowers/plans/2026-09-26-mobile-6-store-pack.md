# The phone app, PR 6: the store pack

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the two submissions need that is not the app: the listing in English and Spanish, the privacy
labels and the app's own privacy manifest, the note to the reviewer, the screenshot plan, the release workflow and the
submit profiles. PRD tier 1, PR 6.

- [x] `docs/store/`: README, `listing.en.md`, `listing.es.md`, `privacy-labels.md`, `review-notes.md`, `screenshots.md`.
- [x] `app.config.ts`: `ios.privacyManifests`.
- [x] `eas.json`: the submit profiles (the App Store Connect app id and team id are placeholders until the accounts
      exist); `.eas/workflows/deploy.yml`: fingerprint, reuse, build, submit, update on a `v*.*.*` tag.
- [ ] Ruben's, when the accounts exist: `eas credentials` for the App Store Connect API key and the Play service
      account; the two placeholders in `eas.json`; App Store Connect's review information with the reviewer
      workspace's email and password (`tooling/scripts/e2e-workspace.mjs` makes the workspace); the screenshots
      from a device build; the support URL the listing names, live at chanlytics.com/support.
- [x] Squash-merge (#1136).

## As built (26 Sep 2026)

- **Screenshots are a plan, not files**: they need a device build in the reviewer's workspace.
- **The reviewer's workspace is the nightly's script**: it already makes a workspace of made-up people that
  production's background work leaves alone; a reviewer email on the platform's domain is its only new input.
- **The app icon stays a PNG.** Apple's layered `.icon` needs Icon Composer on a Mac; the PRD's M11 wanted it, and it
  is one file to replace when there is a Mac.
- **The support URL is named, not built**: chanlytics.com/support must exist before the submission.
