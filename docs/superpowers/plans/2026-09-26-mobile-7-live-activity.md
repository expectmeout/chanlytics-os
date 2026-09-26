# The phone app, PR 7: the call in progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A call the receptionist is on appears on every iPhone of the workspace's people, on the Lock Screen and in
the Dynamic Island, the moment it starts, and leaves when it ends. PRD tier 2, PR 7.

- [x] Migration 00191: `push_devices.activity_token`; `push_device_register` takes it as a fourth argument (the
      three-argument door is dropped so one signature stays); a phone that says no token keeps the one it said before.
- [x] Contracts: `live-activity.ts` (`callActivityStart`, `callActivityPropsOf`, `CALL_ACTIVITY_NAME`), `parseDevice`
      accepts `activity_token`, the bridge's `device` ask carries `activity`, and the page says `{t:"calls",live:n}` on
      every refresh of Live.
- [x] The edge: `lib/ops/apns.ts` (ES256 provider token, HTTP/2 to Apple, `liveactivity` push type, injectable
      session), `lib/voice/call-activity.ts` (one start per phone of the workspace's people, refusals named), called
      from the voice webhook on `call_started` when the keys are set; five getters in `lib/env.ts`.
- [x] The app: `widgets/CallActivity.tsx` (the banner, the island), `shell/live-activity.ios.ts` (the push-to-start
      token to the state, every activity ended on `calls-over`), the registration key is the token pair,
      `enablePushNotifications` on the widgets plugin.
- [x] Tests: `call-activity.test.mjs` (the rule over the fake database, the payload, the token verifying under the
      key, the wire against a stub of HTTP/2), the bridge tests on both sides, `push.test.mjs`.
- [ ] Ruben's: `supabase db push` for 00191; the APNs key and the four variables on the edge (runbook, "Turn on the
      call in progress on phones"); a new build (the widgets plugin's push flag is native).
- [ ] Squash-merge.

## As built (26 Sep 2026)

- **Start from the server, end from the app.** Apple starts a Live Activity remotely only through a push-to-start
  token (iOS 17.2+), so the edge speaks to Apple's service itself; the end needs no push, because the app already
  learns from the Live page's refresh when no call is on and ends what it holds. A phone that is off both the site
  and the network for fifteen minutes lets the activity go stale on its own.
- **The call's own door never waits on Apple.** The start runs after the call's row is written, is caught whole, and
  is logged; the webhook's answer to the voice provider is the same with or without phones.
- **One token per phone, the pair as the registration key.** The activity token can arrive after the push token, so
  the app registers again when either changes, and the site keeps the last activity token a phone said.
- **Android has none.** The two `live-activity` modules make the platform split at the file, not in a condition.
