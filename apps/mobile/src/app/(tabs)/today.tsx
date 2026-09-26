/**
 * The Today tab: the page underneath for the bridge (session, badge, widget, the token), and the native Today over it
 * once it has something true to draw (PR 9). A read that fails leaves the page in front, so nothing is ever blank.
 */
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { Today } from "@/shell/Today";
import { front } from "@/shell/front";

export default function TodayTab() {
  const onReady = useCallback((h: SurfaceHandle) => front.set("today", h), []);
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.fill}>
      <Surface route="today" tab="today" onReady={onReady} />
      <View style={[StyleSheet.absoluteFill, !shown && styles.hidden]} pointerEvents={shown ? "auto" : "none"}>
        <Today onShown={setShown} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, hidden: { opacity: 0 } });
