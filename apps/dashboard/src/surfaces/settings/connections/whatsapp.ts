/**
 * Connect your WhatsApp number: the browser's half of Embedded Signup.
 *
 * Meta's SDK opens a window the business completes on Meta's own pages
 * (login, business, number). Two things come back to this page: a one-time
 * code through the login callback, and the ids of the WABA and phone number
 * through a message event from facebook.com. The code goes to the app's own
 * route with whichever ids were heard; the route proves the owner and hands
 * the exchange to the edge, which reads an id the page did not hear from the
 * token's own grant. Nothing here holds a credential; the code is single-use
 * and only the edge's secret can turn it into a token. After the route
 * answers, the refresh map re-reads Settings, where the number now shows.
 *
 * A browser gives a page a window only inside a press, and a phone's holds to it: a press that first waits on the network
 * gets none, and Meta's SDK says nothing when that happens. So Connections fetches Meta's SDK as it opens (`prepare`), the
 * press asks for the window before it waits on anything, and a window the browser refused is said (7 October: on a phone the
 * press asked Meta's door, fetched the SDK, and only then asked for the window; nothing opened and the page said nothing).
 *
 * Moved from legacy-bridge/whatsapp-connect.ts with Settings › Connections (decision 0015 step 11): the Connections
 * pane imports `waConnect` ({ config(), prepare(), start() }).
 */
import type { LineCodeDto } from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";

type Refused = {
  ok: false;
  reason: "cancelled" | "not_ready" | "sdk" | "failed" | "blocked" | "home_screen";
  message: string;
};
type ConnectResult =
  { ok: true; number: string | null; verifiedName: string | null; qualityRating: string | null } | Refused;

interface FB {
  init(opts: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }): void;
  login(
    cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void,
    opts: Record<string, unknown>,
  ): void;
}

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
/** How long a message from the popup may trail its callback and still be heard. */
const LATE_MESSAGE_MS = 300;

/**
 * Whether a message came from Meta's own pages: Meta's sample listener takes any origin ending in facebook.com, since its
 * window speaks from more than one of its hosts (www, web, business); held here to https and to the domain itself, never a
 * name that only ends in those letters. Two hosts named outright heard nothing from a third (8 October 2026).
 */
function fromMeta(origin: string): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  return u.protocol === "https:" && (u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"));
}

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
    s.onerror = () => {
      // A load that failed is not kept: the next press fetches Meta's SDK again rather than repeat this failure.
      w.__fbReady = undefined;
      reject(new Error("sdk_failed"));
    };
    w.document.head.appendChild(s);
  });
  return w.__fbReady;
}

/** What a press needs in hand to ask for Meta's window at once: Meta's SDK, and the configuration the sign-up runs. */
interface InHand {
  fb: FB;
  configId: string;
}
const IN_HAND = new WeakMap<Window, InHand>();

/**
 * Whether this page was opened from an iPhone's home screen (`navigator.standalone` is WebKit's own word for it). There,
 * another site opens in a sheet of its own that cannot reach the page behind it, so Meta's window could never hand back the
 * code or the ids: the sign-up would finish on Meta's side and never arrive here.
 */
const onHomeScreen = (win: Window): boolean =>
  (win.navigator as { standalone?: boolean } | undefined)?.standalone === true;

/**
 * Whether the browser gave the window asked for while `ask` ran: true or false, or null where none was asked for. Meta's SDK
 * asks the browser itself and reports nothing when it is refused, so the answer is read where it is given.
 */
function windowGiven(win: Window, ask: () => void): boolean | null {
  // Read as a value and put back as it was, so the page's `open` is the browser's own again once the SDK has asked.
  const real = Reflect.get(win, "open");
  let given: boolean | null = null;
  win.open = (...args: Parameters<Window["open"]>) => {
    const opened = real.apply(win, args);
    given = !!opened;
    return opened;
  };
  try {
    ask();
  } finally {
    win.open = real;
  }
  return given;
}

/** What the sign-up window said as it finished: the ids it named (either may be missing), or that the owner closed it. */
type SignupSaid = { phone_number_id: string | null; waba_id: string | null } | { cancelled: true };

/**
 * The ids Meta posts back when the sign-up window finishes: both on a FINISH, the account alone on a FINISH_ONLY_WABA (a
 * number is added later), and whichever a FINISH names when it names one. What is missing the edge reads from the token's
 * own grant; the page sends what it heard.
 */
export function parseSignupMessage(origin: string, data: unknown): SignupSaid | null {
  if (!fromMeta(origin)) return null;
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
    data?: { phone_number_id?: string; waba_id?: string; waba_ids?: string[]; current_step?: string };
  } | null;
  if (!m || m.type !== "WA_EMBEDDED_SIGNUP") return null;
  if (m.event === "FINISH" || m.event === "FINISH_ONLY_WABA") {
    const d = m.data ?? {};
    const waba = d.waba_id ?? (Array.isArray(d.waba_ids) ? d.waba_ids[0] : undefined);
    const said = {
      phone_number_id: d.phone_number_id ? String(d.phone_number_id) : null,
      waba_id: waba ? String(waba) : null,
    };
    return said.phone_number_id || said.waba_id ? said : null;
  }
  if (m.event === "CANCEL") return { cancelled: true };
  return null;
}

/** Meta's door, as the deployment has it: whether a number can be connected here, and by whom. */
const signupConfig = () => read("GET channels/whatsapp/signup");

/**
 * What a sign-up asks Meta for: `keepApp` keeps the business on the WhatsApp Business app it already uses (coexistence,
 * decision 0073, R12): Meta's own "onboarding business app users" flow, which also offers to share the chat history.
 */
interface SignupAsk {
  keepApp?: boolean;
}

/**
 * The sign-up, marked while it runs and unmarked however it ends (connected, cancelled, failed): a mark still there on the next
 * load is a sign-up the page that began it never finished (signupLeftOpenAt).
 */
async function startSignup(win: Window = window, ask: SignupAsk = {}): Promise<ConnectResult> {
  signupRunning = true;
  markSignup(win);
  try {
    return await runSignup(win, ask);
  } finally {
    signupRunning = false;
    clearSignupMark(win);
  }
}

/** Meta's door as its route answers it. */
export type SignupDoor = Awaited<ReturnType<typeof signupConfig>>;

/**
 * Meta's SDK, fetched as Connections opens on a door that is ready (the page passes the answer it already holds), so the press
 * has it in hand and asks for Meta's window at once. A fetch that fails is left to the press, which fetches again and says so.
 */
function prepareSignup(door: Partial<SignupDoor> | null | undefined, win: Window = window): void {
  if (!door || !door.ready || !door.app_id || !door.config_id || onHomeScreen(win)) return;
  const configId = door.config_id;
  loadSdk(win, door.app_id, door.graph_version ?? "").then(
    (fb) => void IN_HAND.set(win, { fb, configId }),
    () => {},
  );
}

/** What a press that has nothing in hand waits for: Meta's door, then its SDK. Kept, so the press after it waits for neither. */
async function fetchForSignup(win: Window): Promise<InHand | Refused> {
  const cfg = await signupConfig().catch(() => null);
  if (!cfg || !cfg.ready || !cfg.app_id || !cfg.config_id)
    return { ok: false, reason: "not_ready", message: "Chanlytics is not set up to connect numbers yet." };
  try {
    const held = { fb: await loadSdk(win, cfg.app_id, cfg.graph_version), configId: cfg.config_id };
    IN_HAND.set(win, held);
    return held;
  } catch {
    return {
      ok: false,
      reason: "sdk",
      message: "Meta's sign-up window could not be loaded. Check that the browser allows facebook.com.",
    };
  }
}

/** The sign-up window, opened and followed to its end; the code and the ids go to the app's own route. */
async function runSignup(win: Window, ask: SignupAsk = {}): Promise<ConnectResult> {
  if (onHomeScreen(win))
    // What to do is said first, here and where a window is refused: a phone's toast is one line, and cuts the rest.
    return {
      ok: false,
      reason: "home_screen",
      message:
        "Open Chanlytics in Safari to connect WhatsApp. Meta's sign-up needs a browser tab, and an app on the home screen has none.",
    };
  // In hand since Connections opened: nothing is waited for, and Meta's window is asked for inside the press.
  const held = IN_HAND.get(win) ?? (await fetchForSignup(win));
  if ("ok" in held) return held;
  // The ids arrive by message while the window is open; the code arrives when it closes. The code is what is needed:
  // the ids are sent on where they were heard, and the edge reads the rest from the token's own grant (8 October 2026:
  // three sign-ups finished on Meta's side, the page heard no ids, and each code was thrown away with nothing connected).
  let ids: { phone_number_id: string | null; waba_id: string | null } | null = null;
  let cancelled = false;
  const onMessage = (e: MessageEvent) => {
    const parsed = parseSignupMessage(e.origin, e.data);
    if (!parsed) return;
    if ("cancelled" in parsed) cancelled = true;
    else ids = parsed;
  };
  win.addEventListener("message", onMessage);
  let answer: (code: string | null) => void = () => {};
  const answered = new Promise<string | null>((resolve) => {
    answer = resolve;
  });
  const given = windowGiven(win, () =>
    held.fb.login((r) => answer(r.authResponse?.code ?? null), {
      config_id: held.configId,
      response_type: "code",
      override_default_response_type: true,
      // Which Embedded Signup this is (v4 since v2 and v3 retired on 15 Oct 2026) is the login configuration's own
      // (`config_id`, made in Meta's dashboard), never a field here. The feature selector is: keeping the WhatsApp
      // Business app is Meta's "onboarding business app users" flow (decision 0073, R12); a number of the business's own
      // on Chanlytics is the plain one. sessionInfoVersion is as Meta's coexistence page still shows it.
      extras: {
        setup: {},
        featureType: ask.keepApp ? "whatsapp_business_app_onboarding" : "",
        sessionInfoVersion: "3",
      },
    }),
  );
  if (given === false) {
    // No window, so no answer will ever come: the sign-up ends here, and the press after this one has everything in hand.
    win.removeEventListener("message", onMessage);
    return {
      ok: false,
      reason: "blocked",
      message:
        "Meta's window was blocked. Press Connect WhatsApp again; if it still does not open, allow pop-ups for Chanlytics.",
    };
  }
  const code = await answered;
  // A late message can follow the callback by a tick.
  await new Promise((r) => win.setTimeout(r, LATE_MESSAGE_MS));
  win.removeEventListener("message", onMessage);
  if (!code || cancelled)
    return {
      ok: false,
      reason: "cancelled",
      message: "The sign-up was closed before it finished. Nothing was connected.",
    };
  const heard = ids as { phone_number_id: string | null; waba_id: string | null } | null;
  const r = await api()("POST channels/whatsapp/connect", {
    body: {
      code,
      ...(heard?.phone_number_id ? { phone_number_id: heard.phone_number_id } : {}),
      ...(heard?.waba_id ? { waba_id: heard.waba_id } : {}),
      // The app kept (coexistence): the edge asks Meta for the contacts and the chat history within its 24 hours (R21).
      ...(ask.keepApp ? { keep_app: true } : {}),
    },
  });
  if (!r.ok) return { ok: false, reason: "failed", message: r.message };
  return {
    ok: true,
    number: r.data.number_e164 ?? null,
    verifiedName: r.data.verified_name ?? null,
    qualityRating: r.data.quality_rating ?? null,
  };
}

/** Connect your WhatsApp number: the door's answer, what a press needs fetched ahead of it, and the sign-up. */
export const waConnect = {
  config: signupConfig,
  prepare: (door: Partial<SignupDoor> | null | undefined) => prepareSignup(door),
  start: (ask?: SignupAsk) => startSignup(window, ask),
};

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
