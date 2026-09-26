import { StyleSheet, Text, View } from "react-native";

/** The site no longer speaks to this version of the app: said plainly, over everything, until the store's update. */
export function Update() {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={styles.title}>Update Chanlytics</Text>
      <Text style={styles.body}>
        This version of the app is older than the workspace can work with. Update it from the store to continue.
      </Text>
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
  title: { fontSize: 22, fontWeight: "600", color: "#fbfaf8", marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: "#a7a8ab", textAlign: "center" },
});
