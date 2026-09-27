# Notes to the reviewer

**Demo account.** A reviewer workspace with made-up data (`tooling/scripts/e2e-workspace.mjs`), signed in with an
email and password entered in App Store Connect's review information; the same account works with the in-app email
door. Sign in with Apple and Google also work; either lands in the same workspace when its provider knows the app.

**What is native (Apple 4.2).** Native tabs (the system's own bar), Sign in with Apple and Google, push
notifications with the bell's number on the icon, a home-screen and Lock Screen widget, a Face ID lock, an offline
state, universal links, and account deletion in the app. The pages inside the tabs are the product's live web app,
which the team also uses on a desk; the native pieces are what a phone adds.

**Purchases (Apple 3.1.3(f)).** The app is a free companion to a paid web tool. There is no purchase in the app and no
call to action to buy elsewhere; the billing page inside the app states that billing is managed on the web.

**Login (Apple 4.8).** Google sign-in is offered, so Sign in with Apple is offered beside it with the same weight.

**Deletion (Apple 5.1.1(v)).** Settings → You → Delete account, two steps, in the app.

**Identifiers.** Bundle id and package `com.chanlytics.app`. Category: Business. Age rating: 4+.
Support: https://chanlytics.com/support. Privacy: https://app.chanlytics.com/privacy.
