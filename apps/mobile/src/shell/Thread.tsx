/**
 * One thread, drawn natively (the PRD, PR 8): the first screen of the app that is not a WebView. Every sentence
 * comes from contracts nativeThreadVM over GET conversations/:id, the same view model the web's Conversations page
 * draws; a reply goes through POST conversations/:id/reply, the one door the web's composer uses, and a refusal is
 * shown in the site's own words. Older messages page back on the oldest one's own instant.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import {
  nativeThreadVM,
  type ConversationDto,
  type ConversationMessageVM,
  type MessageDto,
  type NativeThreadVM,
} from "@chanlytics/contracts";
import { api, ApiRefusal } from "./api";

type Answer = { conversation: Omit<ConversationDto, "messages">; messages: MessageDto[] };

const TEAL = "#3cb79e";
const TONES = {
  light: { paper: "#fbfaf8", ink: "#161616", muted: "#6b6c70", agent: "#eceae6", client: "#ffffff", line: "#e2e0db" },
  dark: { paper: "#0c0d0f", ink: "#fbfaf8", muted: "#a7a8ab", agent: "#1c1e22", client: "#15171a", line: "#26282c" },
};

/** The phone's own zone: the workspace's is the page's, and the thread's times are read on this phone. */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function Thread({ id }: { id: string }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const t = TONES[scheme];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [dto, setDto] = useState<ConversationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [paging, setPaging] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const list = useRef<FlatList<ConversationMessageVM>>(null);

  const load = useCallback(async () => {
    try {
      const a = await api<Answer>(`conversations/${id}`);
      setDto({ ...a.conversation, messages: a.messages });
      setMore(a.messages.length >= 100);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [id]);
  useEffect(() => {
    // After the render, not in it: the read's first setState is what the compiler's rule is about.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const vm: NativeThreadVM | null = useMemo(() => (dto ? nativeThreadVM(dto, TZ, new Date()) : null), [dto]);
  useEffect(() => {
    if (vm) navigation.setOptions({ title: vm.title });
  }, [navigation, vm]);

  const older = useCallback(async () => {
    if (!dto || !more || paging || !vm?.oldestAt) return;
    setPaging(true);
    try {
      const a = await api<Answer>(`conversations/${id}`, { query: { before: vm.oldestAt } });
      setDto((d) => (d ? { ...d, messages: [...a.messages, ...d.messages] } : d));
      setMore(a.messages.length >= 100);
    } catch {
      setMore(false);
    } finally {
      setPaging(false);
    }
  }, [dto, more, paging, vm, id]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const key = Crypto.randomUUID();
    setSending(key);
    setRefusal(null);
    try {
      await api(`conversations/${id}/reply`, { method: "POST", body: { text }, idempotencyKey: key });
      setDraft("");
      await load();
    } catch (e) {
      setRefusal(e instanceof ApiRefusal ? e.message : "Could not send just now.");
    } finally {
      setSending(null);
    }
  }, [draft, sending, id, load]);

  // Newest at the bottom: the list is inverted, so its data is newest first.
  const rows = useMemo(() => (vm ? [...vm.bubbles].reverse() : []), [vm]);

  if (error && !vm) {
    return (
      <View style={[styles.center, { backgroundColor: t.paper }]}>
        <Text style={[styles.words, { color: t.muted }]}>{error}</Text>
        <Pressable onPress={() => void load()} style={styles.retry} accessibilityRole="button">
          <Text style={{ color: TEAL, fontWeight: "600" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!vm) {
    return (
      <View style={[styles.center, { backgroundColor: t.paper }]}>
        <ActivityIndicator color={TEAL} />
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: t.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <Text style={[styles.subtitle, { color: t.muted }]} numberOfLines={1}>
        {vm.subtitle}
      </Text>
      <FlatList
        ref={list}
        data={rows}
        inverted
        keyExtractor={(_, i) => String(rows.length - i)}
        renderItem={({ item }) => <Bubble m={item} tone={t} />}
        contentContainerStyle={styles.list}
        onEndReached={() => void older()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={paging ? <ActivityIndicator color={TEAL} style={{ marginVertical: 12 }} /> : null}
        keyboardDismissMode="interactive"
      />
      <View style={[styles.composer, { borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {refusal ? <Text style={[styles.refusal]}>{refusal}</Text> : null}
        {vm.composer.kind === "closed" ? (
          <Text style={[styles.words, { color: t.muted }]}>{vm.composer.words}</Text>
        ) : (
          <View style={styles.row}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={vm.composer.placeholder}
              placeholderTextColor={t.muted}
              multiline
              style={[styles.input, { color: t.ink, backgroundColor: t.client, borderColor: t.line }]}
              accessibilityLabel="Your reply"
            />
            <Pressable
              onPress={() => void send()}
              disabled={!draft.trim() || !!sending}
              style={[styles.send, (!draft.trim() || !!sending) && styles.sendOff]}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendWords}>Send</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, tone }: { m: ConversationMessageVM; tone: (typeof TONES)["light"] }) {
  const client = m.from === "client";
  const faded = m.reachedCustomer === false;
  const under = [m.by ? `by ${m.by}` : null, m.statusLabel ?? null].filter(Boolean).join(" · ");
  return (
    <View style={[styles.bubbleRow, client ? styles.left : styles.right]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: client ? tone.client : tone.agent, borderColor: tone.line },
          faded && styles.faded,
        ]}
      >
        <Text style={[styles.meta, { color: tone.muted }]}>{m.at}</Text>
        {m.media ? <Text style={[styles.attachment, { color: tone.muted }]}>{mediaWords(m)}</Text> : null}
        {m.text ? <Text style={[styles.body, { color: tone.ink }]}>{m.text}</Text> : null}
        {!client && under ? <Text style={[styles.meta, { color: tone.muted, marginTop: 4 }]}>{under}</Text> : null}
      </View>
    </View>
  );
}

function mediaWords(m: ConversationMessageVM): string {
  const k = m.media?.kind ?? "other";
  const label = { image: "Photo", audio: "Voice note", video: "Video", document: "Document", other: "Attachment" }[k];
  return `${label}${m.media?.filename ? ` · ${m.media.filename}` : ""} (open on the web)`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  words: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: { marginTop: 12, padding: 8 },
  subtitle: { fontSize: 12, textAlign: "center", paddingVertical: 6 },
  list: { paddingHorizontal: 12, paddingVertical: 8 },
  bubbleRow: { flexDirection: "row", marginVertical: 3 },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  faded: { opacity: 0.55, borderStyle: "dashed" },
  meta: { fontSize: 11 },
  attachment: { fontSize: 13, fontStyle: "italic", marginTop: 2 },
  body: { fontSize: 15, lineHeight: 21, marginTop: 2 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8 },
  refusal: { color: "#d9534f", fontSize: 13, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  send: {
    backgroundColor: TEAL,
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.5 },
  sendWords: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
