import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { setLockChoice, unlock } from "./lock";

/** The lock screen: one prompt on arrival, a button to ask again, and the one place the lock is turned off. */
export function Lock({ onUnlocked }: { onUnlocked: () => void }) {
  const [tried, setTried] = useState(false);
  const ask = useCallback(async () => {
    const ok = await unlock();
    setTried(true);
    if (ok) onUnlocked();
  }, [onUnlocked]);
  useEffect(() => {
    // The first prompt, a tick after the screen is up: an effect may not set state itself.
    const t = setTimeout(() => void ask(), 0);
    return () => clearTimeout(t);
  }, [ask]);
  const turnOff = useCallback(async () => {
    if (await unlock()) {
      await setLockChoice(false);
      onUnlocked();
    }
  }, [onUnlocked]);
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={styles.title}>Locked</Text>
      <Pressable
        onPress={() => void ask()}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Unlock</Text>
      </Pressable>
      {tried && (
        <Pressable onPress={() => void turnOff()} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>Stop locking this app</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#0c0d0f",
  },
  title: { fontSize: 22, fontWeight: "600", color: "#fbfaf8", marginBottom: 24 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: "#fbfaf8" },
  pressed: { opacity: 0.7 },
  buttonText: { color: "#0c0d0f", fontSize: 15, fontWeight: "600" },
  link: { marginTop: 20, padding: 8 },
  linkText: { color: "#a7a8ab", fontSize: 14 },
});
