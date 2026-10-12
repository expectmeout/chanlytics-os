/**
 * The motion grammar's wash (decision 0052, canvas A §2): a value someone else changed while the page is open takes a
 * lozenge fill that fades over 1.6 s, and is said once, politely. Nothing moves, and nothing washes on the first paint, on
 * a move to another record (its `scope`), or after the reader's own press: a change within a few seconds of a press or a
 * key of theirs is their own act answering, which the act already says. Under reduced motion it is a short cross-fade
 * (kit.css, "Wash").
 *
 * `useWash` is the rule, for a part of the kit that draws its own value (the Figure's `wash`); `Wash` is the span a page
 * puts around a value of its own. The announcement is one polite region on the body, shared by every wash, so two values
 * changing at once are read one after the other rather than over each other.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "../variants";

/** How long the fill takes to fade. */
const WASH_MS = 1600;
/** A change this soon after the reader's own press or key is theirs. */
const OWN_MS = 4000;

let lastPressMs = 0;
let listening = false;

/** The reader's last press or key, anywhere on the page: what tells their own act from someone else's change. */
function hearPresses(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  const pressed = () => {
    lastPressMs = Date.now();
  };
  document.addEventListener("pointerdown", pressed, true);
  document.addEventListener("keydown", pressed, true);
}

let region: HTMLElement | null = null;

/** Said once, politely, in the one region every wash shares. */
function sayPolitely(words: string): void {
  if (typeof document === "undefined" || !document.body) return;
  if (!region || !region.isConnected) {
    region = document.createElement("span");
    region.className = "rec-sr";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  region.textContent = words;
}

/**
 * Whether a value is washing: it changed since the last draw of the same record, nobody here pressed anything just now,
 * and the fill has not faded yet. `said` is what the region says of it; none says nothing.
 */
export function useWash(scope: string, value: string, said: string | null): boolean {
  const [on, setOn] = useState(false);
  const seen = useRef<{ scope: string; value: string } | null>(null);
  useEffect(() => {
    hearPresses();
    const was = seen.current;
    seen.current = { scope, value };
    if (!scope || !was || was.scope !== scope || was.value === value) return undefined;
    if (Date.now() - lastPressMs < OWN_MS) return undefined;
    setOn(true);
    if (said) sayPolitely(said);
    const fade = setTimeout(() => setOn(false), WASH_MS);
    return () => {
      clearTimeout(fade);
      setOn(false);
    };
  }, [scope, value, said]);
  return on;
}

/** A page's own value, washed when someone else changes it while the page is open. */
export function Wash({
  scope,
  value,
  said,
  className,
  children,
}: {
  /** The record it belongs to: a move to another record is a first paint, never a change. */
  scope: string;
  /** What is compared: the value as said. */
  value: string;
  /** What the polite region says of it; none says nothing. */
  said: string | null;
  className?: string;
  children: ReactNode;
}) {
  const on = useWash(scope, value, said);
  return (
    <span className={cx("wash", className)} data-wash={on ? "true" : undefined}>
      {children}
    </span>
  );
}
