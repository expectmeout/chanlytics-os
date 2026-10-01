/**
 * StatePill: the one pill for a state (moved whole from data-bits.jsx, decision 0015: the kit's one implementation, which
 * seed-globals publishes as window.StatePill for the pages that still read it).
 *
 * The tone comes from contracts (tone.ts), the words from the label maps contracts keeps unless the page has better
 * ones, and a live dot rides the accent, which means "right now" and nothing else. Ten components drew this before,
 * each with its own colours: "Needs you" was the accent in the Inbox, amber in Conversations and the accent on a
 * playbook. The JSX read contracts' `stateOf` through the chrome bridge (`window.__chrome.state`) and, without the
 * bridge (the standalone mockup), drew a plain pill; the kit imports `stateOf` and always draws the toned one.
 * Usage: <StatePill kind="thread" value={t.state} /> · label= overrides the words.
 */
import type { StateKind } from "@chanlytics/contracts";
import { stateOf } from "@chanlytics/contracts";
import type { ReactNode } from "react";

interface StatePillProps {
  /** The family of state (contracts' StateKind). */
  kind: StateKind;
  /** The state, in the family's own words (`escalated`, `live`). */
  value: unknown;
  /** Words of the page's own, over the family's. */
  label?: ReactNode;
  className?: string;
  title?: string | null;
  tip?: string | null;
  testid?: string | null;
}

export function StatePill({
  kind,
  value,
  label = null,
  className = "",
  title = null,
  tip = null,
  testid = null,
}: StatePillProps) {
  const said = stateOf(kind, value);
  const tone = said.tone;
  return (
    <span
      className={`pill${tone === "plain" ? "" : ` pill-${tone}`}${className ? ` ${className}` : ""}`}
      data-state={value}
      data-tone={tone}
      title={title || undefined}
      data-tip={tip || undefined}
      data-testid={testid || undefined}
    >
      {tone === "accent" && <span className="live-dot" style={{ width: 5, height: 5 }} />}
      {label ?? said.label}
    </span>
  );
}
