/**
 * One page of the live site in the shell (the PRD, M2): a WebView at the workspace's hash route, created the first
 * time its tab is in front and kept afterwards. It names the shell in the User-Agent, sets the page's bottom inset
 * before paint, hears the page over the bridge, keeps foreign links out of the app, recovers when iOS kills the
 * content process, and reads "signed out" from the address so the shell can show the sign-in screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import * as Application from "expo-application";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { parsePageMessage, type ShellMessage } from "@chanlytics/contracts";
import { askPage, bottomInset, insetScript, onPageMessage } from "./bridge";
import { getState, registerReloader, setState, useShell } from "./state";
import { Offline } from "./Offline";
import { hrefFor, isOurs, isSignedOutUrl, LOGIN_HREF, userAgentToken } from "@/site";

const PLATFORM = Platform.OS === "ios" ? "ios" : "android";
const PAGE_DARK = "#0c0d0f";

export interface SurfaceHandle {
  ask(m: ShellMessage): void;
  reload(): void;
}

interface Props {
  /** The hash route this page shows; "login" is the sign-in page. */
  route: string;
  /** Called once the page reports its route, each time this tab comes to the front. */
  onReady?: (h: SurfaceHandle) => void;
}

export function Surface({ route, onReady }: Props) {
  const ref = useRef<WebView>(null);
  const focused = useIsFocused();
  // Created the first time this tab is in front, kept afterwards: a latch set during render, not in an effect.
  const [mounted, setMounted] = useState(focused);
  if (focused && !mounted) setMounted(true);
  const [failed, setFailed] = useState(false);
  const slug = useShell((s) => s.slug);
  const insets = useSafeAreaInsets();
  const userAgent = useMemo(() => userAgentToken(Application.nativeApplicationVersion ?? "0.0.0", PLATFORM), []);
  const inset = bottomInset(PLATFORM, insets.bottom);
  const uri = route === "login" ? LOGIN_HREF : hrefFor(slug, route);

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
      const { state } = onPageMessage(getState(), e.nativeEvent.data);
      setState(state);
      if (focused && parsePageMessage(e.nativeEvent.data)?.t === "route") onReady?.(handle);
    },
    [focused, handle, onReady],
  );

  const onNavigation = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading && isSignedOutUrl(nav.url)) setState({ session: "out", slug: null, needs: 0 });
  }, []);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (isOurs(req.url) || req.url.startsWith("about:")) return true;
    if (/^(https?:)/.test(req.url)) void WebBrowser.openBrowserAsync(req.url);
    else if (/^(tel|mailto|sms):/.test(req.url)) void Linking.openURL(req.url);
    return false;
  }, []);

  // Android's hardware back walks the page's own history first.
  useEffect(() => {
    if (Platform.OS !== "android" || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      ref.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [focused]);

  if (!mounted) return <View style={styles.fill} />;
  return (
    <View style={styles.fill}>
      <WebView
        ref={ref}
        source={{ uri }}
        style={styles.fill}
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
        renderLoading={() => <View style={[styles.fill, styles.paper]} />}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsInlineMediaPlayback
        hideKeyboardAccessoryView
        decelerationRate="normal"
        textZoom={100}
      />
      {failed && <Offline onRetry={handle.reload} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  paper: { backgroundColor: PAGE_DARK },
});
