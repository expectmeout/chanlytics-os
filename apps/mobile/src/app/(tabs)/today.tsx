/**
 * The Today tab: the page underneath for the bridge (session, badge, widget, the token), and the native Today over it
 * once it has something true to draw (PR 9). A read that fails leaves the page in front, so nothing is ever blank.
 * While the native screen is in front, the page under it is hidden from VoiceOver and TalkBack, and a press on the
 * tab brings the native screen to its top; every other ask (the token, a route) still goes to the page.
 */
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { Today } from "@/shell/Today";
import { front } from "@/shell/front";

export default function TodayTab() {
  const [shown, setShown] = useState(false);
  const shownNow = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const onShown = useCallback((s: boolean) => {
    shownNow.current = s;
    setShown(s);
  }, []);
  const onReady = useCallback(
    (h: SurfaceHandle) =>
      front.set("today", {
        ...h,
        ask: (m) => (m.t === "top" && shownNow.current ? scroll.current?.scrollTo({ y: 0, animated: true }) : h.ask(m)),
      }),
    [],
  );
  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={shown}
        importantForAccessibility={shown ? "no-hide-descendants" : "auto"}
      >
        <Surface route="today" tab="today" onReady={onReady} />
      </View>
      <View style={[StyleSheet.absoluteFill, !shown && styles.hidden]} pointerEvents={shown ? "auto" : "none"}>
        <Today onShown={onShown} scrollRef={scroll} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, hidden: { opacity: 0 } });
