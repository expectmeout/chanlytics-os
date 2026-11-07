/**
 * Ask's hooks: hold to talk, a held Space that talks, a held press that talks, focus that returns to the line, a field that
 * grows with its words, and reading aloud. Each does one thing and knows nothing about the Line's state.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKey, PointerEvent as ReactPointer, RefObject } from "react";
import { isTypingTarget, type SpeechPurpose } from "@chanlytics/contracts";
import type { AskApi } from "@/bridge/ask";
import { useHoldToTalk } from "../kit/talk/use-hold-to-talk";
import { mediaSays } from "../frame-verbs";

// Hold to talk is the kit's (surfaces/kit/talk/use-hold-to-talk.ts, imported): press starts the
// browser's own recogniser, release stops it, and what was heard is handed back on its own, interim words as they come,
// so the input shows them. Nothing is recorded or uploaded. What it adds here is the Line's language: Spanish where the
// Line speaks it, as the US speaks it (es-US: the businesses' customers, more of them heard right than as Spain's). Words heard for a Line that is gone (Ask closed while it listened) are dropped by the kit's.
/** What a hold starts and stops: the Line's, for a key held, a press held and the mic. */
interface HoldTalk {
  start: (e?: { preventDefault?: () => void }) => void;
  stop: () => void;
}

export const useAskTalk = ({
  lang,
  onWords,
  onHeard,
  disabled,
}: Omit<Parameters<typeof useHoldToTalk>[0], "lang"> & { lang?: string }) =>
  useHoldToTalk({ lang: lang === "es" ? "es-US" : undefined, onWords, onHeard, disabled });

// A Space held on an empty line talks (the Line, 6.6): held 300ms it starts
// listening, and letting go asks. A tap does nothing, because an empty line
// takes no leading space; once there are words, Space is a space. The key's
// repeats while held are swallowed. Two cells.
const AH_HOLD_MS = 300;
export const useHoldSpace = ({ empty, talk }: { empty: () => boolean; talk: HoldTalk }) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const onKeyDown = (e: ReactKey) => {
    if (e.key !== " ") return false;
    if (held.current || timer.current) {
      e.preventDefault();
      return true;
    }
    if (!empty()) return false;
    e.preventDefault();
    timer.current = setTimeout(() => {
      timer.current = null;
      held.current = true;
      talk.start();
    }, AH_HOLD_MS);
    return true;
  };
  const onKeyUp = (e: ReactKey) => {
    if (e.key !== " ") return false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      return true;
    }
    if (held.current) {
      held.current = false;
      talk.stop();
      return true;
    }
    return false;
  };
  return { onKeyDown, onKeyUp };
};

// A press held AH_HOLD_MS listens; a shorter one does nothing. Pointer events, so no keyboard opens and a touch's
// mouse twin is not a second press. The phone's three take it (spec S11); the mic keeps its own down/up. A press that
// travels AH_DRAG_PX before the beat is a drag -- the pull down that closes the takeover (S7) -- and never listens.
const AH_DRAG_PX = 10;
export const useHoldPress = ({ talk, onHold }: { talk: HoldTalk; onHold?: () => void }) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const from = useRef<{ x: number; y: number } | null>(null);
  const end = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (held.current) {
      held.current = false;
      talk.stop();
    }
  };
  return {
    onPointerDown: (e: ReactPointer<HTMLElement>) => {
      if (e && e.preventDefault) e.preventDefault();
      if (timer.current || held.current) return;
      // The press keeps its pointer, as a touch does anyway: a mouse's hold outlasts the three hiding under it as they
      // start to listen (a thread dims), which otherwise read as the pointer leaving and ended the hold at once.
      const el = e && e.currentTarget;
      if (el && el.setPointerCapture && e.pointerId != null) {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* not a live pointer */
        }
      }
      from.current = e && typeof e.clientX === "number" ? { x: e.clientX, y: e.clientY } : null;
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        if (onHold) onHold();
        talk.start();
      }, AH_HOLD_MS);
    },
    onPointerMove: (e: ReactPointer<HTMLElement>) => {
      if (!timer.current || !from.current || !e || typeof e.clientX !== "number") return;
      if (Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > AH_DRAG_PX) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    },
    onPointerUp: end,
    onPointerLeave: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onContextMenu: (e: { preventDefault?: () => void }) => {
      if (e && e.preventDefault) e.preventDefault();
    },
  };
};

// The input is the way on: focus comes back to it whenever `when` is true
// and any of `deps` changes, so typing never lands on a chip just clicked;
// `may`, asked as it lands, can hold it back (a desk's page beside the panel,
// where the member went to work).
export const useAskFocus = (
  ref: RefObject<HTMLElement | null>,
  when: boolean,
  deps: readonly unknown[],
  may?: () => boolean,
) => {
  useEffect(() => {
    if (!when) return;
    const id = setTimeout(() => {
      if (ref.current && (!may || may())) ref.current.focus();
    }, 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller says what brings focus back: `deps` is the point of this hook, and each read is as it lands
  }, deps);
};

// Reading aloud in Ask's voice (bridge/ask/speech.ts): the bridge holds what is happening (idle, loading,
// speaking) and tells every watcher, so the Line reads it rather than keeping a copy, and a Stop from anywhere (the
// Line closing, a question asked, Today's own button) is seen here. `toggle` reads, or stops what is read or awaited;
// it answers a promise of why it could not (the server's words; "" where it gave none) or null. `speakingId` and
// `loading` name the one thing the Line reads, "line", while it is read or awaited, as the mood and the acts read them.
/** A refusal's own words, or none. */
const wordsOf = (e: unknown): string => (e instanceof Error && e.message) || "";

export const useAskSpeech = (A: AskApi | undefined) => {
  const [, setTick] = useState(0);
  useEffect(() => (A && A.watchSpeech ? A.watchSpeech(() => setTick((n) => n + 1)) : undefined), [A, setTick]);
  const state = A && A.state ? A.state() : "idle";
  const stop = () => {
    if (A && A.stopSpeaking) A.stopSpeaking();
  };
  const toggle = async (text: string, purpose: SpeechPurpose = "answer") => {
    if (!A || !A.speak) return null;
    if (A.state && A.state() !== "idle") {
      stop();
      return null;
    }
    try {
      await A.speak(text, purpose);
      return null;
    } catch (e) {
      return wordsOf(e);
    }
  };
  // A held question (bridge/ask/aloud.ts): the element readied inside the press, the one line said while Ask
  // works, and the answer read as it lands, after that line; `answer` says why it could not, as `toggle` does.
  const ready = () => {
    if (A && A.readySpeech) A.readySpeech();
  };
  const wait = (lang: Parameters<AskApi["waitAloud"]>[0], answered: () => boolean) => {
    if (A && A.waitAloud) A.waitAloud(lang, answered);
  };
  const answer = async (text: string) => {
    if (!A || !A.answerAloud) return null;
    try {
      await A.answerAloud(text);
      return null;
    } catch (e) {
      return wordsOf(e);
    }
  };
  return {
    canSpeak: !!(A && A.canSpeak && A.canSpeak()),
    speakingId: state === "speaking" ? "line" : null,
    loading: state === "loading" ? "line" : null,
    toggle,
    stop,
    ready,
    wait,
    answer,
  };
};

// A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md): the newest question stands at
// the top as a question is asked or a conversation opened (D5), and Latest is offered once it is out of sight below
// (D7). The arithmetic is pure, so it is proved without a layout; the thread is the question's offsetParent (ask.css).
const ahStill = () => mediaSays("(prefers-reduced-motion: reduce)");
/** The scroll that stands the newest question a breath under the thread's top edge; the first stands at the top. */
export const ahPinTop = (qTop: number, gap = 14) => Math.max(0, qTop - gap);
/** Whether the newest question's first line is below what the thread shows: Latest is offered then. */
export const ahLatestShown = ({
  qTop,
  scrollTop,
  clientHeight,
}: {
  qTop: number;
  scrollTop: number;
  clientHeight: number;
}) => qTop > scrollTop + clientHeight - 24;
/** How long a glide may take before Latest looks again, where the browser says no `scrollend`. */
const AH_GLIDE_MS = 900;
/**
 * The thread is gliding to its newest question (`data-pinning`): Latest holds back meanwhile (useAskLatest), since the
 * question is on its way up, not out of sight; it flashed on every follow-up in a thread longer than the screen. The
 * glide's end (`scrollend`, or AH_GLIDE_MS where the browser has none) lets it look again.
 */
const ahGlide = (body: HTMLElement) => {
  if (!body.dataset || !body.addEventListener) return;
  body.dataset.pinning = "1";
  let over = false;
  const done = () => {
    if (over) return;
    over = true;
    body.removeEventListener("scrollend", done);
    delete body.dataset.pinning;
    if (typeof Event === "function" && body.dispatchEvent) body.dispatchEvent(new Event("scroll"));
  };
  body.addEventListener("scrollend", done);
  setTimeout(done, AH_GLIDE_MS);
};
/** Stand the newest question at the top of the thread `body`, gliding unless motion is reduced. */
export const ahPinNow = (body: HTMLElement | null) => {
  const q = body && "querySelector" in body ? body.querySelector<HTMLElement>("#ask-now-q") : null;
  if (!q || !body) return;
  const top = ahPinTop(q.offsetTop);
  if (typeof body.scrollTo !== "function") {
    body.scrollTop = top;
    return;
  }
  const still = ahStill();
  if (!still) ahGlide(body);
  body.scrollTo({ top, behavior: still ? "auto" : "smooth" });
};
/** D5: each time `key` changes (another question, another conversation), the newest question stands at the top. */
export const useAskPin = (bodyRef: RefObject<HTMLElement | null>, key: string, on: boolean) => {
  useEffect(() => {
    if (on) ahPinNow(bodyRef.current);
  }, [bodyRef, key, on]);
};
/** D7: whether the newest question is out of sight below, read again as the thread scrolls, once a frame. */
export const useAskLatest = (bodyRef: RefObject<HTMLElement | null>, on: boolean) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const body = bodyRef.current;
    if (!on || !body || !body.addEventListener) {
      setShown(false);
      return undefined;
    }
    let frame = 0;
    const look = () => {
      frame = 0;
      const q = body.querySelector<HTMLElement>("#ask-now-q");
      const gliding = !!(body.dataset && body.dataset.pinning);
      setShown(
        !gliding &&
          !!q &&
          ahLatestShown({ qTop: q.offsetTop, scrollTop: body.scrollTop, clientHeight: body.clientHeight }),
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    look();
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [bodyRef, on, setShown]);
  return shown;
};

// A phone's field focused: the field and the three slide to where the screen made room for the keys (moved here
// from the Line, whose hooks call them).
// The keyboard's own beat on iOS: what it takes to rise, and what the field and the three take to reach their places.
const AH_KEYS_MS = 250;
const ahRect = (el: Element | null) =>
  el && typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
/** Where the field and the hero stand as the field is focused, to slide them from there once the screen has made room. */
/** Where the field and the hero stood. */
interface SlideFrom {
  stage: DOMRect | null;
  hero: DOMRect | null;
}

export const ahSlideFrom = (stage: HTMLElement | null, hero: HTMLElement | null): SlideFrom | null =>
  ahStill() ? null : { stage: ahRect(stage), hero: ahRect(hero) };
// A phone's field just focused: the screen has made room for the keys at once (kit/motion/keyboard.ts watchKeyboard's kb-expected;
// ask.css), so the browser finds the field above them and moves nothing. What the eye sees is the field and the three
// sliding to their places over the keyboard's own beat: a still copy of the field that React never holds goes from
// where the field stood to where it is, over the field itself, held clear meanwhile (the kit's way, as `leaving`), and
// the hero is drawn from where it stood and let go (translate, never transform: the kit's rule). Under reduced motion
// they are simply there (ahSlideFrom gives nothing).
export const ahSlide = (from: SlideFrom | null, stage: HTMLElement | null, hero: HTMLElement | null) => {
  if (!from) return;
  const modal = stage ? stage.parentElement : null;
  const now = ahRect(stage);
  const box = ahRect(modal);
  if (from.stage && stage && modal && now && box) {
    const dy = now.top - from.stage.top;
    if (Math.abs(dy) > 1) {
      const ghost = stage.cloneNode(true) as HTMLElement;
      ghost.setAttribute("aria-hidden", "true");
      ghost.removeAttribute("data-testid");
      ghost.querySelectorAll("[id], [data-testid]").forEach((el) => {
        el.removeAttribute("id");
        el.removeAttribute("data-testid");
      });
      Object.assign(ghost.style, {
        position: "absolute",
        left: `${from.stage.left - box.left}px`,
        top: `${from.stage.top - box.top}px`,
        width: `${from.stage.width}px`,
        margin: "0",
        pointerEvents: "none",
        transition: `translate ${AH_KEYS_MS}ms var(--ease-out)`,
      });
      modal.appendChild(ghost);
      stage.style.opacity = "0";
      requestAnimationFrame(() => {
        ghost.style.translate = `0 ${dy}px`;
      });
      setTimeout(() => {
        ghost.remove();
        stage.style.opacity = "";
      }, AH_KEYS_MS + 30);
    }
  }
  const heroNow = ahRect(hero);
  if (from.hero && hero && heroNow) {
    const dh = from.hero.top - heroNow.top;
    if (Math.abs(dh) > 1) {
      hero.style.transition = "none";
      hero.style.translate = `0 ${dh}px`;
      void hero.offsetHeight;
      hero.style.transition = `translate ${AH_KEYS_MS}ms var(--ease-out)`;
      hero.style.translate = "0 0";
      setTimeout(() => {
        hero.style.transition = "";
        hero.style.translate = "";
      }, AH_KEYS_MS + 30);
    }
  }
};

// A question on its way warms the model's cache (bridge/ask/api.ts warmModel; the server's ask/warm.ts): words on
// the Line, typed or heard, that are more than a jump -- two words or more, eight characters, and no page, person,
// thread or call they reach -- so the answer's first words come about two seconds sooner after Ask has stood idle. The
// bridge sends one warm in four minutes however often it is asked; a hold on the mic warms it as it is pressed.
const AH_WARM_CHARS = 8;
export const useAskWarm = ({ A, open, query }: { A: AskApi | undefined; open: boolean; query: string }) => {
  useEffect(() => {
    const q = (query || "").trim();
    if (!open || !A || !A.warmModel || q.length < AH_WARM_CHARS || !q.includes(" ")) return;
    if (A.jump && A.jump(q).length) return;
    A.warmModel();
  }, [A, open, query]);
};

// The Line's field grows with what is written, a line at a time, before it is painted; ask.css caps it at six lines, and
// past them it scrolls. Measured again as the words change and as the Line opens (a seeded question, a kept draft).
export const useAskGrow = (ref: RefObject<HTMLTextAreaElement | null>, value: string, open: boolean) => {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el || !el.style || el.value !== value) return; // measured once the open field holds these words
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value, open]);
};

// Back closes a phone's takeover (S8): one entry with a null state and the same address, so the shell's hash router
// never hears it and Next's app router, which reloads on a Back to a state it did not write (surfaces/frame/shell-hooks.ts), ignores
// it. Whether the entry is ours is `pushed`, not the popped state; closing any other way goes back over it.
export const useAskBack = (on: boolean, pushed: RefObject<boolean>, onClose: () => void) => {
  // The close it calls is the latest one, while the entry is pushed once per opening, never again for a new function.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const h = typeof window !== "undefined" ? window.history : null;
    if (!on || !h || !h.pushState) return undefined;
    h.pushState(null, "", window.location.href);
    pushed.current = true;
    const onPop = () => {
      if (pushed.current) {
        pushed.current = false;
        close.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed.current) {
        pushed.current = false;
        if (h.back) h.back();
      }
    };
  }, [on, pushed, close]);
};

// A press outside the box closes it, and the press goes on to what it was on, since the page beside a desk's panel is
// live: Inbox in the sidebar closes Ask and opens the Inbox. A press on what stands over it (`over`) is not outside.
export const useAskPressAway = (
  on: boolean,
  boxRef: RefObject<HTMLElement | null>,
  over: string,
  onClose: () => void,
) => {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!on || typeof document === "undefined" || !document.addEventListener) return undefined;
    const onDown = (e: PointerEvent) => {
      const box = boxRef.current;
      const at = e.target as Element | null;
      if (!box || !at || !at.closest || box.contains(at) || at.closest(over)) return;
      close.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [on, boxRef, over, close]);
};

// Whether focus is out of the box, in the page beside it (`away`), kept as it moves.
export const useAskAway = (on: boolean, boxRef: RefObject<HTMLElement | null>, away: RefObject<boolean>) => {
  useEffect(() => {
    if (!on || typeof document === "undefined" || !document.addEventListener) return undefined;
    away.current = false;
    const onIn = (e: FocusEvent) => {
      const box = boxRef.current;
      away.current = !!(box && e.target && !box.contains(e.target as Node));
    };
    document.addEventListener("focusin", onIn);
    return () => document.removeEventListener("focusin", onIn);
  }, [on, boxRef, away]);
};

// As the box goes, focus goes back to what had it before it came, unless the member has put it somewhere since.
export const useAskGiveBack = (on: boolean, boxRef: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    if (!on || typeof document === "undefined") return undefined;
    const from = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    return () => {
      const at = document.activeElement;
      const lost = !at || at === document.body || (box && box.contains(at));
      if (lost && from && from !== document.body && from.isConnected !== false && from.focus)
        from.focus({ preventScroll: true });
    };
  }, [on, boxRef]);
};

// A scroller's bar shows while it scrolls and a beat after (`data-scrolling`), never standing at rest beside what it
// holds, and once scrolled what passes under the head fades at its top edge (`data-scrolled`; ask.css .ask-line-body).
// Data attributes, which React leaves alone: a class set here would be wiped by the next className it writes.
const AH_SCROLL_QUIET_MS = 900;
export const useAskScrollCues = (ref: RefObject<HTMLElement | null>, on: boolean) => {
  useEffect(() => {
    const b = ref.current;
    if (!on || !b || !b.addEventListener) return undefined;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (b.scrollTop > 0) b.dataset.scrolled = "true";
      else delete b.dataset.scrolled;
      b.dataset.scrolling = "true";
      clearTimeout(quiet);
      quiet = setTimeout(() => delete b.dataset.scrolling, AH_SCROLL_QUIET_MS);
    };
    b.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(quiet);
      b.removeEventListener("scroll", onScroll);
    };
  }, [on, ref]);
};

// A desk's panel keeps the keys pressed in it, since the page beside it is live and its own listeners (the Inbox's
// A, D, E and ⌘↵, People's and a person's J and K) read the window: only the shell's chords (⌘K, ⌘B, ⌘1-9) and Ask's own
// ⌘J go on. Esc, unless the line took it first, is the panel's (`escape`).
export const ahPanelKeys = (e: ReactKey, escape: () => void) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && /^[kbj1-9]$/i.test(e.key)) return;
  e.stopPropagation();
  if (e.key !== "Escape" || e.defaultPrevented) return;
  e.preventDefault();
  escape();
};

// What stands open over the page and holds Esc while it does. A desk's panel is none of these: it is `complementary`.
export const AH_OPEN_OVER = '[role="dialog"], [role="alertdialog"], [role="menu"], .pop-place';

// The panel keeps its own keys, so an Esc the window hears on a desk was pressed beside it. It is Ask's wherever focus is,
// unless the page has a use for it: a peek, the plan panel, the pile and a selection take it and say so (spec F7), a field
// keeps its own, as the page's keys leave it, but for the bar's line, Ask's own door, which says so when it has words to
// empty; and a sheet or a menu closes itself and says nothing, often before the window hears the key, so what stands
// open is read as the key goes down, ahead of every listener.
export const useAskEscBeside = (on: boolean) => {
  const free = useRef(false);
  useEffect(() => {
    if (!on || typeof document === "undefined") return undefined;
    const read = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const at = e.target as Element | null;
      const from = at && at.nodeType === 1 ? at : document.activeElement;
      const typing = !!from && isTypingTarget(from.tagName, (from as HTMLElement).isContentEditable);
      const field = typing && !(from && from.closest && from.closest(".tb-line"));
      free.current = !field && !document.querySelector(AH_OPEN_OVER);
    };
    window.addEventListener("keydown", read, true);
    return () => window.removeEventListener("keydown", read, true);
  }, [on, free]);
  return free;
};
