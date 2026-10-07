/**
 * PolicyChip: the ONE policy-class chip (moved whole from data-bits.jsx, decision 0015: the kit's one implementation,
 * which seed-globals publishes as window.PolicyChip for the pages that still read it). Self-subscribes to
 * policy:changed. What the shell owns of it -- the charter's rows and words, the trust digest, the route to Settings >
 * Autonomy -- comes through legacy-verbs.
 */
import { useEffect, useReducer } from "react";
import { openAutonomy, policiesRead, policyStore, trustTable } from "../../legacy-verbs";
import type { PolicyRow } from "../../legacy-verbs";

interface PolicyChipProps {
  /** The policy class the chip names (the charter's row id). */
  cls?: string | null;
  className?: string;
}

/**
 * What the mode DOES, not how it is filed: "Replies · holds it", never "Replies · Veto". One word map, the matrix's
 * (window.POLICY.WORDS).
 */
const polWords = (m: string | null | undefined) => {
  const words: Record<string, { chip?: string }> = policyStore()?.WORDS || {};
  const said: { chip?: string } | undefined = words[String(m)];
  return (said || {}).chip || m;
};

/**
 * TRUST is the mockup's seeded table ("128 auto-sent · 9% edited"). A real workspace has its policies loaded (__POLICIES
 * is set, or null when the read failed) and no such figures, so its chip names the policy instead.
 */
function policyTip(r: PolicyRow) {
  const trust = policiesRead() ? undefined : trustTable();
  const t = trust && trust.cls(r.id);
  if (!trust || !t) return "Workspace policy — Settings · Autonomy";
  return `${r.chip} · ${polWords(policyStore()?.modeOf(r.id))} — ${t.sent.toLocaleString()} auto-sent · ${trust.rate(t)}% edited (30d)`;
}

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
      data-tip={policyTip(r)}
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
