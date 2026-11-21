/**
 * Keys on a desk (Working for you, 21 Nov 2026, W12): the same acts as a held line on a phone, nothing new to learn. J and
 * K move between the page's lines, Enter opens the one in focus, and E, N and / are its Done, Not now and Ask AI about
 * this (held.tsx, on the line itself). They are listed where every key of the app is, the ? sheet (contracts SHORTCUTS,
 * under Today), and drawn nowhere on the page (Ruben, 23 Sep 2026). Never while words are being typed, with a modifier
 * held, or while anything is open over the page: a sheet's own keys are its own.
 */
import { useEffect } from "react";
import { typing } from "./held";

/** The page's lines a key can move to: each line's own press, open and in reach (none folded or shut away). */
const LINE_PRESS = '.calm .calm-line:not([data-folded]) > .calm-fold > :is(a, [role="button"])';

/** Anything open over the page: a sheet, a menu, AI. The page's keys wait for it to shut. */
const OVER_THE_PAGE = '[role="dialog"], [role="menu"], [aria-modal="true"]';

function linesInReach(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(LINE_PRESS)].filter((el) => !el.closest("[inert]"));
}

/** Focus the next line (1) or the one before (-1), from the line in focus, else from the page's start. */
function moveFocus(by: 1 | -1): void {
  const lines = linesInReach();
  if (!lines.length) return;
  const at = lines.findIndex((el) => el === document.activeElement || el.contains(document.activeElement));
  const next = at < 0 ? (by > 0 ? 0 : lines.length - 1) : Math.min(lines.length - 1, Math.max(0, at + by));
  const line = lines[next];
  line?.focus();
  line?.scrollIntoView({ block: "nearest" });
}

/** J and K, heard on the desk's Today. It draws nothing. */
export function TodayKeys(): null {
  useEffect(() => {
    const heard = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((key !== "j" && key !== "k") || e.defaultPrevented || e.shiftKey || typing(e)) return;
      if (document.querySelector(OVER_THE_PAGE)) return;
      e.preventDefault();
      moveFocus(key === "j" ? 1 : -1);
    };
    document.addEventListener("keydown", heard);
    return () => document.removeEventListener("keydown", heard);
  }, []);
  return null;
}
