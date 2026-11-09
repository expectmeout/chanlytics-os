/**
 * This browser told, or not (D12 of the answers canvas). The public key is the deployment's, and with none the choice is not
 * offered at all, so nothing is shown that cannot be kept. On an iPhone a browser can only be told once the app is on the home
 * screen, which `reason` says. Nothing here prompts by itself: a person's press asks.
 */
import { apiFor } from "./api";

/** Whether this browser can be told, and why not. */
export function webPushCan(win: Window): { can: boolean; reason: "no_key" | "no_support" | "home_screen" | null } {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { can: false, reason: "no_key" };
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const iPhone = /iPhone|iPad/.test(nav.userAgent);
  const installed = nav.standalone === true || win.matchMedia?.("(display-mode: standalone)").matches;
  if (iPhone && !installed) return { can: false, reason: "home_screen" };
  if (!("serviceWorker" in nav) || !("PushManager" in win)) return { can: false, reason: "no_support" };
  return { can: true, reason: null };
}

const keyBytes = (base64: string): Uint8Array<ArrayBuffer> => {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Whether this browser is being told now. */
export async function webPushOn(win: Window): Promise<boolean> {
  if (!("serviceWorker" in win.navigator)) return false;
  const reg = await win.navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Say yes in this browser: its own permission prompt, then its subscription kept. */
export async function webPushTurnOn(win: Window): Promise<{ ok: boolean; message: string }> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, message: "Browser alerts are not available yet." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    return { ok: false, message: "This browser said no. You can allow it in its site settings." };
  const reg = await win.navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const json = sub.toJSON();
  const r = await apiFor(win)("POST me/web-push", { body: { endpoint: json.endpoint, keys: json.keys } as never });
  return r.ok ? { ok: true, message: "" } : { ok: false, message: r.message };
}

/** Say no in this browser. */
export async function webPushTurnOff(win: Window): Promise<{ ok: boolean; message: string }> {
  const reg = await win.navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFor(win)("DELETE me/web-push", { body: { endpoint: sub.endpoint } as never });
    await sub.unsubscribe();
  }
  return { ok: true, message: "" };
}
