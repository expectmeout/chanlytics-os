import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { THEME_COLORS, THEME_INK } from "@chanlytics/contracts";
import { canLock, lockChoice, setLockChoice, unlock } from "./lock";
import { mayLock, shouldLock } from "./sign-in";

/**
 * The lock in front of the pages (the rule in sign-in.ts): judged at launch, and on every return after the grace.
 * Until the launch is judged, and whenever the app leaves the screen on a phone that locks it, a plain cover stands in
 * front, so the pages never show first, in the app switcher's snapshot, or to a screen reader behind the lock. The
 * lock started closed only once its check came back, so the pages showed until then.
 */
export function useLockGate(): { locked: boolean; covered: boolean; unlocked: () => void } {
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(true);
  const info = useRef<{ can: boolean; choice: boolean | null; backgroundedAt: number | null }>({
    can: false,
    choice: null,
    backgroundedAt: null,
  });
  useEffect(() => {
    let alive = true;
    void Promise.all([canLock(), lockChoice()]).then(
      ([can, choice]) => {
        if (!alive) return;
        info.current = { ...info.current, can, choice };
        if (shouldLock({ enabled: choice, canLock: can, backgroundedAt: null, now: Date.now(), launch: true }))
          setLocked(true);
        setCovered(false);
      },
      () => alive && setCovered(false),
    );
    const sub = AppState.addEventListener("change", (s) => {
      const i = info.current;
      if (s !== "active") {
        if (s === "background") i.backgroundedAt = Date.now();
        if (mayLock({ enabled: i.choice, canLock: i.can })) setCovered(true);
        return;
      }
      void lockChoice().then((choice) => {
        i.choice = choice;
        const now = Date.now();
        if (shouldLock({ enabled: choice, canLock: i.can, backgroundedAt: i.backgroundedAt, now, launch: false }))
          setLocked(true);
        setCovered(false);
      });
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const unlocked = useCallback(() => setLocked(false), []);
  return { locked, covered, unlocked };
}

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
    <View style={styles.wrap} accessibilityRole="alert" accessibilityViewIsModal>
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
    backgroundColor: THEME_COLORS.dark,
  },
  title: { fontSize: 22, fontWeight: "600", color: THEME_INK.dark, marginBottom: 24 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: THEME_INK.dark },
  pressed: { opacity: 0.7 },
  buttonText: { color: THEME_COLORS.dark, fontSize: 15, fontWeight: "600" },
  link: { marginTop: 20, padding: 8 },
  linkText: { color: "#a7a8ab", fontSize: 14 },
});
