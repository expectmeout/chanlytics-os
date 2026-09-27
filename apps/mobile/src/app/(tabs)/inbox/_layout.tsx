/**
 * The Inbox tab is a stack: the page (the list, a WebView) at its root and, over it, the thread drawn natively (the
 * PRD, PR 8). The page says when a thread is opened (`{t:"route", route:"inbox/<id>"}`); the Surface pushes it here.
 */
import { Stack } from "expo-router";
import { Platform, useColorScheme } from "react-native";

const PAPER = { light: "#fbfaf8", dark: "#0c0d0f" };
const INK = { light: "#161616", dark: "#fbfaf8" };

export default function InboxLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: PAPER[scheme] },
        headerStyle: { backgroundColor: PAPER[scheme] },
        headerTintColor: INK[scheme],
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
