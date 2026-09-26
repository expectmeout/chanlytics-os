/**
 * The root: the page's own dark and light as the app's theme (no white frame on a tab switch), the sign-in page
 * whenever the site says a person is out, the tabs otherwise, an offline screen over everything while the phone has
 * no network, on every return to the foreground a look at the site's build and at EAS Update, and the phone's push
 * token and taps (the PR 2 design).
 */
import { useCallback, useEffect } from "react";
import { AppState, Platform, useColorScheme, View } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { askForToken, coldStartRoute, installForegroundHandler, listen, tabOf } from "@/shell/notifications";
import { StatusBar } from "expo-status-bar";
import { useNetworkState } from "expo-network";
import * as Updates from "expo-updates";
import { Surface } from "@/shell/Surface";
import { Offline } from "@/shell/Offline";
import { getState, reloadEveryPage, setState, useShell } from "@/shell/state";
import { decideReload, shaOf } from "@/shell/deploy";
import { SITE_ORIGIN } from "@/site";

const PAPER = { light: "#fbfaf8", dark: "#0c0d0f" };

async function lookAtTheSite(): Promise<void> {
  try {
    const r = await fetch(`${SITE_ORIGIN}/api/version`, { headers: { accept: "application/json" }, cache: "no-store" });
    const sha = shaOf(await r.json());
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
  const net = useNetworkState();
  const offline = net.isConnected === false;
  const router = useRouter();

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
    return listen({ tap: open, token: (token) => setState({ token }) });
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
          <Surface route="login" />
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: paper } }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        )}
        {offline && Platform.OS !== "web" && <Offline onRetry={retry} />}
      </View>
    </ThemeProvider>
  );
}
