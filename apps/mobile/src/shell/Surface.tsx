/**
 * One page of the live site in the shell (the PRD, M2): a WebView at the workspace's hash route, created the first
 * time its tab is in front and kept afterwards. It names the shell in the User-Agent, sets the page's bottom inset
 * before paint, hears the page over the bridge, keeps foreign links out of the app, recovers when iOS kills the
 * content process, reads "signed out" from the address so the shell can show the sign-in screen and keep nothing of
 * the person who left, hands the page the phone's push token to register, and opens the route of a tapped
 * notification. The page forgets the phone on its own before a sign-out (legacy-bridge/app-bridge.ts forgetPhone):
 * the shell used to intercept the sign-out for that and replay it as a GET, which the route does not answer, so on
 * iOS nobody was ever signed out.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Appearance, BackHandler, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import * as Application from "expo-application";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useRouter } from "expo-router";
import { parsePageMessage, THEME_COLORS, type PageMessage, type ShellMessage } from "@chanlytics/contracts";
import { askPage, bottomInset, insetScript, onPageMessage, registrationKey, shouldRegister, signedOut } from "./bridge";
import { getState, registerReloader, setState, useShell, type Tab } from "./state";
import { setBadge, tabOf } from "./notifications";
import { updateTodayWidget } from "./widget";
import { endCallActivities } from "./live-activity";
import { threadIdOf, tokenArrived } from "./api";
import { Offline } from "./Offline";
import { hrefFor, isOurs, isSignedOutUrl, LOGIN_HREF, NATIVE_DOOR, userAgentToken } from "@/site";

const PLATFORM: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

export interface SurfaceHandle {
  ask(m: ShellMessage): void;
  reload(): void;
}

interface Props {
  /** The hash route this page shows; "login" is the sign-in page. */
  route: string;
  /** The tab this page is in, so a tapped notification's route knows whether it is this page's to open. */
  tab?: Tab;
  /** Called once the page reports its route, each time this tab comes to the front. */
  onReady?: (h: SurfaceHandle) => void;
  /** A form body to POST to the site's native door instead of loading the route: a native token becoming the cookie. */
  post?: string;
}

export function Surface({ route, tab, onReady, post }: Props) {
  const ref = useRef<WebView>(null);
  const focused = useIsFocused();
  const router = useRouter();
  // Created the first time this tab is in front, kept afterwards: a latch set during render, not in an effect.
  const [mounted, setMounted] = useState(focused);
  if (focused && !mounted) setMounted(true);
  const [failed, setFailed] = useState(false);
  const slug = useShell((s) => s.slug);
  const theme = useShell((s) => s.theme);
  const token = useShell((s) => s.token);
  const activityToken = useShell((s) => s.activityToken);
  const registered = useShell((s) => s.registered);
  const session = useShell((s) => s.session);
  const pendingRoute = useShell((s) => s.pendingRoute);
  const [ready, setReady] = useState(false);
  const insets = useSafeAreaInsets();
  const userAgent = useMemo(() => userAgentToken(Application.nativeApplicationVersion ?? "0.0.0", PLATFORM), []);
  const inset = bottomInset(PLATFORM, insets.bottom);
  const uri = route === "login" ? LOGIN_HREF : hrefFor(slug, route);
  // The door's POST from inside the WebView: the cookie it sets is the WebView's, and its 303 lands the page.
  const source = post
    ? { uri: NATIVE_DOOR, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: post }
    : { uri };

  const handle = useMemo<SurfaceHandle>(
    () => ({
      ask: (m) => ref.current?.injectJavaScript(askPage(m)),
      reload: () => {
        setFailed(false);
        ref.current?.reload();
      },
    }),
    [],
  );
  useEffect(() => registerReloader(handle.reload), [handle]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const m = actOnPageMessage(e.nativeEvent.data);
      if (m?.t === "route") {
        setReady(true);
        if (focused) onReady?.(handle);
        // A thread opened on the Inbox page is drawn natively over it (PR 8): the page goes back to its list, so the
        // list is what stands under the thread and what the person returns to.
        const thread = tab === "inbox" ? threadIdOf(m.route) : null;
        if (thread) {
          handle.ask({ t: "navigate", route: "inbox" });
          router.push({ pathname: "/(tabs)/inbox/[id]", params: { id: thread } });
        }
      }
    },
    [focused, handle, onReady, router, tab],
  );

  // The phone registers through the page in front: once per token pair per person (bridge.ts shouldRegister).
  useEffect(() => {
    const s = { ...getState(), session, token, activityToken, registered };
    if (!ready || !focused || route === "login" || !shouldRegister(s)) return;
    setState({ registered: registrationKey(s) }); // claimed now, so a second page in front does not ask again; a refusal clears it
    handle.ask({
      t: "device",
      token: token!,
      platform: PLATFORM,
      version: Application.nativeApplicationVersion ?? "",
      ...(activityToken ? { activity: activityToken } : {}),
    });
  }, [ready, focused, route, session, token, activityToken, registered, handle]);

  // A tapped notification's route, opened by the tab it belongs to once its page is ready.
  useEffect(() => {
    if (!ready || !focused || !pendingRoute || !tab || tabOf(pendingRoute) !== tab) return;
    setState({ pendingRoute: null });
    handle.ask({ t: "navigate", route: pendingRoute });
  }, [ready, focused, pendingRoute, tab, handle]);

  // A signed-out address is the person gone: nothing of theirs stays in the shell, the icon wears no number, and a
  // call activity of theirs ends. The page itself has already forgotten the phone (shell.ts signOut).
  const onNavigation = useCallback((nav: WebViewNavigation) => {
    if (nav.loading || !isSignedOutUrl(nav.url) || getState().session === "out") return;
    setState(signedOut(getState()));
    void setBadge(0);
    void endCallActivities();
  }, []);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (req.url.startsWith("about:") || isOurs(req.url)) return true;
    if (/^(https?:)/.test(req.url)) void WebBrowser.openBrowserAsync(req.url);
    else if (/^(tel|mailto|sms):/.test(req.url)) void Linking.openURL(req.url);
    return false;
  }, []);

  useAndroidBack(ref, focused);

  // The page's paper, behind the WebView (the library's own is white) and in the strip under the status bar: the
  // shell pads the top itself, on both platforms, since the page's header draws to the top of its viewport.
  const paper = { backgroundColor: THEME_COLORS[theme] };
  if (!mounted) return <View style={[styles.fill, paper]} />;
  return (
    <View style={[styles.fill, paper, { paddingTop: insets.top }]}>
      <WebView
        ref={ref}
        source={source}
        style={[styles.fill, paper]}
        applicationNameForUserAgent={userAgent}
        sharedCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={insetScript(inset)}
        onMessage={onMessage}
        onNavigationStateChange={onNavigation}
        onShouldStartLoadWithRequest={onShouldStart}
        onContentProcessDidTerminate={() => ref.current?.reload()}
        onError={() => setFailed(true)}
        onLoadEnd={() => setFailed(false)}
        startInLoadingState
        renderLoading={() => <View style={[StyleSheet.absoluteFill, paper]} />}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsInlineMediaPlayback
        hideKeyboardAccessoryView
        // iOS's "normal" as the number it means: Android's native prop is a Double, and the word crashed the app
        // the moment the first page mounted (the library converts it on iOS only).
        decelerationRate={0.998}
        textZoom={100}
      />
      {failed && <Offline onRetry={handle.reload} />}
    </View>
  );
}

/**
 * What a page's message does beyond the one page that heard it: the shell's state moves (bridge.ts), and the icon,
 * the call activity, the theme, the widget and a waiting token call follow. Returns the message, parsed, for what
 * is the page's own (its route).
 */
function actOnPageMessage(raw: string): PageMessage | null {
  const { state, effect } = onPageMessage(getState(), raw);
  setState(state);
  if (effect === "badge") void setBadge(state.badge);
  if (effect === "calls-over") void endCallActivities();
  // The page's theme is the app's: every useColorScheme() in the shell follows it from here on.
  if (effect === "theme") Appearance.setColorScheme(state.theme);
  const m = parsePageMessage(raw);
  if (m?.t === "today") updateTodayWidget(m.snapshot);
  if (m?.t === "token") tokenArrived(m.access ? { token: m.access, expires: m.expires } : null);
  return m;
}

/** Android's hardware back walks the page's own history first, while its tab is in front. */
function useAndroidBack(ref: RefObject<WebView | null>, focused: boolean): void {
  useEffect(() => {
    if (Platform.OS !== "android" || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      ref.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [focused, ref]);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
