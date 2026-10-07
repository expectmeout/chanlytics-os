# The phone app, PR 3: native sign-in and the lock, design

**Date:** 26 Sep 2026 · **Owner:** Ruben · **Status:** proposed under Ruben's "merge it and continue working and
merging until complete" (26 Sep) · **Checked against:** `origin/main` after PR 2 (#1128). PRD M5.

## The problem

Inside the app a person signs in through the web's email door alone: Google refuses OAuth in an embedded WebView,
and PR 1 hid that button. Apple's rule 4.8 binds the moment a third-party login is offered in the app. And a phone
that anyone can pick up shows the workspace to anyone who does.

## The design

1. **A native sign-in screen** stands where the web login stood when nobody is in: the mark, "Sign in to your
   workspace.", Apple's own button where Apple is, Google's where its ids are, and "Use your email instead", which is
   the web's login page in a Surface, as before. With no native door configured the screen offers email alone.
2. **The token goes to the door from the WebView.** Apple's sheet or Google's yields an identity token; the app puts
   it in a form and has a Surface POST it to `/auth/native` (PR 0's door), so the cookie the door sets is the
   WebView's own and its 303 lands the page, which reports "in" over the bridge. Apple's request carries the hash of
   a nonce and the door gets the raw one, as the door's planner expects.
3. **Google's ids are the build's.** `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in
   the EAS environment; the iOS URL scheme the SDK needs is the iOS id reversed, derived at config time; unset, no
   button and no plugin.
4. **The lock.** Face ID, Touch ID or the passcode in front of the pages at launch and after two minutes in the
   background, on by default where the phone can lock, until the person turns it off from the lock screen itself
   after one successful unlock. The choice lives in the secure store.
5. **Sign-out on both sides.** The web's sign-out already forgets the phone (PR 2); when the page reports "out" the
   app also has Google's SDK forget the account it chose, so the next sheet asks again.

## What is Ruben's

Sign in with Apple on the hosted Supabase project (Providers → Apple: the bundle id `com.chanlytics.app` as a client
id, the Services ID and key once the Apple account exists), Google's iOS client id under Providers → Google →
Authorized Client IDs, and the two EAS environment variables. The runbook's "Turn on native sign-in" lists them.

## Decisions

1. **A POST from the WebView, not a native fetch.** The cookie must be the WebView's; a native fetch would hold it in
   the wrong jar and hand the refresh token to the wrong client (PR 0's decision 2).
2. **The free Google SDK's original flow.** Expo names it and `react-native-nitro-google-signin`; the former is the
   one in wide use, and a token is a token. Its Android side is the legacy Play Services flow, still served.
3. **The lock on by default.** A receptionist's inbox is a customer's words; a phone left on a counter should not show
   them. The person can turn it off, in one place, after proving it is them.
