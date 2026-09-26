# The phone app, PR 9: Today, native

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The page opened most, as the second native screen, over the same read layer Ask uses: one route composes
the day on the server in the page's own words, and the app draws it. PRD tier 2, PR 9.

- [x] `GET /api/v1/today`: a workspace read any member may make, counted with the aggregates, over `readers/today.ts`
      (the five reads Ask makes) and `toTodayVM`. `route-policy.json` gains its row; the typed client is regenerated.
- [x] The app: `shell/Today.tsx` (the standing, the queue, the figures and the recap, who is waiting, the calls, the
      quiet day's door), drawn over the tab's page once it has something true to draw; the page stays mounted for the
      bridge. A row's door is the page's route, opened in its tab; a thread opens natively (PR 8). The screen reads
      again on focus, on pull, and on every refresh the page reports (`todayTick`).
- [x] Tests: `today-route.test.mjs` (the policy, the composed day, the calls additive), the app's `today.test.mjs`.
- [ ] Ruben's: nothing to set. A new build carries the screen.
- [ ] Squash-merge.

## As built (26 Sep 2026)

- **The page stays under the screen.** The tab's WebView is what says the person is in, carries the badge, hands the
  widget its snapshot and the shell its token (decision 0011). Unmounting it would cost all four; keeping it costs
  one page's reads. The native screen reads once more, through one route, and the page's refresh is the signal to
  read again, so the two never disagree for longer than a debounce.
- **Nothing is ever blank.** A read that fails leaves the page in front; the screen shows only when it has a day.
- **The review's three (26 Sep).** The day is kept with the workspace it was read for, so after a switch the page
  stands until the new workspace's day arrives, and an answer for a workspace already left is not drawn. While the
  native screen is in front, the page under it is hidden from VoiceOver and TalkBack. A press on the Today tab brings
  the native screen to its top; every other ask (the token, a route) still reaches the page. `route-policy.json` keeps
  main's order and gains only its one row.
- **One composition, three readers.** The browser, Ask and this route call the same `toTodayVM`; the route is the
  first to hand the composed view model over the wire, which is what a third native surface will want too.
