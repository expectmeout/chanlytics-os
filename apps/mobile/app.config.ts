import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * The phone app's configuration (the PRD, M1 and M11). Everything a store needs to know that is not code.
 *
 * The site the shell holds is EXPO_PUBLIC_SITE_ORIGIN when an EAS environment sets one, else the product's own address;
 * the app links (universal links on iOS, app links on Android) are derived from its host. The identifiers are the
 * product's, once, in one place. What an environment sets is read each time Expo evaluates the config, never as the
 * module loads, so a build, a local run and a test each read their own.
 */
// The config loader reads no file of the app's, so these two are spelled here as src/site.ts DEFAULT_SITE_ORIGIN and
// src/shell/sign-in.ts reversedClientId spell them; test/config.test.mjs holds each copy to its original.
const PRODUCT_ORIGIN = "https://app.chanlytics.com";
const GOOGLE_CLIENT_ID_SHAPE = /^([a-z0-9-]+)\.apps\.googleusercontent\.com$/i;
const ID = "com.chanlytics.app";
/** The EAS project (expo.dev, chanlyticss-team / chanlytics): what builds, updates and push tokens are filed under. */
const EAS_PROJECT_ID = "a5f1a093-2cd8-436b-8e7d-07fb2b0b62dc";
/** contracts THEME_COLORS.dark: the paper the document opens on before its boot script runs. */
const PAGE_DARK = "#0c0d0f";
/** The top tile of the three, the mark (the mascot's rest look, lit, on the dark paper). */
const MARK_CORAL = "#fa695c";

/** What the build's environment decides: the site's host, Google's iOS sign-in, and Android's Firebase file. */
function fromTheEnvironment() {
  const origin = process.env.EXPO_PUBLIC_SITE_ORIGIN || PRODUCT_ORIGIN;
  // Google sign-in's iOS URL scheme is the iOS client id reversed; without the id there is no Google button and no plugin.
  const googleScheme = GOOGLE_CLIENT_ID_SHAPE.exec((process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "").trim())?.[1];
  const googlePlugin: [string, { iosUrlScheme: string }][] = googleScheme
    ? [["@react-native-google-signin/google-signin", { iosUrlScheme: `com.googleusercontent.apps.${googleScheme}` }]]
    : [];
  return {
    host: new URL(origin).host,
    googlePlugin,
    /**
     * Android's Firebase file (google-services.json), which registers the app with Firebase Cloud Messaging: without
     * it a phone is never given a push token. EAS keeps it as a file variable, writes it to a path of its own for each
     * job and names that path in GOOGLE_SERVICES_JSON (docs/runbook.md, "Turn on push"). Unset, the key is left out
     * and the build is what it was. The fingerprint hashes the file's contents and leaves the path out, so a path that
     * differs from one job to the next builds nothing new.
     */
    googleServices: (process.env.GOOGLE_SERVICES_JSON ?? "").trim(),
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { host, googlePlugin, googleServices } = fromTheEnvironment();
  return {
    ...config,
    name: "Chanlytics",
    slug: "chanlytics",
    owner: "chanlyticss-team",
    version: "1.0.0",
    scheme: "chanlytics",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    userInterfaceStyle: "automatic",
    // Behind every screen, before and between the pages: the dark paper, never the system's white.
    backgroundColor: PAGE_DARK,
    ios: {
      bundleIdentifier: ID,
      supportsTablet: false,
      deploymentTarget: "16.4",
      usesAppleSignIn: true,
      config: { usesNonExemptEncryption: false },
      associatedDomains: [`applinks:${host}`],
      infoPlist: {
        // The shell is a WebView of the product: nothing here needs a camera, contacts or location.
        UIBackgroundModes: [],
        // The page's call, mail and text links go to the phone's own apps; iOS answers "can this open?" only for the
        // schemes an app names here, and the WebView asks before it opens one.
        LSApplicationQueriesSchemes: ["tel", "mailto", "sms"],
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
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [{ scheme: "https", host, pathPrefix: "/w/" }],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    plugins: [
      "expo-router",
      "expo-updates",
      // Android's status-bar icon: the three in white on transparent (a 96px PNG), tinted the top tile's coral.
      [
        "expo-notifications",
        { icon: "./assets/images/notification-icon.png", color: MARK_CORAL, defaultChannel: "default" },
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
      ...googlePlugin,
    ],
    // EAS Update: the fingerprint policy, so an update can only reach a build whose native code it matches.
    runtimeVersion: { policy: "fingerprint" },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: { ...config.extra, eas: { projectId: EAS_PROJECT_ID } },
  };
};
