/** The Line's hooks: one concern each, called in the order AskReal always called them. */
import { askedWords, takeAskedOfTheLine } from "../../frame-doors";
import type { AskedSeed, Line } from "./types";
import { useEffect, useLayoutEffect, useRef } from "react";
import { MASCOT } from "@/bridge/mascot";
import { ROUTE_WAIT_MS } from "@/bridge/surface-registry";
import { trapFocus } from "../../kit/focus/trap";
import { moveAlongArc } from "../../kit/motion/arc";
import {
  ahSlide,
  useAskAway,
  useAskBack,
  useAskEscBeside,
  useAskFocus,
  useAskGiveBack,
  useAskPin,
  useAskPressAway,
  useAskScrollCues,
  useAskTalk,
  useHoldPress,
  useHoldSpace,
} from "../hooks";
import { tabMemoryOfWindow } from "../shell";
import {
  arDiscBox,
  arDocked,
  arEscape,
  arFaceFrom,
  arNowKey,
  arOverAsk,
  arPhone,
  arRoute,
  arScopeLabel,
  arStill,
} from "./place";
import { provided } from "@/bridge/provided";

/** How long the three take from the phone's circle to AI's home (Today, calm, D9: one arc, under half a second). */
const AR_FLY_MS = 440;

/** Talking: held on the mic, a Space held on an empty line, a phone's three held a beat; said where the browser cannot listen. The hold is the one mic, and its words go the typed way (the spec's §3.5 as amended 5 Oct, evening): their reads drawn as they run, the answer read aloud in Ask's voice as it lands (arSubmitter). */
export const useArVoice = (ln: Line) => {
  const { A, M, lang, live, query, setQuery, typing, flash, t, submit, speech } = ln;
  const talk = useAskTalk({
    lang,
    disabled: !!live,
    onWords: (words) => {
      setQuery(words);
      M.mood.hear(0.8);
    },
    onHeard: (heard, error) => {
      if (heard) {
        if (!typing.current) void submit(heard, undefined, { spoken: true });
        return;
      }
      // Each said once: a second press refreshes the toast that says it (`once`), never a second beneath it.
      if (error === "blocked") flash({ once: "ask-mic", msg: <>{t.micBlocked}</> });
      else if (error === "not-allowed") flash({ once: "ask-mic", msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech")
        flash({ once: "ask-mic", msg: <>{t.micFailed}</> });
    },
  });
  // Every hold is one: the recogniser starts, what Ask's voice was reading stops, its element is readied inside the press
  // so the answer can be read once it lands (a phone plays audio only from a gesture; the lift readies it too, a press
  // going down being none to some), and the model's cache is warmed for the words on their way. Not while a turn runs:
  // the recogniser is off then (`disabled`), and the one line Ask's voice says while it works goes on (ask/aloud.ts).
  const begin = (e?: { preventDefault?: () => void }) => {
    if (!talk.canTalk) {
      flash({ once: "ask-mic", msg: <>{t.noVoice}</> });
      return;
    }
    if (!live) {
      speech.stop();
      speech.ready();
      if (A.warmModel) A.warmModel();
    }
    talk.start(e);
  };
  const end = () => {
    talk.stop();
    speech.ready();
  };
  // A Space held on an empty line talks (6.6); where the browser cannot listen, it says so.
  const hold = useHoldSpace({ empty: () => !query && !live, talk: { start: begin, stop: end } });
  // A phone's three listen to a press held a beat, with a buzz where the browser has one (S11, S16); where the browser
  // cannot listen, they say so (the field's button is Send alone there).
  const buzz = (ms: number) => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* none here */
    }
  };
  const holdThree = useHoldPress({ talk: { start: begin, stop: end }, onHold: () => buzz(8) });
  return { talk, hold, buzz, holdThree, begin, end };
};

// Ask's mood, said once for every face: listening while held, or while a phone's field is in use, reading until the
// first words, answering while they stream or are read aloud, at rest otherwise. Said while the Line is closed too,
// so a turn left running still shows.
export const useArMood = ({ M, talk, live, quick, speech, composing }: Line) => {
  const moodState = talk.listening
    ? "listening"
    : live
      ? live.say || live.text
        ? "speaking"
        : "thinking"
      : quick && quick.pending
        ? "thinking"
        : speech.speakingId
          ? "speaking"
          : speech.loading
            ? "thinking"
            : composing
              ? "listening"
              : "idle";
  // Said as it changes, never the same word twice: at mount, and at a strict mode's second mount, the Line has nothing
  // to say, and the three may be reading the page in for a face that mounted a moment before (bridge/arrival.ts);
  // a first word of "idle" ended that read on nothing.
  const moodSaid = useRef("idle");
  useEffect(() => {
    if (moodState === moodSaid.current) return;
    moodSaid.current = moodState;
    M.mood.set(moodState);
  }, [M, moodState]);
};

/** A phone's field in use: the slide to where the screen made room, and no composing once the Line closes. */
export const useArSlide = ({ open, composing, setComposing, slideFrom, stageRef, heroRef }: Line) => {
  // The slide runs once the screen has made room (watchKeyboard hears the focus after this page does, so the room is
  // there by the next frame, before anything is painted).
  useLayoutEffect(() => {
    if (!composing || !slideFrom.current || typeof requestAnimationFrame !== "function") return undefined;
    const from = slideFrom.current;
    slideFrom.current = null;
    const id = requestAnimationFrame(() => ahSlide(from, stageRef.current, heroRef.current));
    return () => cancelAnimationFrame(id);
  }, [composing, slideFrom, stageRef, heroRef]);
  useEffect(() => {
    if (!open) setComposing(false);
  }, [open, setComposing]);
};

/**
 * What the AI noticed, read as the Line opens (`read`): where none was held for the language, the home is laid out but not
 * shown until the read is in (`noticeWaits`, ask.css `.ask-now.waiting`), at most the route's wait, so it comes in whole.
 * Answers the stop.
 */
const arNoticeWait = (read: Promise<void>, held: boolean, setWaits: (on: boolean) => void): (() => void) => {
  if (held) return () => {};
  setWaits(true);
  const done = () => setWaits(false);
  const cap = setTimeout(done, provided("routeWaitMs") ?? ROUTE_WAIT_MS);
  void read.finally(() => {
    clearTimeout(cap);
    done();
  });
  return () => {
    clearTimeout(cap);
    done();
  };
};

/**
 * On a phone where the frame's bar stands, the three leave their circle in one arc, up and then across, and land in AI's
 * home by the field (Today, calm, D9; kit/motion/arc.ts). Whether they came from the circle: else they come from the button.
 */
function arRiseFromDisc(to: HTMLElement | null): boolean {
  const disc = arDocked() ? arDiscBox() : null;
  if (!disc) return false;
  const face = to ? to.querySelector<HTMLElement>("canvas") : null;
  if (to && face && !arStill()) {
    const box = face.getBoundingClientRect();
    const fit = MASCOT.fitSide;
    const scale = box.width && box.height ? fit(disc.width, disc.height) / fit(box.width, box.height) : 1;
    void moveAlongArc({ outer: to, inner: face }, { from: disc, to: box }, { ms: AR_FLY_MS, way: "rise", scale });
  }
  return true;
}

/**
 * Elsewhere the three move from the button into the line (a FLIP): centre to centre, since a box scales about its centre,
 * less the way a desk's panel has still to slide in; and scaled by the three's own size in each box (the mascot's
 * fitSide), since the hero's stage is far wider than they are, and its width alone started them smaller than the
 * button's and popped them up. With reduced motion they are simply here.
 */
function arFlipFromButton(to: HTMLElement | null): void {
  const from = arFaceFrom();
  if (!from || !to || !to.animate || arStill()) return;
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const box = to.closest ? to.closest(".ask-line") : null;
  const slid =
    box && window.getComputedStyle
      ? parseFloat(String(window.getComputedStyle(box).translate || "0").split(" ")[0] ?? "") || 0
      : 0;
  const fit = MASCOT.fitSide;
  const dx = start.left + start.width / 2 - (end.left - slid + end.width / 2);
  const dy = start.top + start.height / 2 - (end.top + end.height / 2);
  const scale = end.width && end.height ? fit(start.width, start.height) / fit(end.width, end.height) : 0;
  if (scale)
    to.animate(
      [
        { translate: `${dx}px ${dy}px`, scale: `${scale}` },
        { translate: "0 0", scale: "1" },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
}

/** Open, and the language changing while it is open: what the AI noticed, read in that language. */
const useArNotices = ({ lang, open, A, setNoticeWaits }: Pick<Line, "lang" | "open" | "A" | "setNoticeWaits">) => {
  useEffect(() => {
    if (!open || !A?.readNotices) return;
    const noticeLang = lang ?? "en";
    return arNoticeWait(A.readNotices(noticeLang), A.holdsNotice(noticeLang), setNoticeWaits);
  }, [open, A, lang, setNoticeWaits]);
};

/** What opening does: the route's scope, the threads and the surfaces the rows read, and the three coming in from the button. */
export const useArOpen = ({
  lang,
  open,
  A,
  route,
  openedAt,
  setScope,
  threadsReady,
  setThreads,
  setTick,
  setNoticeWaits,
  faceRef,
}: Line) => {
  // Open: the route's scope, the threads, and the surfaces the rows read (Right now reads Today's and Broadcasts').
  useEffect(() => {
    if (!open || !A) return;
    openedAt.current = Date.now();
    const r = arRoute();
    setScope(A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param)));
    threadsReady.current = A.threads().then((list) => {
      setThreads(list);
      return list;
    });
    if (A.readFollowUps) void A.readFollowUps();
    const bump = () => setTick((n) => n + 1);
    const evs = [
      "surface:inbox",
      "surface:live",
      "surface:clients",
      "surface:settings",
      "surface:today",
      "surface:broadcasts",
      "ask:follow-ups",
    ];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, [open, A, openedAt, setScope, threadsReady, setThreads, setTick]);

  useArNotices({ lang, open, A, setNoticeWaits });

  // Open, and the page under the Line changing while it is open: the page is warmed (POST ask/warm; bridge/ask/api.ts),
  // so the server has read the rows on screen before the question comes. Never waited on; a page that cannot say what it
  // holds, or a warm that fails, costs nothing.
  useEffect(() => {
    if (!open || !A || !A.warm || !A.context) return;
    // A tick later, so a page that has just come under the Line has said what it drew (bridge/ask/context.ts).
    const id = setTimeout(() => {
      try {
        Promise.resolve(A.warm(A.context(arRoute()))).catch(() => {});
      } catch {
        /* the question still goes */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [open, A, route.page, route.param]);

  // Open: the three move from the button into the line (a FLIP), and the button's own face hides while they stand here
  // (ask.css, body.ask-open), so there is one character. With reduced motion they are simply here.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const body = document.body;
    if (body && body.classList) body.classList.add("ask-open");
    const to = faceRef.current;
    if (!arRiseFromDisc(to)) arFlipFromButton(to);
    return () => {
      if (body && body.classList) body.classList.remove("ask-open");
    };
  }, [open, faceRef]);

  // On a desk the page beside the panel is live: as it moves (a press there, or an answer's Open), the scope follows it,
  // so the next question is about what is on screen. A phone's takeover covers the page, which does not move under it.
  useEffect(() => {
    if (!open || !A || arPhone()) return;
    setScope(A.scopeFor(route.page, route.param, arScopeLabel(route.page, route.param)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the page moving moves the scope: the Line's opening sets its own (useArOpen, above)
  }, [route.page, route.param]);
};

/** Closing: Back on a phone, a press outside a desk's panel, and what the Line forgets once closed. */
export const useArClose = ({ open, onClose, setQuick, setDoomed, setView, speech, pushed, dialogRef }: Line) => {
  // Back closes the takeover (S8); whether the entry is ours is `pushed` (useArLine), and going somewhere takes it for
  // the place (nav). A desk's panel closes on a press outside it, which goes on to what it was on (Ruben, 16 Oct 2026:
  // "users can click away and it closes"). Both are ../hooks.ts's.
  useAskBack(open && arPhone(), pushed, onClose);
  useAskPressAway(open && !arPhone(), dialogRef, arOverAsk(), onClose);

  // Closed: nothing keeps reading or talking and the rows are home again; the words typed and an open conversation
  // come back until Clear (D14, S9).
  useEffect(() => {
    if (!open) {
      setQuick(null);
      setDoomed(null);
      setView("rows");
      speech.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once as the Line closes, with the speech of that draw; the setters do not change
  }, [open]);
};

// The draft and the conversation's id, kept in the tab (bridge/tab-memory.ts) so a reload keeps them too (S9):
// the words as typed, never on a timer (record-fold.jsx useUnsavedWork), forgotten when the field empties while open;
// the Line is made closed, so being made forgets nothing. The id whenever a thread is opened or made, forgotten when
// the conversation ends (Clear, or deleted), never by the Line being made, or when the kept one cannot be read, so a
// thread that will not read does not flash on every open.
export const useArMemory = ({ open, A, query, setQuery, active, asked, openThread }: Line) => {
  const threadWas = useRef<string | null>(null);
  // Open: what the tab kept comes back. A kept conversation is read first and the words go back after it, since
  // opening a thread empties the field; a request the shell sent as it opened (asked) wins over a kept conversation.
  useEffect(() => {
    const m = tabMemoryOfWindow();
    if (!open || !A || !m) return;
    const kept = m.draft("ask");
    const words = typeof kept === "string" && kept && !query ? kept : null;
    const th = m.draft("ask-thread");
    if (typeof th === "string" && th && !active && !asked.current)
      void openThread({ id: th }).then((o) => {
        if (!o) m.dropDraft("ask-thread");
        if (words) setQuery(words);
      });
    else if (words) setQuery(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once each opening, with what that draw holds: a later change is not what the tab kept
  }, [open]);
  useEffect(() => {
    const m = tabMemoryOfWindow();
    if (!m) return;
    if (query.trim()) m.keepDraft("ask", query);
    else if (open) m.dropDraft("ask");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the words change, never as the Line opens or closes: being made forgets nothing
  }, [query]);
  // As the conversation's id changes, not each message of it.
  const id = active ? active.id : null;
  const conversing = !!active;
  useEffect(() => {
    const m = tabMemoryOfWindow();
    const had = threadWas.current;
    threadWas.current = id;
    if (!m) return;
    if (id) m.keepDraft("ask-thread", id);
    else if (!conversing && had) m.dropDraft("ask-thread");
  }, [id, conversing]);
};

/** Where focus goes: the field on a desktop, the dialog on a phone or any touch screen, the field again after "Type instead"; a phone's dialog holds it (trapFocus), a desk's panel shares it with the page beside it. */
export const useArFocus = ({
  A,
  open,
  doomed,
  live,
  active,
  view,
  quick,
  inputRef,
  dialogRef,
  talk,
  typing,
  away,
  dock,
}: Line) => {
  const phone = arPhone();
  // The field with a mouse and keys; else the dialog, so no keyboard rises until a tap asks (S10; focusAsDrawn).
  const field = !phone && (!A || !A.focusAsDrawn || A.focusAsDrawn());
  // On a desk, once the member works in the page (focus left the panel) the field leaves them there as answers land,
  // until they come back to the panel (../hooks.ts useAskAway).
  useAskAway(open && !phone, dialogRef, away);
  // A press on a card leaves focus on what became of it (AskCard), which the card's outcome must not take away.
  const onCard = () => !!document.activeElement?.closest?.(".ask-job");
  useAskFocus(
    inputRef,
    open && !doomed && field,
    [open, live, active, doomed, view, quick],
    () => !away.current && !onCard(),
  );
  useAskFocus(dialogRef, open && !field, [open]);
  // A phone's takeover keeps Tab inside it; a desk's panel lets Tab go on to the page, and as it closes gives focus back
  // to what had it before it opened, unless the member has put it somewhere since (../hooks.ts useAskGiveBack).
  // On the frame's bar its field and its press are outside the dialog, and the page under it is taken away by the frame:
  // focus is held and given back as ever, and Tab goes on from the dialog to the field and the circle.
  const docked = !!dock;
  useEffect(
    () => (open && phone && dialogRef.current ? trapFocus(dialogRef.current, { wrap: !docked }) : undefined),
    [open, phone, dialogRef, docked],
  );
  useAskGiveBack(open && !phone, dialogRef);
  // Listening ended after "Type instead": the words heard are in the field, and the field takes focus to finish them.
  useEffect(() => {
    if (talk.listening || !typing.current) return;
    typing.current = false;
    if (inputRef.current) inputRef.current.focus();
  }, [talk.listening, typing, inputRef]);
};
/** What the shell sends as it opens the Line, and the keys anywhere in it. */
export const useArSeedKeys = ({
  open,
  A,
  onClose,
  live,
  view,
  asked,
  setTick,
  setView,
  setScope,
  setActive,
  setQuick,
  setQuery,
  stop,
  openThread,
  submit,
}: Line) => {
  // What the shell sends as it opens the Line: a question to ask or to finish, or a thread to open (`askAbout({ thread })`, any caller). The
  // shell opens and sends in the same moment, so the Line listens while closed too and keeps the last request.
  useEffect(() => {
    const onSeed = (e: CustomEvent<AskedSeed>) => {
      takeAskedOfTheLine();
      asked.current = e.detail || {};
      setTick((n) => n + 1);
    };
    window.addEventListener("ask:seed", onSeed);
    // A door pressed before this code landed: it kept what it asked.
    const waiting = takeAskedOfTheLine();
    if (waiting) {
      asked.current = waiting;
      setTick((n) => n + 1);
    }
    return () => window.removeEventListener("ask:seed", onSeed);
  }, [asked, setTick]);

  const beside = useAskEscBeside(open && !!A);
  useEffect(() => {
    if (!open || !A) return;
    // Anywhere in the Line, not only on the line: ⌘J (or Ctrl J) opens Earlier, before the browser's Downloads can; Esc
    // stops a turn in flight, else steps back out of Earlier, else closes. The line takes Esc first when it has focus
    // (onKey), a desk's panel next (panelKeys), and one pressed in the page beside it is Ask's if `beside` says so.
    const onKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setView((v) => (v === "earlier" ? "rows" : "earlier"));
        return;
      }
      if (e.key === "Escape" && !e.defaultPrevented && (arPhone() || beside.current))
        arEscape({ live, stop, view, setView, onClose });
    };
    window.addEventListener("keydown", onKeys);
    // Taken once open, after the route's own scope, so a request's scope wins.
    const d = asked.current;
    if (d) {
      asked.current = null;
      const r = arRoute(),
        chip = d.about
          ? typeof d.about === "object"
            ? d.about
            : null
          : A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param));
      if (d.about) setScope(chip);
      const prompt = askedWords(d, A.language());
      if (d.thread) void openThread({ id: d.thread });
      else if (d.mode === "compose" || !prompt) {
        setActive(null);
        setQuick(null);
        setQuery(prompt || "");
      } else void submit(prompt, chip, d.fresh ? { fresh: true } : undefined); // the chip this opening shows: `scope` is still the last opening's until the next draw; a page's own search (`fresh`) its own conversation
    }
    return () => window.removeEventListener("keydown", onKeys);
  });
};

/** Where the keys stand: back to the top whenever what is under the line changes, and kept in sight as they move. */
export const useArWalk = ({ query, active, open, view, quick, live, setSel, setMove, bodyRef, sel, move }: Line) => {
  // A new place to stand whenever what is under the line changes; not on every piece of a streaming answer, so `running`
  // and never `live`.
  const running = !!live;
  useEffect(() => {
    setSel(0);
    setMove(-1);
  }, [query, active, open, view, quick, running, setSel, setMove]);
  // Earlier and the home start at their top; in a thread the newest question stands at its top, once per question or
  // conversation, never again as its answer lands (D5, D10). The row or move the keys stand on stays in sight.
  const fromTop = view !== "rows" || !(active || quick);
  const said = active ? active.messages.length : 0;
  useEffect(() => {
    if (bodyRef.current && fromTop) bodyRef.current.scrollTop = 0;
  }, [said, quick, view, fromTop, bodyRef]);
  useAskPin(bodyRef, arNowKey(active, quick), open && view === "rows" && !!(active || quick));
  useEffect(() => {
    const b = bodyRef.current;
    if (!b || !("querySelector" in b)) return;
    const el = b.querySelector<HTMLElement>(".ask-row.sel, .line-chip.sel, .ask-item.sel, .ask-open.sel");
    if (!el || !el.getBoundingClientRect) return;
    const top = el.getBoundingClientRect().top - b.getBoundingClientRect().top - b.clientTop + b.scrollTop,
      h = el.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = Math.max(0, top - 8);
    else if (top + h > b.scrollTop + b.clientHeight) b.scrollTop = top + h - b.clientHeight + 8;
  }, [sel, move, bodyRef]);
  useAskScrollCues(bodyRef, open); // its bar while it scrolls, its top edge faded once scrolled (../hooks.ts)
};
