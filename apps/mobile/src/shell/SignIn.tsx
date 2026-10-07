/**
 * The native sign-in screen (the PR 3 design): Apple's button where Apple is, Google's where its ids are, and the
 * email door, which is the web's own login page in a Surface. Apple 4.8: a third-party login offered in the app means
 * Apple's own beside it, same screen, same weight. A native token is handed to the site's door by a POST from the
 * WebView, so the cookie lands where the pages read it.
 */
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Surface } from "./Surface";
import { doorForm, type DoorHandoff } from "./sign-in";
import { appleAvailable, GOOGLE, signInWithApple, signInWithGoogle } from "./native-auth";
import { isNativeDoorFailedUrl } from "@/site";
import { THEME_COLORS, THEME_INK } from "@chanlytics/contracts/phone-app";
import { setState } from "./state";

// The sign-in stands in the web's default theme: no page has said the member's yet.
const PAPER = THEME_COLORS.dark;
const INK = THEME_INK.dark;
const MUTED = "#a7a8ab";

export function SignIn() {
  const [apple, setApple] = useState(false);
  const [email, setEmail] = useState(false);
  const [handoff, setHandoff] = useState<DoorHandoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void appleAvailable().then(setApple);
  }, []);
  // The chooser is the one screen an update may restart the app on (state.ts idle); the web door and the handoff
  // are not, since a person may be typing there.
  useEffect(() => {
    setState({ idle: !email && !handoff });
    return () => setState({ idle: false });
  }, [email, handoff]);

  const backIfRefused = useCallback((url: string) => {
    if (!isNativeDoorFailedUrl(url)) return;
    setHandoff(null);
    setError("That sign-in didn't finish. Try again, or use your email.");
  }, []);

  const run = useCallback(async (go: () => Promise<DoorHandoff | null>, failed: string) => {
    setBusy(true);
    setError(null);
    try {
      const h = await go();
      if (h) setHandoff(h);
    } catch {
      setError(failed);
    } finally {
      setBusy(false);
    }
  }, []);

  // A door that refused the token lands on the login page: back to the chooser, saying so, rather than a web page
  // with no way back to the native buttons.
  if (handoff) return <Surface route="login" post={doorForm(handoff)} onLanded={backIfRefused} />;
  if (email) return <Surface route="login" />;

  const nativeDoors = apple || !!GOOGLE;
  return (
    <View style={styles.wrap}>
      {/* The three, Chanlytics' mark, on the paper: the app icon's own art is the store's, square and opaque. */}
      <Image source={require("../../assets/images/mark.png")} style={styles.mark} accessibilityIgnoresInvertColors />
      <Text style={styles.title}>Sign in to your workspace.</Text>
      {apple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={999}
          style={styles.apple}
          onPress={() => {
            if (!busy) void run(signInWithApple, "Apple sign-in didn't complete. Try again, or use your email.");
          }}
        />
      )}
      {GOOGLE && (
        <Pressable
          disabled={busy}
          onPress={() => void run(signInWithGoogle, "Google sign-in didn't complete. Try again, or use your email.")}
          style={({ pressed }) => [styles.button, styles.google, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </Pressable>
      )}
      <Pressable
        disabled={busy}
        onPress={() => setEmail(true)}
        style={({ pressed }) => [styles.button, nativeDoors ? styles.quiet : styles.google, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, nativeDoors && styles.quietText]}>
          {nativeDoors ? "Use your email instead" : "Sign in with your email"}
        </Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: PAPER, gap: 12 },
  mark: { width: 72, height: 72, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "600", color: INK, marginBottom: 16, textAlign: "center" },
  apple: { width: 280, height: 48 },
  button: { width: 280, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  google: { backgroundColor: INK },
  quiet: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3a3b3e" },
  pressed: { opacity: 0.7 },
  buttonText: { color: PAPER, fontSize: 16, fontWeight: "600" },
  quietText: { color: INK },
  error: { color: MUTED, fontSize: 14, textAlign: "center", marginTop: 8 },
});
