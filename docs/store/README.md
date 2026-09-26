# The store pack

What the two stores ask for that is not code, kept here so a submission is a copy, not a composition. PR 6 of the
phone app (`docs/superpowers/specs/2026-09-26-mobile-app-prd.md`, tier 1).

| File                | What it is                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `listing.en.md`     | The App Store and Play listing in English: name, subtitle, description, keywords, what's new |
| `listing.es.md`     | The same in Spanish                                                                          |
| `privacy-labels.md` | Apple's nutrition labels and Google's data safety form, from what the app itself collects    |
| `review-notes.md`   | The note to the reviewer: the demo account, what is native, why it is not a repackaged site  |
| `screenshots.md`    | Which screens, on which devices, in which order; taken from a device build when one exists   |

The identifiers, the app's category and age rating, the support and privacy URLs live in `review-notes.md`. The
reviewer's workspace is made by `tooling/scripts/e2e-workspace.mjs` with made-up data and a reviewer email of the
platform's own domain; its address and password are set in App Store Connect, never here.
