/**
 * Today, drawn natively (the PRD, PR 9): the second native screen, over the page's own Today, which stays mounted
 * underneath for the bridge (the session, the badge, the widget). Every sentence is contracts toTodayVM's, composed
 * once by GET /api/v1/today over the reader Ask uses, so the page, Ask and this screen never disagree. A row's door
 * is the page's route, opened in the tab it belongs to; the phone's Inbox draws a thread natively (PR 8).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TodayVM } from "@chanlytics/contracts";
import { api } from "./api";
import { setState, useShell } from "./state";
import { tabOf } from "./notifications";
import { CALLS_UNREAD, sinceWords } from "./today-pure";

const TEAL = "#3cb79e";
const TONES = {
  light: { paper: "#fbfaf8", ink: "#161616", muted: "#6b6c70", card: "#ffffff", line: "#e2e0db", warn: "#b4541c" },
  dark: { paper: "#0c0d0f", ink: "#fbfaf8", muted: "#a7a8ab", card: "#15171a", line: "#26282c", warn: "#e8955c" },
};
type Tone = (typeof TONES)["light"];

/**
 * Whether the native screen has something true to draw; a failed first read leaves the page in front. The day is
 * kept with the workspace it was read for: after a switch, the page stands until the new workspace's day arrives.
 */
export function Today({
  onShown,
  scrollRef,
}: {
  onShown?: (shown: boolean) => void;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const t = TONES[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const slug = useShell((s) => s.slug);
  const session = useShell((s) => s.session);
  const tick = useShell((s) => s.todayTick);
  const [day, setDay] = useState<{ slug: string; vm: TodayVM } | null>(null);
  const [busy, setBusy] = useState(false);
  const vm = day && day.slug === slug ? day.vm : null;
  const current = useRef(slug);
  useEffect(() => {
    current.current = slug;
  }, [slug]);

  const load = useCallback(async () => {
    if (!slug || session !== "in") return;
    setBusy(true);
    try {
      const a = await api<{ today: TodayVM }>("today", { query: { workspace: slug } });
      // An answer for a workspace the shell has since left is not drawn.
      if (current.current === slug) setDay({ slug, vm: a.today });
    } catch {
      /* the page underneath stands; the next refresh reads again */
    } finally {
      setBusy(false);
    }
  }, [slug, session]);

  // After the render, on every page refresh of Today, and whenever the tab comes back in front.
  useEffect(() => {
    if (!focused) return;
    const h = setTimeout(() => void load(), 0);
    return () => clearTimeout(h);
  }, [focused, tick, load]);
  useEffect(() => onShown?.(!!vm), [vm, onShown]);

  const open = useCallback(
    (route: string) => {
      setState({ pendingRoute: route, activeTab: tabOf(route) });
      router.navigate(`/(tabs)/${tabOf(route)}` as never);
    },
    [router],
  );

  if (!vm) return null;
  const q = vm.queue;
  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.fill, { backgroundColor: t.paper }]}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} tintColor={TEAL} />}
      testID="native-today"
    >
      <Text style={[styles.eyebrow, { color: t.muted }]}>{vm.standing.eyebrow}</Text>
      <Text style={[styles.headline, { color: vm.standing.tone === "alert" ? t.warn : t.ink }]}>
        {vm.standing.headline}
      </Text>
      {vm.standing.detail ? <Text style={[styles.detail, { color: t.muted }]}>{vm.standing.detail}</Text> : null}
      <Text style={[styles.lines, { color: vm.standing.lines.down ? t.warn : t.muted }]}>{vm.standing.lines.text}</Text>
      {vm.standing.alert ? <Text style={[styles.alert, { color: t.warn }]}>{vm.standing.alert}</Text> : null}

      <Section
        title={q.rows.length ? `Needs you${q.waiting ? ` · ${q.waiting} waiting` : ""}` : q.empty.title}
        tone={t}
      >
        {q.rows.length === 0 ? <Text style={[styles.muted, { color: t.muted }]}>{q.empty.sub}</Text> : null}
        {q.rows.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => open(r.cta.to)}
            style={[styles.row, { backgroundColor: t.card, borderColor: t.line }]}
            accessibilityRole="button"
          >
            <View style={styles.rowTop}>
              <Text style={[styles.who, { color: t.ink }]}>{r.who}</Text>
              <Text style={[styles.when, { color: r.warn ? t.warn : t.muted }]}>{r.when}</Text>
            </View>
            <Text style={[styles.sentence, { color: t.ink }, r.quoted && styles.quoted]}>{r.sentence}</Text>
            <Text style={[styles.meta, { color: t.muted }]}>{[r.channel, ...r.status].join(" · ")}</Text>
            <Text style={[styles.cta, { color: TEAL }]}>{r.cta.label}</Text>
          </Pressable>
        ))}
        {q.more > 0 ? (
          <Pressable onPress={() => open("inbox")} accessibilityRole="button">
            <Text style={[styles.cta, { color: TEAL }]}>{`${q.more} more in the Inbox`}</Text>
          </Pressable>
        ) : null}
      </Section>

      <Section title={vm.recap ? vm.recap.label : "Today so far"} tone={t}>
        {vm.figures ? (
          <View style={styles.figures}>
            {vm.figures.map((f) => (
              <View key={f.id} style={[styles.figure, { backgroundColor: t.card, borderColor: t.line }]}>
                <Text style={[styles.value, { color: t.ink }]}>{String(f.value)}</Text>
                <Text style={[styles.label, { color: t.muted }]}>{f.label}</Text>
                {f.meta ? <Text style={[styles.metaSmall, { color: t.muted }]}>{f.meta}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.muted, { color: t.muted }]}>
            {`${vm.quiet ? vm.quiet.headline : vm.recap ? vm.recap.line : "Nothing has come in yet today."} ${vm.proof}`}
          </Text>
        )}
        {(vm.recap?.sentences ?? [])
          .filter((s) => !s.traffic)
          .map((s, i) => (
            <Pressable key={i} disabled={!s.to} onPress={() => s.to && open(s.to)}>
              <Text style={[styles.sentence, { color: s.warn ? t.warn : t.ink }]}>{s.text}</Text>
            </Pressable>
          ))}
        {(vm.recap?.receipts ?? []).map((r, i) => (
          <Pressable key={`r${i}`} onPress={() => open(r.to)}>
            <Text style={[styles.meta, { color: t.muted }]}>{`${r.at} · ${r.text}`}</Text>
          </Pressable>
        ))}
        {vm.callsRead === false ? <Text style={[styles.meta, { color: t.warn }]}>{CALLS_UNREAD}</Text> : null}
      </Section>

      {vm.noReply.length ? (
        <Section title="Worth a look" tone={t}>
          {vm.noReply.map((n) => (
            <Pressable key={n.conversationId} onPress={() => open(n.to)} accessibilityRole="button">
              <Text
                style={[styles.sentence, { color: t.ink }]}
              >{`${n.who} has had nothing back for ${sinceWords(n.sinceMs)}.`}</Text>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {vm.calls ? (
        <Section title={vm.calls.line} tone={t}>
          {vm.calls.rows.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => open(c.to)}
              style={[styles.row, { backgroundColor: t.card, borderColor: t.line }]}
              accessibilityRole="button"
            >
              <View style={styles.rowTop}>
                <Text style={[styles.who, { color: t.ink }]}>{c.who}</Text>
                <Text style={[styles.when, { color: t.muted }]}>{[c.at, c.duration].filter(Boolean).join(" · ")}</Text>
              </View>
              {c.note ? <Text style={[styles.meta, { color: t.muted }]}>{c.note}</Text> : null}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {vm.quiet?.launchpad ? (
        <Pressable
          onPress={() => open(vm.quiet!.launchpad!.to)}
          style={[styles.launch, { borderColor: TEAL }]}
          accessibilityRole="button"
        >
          <Text style={[styles.cta, { color: TEAL }]}>{vm.quiet.launchpad.label}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, tone, children }: { title: string; tone: Tone; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: tone.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 6 },
  eyebrow: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  headline: { fontSize: 26, fontWeight: "700", lineHeight: 32 },
  detail: { fontSize: 15, lineHeight: 21 },
  lines: { fontSize: 13 },
  alert: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  section: { marginTop: 18, gap: 8 },
  title: { fontSize: 17, fontWeight: "600" },
  muted: { fontSize: 14, lineHeight: 20 },
  row: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  who: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  when: { fontSize: 12 },
  sentence: { fontSize: 15, lineHeight: 21 },
  quoted: { fontStyle: "italic" },
  meta: { fontSize: 12, lineHeight: 17 },
  metaSmall: { fontSize: 11, marginTop: 2 },
  cta: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  figure: { flexBasis: "47%", flexGrow: 1, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  value: { fontSize: 24, fontWeight: "700" },
  label: { fontSize: 12, marginTop: 2 },
  launch: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: "center" },
});
