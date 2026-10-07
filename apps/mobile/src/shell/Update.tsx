import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Application from "expo-application";
import { THEME_COLORS, THEME_INK } from "@chanlytics/contracts/phone-app";

/**
 * The site no longer speaks to this version of the app: said plainly, over everything, with the way to the update.
 * Android opens the app's page in Google Play; iOS names the App Store until the app has an App Store id to open.
 */
export function Update() {
  const pkg = Application.applicationId;
  const openPlay = () => {
    if (!pkg) return;
    void Linking.openURL(`market://details?id=${pkg}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`),
    );
  };
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={styles.title}>Update Chanlytics</Text>
      <Text style={styles.body}>
        This version of the app is older than the workspace can work with. Update it from the{" "}
        {Platform.OS === "android" ? "Play Store" : "App Store"} to continue.
      </Text>
      {Platform.OS === "android" && pkg && (
        <Pressable
          onPress={openPlay}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Open Google Play</Text>
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
  title: { fontSize: 22, fontWeight: "600", color: THEME_INK.dark, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: "#a7a8ab", textAlign: "center" },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: THEME_INK.dark,
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: THEME_COLORS.dark, fontSize: 15, fontWeight: "600" },
});
