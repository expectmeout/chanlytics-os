/**
 * Native sign-in (the PR 3 design): Apple's own sheet and Google's, each yielding an identity token the site's door
 * turns into the cookie session. Apple asks for the request's nonce hashed and answers with the hash in the token;
 * the door gets the raw one (Supabase compares). A cancel is null, never an error.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Platform } from "react-native";
import { googleIds, type DoorHandoff, type GoogleIds } from "./sign-in";

export const GOOGLE: GoogleIds | null = googleIds({
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

let googleReady = false;
function google(): typeof GoogleSignin | null {
  if (!GOOGLE) return null;
  if (!googleReady) {
    GoogleSignin.configure({ iosClientId: GOOGLE.ios, webClientId: GOOGLE.web });
    googleReady = true;
  }
  return GoogleSignin;
}

export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<DoorHandoff | null> {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
    return c.identityToken ? { provider: "apple", token: c.identityToken, nonce } : null;
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}

export async function signInWithGoogle(): Promise<DoorHandoff | null> {
  const g = google();
  if (!g) return null;
  if (Platform.OS === "android") await g.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const r = await g.signIn();
  if (r.type !== "success" || !r.data.idToken) return null;
  return { provider: "google", token: r.data.idToken };
}

/** The native side of a sign-out: Google's SDK forgets the account it chose, so the next sheet asks again. */
export async function signOutNatively(): Promise<void> {
  try {
    await google()?.signOut();
  } catch {
    /* nothing to forget */
  }
}
