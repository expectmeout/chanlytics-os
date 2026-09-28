# The phone app

The shell that holds Chanlytics on a phone: five native tabs, each a WebView of the live site, with the bridge in
`@chanlytics/contracts` (`app-bridge.ts`) between them. The product requirements are
`docs/superpowers/specs/2026-09-26-mobile-app-prd.md`; the plan this was built to is
`docs/superpowers/plans/2026-09-26-mobile-1-shell.md`.

## Run it

Nothing here runs in Expo Go. Every command runs from this directory.

```bash
corepack pnpm install                                   # from the repository root, once
corepack pnpm exec eas build --profile development-simulator --platform ios   # a simulator build, no Apple account needed
corepack pnpm exec eas build --profile development --platform android          # an APK for an emulator or a phone
corepack pnpm start                                      # the dev client loop, once one is installed
```

**The preview app on main** (`.eas/workflows/preview.yml`): a push to main that changes what the app is made of (this
app, the lockfile, or a contracts module its entry reaches; `test/preview-paths.test.mjs` holds the list to that
entry) fingerprints the native code. When a preview APK with that fingerprint exists, the push reaches it as an update
on the `preview` channel (the app fetches it at launch and runs it on the next one); only a native change builds a new
APK. Besides the native modules, the fingerprint hashes the evaluated `app.config.ts`, this `package.json`'s scripts,
`eas.json` and `.gitignore`: a change to any of those builds a new APK, which spends the plan's build credit.

`EXPO_PUBLIC_SITE_ORIGIN` names the site the shell holds. Unset, it is the product's own address (`src/site.ts`); an
EAS environment or a local `.env.local` may point it elsewhere, at a preview for instance.

## What is where

- `@chanlytics/contracts/phone-app` (`packages/contracts/src/mobile/phone-app.ts`): everything the app reads of
  contracts, bundled from its sources. The package's root is the web's built bundle, every export and zod, and the
  app's lint refuses it.
- `src/site.ts`: the origin, the User-Agent token the site reads, a workspace page's address.
- `src/shell/Surface.tsx`: one page of the site; `bridge.ts` its side of the bridge; `state.ts` what the shell knows;
  `deploy.ts` when a deploy reloads the pages; `Offline.tsx` the screen without a network.
- `src/app/(tabs)`: the five tabs; `src/app/_layout.tsx` the theme, the sign-in gate, the foreground looks.
- `test/`: the pure modules, run by the repository's `corepack pnpm test`.
- `.maestro/`: the walk's flows, which `tooling/scripts/mobile/walk.mjs` runs on an Android emulator or phone, signed in
  (`docs/runbook.md`, "Walk the phone app").

## Being told

The phone asks for its token on a device (never a simulator), hands it to the page in front, which registers it through
the account route, and opens a tapped notification's route in the tab that owns it (`src/shell/notifications*.ts`). The
icon's number is the bell's. Push credentials and the signing token are the runbook's "Turn on push".

## Signing in, and the lock

Apple's sheet and Google's yield a token that a Surface POSTs to the site's native door, so the cookie is the WebView's
(`src/shell/native-auth.ts`, `sign-in.ts`). The lock (`lock.ts`, `LockScreen.tsx`) stands at launch and after two minutes
away, on by default where the phone can lock. Google's ids come from the EAS environment; see the runbook's "Turn on
native sign-in".

## What waits on what

PR 1 (this) needs only an Expo project and `EXPO_TOKEN`. Push (PR 2) needs the Apple Developer Program's APNs key
and a Firebase project; native sign-in (PR 3) the Apple and Google providers. SDK 58 renames
`expo-router/unstable-native-tabs` to `expo-router/native-tabs`; that is the whole move.
