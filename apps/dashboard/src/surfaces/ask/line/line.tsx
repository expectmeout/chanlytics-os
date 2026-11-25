/**
 * AskReal: Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6, and the Stage's,
 * docs/superpowers/specs/2026-09-23-ask-the-stage-design.md, section 5), one layout everywhere: a head, the three large in a
 * hero that a held press talks to, the rows (home, typing, Earlier) or a conversation as one thread (the spec
 * 2026-09-27-ask-chat-on-a-phone), each answer Say · Show · Do (../turn.tsx), and the field at the foot. Reopening resumes the
 * conversation and the words typed until New; the tab keeps both across a reload (S9).
 * On a phone it is the whole screen, and ×, Esc, a pull down and Back close it. On a desk it is a panel of glass docked at the
 * right, the sidebar's twin, over a page that keeps its layout and stays the member's (Ruben, 16 Oct 2026): ×, Esc and a press
 * outside close it, that press going on to what it was on; an answer that opens a place moves the page there with Ask still
 * open; and the keys pressed in either are that one's own, an Esc the page has no use for being Ask's.
 * This folder is the shell: the state of one open Line (state.ts), its keys and hooks (hooks.tsx), the turn runner (turns.tsx). The
 * rows are ../home.tsx's, the words ../words.ts's and the hooks ../hooks.ts's; everything that talks to the workspace goes
 * through askCalls(). No key symbol is drawn (D17): the shortcuts sheet lists the keys (contracts SHORTCUTS), opened by ? or
 * the account menu.
 */
import { useLayoutEffect } from "react";
import { sayAskDocked, useAskDock } from "@/bridge/ask/dock";
import { useRootFlag } from "../../kit/motion/root-flags";
import { MASCOT } from "@/bridge/mascot";
import { useAskFoot, useAskGrow, useAskLatest, useAskWarm } from "../hooks";
import { askCalls } from "../shell";
import { askText } from "../words";
import { arActs } from "./acts";
import { arAttach, useArDrop } from "./attached";
import { arBody, arFoot, arHero, arLineEnd, arLineView } from "./draw";
import {
  useArClose,
  useArFocus,
  useArMemory,
  useArMood,
  useArOpen,
  useArSeedKeys,
  useArSlide,
  useArVoice,
  useArWalk,
} from "./hooks";
import { arDocked, arPhone, arRoute } from "./place";
import { useArLine } from "./state";
import { arSubmitter } from "./turns";
import type { Line } from "./types";
import { arActivate, arHeroState, arOnKey, arUnder } from "./under";

/** How tall the field's room on the frame's bar is, said to the Line's window as --ask-room while the Line stands on the bar. */
const useAskRoom = (room: HTMLElement | null, dialog: Line["dialogRef"]) => {
  useLayoutEffect(() => {
    const box = dialog.current;
    if (!room || !box || typeof ResizeObserver !== "function") return undefined;
    const fit = () => box.style.setProperty("--ask-room", `${room.offsetHeight}px`);
    const seen = new ResizeObserver(fit);
    seen.observe(room);
    fit();
    return () => {
      seen.disconnect();
      box.style.removeProperty("--ask-room");
    };
  }, [room, dialog]);
};

// ---- The Line -------------------------------------------------------------------------------------------------------
// `ln` is the Line as drawn so far: the props and parts, the state, the acts, then what each hook and builder above
// returns; every hook before the early return, the rest only while the Line is open. The acts call no hook, so they are
// made before the hooks that call them (a heard question, a kept or seeded thread, Esc), closed or open.
export const AskReal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const A = askCalls();
  // Ask's face: the one mood every face follows (bridge/mascot mood.ts), standing in the line.
  const ln = { open, onClose, A, M: MASCOT, ...useArLine(A) } as Line;
  ln.t = askText(ln.lang);
  const route = arRoute();
  ln.route = route;
  // With the param: Leads is People's `leads` param, and the Line on it is the finder (spec F2, F3).
  ln.surface = A ? A.surfaceFor(route.page, route.param) : "other";
  Object.assign(ln, arAttach(ln));
  Object.assign(ln, arActs(ln));
  const { dropping, ...dropProps } = useArDrop(ln.attach);
  ln.dropping = dropping;
  ln.dropProps = dropProps;
  // On a phone where the frame's bar stands, the field and the one press are drawn in the frame's rooms: the Line says
  // it is here, and the frame folds its bar and hands the rooms over (bridge/ask/dock.ts). Known
  // before the hooks, which hold focus and fly the three by it.
  const dock = useAskDock();
  const docked = open && !!A && arDocked();
  useLayoutEffect(() => {
    if (!docked) return undefined;
    sayAskDocked(true);
    return () => sayAskDocked(false);
  }, [docked]);
  ln.dock = docked ? dock : null;
  // The bar grows with what its field holds (a question of several lines): the Line keeps that much room at its foot, so
  // nothing of it stands under the bar (ask.css --ask-room).
  useAskRoom(docked ? dock.field : null, ln.dialogRef);
  ln.submit = arSubmitter(ln);
  Object.assign(ln, useArVoice(ln));
  useAskWarm(ln); // and a question on its way warms the model's cache (../hooks.ts)
  useArMood(ln);
  useArSlide(ln);
  useArOpen(ln);
  useArClose(ln);
  useArMemory(ln);
  useArFocus(ln);
  useArSeedKeys(ln);
  useArWalk(ln);
  useAskGrow(ln.inputRef, ln.query, open); // the field grows with its words, to six lines (../hooks.ts)
  ln.below = useAskLatest(ln.bodyRef, open && ln.view === "rows" && !!(ln.active || ln.quick));
  useAskFoot(ln.bodyRef, open && ln.view === "rows" && !!(ln.active || ln.quick)); // a card's foot in reach (../hooks.ts)
  // Open on a phone with a field of its own, the Line holds the page (aria-modal, draw.tsx): said on the document's root
  // (kit/motion/root-flags.ts).
  useRootFlag("modalOpen", open && !!A && arPhone() && !docked);

  if (!open || !A) return null;
  ln.phone = arPhone();
  Object.assign(ln, arUnder(ln));
  ln.activate = arActivate(ln);
  ln.onKey = arOnKey(ln);
  Object.assign(ln, arLineEnd(ln));
  ln.body = arBody(ln);
  Object.assign(ln, arHeroState(ln));
  ln.hero = arHero(ln);
  ln.foot = arFoot(ln);
  return arLineView(ln);
};
