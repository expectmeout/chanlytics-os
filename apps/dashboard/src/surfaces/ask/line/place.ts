/**
 * What the Line reads of where it stands: the route under it, a scope's name, a phone or a desk, where the three come from
 * as it opens, and what stands over the page. Pure of its state.
 */
import type { AskMessageVM, AskScope } from "@chanlytics/contracts";
import { AH_OPEN_OVER } from "../hooks";
import { askKindGlyph } from "../card-parts";
import { inboxThreads, liveCalls, routeNow } from "../shell";
import type { Conversation, Line, LineRoute, QuickTurn } from "./types";

// A hold's lift that makes no click on the button (the finger let go elsewhere) is forgotten after this.
export const AR_LIFT_MS = 400;

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

export const arFailed = (id: string, text: string) =>
  ({
    id,
    role: "assistant",
    text,
    failed: true,
    citations: [],
    followups: [],
    proposals: [],
    atMs: Date.now(),
  }) as Partial<AskMessageVM> as AskMessageVM;

/** The newest question's key: the thread stands it at the top once each (the spec 2026-09-27-ask-chat-on-a-phone, D5). */
export const arNowKey = (active: Conversation | null, quick: QuickTurn | null) => {
  const q = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
  return q ? q.id : quick ? `quick:${quick.q}` : "";
};

export const arPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
export const arStill = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Where the three come from as the Line opens: the top bar's button, where it is drawn. On a phone the ✦ is gone
// before the takeover comes in (surfaces/frame/shell-chrome.tsx draws it only while Ask is closed), so the takeover's own fade is it.
export const arFaceFrom = () => {
  if (typeof document === "undefined" || !("querySelector" in document)) return null;
  const el = document.querySelector<HTMLElement>('[data-testid="tb-ask-face"]');
  return el && el.getBoundingClientRect().width ? el : null;
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
