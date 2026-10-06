/**
 * Connect your WhatsApp number: the browser's half of Embedded Signup.
 *
 * Meta's SDK opens a window the business completes on Meta's own pages
 * (login, business, number). Two things come back to this page: a one-time
 * code through the login callback, and the ids of the WABA and phone number
 * through a message event from facebook.com. Both go to the app's own
 * route, which proves the owner and hands the exchange to the edge. Nothing
 * here holds a credential; the code is single-use and only the edge's
 * secret can turn it into a token. After the route answers, the refresh map
 * re-reads Settings, where the number now shows.
 *
 * Moved from legacy-bridge/whatsapp-connect.ts with Settings › Connections (decision 0015 step 11): the Connections
 * pane imports `waConnect` ({ config(), start() }).
 */
import type { LineCodeDto } from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";

type ConnectResult =
  | { ok: true; number: string | null; verifiedName: string | null; qualityRating: string | null }
  | { ok: false; reason: "cancelled" | "not_ready" | "sdk" | "no_ids" | "failed"; message: string };

interface FB {
  init(opts: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }): void;
  login(
    cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void,
    opts: Record<string, unknown>,
  ): void;
}

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const META_ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com"]);
/** How long a message from the popup may trail its callback and still be heard. */
const LATE_MESSAGE_MS = 300;

/**
 * The mark a sign-up leaves in this tab's sessionStorage while Meta's window is open: the instant it began. A reload takes with
 * it the listener Meta's window answers to and the SDK's login callback, so a sign-up Meta finishes after one never reaches
 * Chanlytics (6 October: the window was open at 12:07, the page was loaded again at 12:11, Meta finished at 12:48 and no connect
 * was ever asked; the one-time code rides the SDK's own callback, which a reloaded page cannot get back). The mark survives the
 * reload (sessionStorage is the tab's), so Connections can say what to do. Kept in try/catch as the house keeps storage: where
 * it is blocked the mark is a courtesy that is not made.
 */
const SIGNUP_MARK = "chanlytics.whatsapp.signup";

/** Whether this page is running a sign-up now: a mark with none running is one a page that is gone left behind. */
let signupRunning = false;

/**
 * When a sign-up was started on this tab by a page that is gone and never came back (an ISO instant), else null: no mark, storage
 * blocked, a render with no window, or a sign-up this page is itself running (it has not failed to come back, it is still open).
 */
export function signupLeftOpenAt(win?: Window): string | null {
  if (signupRunning) return null;
  try {
    return (win ?? window).sessionStorage.getItem(SIGNUP_MARK);
  } catch {
    return null;
  }
}

function markSignup(win: Window): void {
  try {
    win.sessionStorage.setItem(SIGNUP_MARK, new Date().toISOString());
  } catch {
    /* storage blocked: the mark is a courtesy, and the sign-up goes on without it */
  }
}

function clearSignupMark(win: Window): void {
  try {
    win.sessionStorage.removeItem(SIGNUP_MARK);
  } catch {
    /* storage blocked: there is no mark to take away */
  }
}

/** The window as Meta's SDK leaves it: its global, the hook it calls once loaded, and the load this page started. */
type SdkWindow = Window & { FB?: FB; fbAsyncInit?: () => void; __fbReady?: Promise<FB> };

/** Load Meta's SDK once; resolve with the global it defines. */
function loadSdk(win: Window, appId: string, version: string): Promise<FB> {
  const w = win as SdkWindow;
  if (w.FB) return Promise.resolve(w.FB);
  if (w.__fbReady) return w.__fbReady;
  w.__fbReady = new Promise<FB>((resolve, reject) => {
    w.fbAsyncInit = () => {
      const fb = w.FB;
      if (!fb) {
        reject(new Error("sdk_missing"));
        return;
      }
      try {
        fb.init({ appId, version, xfbml: false, cookie: false });
        resolve(fb);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
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
export function parseSignupMessage(
  origin: string,
  data: unknown,
): { phone_number_id: string; waba_id: string } | { cancelled: true } | null {
  if (!META_ORIGINS.has(origin)) return null;
  let obj: unknown = data;
  if (typeof data === "string") {
    try {
      obj = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const m = obj as {
    type?: string;
    event?: string;
    data?: { phone_number_id?: string; waba_id?: string; current_step?: string };
  } | null;
  if (!m || m.type !== "WA_EMBEDDED_SIGNUP") return null;
  if (m.event === "FINISH" || m.event === "FINISH_ONLY_WABA") {
    const d = m.data ?? {};
    if (d.phone_number_id && d.waba_id)
      return { phone_number_id: String(d.phone_number_id), waba_id: String(d.waba_id) };
    return null;
  }
  if (m.event === "CANCEL") return { cancelled: true };
  return null;
}

/** Meta's door, as the deployment has it: whether a number can be connected here, and by whom. */
const signupConfig = () => read("GET channels/whatsapp/signup");

/**
 * The sign-up, marked while it runs and unmarked however it ends (connected, cancelled, failed): a mark still there on the next
 * load is a sign-up the page that began it never finished (signupLeftOpenAt).
 */
async function startSignup(win: Window = window): Promise<ConnectResult> {
  signupRunning = true;
  markSignup(win);
  try {
    return await runSignup(win);
  } finally {
    signupRunning = false;
    clearSignupMark(win);
  }
}

/** The sign-up window, opened and followed to its end; the code and the ids go to the app's own route. */
async function runSignup(win: Window): Promise<ConnectResult> {
  const cfg = await signupConfig().catch(() => null);
  if (!cfg || !cfg.ready || !cfg.app_id || !cfg.config_id)
    return { ok: false, reason: "not_ready", message: "Chanlytics is not set up to connect numbers yet." };
  let FBsdk: FB;
  try {
    FBsdk = await loadSdk(win, cfg.app_id, cfg.graph_version);
  } catch {
    return {
      ok: false,
      reason: "sdk",
      message: "Meta's sign-up window could not be loaded. Check that the browser allows facebook.com.",
    };
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
    FBsdk.login((r) => resolve(r.authResponse?.code ?? null), {
      config_id: cfg.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    });
  });
  // A late message can follow the callback by a tick.
  await new Promise((r) => win.setTimeout(r, LATE_MESSAGE_MS));
  win.removeEventListener("message", onMessage);
  if (!code || cancelled)
    return {
      ok: false,
      reason: "cancelled",
      message: "The sign-up was closed before it finished. Nothing was connected.",
    };
  if (!ids)
    return {
      ok: false,
      reason: "no_ids",
      message: "The sign-up finished without a number. Start it again and pick the number to connect.",
    };
  const r = await api()("POST channels/whatsapp/connect", {
    body: { code, ...(ids as { phone_number_id: string; waba_id: string }) },
  });
  if (!r.ok) return { ok: false, reason: "failed", message: r.message };
  return {
    ok: true,
    number: r.data.number_e164 ?? null,
    verifiedName: r.data.verified_name ?? null,
    qualityRating: r.data.quality_rating ?? null,
  };
}

/** Connect your WhatsApp number: the door's answer, and the sign-up. */
export const waConnect = { config: signupConfig, start: () => startSignup() };

/** The codes sent to the line lately, newest first: the edge reads them from the provider's own record on every call. */
const readCodes = async (): Promise<LineCodeDto[]> => (await read("GET lines/codes")).codes;

/**
 * Ask Meta what it holds about the number now. The edge keeps the answer on the channel, and the refresh this write makes
 * re-reads Settings, where the row says it.
 */
const checkStanding = async (): Promise<boolean> => (await api()("POST channels/whatsapp/standing")).ok;

/** What the open Connections page asks beside the sign-up: the codes texted to the line, and the check of the number. */
export const lineCodes = { read: readCodes };
export const waStanding = { check: checkStanding };
