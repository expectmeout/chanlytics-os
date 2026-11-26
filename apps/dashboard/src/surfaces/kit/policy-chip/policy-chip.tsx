/**
 * PolicyChip: the ONE policy-class chip (moved whole from data-bits.jsx, decision 0015: the kit's one implementation,
 * imported where it is drawn). Self-subscribes to policy:changed. What the shell owns of it -- the charter's rows and
 * words, the route to Settings > Autonomy -- comes through frame-verbs.
 */
import { useEffect, useReducer } from "react";
import { openAutonomy, policyStore } from "../../frame-verbs";

interface PolicyChipProps {
  /** The policy class the chip names (the charter's row id). */
  cls?: string | null;
  className?: string;
}

/**
 * What the mode DOES, not how it is filed: "Replies · holds it", never "Replies · Veto". One word map, the matrix's
 * (the charter's WORDS).
 */
const polWords = (m: string | null | undefined) => {
  const words: Record<string, { chip?: string }> = policyStore()?.WORDS || {};
  const said: { chip?: string } | undefined = words[String(m)];
  return (said || {}).chip || m;
};

/**
 * What a hover says of a class: the policy and where it is set. The mockup's seeded trust digest ("128 auto-sent · 9%
 * edited") went with demo mode, and a real workspace has no such figures.
 */
const POLICY_TIP = "Workspace policy · Settings · Autonomy";

export function PolicyChip({ cls, className = "" }: PolicyChipProps) {
  const [, pcTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("policy:changed", pcTick);
    return () => window.removeEventListener("policy:changed", pcTick);
  }, []);
  const r = cls && policyStore()?.row(cls);
  if (!r) return null;
  return (
    <button
      className={`chip pol-chip ${className}`}
      data-tip={POLICY_TIP}
      onClick={(e) => {
        e.stopPropagation();
        openAutonomy();
      }}
    >
      {r.locked ? (
        <>Owner-only · {r.chip}</>
      ) : (
        <>
          {r.chip} · {polWords(policyStore()?.modeOf(r.id))}
        </>
      )}
    </button>
  );
}
