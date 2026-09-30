/**
 * The kit's empty state and failed read (kit.css, ".empty*"): the one way a page says there is nothing here, and the one
 * way it says it could not read (moved whole from data-bits.jsx, decision 0015: the kit's one implementation, which
 * seed-globals publishes as window.EmptyState and window.FailedRead for the pages that still read them).
 *
 * A read that failed is its own state, never "nothing there" (the audit's D9: Reports went blank when one of its two
 * reads failed). The same three kinds in both, the alert glyph, a Retry that reads the surface again, and the sentence
 * that the rest is current.
 *
 *   <EmptyState kind="page" glyph="inbox" title="Inbox zero" body="…" action={{ label: "See what it handled", to: "conversations" }} />
 *   <FailedRead kind="card" what="your team" surface="settings" />
 *
 * `action.to` goes to a route (the frame's move), `action.onClick` runs, `action.gate` carries the honesty gate's props,
 * `also` is a quieter second; `tone="ok"` is the green check of a day with nothing left to do. `surface` retries through
 * the runner, `onRetry` runs instead, and with neither there is nothing to press (a state support repairs).
 *
 * It draws what the gallery's "Empty state and failed read" family draws, entry for entry
 * (tooling/scripts/e2e-harness/kit-gallery.mjs; tooling/scripts/tests/styles/kit-components.test.mjs holds the two
 * together). Its acts are the house's buttons and links by their classes, as the kit's Button and LinkButton write them.
 */
import type { ReactNode } from "react";
import { canRefreshSurfaces, navigate, refreshSurface } from "@/legacy-bridge/legacy-verbs";
import { Icon } from "../icon/icon";

type Kind = "page" | "card" | "line" | "block";

/** One act: its words, and where it goes or what it runs. */
export interface EmptyAct {
  label: ReactNode;
  /** A route to go to (the frame's move). */
  to?: string;
  onClick?: () => void;
  testid?: string;
  /** The record fold this act opens, where the fold gives focus back as it closes (record-fold.jsx `data-rec-act`). */
  recAct?: string;
  /** The honesty gate's props (role gates), spread onto the button. */
  gate?: Record<string, unknown>;
}

export interface EmptyStateProps {
  kind?: Kind;
  glyph?: string | null;
  title?: ReactNode;
  body?: ReactNode;
  action?: EmptyAct | null;
  also?: EmptyAct | null;
  tone?: string | null;
  className?: string;
  testid?: string | null;
  children?: ReactNode;
}

const GLYPH_SIZE = { page: 24, card: 16, line: 13, block: 13 } as const;

function go(act: EmptyAct): () => void {
  return () => {
    if (act.onClick) act.onClick();
    else if (act.to) navigate(act.to);
  };
}

function actClass(kind: Kind, primary: boolean): string {
  if (kind === "line") return "cl-bucket-link";
  if (!primary) return "btn btn-ghost btn-sm";
  return kind === "page" ? "btn btn-primary btn-sm" : "btn btn-sm";
}

/** One act, as the button or the link its kind draws: called, not drawn, so the tree has no part of its own for it. */
function actButton(kind: Kind, a: EmptyAct, primary: boolean) {
  return (
    <button
      type="button"
      className={actClass(kind, primary)}
      onClick={go(a)}
      data-testid={a.testid || undefined}
      data-rec-act={a.recAct || undefined}
      {...(a.gate || {})}
    >
      {a.label}
      {kind === "line" && <Icon name="arrow-right" size={10} />}
    </button>
  );
}

/** Nothing here: a pane's, a card's or a line's, with what to do about it. */
export function EmptyState({
  kind = "card",
  glyph = null,
  title = null,
  body = null,
  action = null,
  also = null,
  tone = null,
  className = "",
  testid = null,
  children = null,
}: EmptyStateProps) {
  return (
    <div
      className={`empty empty-${kind}${tone ? ` empty-${tone}` : ""}${className ? ` ${className}` : ""}`}
      data-testid={testid || undefined}
    >
      {glyph && (
        <div className="empty-glyph">
          <Icon name={glyph} size={GLYPH_SIZE[kind]} />
        </div>
      )}
      <div className="empty-words">
        {title && <div className="empty-title">{title}</div>}
        {body && <div className="empty-body">{body}</div>}
        {children}
      </div>
      {(action || also) && (
        <div className="empty-acts">
          {action && actButton(kind, action, true)}
          {also && actButton(kind, also, false)}
        </div>
      )}
    </div>
  );
}

export interface FailedReadProps {
  kind?: Kind;
  /** What could not be read: "your team" (the title says "Couldn't read your team"). */
  what?: string;
  /** Why, in a sentence, said before the body. */
  why?: string | null;
  title?: ReactNode;
  body?: ReactNode;
  /** The surface a retry reads again, by its key. */
  surface?: string | null;
  onRetry?: (() => void) | null;
  busy?: boolean;
  also?: { label: ReactNode; onClick?: () => void; testid?: string } | null;
  className?: string;
  testid?: string | null;
  retryTestid?: string | null;
  children?: ReactNode;
}

/** The Retry: the house's button by its kind, with the refresh glyph, busy while it reads again. */
function retryButton(p: { kind: Kind; busy: boolean; onRetry: () => void; testid: string | undefined }) {
  return (
    <button
      type="button"
      className={p.kind === "line" ? "cl-bucket-link" : p.kind === "page" ? "btn btn-primary btn-sm" : "btn btn-sm"}
      disabled={p.busy}
      onClick={p.onRetry}
      data-testid={p.testid}
    >
      <Icon name="refresh" size={11} /> {p.busy ? "Retrying…" : "Retry"}
    </button>
  );
}

/** The quieter second act beside the Retry. */
function alsoButton(kind: Kind, also: NonNullable<FailedReadProps["also"]>) {
  return (
    <button
      type="button"
      className={kind === "line" ? "cl-bucket-link" : "btn btn-ghost btn-sm"}
      onClick={also.onClick}
      data-testid={also.testid || undefined}
    >
      {also.label}
    </button>
  );
}

/** A read that failed, never "nothing there": the alert glyph, what stopped, and a Retry where there is one to press. */
export function FailedRead({
  kind = "card",
  what = "this",
  why = null,
  title = null,
  body = null,
  surface = null,
  onRetry = null,
  busy = false,
  also = null,
  className = "",
  testid = null,
  retryTestid = null,
  children = null,
}: FailedReadProps) {
  const retry = onRetry || (surface && canRefreshSurfaces() ? () => void refreshSurface(surface) : null);
  const reason = why ? `${String(why).replace(/\.?\s*$/, "")}. ` : "";
  return (
    <div
      className={`empty empty-${kind} empty-failed${className ? ` ${className}` : ""}`}
      role="status"
      data-testid={testid || undefined}
    >
      <div className="empty-glyph">
        <Icon name="alert" size={GLYPH_SIZE[kind]} />
      </div>
      <div className="empty-words">
        <div className="empty-title">{title || `Couldn't read ${what}`}</div>
        <div className="empty-body">
          {body ? (
            <>
              {reason}
              {body}
            </>
          ) : (
            <>{reason}Everything else here is current, and the receptionist keeps working.</>
          )}
        </div>
        {children}
      </div>
      {(retry || also) && (
        <div className="empty-acts">
          {retry &&
            retryButton({
              kind,
              busy,
              onRetry: retry,
              testid: retryTestid || (testid ? `${testid}-retry` : undefined),
            })}
          {also && alsoButton(kind, also)}
        </div>
      )}
    </div>
  );
}
