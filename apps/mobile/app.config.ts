import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The phone app's configuration (the PRD, M1 and M11). Everything a store needs to know that is not code.
 *
 * The site the shell holds is EXPO_PUBLIC_SITE_ORIGIN, set per EAS environment and never written here: the app links
 * (universal links on iOS, app links on Android) are derived from its host and left out while it is unset, so a
 * build with no origin claims no domain. The identifiers are the product's, once, in one place.
 */
const ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? "";
const HOST = ORIGIN ? new URL(ORIGIN).host : "";
const ID = "com.chanlytics.app";
/** The EAS project (expo.dev, chanlyticss-team / chanlytics): what builds, updates and push tokens are filed under. */
const EAS_PROJECT_ID = "a5f1a093-2cd8-436b-8e7d-07fb2b0b62dc";
const PAGE_DARK = "#0c0d0f"; // contracts THEME_COLORS.dark: the paper the document opens on before its boot script runs.

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Chanlytics",
  slug: "chanlytics",
  owner: "chanlyticss-team",
  version: "1.0.0",
  scheme: "chanlytics",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: ID,
    supportsTablet: false,
    deploymentTarget: "16.4",
    config: { usesNonExemptEncryption: false },
    ...(HOST ? { associatedDomains: [`applinks:${HOST}`] } : {}),
    infoPlist: {
      // The shell is a WebView of the product: nothing here needs a camera, contacts or location. Face ID comes with PR 3.
      UIBackgroundModes: [],
    },
  },
  android: {
    package: ID,
    adaptiveIcon: {
      backgroundColor: PAGE_DARK,
      foregroundImage: "./assets/images/android-icon-foreground.png",
    },
    predictiveBackGestureEnabled: false,
    ...(HOST
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: [{ scheme: "https", host: HOST, pathPrefix: "/w/" }],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
  },
  plugins: [
    "expo-router",
    "expo-updates",
    ["expo-splash-screen", { backgroundColor: PAGE_DARK, image: "./assets/images/splash-icon.png", imageWidth: 96 }],
  ],
  // EAS Update: the fingerprint policy, so an update can only reach a build whose native code it matches.
  runtimeVersion: { policy: "fingerprint" },
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { ...config.extra, eas: { projectId: EAS_PROJECT_ID } },
});
