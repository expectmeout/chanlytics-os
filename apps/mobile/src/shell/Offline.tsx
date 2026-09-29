import { Pressable, StyleSheet, Text, View } from "react-native";
import { THEME_COLORS, THEME_INK } from "@chanlytics/contracts/phone-app";

/**
 * A phone without a network sees this, not a blank page: Apple's 2.1 and a person's patience both ask for it.
 * Drawn over the pages, which stay mounted, so a connection returning is a retry away.
 */
export function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={styles.title}>No connection</Text>
      <Text style={styles.body}>
        Chanlytics needs the network to show your workspace. It will be here when you are back.
      </Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
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
  title: { fontSize: 22, fontWeight: "600", color: THEME_INK.dark, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: "#a7a8ab", textAlign: "center", marginBottom: 24 },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: THEME_INK.dark },
  pressed: { opacity: 0.7 },
  buttonText: { color: THEME_COLORS.dark, fontSize: 15, fontWeight: "600" },
});
