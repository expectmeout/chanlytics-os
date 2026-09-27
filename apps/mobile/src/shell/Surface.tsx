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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Appearance,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewOpenWindowEvent,
  WebViewSource,
} from "react-native-webview/lib/WebViewTypes";
import * as Application from "expo-application";
import * as WebBrowser from "expo-web-browser";
import * as Updates from "expo-updates";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { useObserve } from "expo-observe";
import { parsePageMessage, THEME_COLORS, type PageMessage, type ShellMessage } from "@chanlytics/contracts";
import { askPage, bottomInset, insetScript, onPageMessage, registrationKey, shouldRegister, signedOut } from "./bridge";
import { getState, registerReloader, setState, useShell, type Tab } from "./state";
import { setBadge, tabOf } from "./notifications";
import { updateTodayWidget } from "./widget";
import { endCallActivities } from "./live-activity";
import { front } from "./front";
import { Offline } from "./Offline";
import { shareFile } from "./files";
import { hrefFor, isOurs, isSignedOutUrl, LOGIN_HREF, NATIVE_DOOR, userAgentToken } from "@/site";

const PLATFORM: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
/**
 * Whether a computer on the cable may inspect the pages (chrome://inspect, Safari's Develop menu): in a development or
 * preview build only, where it is how a page's load is measured on a phone. Never in a store build, where it would
 * hand the signed-in pages to anyone holding the phone with a debugger.
 */
const INSPECTABLE = __DEV__ || Updates.channel === "preview";

export interface SurfaceHandle {
  ask(m: ShellMessage): void;
  reload(): void;
}

interface Props {
  /** The hash route this page shows; "login" is the sign-in page. */
  route: string;
  /**
   * The tab this page is in: a tapped notification's route knows whether it is this page's to open, and whenever the
   * tab is in front with its page ready, this page is the one a tab press reaches (front.ts).
   */
  tab?: Tab;
  /** Called once, the first time the page reports its route. */
  onReady?: (h: SurfaceHandle) => void;
  /** A form body to POST to the site's native door instead of loading the route: a native token becoming the cookie. */
  post?: string;
  /** Called with each address the page lands on: the sign-in screen reads a door that refused from it. */
  onLanded?: (url: string) => void;
}

export function Surface({ route, tab, onReady, post, onLanded }: Props) {
  const ref = useRef<WebView>(null);
  // Whether a sheet, a dialog or a menu stands over the page, as the page last said (legacy-bridge/app-bridge.ts
  // watchOverlays, at install and on every change): Android's Back closes it before it walks the history.
  const overlay = useRef(false);
  const focused = useIsFocused();
  // Created the first time this tab is in front, kept afterwards: a latch set during render, not in an effect.
  const [mounted, setMounted] = useState(focused);
  if (focused && !mounted) setMounted(true);
  // Counts the times Android's renderer died under this page: each one is a new WebView, since the old one is dead
  // and blank for good (the library only reports it). iOS reloads in place, below.
  const [epoch, setEpoch] = useState(0);
  // A new WebView after a dead renderer has nothing standing over it until its page says so.
  useEffect(() => {
    overlay.current = false;
  }, [epoch]);
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
  // Where this WebView starts, fixed as it is created, and again for each new one after a dead renderer: the page
  // moves itself after that. It followed the shell's slug, so on a first launch (no slug yet: the site's home, which
  // replaces itself with the workspace's address) the page naming its workspace sent the WebView to the same page
  // with `#/today` added, an entry Back then stepped through with nothing to see. Every launch after the first knows
  // its workspace from the one before (remembered.ts) and starts at its address.
  const [start, setStart] = useState<{ epoch: number; source: WebViewSource } | null>(null);
  const source = start?.epoch === epoch ? start.source : sourceOf(route, slug, post);
  if (mounted && start?.epoch !== epoch) setStart({ epoch, source });

  const handle = useMemo<SurfaceHandle>(
    () => ({
      ask: (m) => ref.current?.injectJavaScript(askPage(m)),
      reload: () => ref.current?.reload(),
    }),
    [],
  );
  useEffect(() => registerReloader(handle.reload), [handle]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const m = actOnPageMessage(e.nativeEvent.data);
      if (m?.t === "overlay") overlay.current = m.open;
      if (m?.t === "route") {
        if (!ready) onReady?.(handle);
        setReady(true);
      }
    },
    [handle, onReady, ready],
  );

  useFront(tab, ready && focused, handle);
  useInteractiveOnReady(ready);

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
    const workspace = getState().pendingWorkspace;
    setState({ pendingRoute: null, pendingWorkspace: null });
    // Its workspace rides along: the page opens that workspace when it is not the one on screen.
    handle.ask({ t: "navigate", route: pendingRoute, ...(workspace ? { workspace } : {}) });
  }, [ready, focused, pendingRoute, tab, handle]);

  // A signed-out address is the person gone: nothing of theirs stays in the shell, the icon wears no number, and a
  // call activity of theirs ends. The page itself has already forgotten the phone (shell.ts signOut).
  const canGoBack = useRef(false);
  const onNavigation = useCallback(
    (nav: WebViewNavigation) => {
      canGoBack.current = nav.canGoBack;
      if (!nav.loading) onLanded?.(nav.url);
      if (nav.loading || !isSignedOutUrl(nav.url) || getState().session === "out") return;
      setState(signedOut(getState()));
      void setBadge(0);
      void endCallActivities();
    },
    [onLanded],
  );

  // The page itself stays on the site; another site opens in the browser. Only http(s) reaches here: the library opens
  // tel:, mailto: and the rest itself. A frame inside the page (an embed, a payment form) loads where the page put it;
  // iOS asks about every frame, and Android says nothing of frames, so only an explicit sub-frame is let through.
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (req.isTopFrame === false || isOurs(req.url)) return true;
    void WebBrowser.openBrowserAsync(req.url);
    return false;
  }, []);

  useAndroidBack(ref, canGoBack, overlay, focused);

  // The page's paper, behind the WebView (the library's own is white) and in the strip under the status bar: the
  // shell pads the top itself, on both platforms, since the page's header draws to the top of its viewport.
  const paper = { backgroundColor: THEME_COLORS[theme] };
  if (!mounted) return <View style={[styles.fill, paper]} />;
  return (
    <AboveTheKeyboard style={[styles.fill, paper, { paddingTop: insets.top }]}>
      <WebView
        key={epoch}
        ref={ref}
        source={source}
        style={[styles.fill, paper]}
        applicationNameForUserAgent={userAgent}
        sharedCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={insetScript(inset, PLATFORM === "android")}
        onMessage={onMessage}
        onNavigationStateChange={onNavigation}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={openWindow}
        onContentProcessDidTerminate={() => ref.current?.reload()}
        onRenderProcessGone={() => setEpoch((n) => n + 1)}
        startInLoadingState
        renderLoading={() => <View style={[StyleSheet.absoluteFill, paper]} />}
        // A load that fails (no network, the site down) shows the app's own screen, with a retry, in place of the
        // library's white debug page. It used to be tracked in state from onError, which the library follows with
        // onLoadEnd for the same failure, so the flag was cleared the moment it was set.
        renderError={() => <Offline onRetry={handle.reload} />}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsInlineMediaPlayback
        hideKeyboardAccessoryView
        // iOS's "normal" as the number it means: Android's native prop is a Double, and the word crashed the app
        // the moment the first page mounted (the library converts it on iOS only).
        decelerationRate={0.998}
        webviewDebuggingEnabled={INSPECTABLE}
        // No textZoom: Android's WebView follows the phone's font size, which 100 took from anyone who reads larger.
      />
    </AboveTheKeyboard>
  );
}

/**
 * Android draws the app edge to edge, so the system shrinks nothing for the keyboard: the page kept its height, the
 * keyboard lay over it, and the browser panned the view to the field, taking the page's header and a thread's name off
 * the top. Here the page is shrunk to stand above the keys, as a browser tab's page is, and told so before it paints
 * (insetScript), so it makes no room of its own. iOS's WebView makes its own room, and is left as it is.
 */
function AboveTheKeyboard({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" enabled={PLATFORM === "android"} style={style}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * What a page's message does beyond the one page that heard it: the shell's state moves (bridge.ts), and the icon,
 * the call activity, the theme and the widget follow. Returns the message, parsed, for what is the page's own (its
 * route).
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
  if (m?.t === "file") void shareFile(m);
  return m;
}

/**
 * Android's Back, while its tab is in front: first it closes what stands over the page (a sheet, a dialog, a menu:
 * the page is asked, and closes it as Escape would), then it walks the page's own history, and at the history's start
 * it is the system's own Back (the last tab, then the app left). It used to answer "handled" whatever the page's
 * history held, so the app could not be left; and it left the page from under an open sheet, the app with it.
 */
function useAndroidBack(
  ref: RefObject<WebView | null>,
  canGoBack: RefObject<boolean>,
  overlay: RefObject<boolean>,
  focused: boolean,
): void {
  useEffect(() => {
    if (Platform.OS !== "android" || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (overlay.current) {
        ref.current?.injectJavaScript(askPage({ t: "close" }));
        return true;
      }
      if (!canGoBack.current) return false;
      ref.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [focused, ref, canGoBack, overlay]);
}

/**
 * The page drawn and answering for the first time is when this screen is interactive (EAS Observe's time to
 * interactive, per tab through the router integration); only the first mark in a session is counted app-wide.
 */
function useInteractiveOnReady(ready: boolean): void {
  const { markInteractive } = useObserve();
  useEffect(() => {
    if (ready) markInteractive();
  }, [ready, markInteractive]);
}

/**
 * What a new WebView loads: the sign-in page, the route on the workspace's address, or the native door's POST of an
 * identity token (the cookie it sets is the WebView's, and its 303 lands the page).
 */
function sourceOf(route: string, slug: string | null, post: string | undefined): WebViewSource {
  // iOS sends the form's type as told; Android's postUrl sends a form already, and warns of headers on every render.
  if (post)
    return {
      uri: NATIVE_DOOR,
      method: "POST",
      ...(Platform.OS === "ios" ? { headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
      body: post,
    };
  return { uri: route === "login" ? LOGIN_HREF : hrefFor(slug, route) };
}

/**
 * A link the page opens in a new window (`target="_blank"`: a booking page, a provider's console) opens in the
 * browser, never in the tab, where a second page would stand in the workspace's place. Android handed it to the
 * system past the rule above, and iOS opened one of the site's own inside the tab.
 */
function openWindow(e: WebViewOpenWindowEvent): void {
  const url = e.nativeEvent.targetUrl;
  if (/^https?:/.test(url)) void WebBrowser.openBrowserAsync(url);
}

/**
 * The page a tab press reaches (front.ts): this one, whenever its tab is in front and its page is ready, forgotten as
 * it unmounts. It was set only as the page reported a route, and a tab already open reports none on its return, so
 * the record went stale after the first switch and re-tap-to-top stopped working.
 */
function useFront(tab: Tab | undefined, inFront: boolean, handle: SurfaceHandle): void {
  useEffect(() => {
    if (tab && inFront) front.set(tab, handle);
  }, [tab, inFront, handle]);
  useEffect(() => {
    if (!tab) return;
    return () => front.forget(tab);
  }, [tab]);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
