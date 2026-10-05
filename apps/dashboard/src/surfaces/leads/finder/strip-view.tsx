/**
 * The strip above the table (moved from legacy/pages/leads-finder.jsx, decision 0015): running, checking, the question
 * after 25 in the accent with role="alert", or one of the nine endings (sections 8.4, 8.5, 8.8). Every word it says is
 * leadStrip's (strip.ts), so nothing is spelled here; every button hands its id and its argument back through the one
 * onAction the page gives it, and presses nothing itself.
 */
import type { ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import type { StripVM } from "./types";

const QUIET = ["undo", "excluded", "review", "stop", "stop_here", "sort_fit", "take_offered", "not_now"];

export const LeadStrip = ({
  vm,
  onAction,
  children = null,
}: {
  vm: StripVM | null;
  onAction: (id: string, arg?: unknown) => unknown;
  children?: ReactNode;
}) => {
  if (!vm) return null;
  const tone = vm.state === "question" ? "ask" : vm.state === "ended" ? "done" : "";
  // With the band inside, its tabs ARE the ways into each pile: the strip's own "14 need a look" link beside a tab saying
  // "14 need a look" was the same door twice. A step that opens a pile stays -- it is the one next thing.
  const actions = children ? vm.actions.filter((a) => !a.pile) : vm.actions;
  const parts = vm.parts.map((t) => ` · ${t}`).join("");
  return (
    <div
      className={`lf-strip ${tone}${children ? " has-band" : ""}`}
      role={vm.alert ? "alert" : "status"}
      data-testid="lead-strip"
    >
      {vm.state === "running" ? <span className="live-dot" aria-hidden="true" /> : null}
      {vm.state === "question" ? (
        <span className="qmark" aria-hidden="true">
          ?
        </span>
      ) : null}
      {vm.state === "ended" ? (
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
        <span className="lf-strip-said" title={`${vm.title}${parts}`}>
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
      {actions.length ? (
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
              title={a.where || undefined}
              onClick={() => onAction(a.id, a.arg)}
            >
              {a.label}
            </button>
          ))}
        </span>
      ) : null}
      {vm.progress === null ? null : (
        <span className="lf-strip-bar" style={{ width: `${Math.round(vm.progress * 100)}%` }} aria-hidden="true" />
      )}
    </div>
  );
};
