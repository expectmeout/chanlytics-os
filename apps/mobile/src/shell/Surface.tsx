/**
 * One page of the live site in the shell (the PRD, M2): a WebView at the workspace's hash route, created the first
 * time its tab is in front and kept afterwards. It names the shell in the User-Agent, sets the page's bottom inset
 * before paint, hears the page over the bridge, keeps foreign links out of the app, recovers when iOS kills the
 * content process, reads "signed out" from the address so the shell can show the sign-in screen, hands the page the
 * phone's push token to register, opens the route of a tapped notification, and has the page forget the phone before
 * a sign-out (the PR 2 design).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Appearance, BackHandler, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import * as Application from "expo-application";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useRouter } from "expo-router";
import { parsePageMessage, THEME_COLORS, type ShellMessage } from "@chanlytics/contracts";
import { askPage, bottomInset, insetScript, onPageMessage, registrationKey, shouldRegister } from "./bridge";
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

/** How long the page has to forget the phone before a sign-out goes ahead without it. */
const FORGET_WAIT_MS = 2000;

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
  const forgetting = useRef<{ resolve: () => void } | null>(null);
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
      const { state, effect } = onPageMessage(getState(), e.nativeEvent.data);
      setState(state);
      if (effect === "badge") void setBadge(state.badge);
      if (effect === "calls-over") void endCallActivities();
      // The page's theme is the app's: every useColorScheme() in the shell follows it from here on.
      if (effect === "theme") Appearance.setColorScheme(state.theme);
      const m = parsePageMessage(e.nativeEvent.data);
      if (m?.t === "today") updateTodayWidget(m.snapshot);
      if (m?.t === "device" && m.state === "forgotten") forgetting.current?.resolve();
      if (m?.t === "token") tokenArrived(m.access ? { token: m.access, expires: m.expires } : null);
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

  const onNavigation = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading && isSignedOutUrl(nav.url)) setState({ session: "out", slug: null, needs: 0, registered: null });
  }, []);

  const onShouldStart = useCallback(
    (req: ShouldStartLoadRequest) => {
      if (req.url.startsWith("about:")) return true;
      if (isOurs(req.url)) {
        // Before the person signs out, the page forgets the phone; two seconds at most, then the sign-out goes on.
        const { token: tok, registered: reg } = getState();
        if (/\/auth\/signout(\/|\?|$)/.test(req.url) && tok && reg && !forgetting.current) {
          const go = () => {
            forgetting.current = null;
            setState({ registered: null });
            ref.current?.injectJavaScript(`window.location.assign(${JSON.stringify(req.url)});true;`);
          };
          const timer = setTimeout(go, FORGET_WAIT_MS);
          forgetting.current = {
            resolve: () => {
              clearTimeout(timer);
              go();
            },
          };
          handle.ask({ t: "forget", token: tok });
          return false;
        }
        return true;
      }
      if (/^(https?:)/.test(req.url)) void WebBrowser.openBrowserAsync(req.url);
      else if (/^(tel|mailto|sms):/.test(req.url)) void Linking.openURL(req.url);
      return false;
    },
    [handle],
  );

  // Android's hardware back walks the page's own history first.
  useEffect(() => {
    if (Platform.OS !== "android" || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      ref.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [focused]);

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

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
