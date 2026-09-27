/**
 * The pure part of native sign-in and the lock (the PR 3 design). No native import, so the rules run under node.
 *
 * A native identity token becomes the WebView's cookie session by being POSTed to the site's door, /auth/native,
 * FROM the WebView: the cookie the door sets then lands in the WebView's own store, and the 303 lands the page.
 * The form here is that POST's body.
 */

export type NativeProvider = "apple" | "google";

export interface DoorHandoff {
  provider: NativeProvider;
  token: string;
  /** The raw nonce Apple's request was made with (its hash is in the token); Google needs none. */
  nonce?: string;
}

/** The door's form body: what /auth/native reads (native-sign-in.ts on the site). Lands on the site's home. */
export function doorForm(h: DoorHandoff): string {
  const p = new URLSearchParams();
  p.set("provider", h.provider);
  p.set("token", h.token);
  if (h.nonce) p.set("nonce", h.nonce);
  p.set("next", "/");
  return p.toString();
}

/** Google's client ids, from the build's environment; unset, there is no Google button. */
export interface GoogleIds {
  ios: string;
  web: string;
}
export function googleIds(env: { ios?: string | undefined; web?: string | undefined }): GoogleIds | null {
  const ios = (env.ios ?? "").trim();
  const web = (env.web ?? "").trim();
  return ios && web ? { ios, web } : null;
}

/** The URL scheme Google's iOS SDK answers on: the client id, reversed, as the config plugin wants it. */
export function reversedClientId(iosClientId: string): string | null {
  const m = /^([a-z0-9-]+)\.apps\.googleusercontent\.com$/i.exec(iosClientId.trim());
  return m ? `com.googleusercontent.apps.${m[1]}` : null;
}

/** How long the app may sit in the background before it locks again. */
export const LOCK_GRACE_MS = 2 * 60_000;

export interface LockInput {
  /** The person's choice, kept in the secure store; null before they have made one. */
  enabled: boolean | null;
  /** Whether the phone has a biometric enrolled (or a passcode, which the prompt falls back to). */
  canLock: boolean;
  /** When the app last went to the background, or null since launch. */
  backgroundedAt: number | null;
  now: number;
  /** Whether a launch is being judged (locked at once) or a return (locked after the grace). */
  launch: boolean;
}

/** Whether this phone locks the app at all: on where it can lock, until the person says otherwise. */
export function mayLock(i: Pick<LockInput, "enabled" | "canLock">): boolean {
  return i.canLock && (i.enabled ?? true);
}

/** Whether the lock stands in front of the pages now: at launch, or on a return after the grace. */
export function shouldLock(i: LockInput): boolean {
  if (!mayLock(i)) return false;
  if (i.launch) return true;
  if (i.backgroundedAt === null) return false;
  return i.now - i.backgroundedAt >= LOCK_GRACE_MS;
}
