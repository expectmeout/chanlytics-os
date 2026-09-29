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
