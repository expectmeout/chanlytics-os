/**
 * The kit's strip of views (kit.css, `.stabs`; docs/superpowers/specs/2026-10-08-one-motion-for-every-strip-design.md):
 * the few views a page is, side by side on one capsule, the picked one lit. The Inbox's Needs you, Conversations and
 * Live; People's scopes; Reports' lenses. It is the page, not something on it: a page's
 * own sub-menu is the SubTabs (../sub-tabs/sub-tabs.tsx), a line of words under this.
 *
 * A view has an address, so a tab is a link (the shell's "a door is a link"): a long press, a middle click or a new
 * tab opens that view, and a plain press is the app's own move. Never Base UI's Tabs, which are buttons over panels.
 *
 * A press answers before the page it asks for is drawn. The tab lights (the address moves a beat later, when the
 * router lands), the highlight starts toward it and the page on screen starts leaving (kit/motion/view-deck.ts), and
 * only then, a painted frame on, the address moves: a page drawn in one long piece began before the browser had
 * painted, and the tab lit only with the page (5 Oct 2026). A page that may not be left yet says so (`mayLeave`), and
 * then nothing moves but the page's own question.
 *
 * It draws what the shell's SurfaceTabs drew, which is now the frame's adapter over this (legacy/components/
 * frame/surface-tabs.tsx), with one element more: the highlight a change of view carries (./glide.ts). `className` is for
 * the page's layout, and comes last.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { viewDeck } from "../motion/view-deck";
import { cx } from "../variants";
import { afterPaint } from "./after-paint";
import { glideTo, showPicked } from "./glide";

/** How long a tab pressed stays lit while the address has not followed, before the strip says where it is again. */
const PENDING_MS = 3000;

/** A view: its address and its words, and what it may say beside them. */
export type ViewTab = {
  id: string;
  label: string;
  /** Its address. */
  href: string;
  /** A figure beside its words, where it has one to say; none is said for a zero. */
  count?: number | null;
  /** The figure counts people who need you. */
  tone?: "warn";
  /** Something is happening there now: a call on the line. */
  live?: boolean;
  /** Something there needs you: an amber dot after its figure, named by these words for a screen reader. */
  need?: string;
  /** What the view is, on hover. */
  tip?: string;
  testid?: string;
  /** Start its read: called as a pointer, a finger or the keyboard reaches the tab. */
  warm?: () => void;
};

/** A strip of views: which strip it is, its name, the one picked, the views, and what picking another does. */
export type ViewTabsProps = {
  /** Which strip, as a word: the strip wears `stabs-<name>`. */
  name: string;
  /** What the strip is, to a screen reader ("Which report"). */
  label: string;
  picked: string;
  tabs: readonly ViewTab[];
  /** Move to a view. Called for the picked one too, whose address lets go of what was picked inside it. */
  onPick: (id: string) => void;
  /** Whether the page on screen may be left now. Where it answers no, nothing moves and `onPick` hears the press. */
  mayLeave?: () => boolean;
  /**
   * The strip is as wide as its column, its tabs in equal shares (a person's tabs on a phone, canvas A), and wears the
   * control layer's rim and blur at every width, since the page moves behind it.
   */
  fill?: boolean;
  testid?: string;
  className?: string;
};

/** A plain press of the main button: one with a key held, or another button, is the browser's own. */
const ownPress = (e: MouseEvent) =>
  !(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

/** A strip of views, one picked. A strip of one view draws nothing. */
export function ViewTabs({ name, label, picked, tabs, onPick, mayLeave, fill, testid, className }: ViewTabsProps) {
  // The tab pressed, lit until the address says it is the page's own.
  const [pending, setPending] = useState<string | null>(null);
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    setPending(null);
  }, [picked]);
  useEffect(() => {
    if (pending === null) return undefined;
    const t = setTimeout(() => setPending(null), PENDING_MS);
    return () => clearTimeout(t);
  }, [pending]);
  const lit = pending ?? picked;
  const shown = tabs.map((tab) => tab.id).join(" ");
  // Before the strip is painted, so it never shows at its start and then jumps; and again when its views change.
  useLayoutEffect(() => {
    showPicked(strip.current);
  }, [lit, shown]);
  // And again when the strip's own width changes under it: the scroll was worked out for the width it had, and a control
  // drawn beside it later narrows it (Reports' lenses beside the period on a phone left Reviews 10px past the edge,
  // 17 Oct 2026).
  const drawn = tabs.length >= 2;
  useEffect(() => {
    const el = strip.current;
    if (!drawn || !el || typeof ResizeObserver === "undefined") return undefined;
    const sized = new ResizeObserver(() => showPicked(el));
    sized.observe(el);
    return () => sized.disconnect();
  }, [drawn]);
  if (!drawn) return null;

  const press = (e: MouseEvent<HTMLAnchorElement>, tab: ViewTab) => {
    if (!ownPress(e)) return;
    e.preventDefault();
    const from = tabs.findIndex((t) => t.id === lit);
    const to = tabs.findIndex((t) => t.id === tab.id);
    if (tab.id === picked && pending !== null) {
      // Pressed back to the page it is on while another was on its way: that page is not coming.
      viewDeck.stay();
      setPending(null);
    } else if (tab.id !== picked && from !== to && from >= 0 && (!mayLeave || mayLeave())) {
      const move = viewDeck.leave(to > from ? 1 : -1);
      const was = strip.current ? strip.current.querySelector<HTMLElement>(".stabs-tab.active") : null;
      if (strip.current && was && e.currentTarget) glideTo(strip.current, was, e.currentTarget, move);
      setPending(tab.id);
    }
    afterPaint(() => onPick(tab.id));
  };

  return (
    <nav
      ref={strip}
      className={cx("stabs", `stabs-${name}`, className)}
      aria-label={label}
      {...(fill ? { "data-fill": "true" } : {})}
      data-testid={testid}
    >
      <span className="stabs-pill" aria-hidden="true" />
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={cx("stabs-tab", lit === tab.id && "active")}
          aria-current={picked === tab.id ? "page" : undefined}
          data-testid={tab.testid}
          data-tip={tab.tip}
          data-tip-side={tab.tip ? "bottom" : undefined}
          onPointerEnter={tab.warm}
          onTouchStart={tab.warm}
          onFocus={tab.warm}
          onClick={(e) => press(e, tab)}
        >
          {tab.label}
          {tab.live ? <span className="live-dot" /> : null}
          {tab.count ? (
            <span
              className={cx("stabs-badge tally", tab.tone === "warn" && "tally-warn")}
              data-tone={tab.tone ?? "plain"}
            >
              {tab.count}
            </span>
          ) : null}
          {tab.need ? <span className="subtab-dot is-warn" role="img" aria-label={tab.need} /> : null}
        </a>
      ))}
    </nav>
  );
}
