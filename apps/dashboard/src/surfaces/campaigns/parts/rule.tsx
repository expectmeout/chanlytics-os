/**
 * The rule a campaign's runs keep, as a word of its sentence (Ruben, 11 Oct 2026, "Option B"): "…, without asking you",
 * "…, asking you first", the mode Autonomy holds for the moment's class, said as what it does to a run. It stood as a chip
 * of its own under the sentence ("Re-engage · asks you"), in the matrix's words. Pressed, it opens Autonomy, where the
 * mode is set, as the chip did; it hears a change made there (policy:changed), as the chip does.
 */
import { useEffect, useReducer } from "react";
import { LIFECYCLE_WORDS, POLICY_MODES } from "@chanlytics/contracts";
import type { PolicyMode } from "@chanlytics/contracts";
import { Token } from "../../kit/picker/picker";
import { openAutonomy, policyStore } from "../../legacy-verbs";

/** The mode the policy store holds for a class, in contracts' words for it; null where it holds no row for the class. */
export function cmRuleOf(cls: string | null): PolicyMode | null {
  if (!cls) return null;
  const store = policyStore();
  // A row is found by its id (book) or its class (booking), and its mode is held by its id, as the chip reads it.
  const row = store ? store.row(cls) : null;
  if (!store || !row) return null;
  const mode = String(store.modeOf(row.id) ?? "").toLowerCase();
  return (POLICY_MODES as readonly string[]).includes(mode) ? (mode as PolicyMode) : null;
}

/** The rule's word, or nothing where Autonomy holds no row for the class (a reach-out's step, a class it does not name). */
export function CmRuleWord({ cls, testid }: { cls: string | null; testid: string }) {
  const [, heard] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("policy:changed", heard);
    return () => window.removeEventListener("policy:changed", heard);
  }, []);
  const mode = cmRuleOf(cls);
  if (!mode) return null;
  const S = LIFECYCLE_WORDS.compose.sentence;
  return (
    <Token
      className="cm-rule-word"
      data-mode={mode}
      aria-label={`${S.ruleLabel}: ${S.rule[mode]}`}
      onClick={(e) => {
        e.stopPropagation();
        openAutonomy();
      }}
      data-testid={testid}
    >
      {S.rule[mode]}
    </Token>
  );
}
