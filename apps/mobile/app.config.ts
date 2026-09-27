import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The phone app's configuration (the PRD, M1 and M11). Everything a store needs to know that is not code.
 *
 * The site the shell holds is EXPO_PUBLIC_SITE_ORIGIN when an EAS environment sets one, else the product's own address;
 * the app links (universal links on iOS, app links on Android) are derived from its host. The identifiers are the product's, once, in one place.
 */
const ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN || "https://app.chanlytics.com"; // src/site.ts DEFAULT_SITE_ORIGIN
const HOST = ORIGIN ? new URL(ORIGIN).host : "";
// Google sign-in's iOS URL scheme is the iOS client id reversed; without the id there is no Google button and no plugin.
const GOOGLE_IOS = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "").trim();
const GOOGLE_SCHEME = /^([a-z0-9-]+)\.apps\.googleusercontent\.com$/i.exec(GOOGLE_IOS)?.[1];
const GOOGLE_PLUGIN: [string, { iosUrlScheme: string }][] = GOOGLE_SCHEME
  ? [["@react-native-google-signin/google-signin", { iosUrlScheme: `com.googleusercontent.apps.${GOOGLE_SCHEME}` }]]
  : [];
const ID = "com.chanlytics.app";
/** The EAS project (expo.dev, chanlyticss-team / chanlytics): what builds, updates and push tokens are filed under. */
const EAS_PROJECT_ID = "a5f1a093-2cd8-436b-8e7d-07fb2b0b62dc";
const PAGE_DARK = "#0c0d0f";
const MARK_TEAL = "#3cb79e"; // the ring in the mark, sampled from icon.png // contracts THEME_COLORS.dark: the paper the document opens on before its boot script runs.

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
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    ...(HOST ? { associatedDomains: [`applinks:${HOST}`] } : {}),
    infoPlist: {
      // The shell is a WebView of the product: nothing here needs a camera, contacts or location.
      UIBackgroundModes: [],
    },
    // The app's own manifest (docs/store/privacy-labels.md); the Expo modules ship theirs. No tracking, no tracking domain.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1"],
        },
      ],
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
    // The status-bar icon Android draws is the mark in white on transparent (a 96px PNG); the tint is the ring's teal.
    [
      "expo-notifications",
      { icon: "./assets/images/notification-icon.png", color: MARK_TEAL, defaultChannel: "default" },
    ],
    ["expo-splash-screen", { backgroundColor: PAGE_DARK, image: "./assets/images/splash-icon.png", imageWidth: 96 }],
    "expo-apple-authentication",
    ["expo-local-authentication", { faceIDPermission: "Chanlytics locks itself with Face ID until you return." }],
    "expo-secure-store",
    // Today on the home screen and the Lock Screen (src/widgets/TodayWidget.tsx); the app group is the default.
    [
      "expo-widgets",
      {
        // The call in progress is a Live Activity started by the site's push (src/widgets/CallActivity.tsx).
        enablePushNotifications: true,
        widgets: [
          {
            name: "TodayWidget",
            displayName: "Today",
            description: "Today's messages, calls and who needs you.",
            ios: { supportedFamilies: ["systemSmall", "systemMedium", "accessoryRectangular"] },
          },
        ],
      },
    ],
    ...GOOGLE_PLUGIN,
  ],
  // EAS Update: the fingerprint policy, so an update can only reach a build whose native code it matches.
  runtimeVersion: { policy: "fingerprint" },
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { ...config.extra, eas: { projectId: EAS_PROJECT_ID } },
});
