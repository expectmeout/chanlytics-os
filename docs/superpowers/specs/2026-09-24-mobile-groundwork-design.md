# The phone app's ground: design

**Status:** approved by Ruben on 24 Sep 2026 ("go"), as PR 0 of the phone app plan. Checked against `origin/main` at
`4ff6f3bc`. The app itself (an Expo shell whose tabs hold the live web surfaces) is PRs 1 to 4; this PR is the web
side everything in it leans on, and it ships value on its own.

## The problem

The product already runs on a phone: a phone tab bar at 720px and under, an installable shell with a manifest and a
service worker that caches nothing, a bell built from kept `notifications` rows. Three things stop a native shell
from wrapping it as it is:

1. **It does not know when it is inside the app.** The web tab bar would sit under the native one, the Stripe doors
   would offer a purchase inside an App Store app (guideline 3.1.3(f) forbids that in a free companion to a paid web
   tool), and the last row of every page would hide under the glass tab bar.
2. **Nobody can be told on a phone.** The service worker says "push arrives here when the keys for it exist", and
   no keys exist. Every alert the edge raises is kept as a row and mailed; no row reaches a device.
3. **A native sign-in has no door.** Google refuses OAuth inside an embedded WebView, so the app signs in natively
   and receives an identity token, and nothing on the web side turns that token into the cookie the WebView reads.
   And a link in a text or an email cannot open the app, because the domain publishes no app-links file.

## The design

Five pieces, each in the layer that owns it, none of them visible on the web today.

### 1. In-app mode

The shell sends its WebView's User-Agent with one token: `ChanlyticsApp/<version> (ios|android)`. A boot script
inline in the document head, beside the theme's, reads it before first paint (`contracts/chrome.ts inAppBootScript`,
over the one regex `inAppFrom` reads) and stamps `html.in-app` plus `window.__IN_APP = {platform, version}`. From
that one fact:

- the app shell does not draw its phone tab bar (the native one stands there);
- the billing page draws its status and one sentence, "Billing is managed from Chanlytics on the web", in place
  of the three Stripe doors (Start the trial, Resume, Manage billing). No link, no button: a call to action to buy
  outside the app is what the guideline names;
- the page's bottom inset is the shell's: the shell sets `--app-inset-bottom` on `html` to its tab bar's height,
  and `mobile.css` pads the scrolling column and lifts the ✦ by it under `html.in-app`.

Nothing else changes in-app. The theme, the density, every page's words are the web's.

### 2. App links

`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` are served by one route
(`app/api/app-links/[store]/route.ts`) behind two rewrites, public by a `/.well-known/` prefix. Each is rendered
from an environment variable and is a 404 while it is unset, so the file appears the day the store accounts exist
and never lies before that:

- `APP_LINKS_APPLE`: `TEAMID.bundle.id`, several separated by commas. The Apple file opens every path to the app
  except the ones meant for a browser: `/auth/*`, `/yes/*`, `/b/*`, `/privacy`, `/terms`, `/data-deletion`.
- `APP_LINKS_ANDROID`: `package=FP1|FP2;package2=FP3`, SHA-256 certificate fingerprints per package.

### 3. The native sign-in door

`POST /auth/native` (public, like `/auth/callback`) takes `{provider: "apple" | "google", token, nonce?, next?}`,
signs the identity token in through the cookie-backed server client (`signInWithIdToken`), and answers a 303 to
`next` on this site only (`safeNext`, the callback's own rule) or to `/login?error=native`. The decision is a pure
planner (`src/server/native-sign-in.ts`), the route stays a thin door, and the door is rate-limited per network the
way sign-up is (`ipOf` moves to `src/server/request-ip.ts` so the two share it). The email-code sign-in needs no
door: the web login page already works inside a WebView.

### 4. A phone can be told (the table and the routes)

Migration 00162: `push_devices` (one row per device token: `user_id`, `token` unique, `platform` in ios/android,
`app_version`, `last_seen_at`), RLS so a person reads and forgets their own, two definer doors so a token that moves
to another account moves cleanly: `push_device_register(p_token, p_platform, p_app_version)` deletes any row with
that token and inserts this person's; `push_device_forget(p_token)` deletes this person's. The same migration widens
`jobs.kind` with `push_send`. Contracts hold both closed sets to the database (`PUSH_PLATFORMS`, `JOB_KINDS`).

`PUT /api/v1/me/devices` and `DELETE /api/v1/me/devices` are account-scoped writes (the device is the person's, not a
workspace's), counted under a new `device_register` bucket.

### 5. A phone is told (the job)

The one place the edge reaches a human, `notify`, keeps its row first. When the kept row's kind is one a phone
should hear about (`PUSH_KINDS` in contracts: handoff, call, note_for_you, leads_ready, leads_question,
broadcast_sent, broadcast_stopped, job_failed, billing, number, review), it schedules one `push_send` job naming the
row. The job reads the row, finds its readers (the one `recipient_user_id`, else every member of the workspace), their
devices, and sends one message per device through a push port the edge binds (`lib/ops/push.ts`, Expo's push service,
`EXPO_ACCESS_TOKEN` optional). A device the service reports as gone (`DeviceNotRegistered`) is forgotten. A transport
failure throws, and `push_send` is in `RETRY_WAITS_MS` (one minute, then five), so a bad minute at the provider is not
a lost alert. The words are the bell's own: the row's title, the first line of its body (`firstLine`, the derivation the
bell already uses), the route in `data`.

## What this PR does not do

- The app. PR 1 is the shell, PR 2 native sign-in on the app side, PR 3 push registration and tap-to-route, PR 4 the
  store pack.
- Quiet hours, badge counts, and a push for the held draft's cancel window or a call that hung up before analysis
  (those bell rows are derived in the browser, not kept). PR 3.
- Enabling Sign in with Apple on the hosted Supabase project, the Vercel variables (`APP_LINKS_*`,
  `EXPO_ACCESS_TOKEN`), and the production `db push`: listed on the PR for Ruben.

## Decisions

1. **A WebView of the live site, not Expo's DOM-component shell.** The surfaces are one classic-script monolith
   booted once by the bridge, with cookie sessions and realtime; bundling it per screen would ship the whole runtime
   per tab and break auth. Native screens come later, one at a time.
2. **The identity token goes to the server, never a refresh token.** Handing the native session's refresh token to
   the WebView would rotate it out from under the native client. The server signs the token in on its own, so the
   WebView's cookie session and any native session are independent.
3. **Push rides on `notify`, not on new emission points.** Every alert the edge raises already passes through it
   and is already kept as a row with a kind and a route. The kinds a phone hears about are a list, not everything.
4. **Two definer doors for devices, not insert/update policies.** A token that moves to another account on the same
   phone must be re-owned in one statement; RLS alone cannot delete the other account's row.
5. **The app-links files are 404 until configured.** A published file with a placeholder team id is a lie Apple
   caches for a day.
