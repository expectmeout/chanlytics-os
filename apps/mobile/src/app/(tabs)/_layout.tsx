/**
 * Five native tabs over the live site (the PRD, M2): the system's own bar, Liquid Glass on iOS 26, Material on
 * Android. Today, Inbox with the needs-you badge, Calendar, People, More. A tab pressed while already in front asks
 * its page for the top; More asks for the drawer. `unstable-native-tabs` is SDK 57's path; SDK 58 names it
 * `expo-router/native-tabs` and nothing else changes. The bar's ink is the page's, per theme (contracts THEME_INK),
 * on both platforms: it was fixed to the light theme's on Android, near-black labels on a dark bar.
 */
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { ComponentProps } from "react";
import { useColorScheme } from "react-native";
import { THEME_INK } from "@chanlytics/contracts";
import { useShell, type Tab } from "@/shell/state";
import { front } from "@/shell/front";

type IconProps = ComponentProps<typeof NativeTabs.Trigger.Icon>;
const TABS: { name: Tab; label: string; icon: IconProps }[] = [
  { name: "today", label: "Today", icon: { sf: "house", md: "home" } },
  { name: "inbox", label: "Inbox", icon: { sf: "tray", md: "inbox" } },
  { name: "calendar", label: "Calendar", icon: { sf: "calendar", md: "calendar_month" } },
  { name: "people", label: "People", icon: { sf: "person.2", md: "group" } },
  { name: "more", label: "More", icon: { sf: "ellipsis", md: "more_horiz" } },
];

export default function TabsLayout() {
  const needs = useShell((s) => s.needs);
  const ink = THEME_INK[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    // Every tab says its name, on Android as on iOS: Material's own default for five tabs names only the one in front,
    // which left four bare icons on a phone (the walk of 28 September).
    <NativeTabs tintColor={ink} labelStyle={{ color: ink }} labelVisibilityMode="labeled">
      {TABS.map((t) => (
        <NativeTabs.Trigger
          key={t.name}
          name={t.name}
          disableScrollToTop
          listeners={{
            tabPress: () => {
              // Pressed while in front: the page's top (or, for More, the drawer again). Else the tab just comes.
              if (front.tab === t.name) front.ask(t.name === "more" ? { t: "menu" } : { t: "top" });
            },
          }}
        >
          <NativeTabs.Trigger.Icon {...t.icon} />
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          {t.name === "inbox" && needs > 0 && <NativeTabs.Trigger.Badge>{String(needs)}</NativeTabs.Trigger.Badge>}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
