/**
 * The Inbox tab is a stack: the page (the list, a WebView) at its root and, over it, the thread drawn natively (the
 * PRD, PR 8). The page says when a thread is opened (`{t:"route", route:"inbox/<id>"}`); the Surface pushes it here.
 */
import { Stack } from "expo-router";
import { Platform, useColorScheme } from "react-native";
import { THEME_COLORS, THEME_INK } from "@chanlytics/contracts";

export default function InboxLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: THEME_COLORS[scheme] },
        headerStyle: { backgroundColor: THEME_COLORS[scheme] },
        headerTintColor: THEME_INK[scheme],
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        ...(Platform.OS === "ios" ? { headerLargeTitle: false } : {}),
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ headerShown: true, title: "" }} />
    </Stack>
  );
}
