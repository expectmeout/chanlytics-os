/**
 * The role gate (moved from legacy/components/data-bits.jsx, the one-system plan's step 2). gate(action, doing?) spreads
 * onto a committing control's opening tag AFTER its handlers. Allowed -> {}. Denied -> the control stays on the page and
 * in the tab order, says why on hover, on focus and when pressed, and does nothing. It used to return `disabled` and a
 * `title`: a disabled button takes no focus and fires no hover, so the reason reached no keyboard, no finger and most
 * pointers (A7). The words are contracts' (refusal.ts roleGate, through the bridge): the same no the server's refusal
 * gives after a press. `doing` names what this control does where the permission's own words would mislead -- snoozing
 * is an `approve` act. Engine fns double-guard with canDo(action) so hotkeys and bulk paths respect roles.
 *
 * Each reads the role store (identity.ts), the gate's words and the tip off the window when it is asked, as the JSX did: a
 * test stands in for any of them there, until the gates are imported everywhere (the one-system plan, step 9).
 */
import type { Role } from "@chanlytics/contracts";
import type { GateProps } from "../legacy-verbs";

/** Whether the role acting may do a permission's act: with no role store, it may. */
export const canDo = (a: string): boolean => {
  const store = window.ST_STORE;
  return !store || store.can?.(a) === true;
};

/** Whether the member, as they are acting (View-as included), stands on this rung or above it; with no store, no. */
export const mayAtLeast = (rung: string): boolean => {
  const store = window.ST_STORE;
  return !!(store && store.mayAtLeast && store.mayAtLeast(rung as Role));
};

/** Why the role acting may not do it, in contracts' words. */
export const gateTitle = (a: string, doing?: string): string => {
  const said = window.__roleGate
    ? window.__roleGate(
        window.ST_STORE ? window.ST_STORE.myRole() : "viewer",
        a as Parameters<typeof window.__roleGate>[1],
        doing,
      )
    : null;
  return said ? said.reason : "Your role can't do this.";
};

/**
 * A control that refuses: focusable, described, and inert. Every handler that would act is replaced -- the click; Enter
 * and Space, which would also reach a row's own key handler; a hold's pointer and key-up events -- and pressing it shows
 * the reason at the control, which is how a finger gets to read it.
 */
export const gatedProps = (reason: string): GateProps => {
  const refuse = (e: { preventDefault: () => void; stopPropagation: () => void; currentTarget: Element }) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.__tip) window.__tip.show(e.currentTarget);
  };
  return {
    disabled: false,
    title: undefined,
    "aria-disabled": true,
    "aria-description": reason,
    "data-tip": reason,
    "data-gated": "",
    onClick: refuse,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") refuse(e);
    },
    onKeyUp: undefined,
    onPointerDown: undefined,
    onPointerUp: undefined,
    onPointerLeave: undefined,
    onPointerCancel: undefined,
  };
};

/** What a role gate spreads onto a control: nothing where the role may act, `gatedProps` with its reason where not. */
export const gate = (a: string, doing?: string): GateProps => (canDo(a) ? {} : gatedProps(gateTitle(a, doing)));
