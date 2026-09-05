/**
 * Connect your WhatsApp number: the browser's half of Embedded Signup.
 *
 * Meta's SDK opens a window the business completes on Meta's own pages
 * (login, business, number). Two things come back to this page: a one-time
 * code through the login callback, and the ids of the WABA and phone number
 * through a message event from facebook.com. Both go to the app's own
 * route, which proves the owner and hands the exchange to the edge. Nothing
 * here holds a credential; the code is single-use and only the edge's
 * secret can turn it into a token.
 *
 * Published to the mockup as window.__waConnect = { config(), start() }.
 */
import { fetchEnvelope, scoped } from "./surface-data";

export interface SignupConfig {
  app_id: string | null;
  config_id: string | null;
  graph_version: string;
  ready: boolean;
  reason: string | null;
  canConnect: boolean;
}

export type ConnectResult =
  | { ok: true; number: string | null; verifiedName: string | null; qualityRating: string | null }
  | { ok: false; reason: "cancelled" | "not_ready" | "sdk" | "no_ids" | "failed"; message: string };

interface FB {
  init(opts: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }): void;
  login(cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, opts: Record<string, unknown>): void;
}

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const META_ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com"]);

/** Load Meta's SDK once; resolve with the global it defines. */
export function loadSdk(win: Window, appId: string, version: string): Promise<FB> {
  const w = win as unknown as { FB?: FB; fbAsyncInit?: () => void; document: Document; __fbReady?: Promise<FB> };
  if (w.FB) return Promise.resolve(w.FB);
  if (w.__fbReady) return w.__fbReady;
  w.__fbReady = new Promise<FB>((resolve, reject) => {
    w.fbAsyncInit = () => {
      try {
        w.FB!.init({ appId, version, xfbml: false, cookie: false });
        resolve(w.FB!);
      } catch (e) {
        reject(e);
      }
    };
    const s = w.document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("sdk_failed"));
    w.document.head.appendChild(s);
  });
  return w.__fbReady;
}

/** The ids Meta posts back when the sign-up window finishes. */
export function parseSignupMessage(origin: string, data: unknown): { phone_number_id: string; waba_id: string } | { cancelled: true } | null {
  if (!META_ORIGINS.has(origin)) return null;
  let obj: unknown = data;
  if (typeof data === "string") {
    try { obj = JSON.parse(data); } catch { return null; }
  }
  const m = obj as { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; current_step?: string } } | null;
  if (!m || m.type !== "WA_EMBEDDED_SIGNUP") return null;
  if (m.event === "FINISH" || m.event === "FINISH_ONLY_WABA") {
    const d = m.data ?? {};
    if (d.phone_number_id && d.waba_id) return { phone_number_id: String(d.phone_number_id), waba_id: String(d.waba_id) };
    return null;
  }
  if (m.event === "CANCEL") return { cancelled: true };
  return null;
}

export function installWhatsAppConnect(win: Window = window): void {
  const config = () => fetchEnvelope<SignupConfig>("/api/v1/channels/whatsapp/signup");

  const start = async (): Promise<ConnectResult> => {
    const cfg = await config().catch(() => null);
    if (!cfg || !cfg.ready || !cfg.app_id || !cfg.config_id) return { ok: false, reason: "not_ready", message: "Chanlytics is not set up to connect numbers yet." };
    let FBsdk: FB;
    try {
      FBsdk = await loadSdk(win, cfg.app_id, cfg.graph_version);
    } catch {
      return { ok: false, reason: "sdk", message: "Meta's sign-up window could not be loaded. Check that the browser allows facebook.com." };
    }
    // The ids arrive by message while the window is open; the code arrives
    // when it closes. Both are needed, in whichever order they come.
    let ids: { phone_number_id: string; waba_id: string } | null = null;
    let cancelled = false;
    const onMessage = (e: MessageEvent) => {
      const parsed = parseSignupMessage(e.origin, e.data);
      if (!parsed) return;
      if ("cancelled" in parsed) cancelled = true;
      else ids = parsed;
    };
    win.addEventListener("message", onMessage);
    const code = await new Promise<string | null>((resolve) => {
      FBsdk.login(
        (r) => resolve(r.authResponse?.code ?? null),
        { config_id: cfg.config_id, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } },
      );
    });
    // A late message can follow the callback by a tick.
    await new Promise((r) => win.setTimeout(r, 300));
    win.removeEventListener("message", onMessage);
    if (!code || cancelled) return { ok: false, reason: "cancelled", message: "The sign-up was closed before it finished. Nothing was connected." };
    if (!ids) return { ok: false, reason: "no_ids", message: "The sign-up finished without a number. Start it again and pick the number to connect." };
    const res = await win.fetch(scoped("/api/v1/channels/whatsapp/connect"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, ...(ids as { phone_number_id: string; waba_id: string }) }),
    });
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: { number_e164?: string | null; verified_name?: string | null; quality_rating?: string | null }; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, reason: "failed", message: j?.error?.message ?? `The connection did not complete (${res.status}).` };
    const refresh = (win as unknown as { __refreshSettings?: () => Promise<void> }).__refreshSettings;
    if (refresh) await refresh();
    return { ok: true, number: j.data?.number_e164 ?? null, verifiedName: j.data?.verified_name ?? null, qualityRating: j.data?.quality_rating ?? null };
  };

  (win as unknown as { __waConnect?: { config: typeof config; start: typeof start } }).__waConnect = { config, start };
}
