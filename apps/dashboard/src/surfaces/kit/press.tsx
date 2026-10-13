/**
 * What a press of the kit's is, decided once for the Button and the LinkButton
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4): one that acts where it stands is a <button>, of type
 * button unless a form's own is asked for; one that opens a page of its own is a link, its address in the href, so a
 * long press, a middle click or a new tab opens it too (the shell's "a door is a link", data-bits `routeDoor`). The
 * element is chosen where the press is written, by an address or none, since each takes its own attributes and ref.
 */
import type { ComponentPropsWithRef } from "react";

/** A press that acts where it stands: a <button>, which submits a form only when `type` asks it to. */
export type PressAct = ComponentPropsWithRef<"button"> & { href?: undefined };

/** A press that opens a page of its own: a link, which is never disabled, since a door that goes nowhere is none. */
export type PressDoor = ComponentPropsWithRef<"a"> & { href: string };

/**
 * Where a press's work begins: after the frame that answers it has been painted, where there are frames. The frame's
 * callback, then a message, which runs once that frame is on the screen: a strip's tab and a tab bar's place light
 * first, and only then is the page they ask for drawn (a page drawn in one long piece began before the browser had
 * painted, and the tab lit only with the page: 5 Oct 2026). Never a timer: while a finger is down on a page that listens
 * to touches, a browser holds timers back until it knows the touch is no scroll (Chromium, about 100 ms: the tab bar's
 * move waited for the lift, measured 12 Oct 2026), and a message it runs at once.
 */
export function afterPaint(then: () => void): void {
  if (typeof requestAnimationFrame !== "function" || typeof MessageChannel !== "function") {
    then();
    return;
  }
  requestAnimationFrame(() => {
    const next = new MessageChannel();
    next.port1.onmessage = () => {
      next.port1.close();
      then();
    };
    next.port2.postMessage(0);
  });
}

/** The element a press is, with the classes its component gives it. */
export function Press(props: (PressAct | PressDoor) & { className: string }) {
  if (props.href !== undefined) {
    const { children, ...door } = props;
    return <a {...door}>{children}</a>;
  }
  const { children, type = "button", href: _none, ...act } = props;
  return (
    <button {...act} type={type}>
      {children}
    </button>
  );
}
