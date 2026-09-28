# Privacy labels

What the app itself collects, and nothing the web already declares in its own policy. The shell holds the site in
a WebView; the site's data practices are the privacy policy's, at `/privacy`.

## Apple, App Privacy

| Data type              | Collected | Linked to the user | Used for tracking | Why                                                |
| ---------------------- | --------- | ------------------ | ----------------- | -------------------------------------------------- |
| Contact info, email    | Yes       | Yes                | No                | The account (Sign in with Apple, Google, or email) |
| Identifiers, device ID | Yes       | Yes                | No                | The push token, to tell the phone (`push_devices`) |
| User content, messages | Yes       | Yes                | No                | The business's conversations, shown to its team    |
| Diagnostics            | Yes       | No                 | No                | Crashes, errors and launch timings (EAS Observe)   |
| Usage data             | No        |                    |                   | No analytics in the app                            |

Tracking: none. `NSPrivacyTracking` is false and there is no tracking domain.

**Privacy manifest** (`app.config.ts`, `ios.privacyManifests`): the app's own code touches `UserDefaults` (the
lock's choice lives in the keychain, but expo-secure-store and expo-updates read defaults) under reason `CA92.1`,
and file timestamps through Metro's assets under `C617.1`; the Expo modules ship their own manifests.

## Google, Data safety

- Collects: email address (account), device or other IDs (the push token), messages (the business's conversations),
  and app info and performance: crash logs, diagnostics and launch timings through EAS Observe, not linked to the
  person and not used for advertising.
- Shares: none with third parties beyond the push service carrying the notification's words.
- Encrypted in transit: yes. Deletion: in the app, Settings → You → Delete account.
