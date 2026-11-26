/**
 * What the Line reads of where it stands: the route under it, a scope's name, a phone or a desk, where the three come from
 * as it opens, and what stands over the page. Pure of its state.
 */
import type { AskMessageVM, AskScope } from "@chanlytics/contracts";
import { askOnScreenKey } from "@/bridge/ask/on-screen";
import { AH_OPEN_OVER } from "../hooks";
import { askKindGlyph } from "../card-parts";
import { inboxThreads, liveCalls, mediaSays, routeNow } from "../shell";
import type { Conversation, Line, LineRoute, QuickTurn } from "./types";
import type { LineWords } from "../words";

// A hold's lift that makes no click on the button (the finger let go elsewhere) is forgotten after this.
export const AR_LIFT_MS = 400;

/** The breath before the field takes the focus after its words were set: the draw that holds them has run. */
export const AR_FOCUS_MS = 20;

export const arRoute = (): LineRoute => {
  const [page, ...rest] = routeNow().split("/");
  return { page: page || "today", param: rest.length ? rest.join("/") : null };
};

export const arScopeLabel = (page: string, param: string | null) => {
  if (!param) return null;
  const T = inboxThreads();
  if (page === "inbox") {
    const t = T.find((x) => x.id === param);
    return t ? t.who : null;
  }
  // A person is named by the palette's scopeFor (personLabelOf), on any of their tabs: the address is read once, there.
  if (page === "conversations" && param.startsWith("cv-")) {
    const L = liveCalls();
    const c = [...(L.now || []), ...(L.recent || [])].find((x) => x.callId === param.slice(3));
    return c ? c.who : null;
  }
  return null;
};

export const arScopeIcon = (s: AskScope) => askKindGlyph(s.kind);

/**
 * A message the Line draws before the server has said one (the question as asked, the answer on its way, a turn that
 * failed): what it holds, and the rest as a message that says nothing yet. Its language is the server's word on a
 * message it wrote, and nothing reads it on one the Line drew itself.
 */
export const lineMessage = (
  message: Pick<AskMessageVM, "id" | "role" | "text"> & Partial<AskMessageVM>,
): AskMessageVM => ({
  at: "",
  atMs: Date.now(),
  citations: [],
  followups: [],
  navigate: null,
  proposals: [],
  language: "en",
  ungrounded: false,
  tools: [],
  latencyMs: null,
  failed: false,
  ...message,
});

export const arFailed = (id: string, text: string) => lineMessage({ id, role: "assistant", text, failed: true });

/** The newest question's key: the thread stands it at the top once each (the spec 2026-09-27-ask-chat-on-a-phone, D5). */
export const arNowKey = (active: Conversation | null, quick: QuickTurn | null) => {
  const q = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
  return q ? q.id : quick ? `quick:${quick.q}` : "";
};

export const arPhone = () => mediaSays("(max-width: 720px)");
export const arStill = () => mediaSays("(prefers-reduced-motion: reduce)");

// Where the three come from as the Line opens: the top bar's button, where it is drawn. On a phone the ✦ is gone
// before the takeover comes in (surfaces/frame/shell-chrome.tsx draws it only while Ask is closed), so the takeover's own fade is it.
export const arFaceFrom = () => {
  if (typeof document === "undefined" || !("querySelector" in document)) return null;
  const el = document.querySelector<HTMLElement>('[data-testid="tb-ask-face"]');
  return el && el.getBoundingClientRect().width ? el : null;
};

/**
 * Whether the frame's own bar stands on this phone, so AI's field is the bar's (Today, calm, D8; bridge/ask/dock.ts): drawn,
 * and on screen. Not inside the native app, whose own tab bar stands there, nor over a page that took the screen and
 * sent the bar away: there AI keeps a field of its own.
 */
export const arDocked = (): boolean => {
  if (typeof document === "undefined" || !("querySelector" in document) || !arPhone()) return false;
  const bar = document.querySelector<HTMLElement>(".phone-places");
  return !!bar && bar.getClientRects().length > 0;
};

/** One tile of the three on the phone's circle, and the canvas they were drawn on there (ask.css `.phone-ask-face`). */
const DISC_FACE = { width: 45, height: 38 } as const;
const DISC_FACE_DROP = 0.225 * 14;

/** Where the three stood on the phone's circle before AI opened: its middle, at the size they were drawn there. */
export const arDiscBox = (): { left: number; top: number; width: number; height: number } | null => {
  if (typeof document === "undefined" || !("querySelector" in document)) return null;
  const disc = document.querySelector<HTMLElement>(".phone-ask");
  const box = disc ? disc.getBoundingClientRect() : null;
  if (!box || !box.width) return null;
  return {
    left: box.left + (box.width - DISC_FACE.width) / 2,
    // The three were drawn a hair under the circle's middle there (ask.css `.phone-ask-face`, 0.225 of a tile).
    top: box.top + (box.height - DISC_FACE.height) / 2 + DISC_FACE_DROP,
    ...DISC_FACE,
  };
};

/** What Ask puts over the page itself, whose presses are not a press outside a desk's panel: its toasts, a card's menu, pop or sheet, and the top bar's Ask, which toggles it. */
export const arOverAsk = () => `${AH_OPEN_OVER}, .pp-toast-stack, .tb-ask`;

/** Esc, wherever it is the Line's: a turn in flight stops, else Earlier steps back to the rows, else Ask closes. */
export const arEscape = ({
  live,
  stop,
  view,
  setView,
  onClose,
}: Pick<Line, "live" | "stop" | "view" | "setView" | "onClose">) => {
  if (live) stop();
  else if (view === "earlier") setView("rows");
  else onClose();
};

/**
 * Campaigns' field asks for what should go out; on Content, where Ask makes posts and videos, for what to make; on its Ads
 * page, which sends nothing yet, for nothing of the kind.
 */
export const campaignsAskOf = (words: LineWords): string => {
  const on = askOnScreenKey();
  if (on === "content") return words.describeContent;
  return on === "ads" ? words.placeholder : words.describeCampaigns;
};
