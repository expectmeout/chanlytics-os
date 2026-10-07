# The phone app, PR 4: Today on the home screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today's headline, figures and the first person who needs you on the home screen and the Lock Screen, from
the page's own view model, as of the last refresh. The spec is `2026-09-26-mobile-4-widget-design.md`; the PRD's M7.

**Architecture:** `contracts/widget.ts` (the snapshot from the Today view model, and its parse), a `today` shape on the
bridge, the page posting it on `surface:today`, `shell/widget.ios.ts` handing it to `widgets/TodayWidget.tsx`
(`expo-widgets`, the `'widget'` directive), the plugin entry in `app.config.ts`.

**Worktree and branch:** `claude/fervent-brahmagupta-dj2o1e`, after PR 3's commit.

- [x] `contracts/widget.ts` + `widget-snapshot.test.mjs`.
- [x] Bridge: `today` in contracts `app-bridge.ts`; the page's `app-bridge.ts` posts it; `app-bridge*.test.mjs`.
- [x] `widgets/TodayWidget.tsx`, `shell/widget.ios.ts`, `shell/widget.ts` (Android no-op), `Surface.tsx` hand-off,
      `app.config.ts` plugin entry with the three families.
- [x] The gates and a Metro export.
- [x] Squash-merge (#1132).

## As built (26 Sep 2026)

- **Not seen on a phone here.** The widget extension exists only in a development build on a device; the layout's
  proof is the SwiftUI runtime's, the day the Apple account allows a device build. The data path is executed by
  tests: the page posts the snapshot, the contracts parse holds it to its shapes.
- **A background refresh is deferred** (the spec's point 4).
