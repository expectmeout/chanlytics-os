/**
 * The root: the page's own dark and light as the app's theme (no white frame on a tab switch), the sign-in page
 * whenever the site says a person is out, the tabs otherwise, an offline screen over everything while the phone has
 * no network, on every return to the foreground a look at the site's build and at EAS Update, the phone's push
 * token and taps (the PR 2 design), and the lock in front of everything (the PR 3 design).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, useColorScheme, View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { askForToken, coldStartRoute, installForegroundHandler, listen, tabOf } from "@/shell/notifications";
import { StatusBar } from "expo-status-bar";
import { useNetworkState } from "expo-network";
import * as Updates from "expo-updates";
import { Offline } from "@/shell/Offline";
import { SignIn } from "@/shell/SignIn";
import { Lock } from "@/shell/LockScreen";
import { canLock, lockChoice } from "@/shell/lock";
import { shouldLock } from "@/shell/sign-in";
import { signOutNatively } from "@/shell/native-auth";
import { listenPushToStart } from "@/shell/live-activity";
import { getState, reloadEveryPage, setState, useShell } from "@/shell/state";
import { decideReload, isOlderThan, minAppOf, shaOf } from "@/shell/deploy";
import { Update } from "@/shell/Update";
import * as Application from "expo-application";
import { SITE_ORIGIN } from "@/site";

const PAPER = { light: "#fbfaf8", dark: "#0c0d0f" };

async function lookAtTheSite(): Promise<void> {
  try {
    const r = await fetch(`${SITE_ORIGIN}/api/version`, { headers: { accept: "application/json" }, cache: "no-store" });
    const body = await r.json();
    const sha = shaOf(body);
    const min = minAppOf(body);
    if (min && isOlderThan(Application.nativeApplicationVersion ?? "0.0.0", min)) setState({ tooOld: true });
    const { siteSha, lastReloadAt } = getState();
    const now = Date.now();
    if (decideReload({ lastSha: siteSha, sha, lastReloadAt, now }) === "reload") {
      setState({ siteSha: sha, lastReloadAt: now });
      reloadEveryPage();
    } else if (sha && !siteSha) setState({ siteSha: sha });
  } catch {
    /* no network, or the site is mid-deploy: the next foreground looks again */
  }
}

async function lookAtUpdates(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) return;
    await Updates.fetchUpdateAsync();
    // Only while nobody is mid-page: the sign-in screen, or the first look after a launch.
    if (getState().session !== "in") await Updates.reloadAsync();
  } catch {
    /* an update that cannot be fetched is not the person's problem */
  }
}

installForegroundHandler();

export default function RootLayout() {
  const scheme = useColorScheme();
  const session = useShell((s) => s.session);
  const tooOld = useShell((s) => s.tooOld);
  const net = useNetworkState();
  const offline = net.isConnected === false;
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const lockInfo = useRef<{ can: boolean; choice: boolean | null; backgroundedAt: number | null }>({
    can: false,
    choice: null,
    backgroundedAt: null,
  });

  // The lock (shell/lock.ts, the rule in sign-in.ts): at launch, and after two minutes in the background.
  useEffect(() => {
    void Promise.all([canLock(), lockChoice()]).then(([can, choice]) => {
      lockInfo.current = { ...lockInfo.current, can, choice };
      if (shouldLock({ enabled: choice, canLock: can, backgroundedAt: null, now: Date.now(), launch: true }))
        setLocked(true);
    });
    const sub = AppState.addEventListener("change", (s) => {
      const info = lockInfo.current;
      if (s === "background") info.backgroundedAt = Date.now();
      if (s === "active") {
        void lockChoice().then((choice) => {
          info.choice = choice;
          if (
            shouldLock({
              enabled: choice,
              canLock: info.can,
              backgroundedAt: info.backgroundedAt,
              now: Date.now(),
              launch: false,
            })
          )
            setLocked(true);
        });
      }
    });
    return () => sub.remove();
  }, []);

  // A sign-out on the web is one on the phone too: Google's SDK forgets the account it chose.
  useEffect(() => {
    if (session === "out") void signOutNatively();
  }, [session]);

  // The phone is told (shell/notifications.ts): the token once, every rotation, and every tap into its tab.
  useEffect(() => {
    const open = (route: string) => {
      setState({ pendingRoute: route });
      router.navigate(`/(tabs)/${tabOf(route)}` as never);
    };
    void askForToken().then((token) => {
      if (token) setState({ token });
    });
    void coldStartRoute().then((route) => {
      if (route) open(route);
    });
    const offTaps = listen({ tap: open, token: (token) => setState({ token }) });
    // The Live Activity's push-to-start token, registered beside the push token the moment the phone hands it out.
    const offActivity = listenPushToStart((activityToken) => setState({ activityToken }));
    return () => {
      offTaps();
      offActivity();
    };
  }, [router]);

  useEffect(() => {
    void lookAtTheSite();
    void lookAtUpdates();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void lookAtTheSite();
        void lookAtUpdates();
      }
    });
    return () => sub.remove();
  }, []);

  const retry = useCallback(() => reloadEveryPage(), []);
  const theme = scheme === "dark" ? DarkTheme : DefaultTheme;
  const paper = scheme === "dark" ? PAPER.dark : PAPER.light;

  return (
    <ThemeProvider value={{ ...theme, colors: { ...theme.colors, background: paper, card: paper } }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: paper }}>
        {session === "out" ? (
          <SignIn />
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: paper } }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        )}
        {offline && Platform.OS !== "web" && <Offline onRetry={retry} />}
        {locked && <Lock onUnlocked={() => setLocked(false)} />}
        {tooOld && <Update />}
      </View>
    </ThemeProvider>
  );
}
