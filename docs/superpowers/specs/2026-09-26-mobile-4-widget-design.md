# The phone app, PR 4: Today on the home screen, design

**Date:** 26 Sep 2026 · **Owner:** Ruben · **Status:** proposed under Ruben's "merge it and continue working and
merging until complete" · **Checked against:** `origin/main` after PR 3 (#1130). PRD M7.

## The problem

Apple's rule 4.2 asks what elevates the app beyond a repackaged website. Native tabs, native sign-in, push, the lock
and an offline state are the floor. A widget is a thing a website cannot be: Today on the home screen and the Lock
Screen without opening anything.

## The design

1. **One snapshot, in the page's words.** `contracts todayWidgetSnapshot` derives it from the Today view model the
   page already holds (`TODAY_DATA`): the standing's headline, the four figures with their labels, how many are
   waiting on you, the first person who needs you and why, and the moment. Nothing the widget says is a number the
   page would not say.
2. **The page hands it over.** On every `surface:today` and at install, the bridge posts `{t:"today", snapshot}`;
   the shell parses it (`parseTodayWidgetSnapshot`: shapes and sizes, nothing else) and calls the widget's
   `updateSnapshot`. Android has no widget library; the snapshot goes nowhere there.
3. **The widget is TypeScript** (`expo-widgets`, `@expo/ui/swift-ui`): small and medium on the home screen, the
   rectangle on the Lock Screen; the mark's teal for the person who needs you; "As of 3:41 PM" in the person's clock.
4. **Refresh.** The widget is as fresh as the last time the app's Today refreshed: at every foreground, on every push
   the page reacts to, on every realtime change while the app is open. A background refresh from the site with the
   WebView's cookie is a follow-up (the PRD's M7 names it), not this PR.

## Decisions

1. **The page feeds the widget, not a native fetch.** The view model exists once, on the page; a second reader of the
   API from native would be a second derivation of Today's words.
2. **No Live Activity here.** It needs a second push transport (the PRD's PR 7).
