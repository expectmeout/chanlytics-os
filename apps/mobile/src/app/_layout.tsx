/**
 * The root: the page's own theme as the app's (the page says which; Appearance is set from it, so every
 * useColorScheme() in the shell follows the member's choice rather than the device's, and no white frame shows on a
 * tab switch), the sign-in page whenever the site says a person is out, the tabs otherwise, an offline screen over
 * everything while the phone has no network, on every return to the foreground a look at the site's build and at
 * EAS Update, the phone's push token and taps (the PR 2 design), and the lock in front of everything (the PR 3
 * design).
 */
import { useCallback, useEffect, useRef } from "react";
import { Appearance, AppState, Platform, StyleSheet, useColorScheme, View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { askForToken, coldStartTap, installForegroundHandler, listen, type Tap } from "@/shell/notifications";
import { tabHrefOf } from "@/shell/notifications-pure";
import { StatusBar } from "expo-status-bar";
import { useNetworkState } from "expo-network";
import * as Updates from "expo-updates";
import { Offline } from "@/shell/Offline";
import { SignIn } from "@/shell/SignIn";
import { Lock, useLockGate } from "@/shell/LockScreen";
import { signOutNatively } from "@/shell/native-auth";
import { listenPushToStart } from "@/shell/live-activity";
import { getState, reloadEveryPage, setState, useShell } from "@/shell/state";
import { recallAndKeep } from "@/shell/remembered";
import { decideReload, isOlderThan, minAppOf, shaOf } from "@/shell/deploy";
import { Update } from "@/shell/Update";
import * as Application from "expo-application";
import { THEME_COLORS } from "@chanlytics/contracts/phone-app";
import { SITE_ORIGIN } from "@/site";
import { Observe, ObserveRoot } from "expo-observe";
import { front } from "@/shell/front";

// The workspace and the theme the last launch kept, before any page is made: the first page opens at its workspace's
// own address, in the member's own theme. Before any page has said one, the theme is the web's own default.
recallAndKeep();
Appearance.setColorScheme(getState().theme);

async function lookAtTheSite(): Promise<void> {
  try {
    const r = await fetch(`${SITE_ORIGIN}/api/version`, { headers: { accept: "application/json" }, cache: "no-store" });
    const body = await r.json();
    const sha = shaOf(body);
    const min = minAppOf(body);
    if (min && isOlderThan(Application.nativeApplicationVersion ?? "0.0.0", min)) setState({ tooOld: true });
    const { siteSha, lastReloadAt } = getState();
    const now = Date.now();
    // A new build of the site: every page out of sight is reloaded onto it. The one in front is not, since a reload there
    // took the person's place and whatever they were typing; the site marks that page stale itself and offers the
    // reload (LegacyApp's version check), and the next cold start loads the new build.
    if (decideReload({ lastSha: siteSha, sha, lastReloadAt, now }) === "reload") {
      setState({ siteSha: sha, lastReloadAt: now });
      reloadEveryPage(front.page()?.reload);
    } else if (sha && !siteSha) setState({ siteSha: sha });
  } catch {
    /* no network, or the site is mid-deploy: the next foreground looks again */
  }
}

/**
 * EAS Update on every return to the foreground. Not at launch: expo-updates checks and fetches there on its own
 * (checkAutomatically's default), and a second check right behind it bought nothing but a restart of the app the
 * moment the download ended, before anyone was in, lock screen included. An update fetched here restarts the app at
 * once only while nobody is in the middle of anything (state.ts idle) and the lock is not up; otherwise it runs on
 * the next launch. A rollback the server ordered counts as an update. One look at a time.
 */
let looking = false;
async function lookAtUpdates(locked: () => boolean): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || looking) return;
  looking = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable && !check.isRollBackToEmbedded) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew && !fetched.isRollBackToEmbedded) return;
    if (getState().idle && !locked()) {
      await Updates.reloadAsync({ reloadScreenOptions: { backgroundColor: THEME_COLORS[getState().theme] } });
    }
  } catch {
    /* an update that cannot be fetched is not the person's problem */
  } finally {
    looking = false;
  }
}

installForegroundHandler();

// Which bundle this launch runs, said once in the device's log (logcat's ReactNativeJS): an update's id, when it was
// published and its channel, or the build's own bundle. The walk reads it to say what it walked
// (tooling/scripts/mobile/walk.mjs). Nothing of a person's is in it.
console.info(
  "app_launch",
  JSON.stringify({
    update: Updates.updateId,
    publishedAt: Updates.createdAt?.toISOString() ?? null,
    embedded: Updates.isEmbeddedLaunch,
    channel: Updates.channel,
  }),
);

// EAS Observe: launch and per-tab timings from real phones (each tab's page marks itself interactive as it first
// reports its route, Surface.tsx), and the app's crashes and unhandled errors. Nothing of a page's content is sent.
Observe.configure({ integrations: { "expo-router": true } });

function RootLayout() {
  const scheme = useColorScheme();
  const session = useShell((s) => s.session);
  const tooOld = useShell((s) => s.tooOld);
  const net = useNetworkState();
  const offline = net.isConnected === false;
  const router = useRouter();
  // The lock (LockScreen.tsx useLockGate): at launch, and after two minutes in the background; covered meanwhile.
  const { locked, covered, unlocked } = useLockGate();

  // A sign-out on the web is one on the phone too: Google's SDK forgets the account it chose. A route that waited
  // through the sign-in (a tapped notification, a link) opens as the person comes in.
  useEffect(() => {
    if (session === "out") void signOutNatively();
    const waiting = getState().pendingRoute;
    if (session === "in" && waiting) router.navigate(tabHrefOf(waiting));
  }, [session, router]);

  // The phone is told (shell/notifications.ts): the token once, every rotation, and every tap into its tab. While
  // nobody is signed in there are no tabs to navigate (the sign-in screen stands in their place): the route waits,
  // and the effect below opens it as the person comes in.
  useEffect(() => {
    const open = ({ route, workspace }: Tap) => {
      setState({ pendingRoute: route, pendingWorkspace: workspace });
      if (getState().session !== "out") router.navigate(tabHrefOf(route));
    };
    void coldStartTap().then((tap) => {
      if (tap) open(tap);
    });
    const offTaps = listen({ tap: open, token: (token) => setState({ token }) });
    // The Live Activity's push-to-start token, registered beside the push token the moment the phone hands it out.
    const offActivity = listenPushToStart((activityToken) => setState({ activityToken }));
    return () => {
      offTaps();
      offActivity();
    };
  }, [router]);

  // The notification prompt comes once someone is signed in, not over the sign-in screen at first launch: a prompt
  // before the person knows what the app will tell them is the one most often refused, and a refusal is for good.
  useEffect(() => {
    if (session !== "in") return;
    void askForToken().then((token) => {
      if (token) setState({ token });
    });
  }, [session]);

  const lockedNow = useRef(false);
  useEffect(() => {
    lockedNow.current = locked;
  }, [locked]);
  useEffect(() => {
    void lookAtTheSite();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void lookAtTheSite();
        void lookAtUpdates(() => lockedNow.current);
        // A registration the site refused is asked for once more on each return, never in a loop (bridge.ts).
        setState({ refused: null });
      }
    });
    return () => sub.remove();
  }, []);

  const retry = useCallback(() => reloadEveryPage(), []);
  const theme = scheme === "dark" ? DarkTheme : DefaultTheme;
  const paper = THEME_COLORS[scheme === "dark" ? "dark" : "light"];

  return (
    <ThemeProvider value={{ ...theme, colors: { ...theme.colors, background: paper, card: paper } }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: paper }}>
        {/* Behind the lock or the cover, nothing of the pages is read out by VoiceOver or TalkBack. */}
        <View
          style={{ flex: 1 }}
          importantForAccessibility={locked || covered ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={locked || covered}
        >
          {session === "out" ? (
            <SignIn />
          ) : (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: paper } }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
          )}
          {offline && Platform.OS !== "web" && <Offline onRetry={retry} />}
        </View>
        {covered && !locked && <View style={[StyleSheet.absoluteFill, { backgroundColor: paper }]} />}
        {locked && <Lock onUnlocked={unlocked} />}
        {tooOld && <Update />}
      </View>
    </ThemeProvider>
  );
}

export default ObserveRoot.wrap(RootLayout);
