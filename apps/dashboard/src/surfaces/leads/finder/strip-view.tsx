/**
 * The strip above the table (moved from legacy/pages/leads-finder.jsx, decision 0015): running, checking, the question
 * after 25 in the accent with role="alert", or one of the nine endings (sections 8.4, 8.5, 8.8). Every word it says is
 * leadStrip's (strip.ts), so nothing is spelled here; every button hands its id and its argument back through the one
 * onAction the page gives it, and presses nothing itself.
 *
 * Two lines at most (Ruben, 16 Nov 2026, "cleaner, less redundant"): what is happening and its one act, then what it has
 * counted beside where its adds go (`foot`, the page's Adds go to), so a running search is one block, not four lines.
 */
import type { ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import type { StripVM } from "./types";

const QUIET = [
  "undo",
  "excluded",
  "review",
  "stop",
  "stop_here",
  "sort_fit",
  "take_offered",
  "not_now",
  "not_on_renewal",
];

/** The strip's classes: its tone (a question asks, a round that ended is done), whether it holds the band and a second line. */
const stripClassOf = (vm: StripVM, band: boolean, second: boolean): string => {
  const tone = vm.state === "question" ? "ask" : vm.state === "found" || vm.state === "ended" ? "done" : "";
  return `lf-strip ${tone}${band ? " has-band" : ""}${second ? " has-foot" : ""}`;
};

/**
 * The strip's second line: the count a phone reads from across a room (D9 of the answers canvas; a desk's parts say it),
 * then where the search's adds go. Nothing where it has neither.
 */
const StripFoot = ({ count, foot }: { count: StripVM["count"]; foot: ReactNode }) => {
  if (!count && !foot) return null;
  return (
    <span className="lf-strip-foot" data-testid="strip-foot">
      {count ? (
        <span className="lf-strip-count" data-testid="strip-count">
          <b>{count.n}</b> of {count.of}
        </span>
      ) : null}
      {count && foot ? (
        <span className="lf-strip-sep" aria-hidden="true">
          ·
        </span>
      ) : null}
      {foot}
    </span>
  );
};

export const LeadStrip = ({
  vm,
  onAction,
  children = null,
  act = null,
  foot = null,
}: {
  vm: StripVM | null;
  onAction: (id: string, arg?: unknown) => unknown;
  children?: ReactNode;
  /** The page's own act at the end of the strip's actions: the search's door to a reach-out, on a phone (scope.tsx). */
  act?: ReactNode;
  /** The second line's end: where the search's adds go (scope.tsx), beside what it has counted. */
  foot?: ReactNode;
}) => {
  if (!vm) return null;
  // With the band inside, its tabs ARE the ways into each pile: the strip's own "14 need a look" link beside a tab saying
  // "14 need a look" was the same door twice, and so was an ending's step that only opens a pile ("1 left out" beside the
  // tab saying it, Ruben, 10 Oct 2026): the tab is that door.
  const actions = children ? vm.actions.filter((a) => !a.pile && a.id !== "excluded" && a.id !== "review") : vm.actions;
  const parts = vm.parts.map((t) => ` · ${t}`).join("");
  return (
    <div
      className={stripClassOf(vm, !!children, !!(vm.count || foot))}
      role={vm.alert ? "alert" : "status"}
      data-state={vm.state}
      data-testid="lead-strip"
    >
      {vm.state === "running" ? <span className="live-dot" aria-hidden="true" /> : null}
      {vm.state === "question" ? (
        <span className="qmark" aria-hidden="true">
          ?
        </span>
      ) : null}
      {vm.state === "found" ? (
        <span className="ok-mark">
          <Icon name="check" size={15} />
        </span>
      ) : null}
      {vm.state === "question" ? (
        <span className="lf-ask-text">
          <span className="lf-q" data-testid="strip-title">
            {vm.title}
          </span>
          <span className="lf-q-sub" data-testid="strip-parts">
            {vm.parts.join(" · ")}
          </span>
        </span>
      ) : (
        // The title holds; what follows it gives way first, and says itself whole on hover.
        <span className="lf-strip-said" data-tip={`${vm.title}${parts}`}>
          <span className="lf-strip-title" data-testid="strip-title">
            {vm.title}
          </span>
          {vm.parts.length ? (
            <span className="lf-strip-parts" data-testid="strip-parts">
              {parts}
            </span>
          ) : null}
        </span>
      )}
      {children ? <span className="lf-strip-band">{children}</span> : <span className="sp" />}
      {/* .lf-acts is what the stylesheet already stacks at a phone's width, so the actions are one group here rather than
          loose buttons in the strip's flex row. */}
      {actions.length || act ? (
        <span className="lf-acts">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={
                a.id === "excluded" || a.id === "review"
                  ? "lnk"
                  : `btn btn-sm ${a.primary ? "btn-primary" : QUIET.indexOf(a.id) >= 0 ? "btn-ghost" : ""}`
              }
              data-testid={`strip-${a.id}`}
              data-act={a.id}
              data-tip={a.where || undefined}
              onClick={() => onAction(a.id, a.arg)}
            >
              {a.label}
            </button>
          ))}
          {act}
        </span>
      ) : null}
      <StripFoot count={vm.count} foot={foot} />
      {vm.progress === null ? null : (
        <span className="lf-strip-bar" style={{ width: `${Math.round(vm.progress * 100)}%` }} aria-hidden="true" />
      )}
    </div>
  );
};
