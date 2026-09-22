/**
 * Judge one evaluation case against what the receptionist said.
 *
 * Pure, so a test can execute it on a fixture. Every expectation is a hard
 * assertion an owner would recognise: no price ever, the right kind of
 * question, a handoff when one is due, the customer's language, a fact that
 * had to appear, a phrase that must not.
 */
import { violatesNoPrices } from "../../packages/contracts/dist/index.js";

/**
 * @typedef {{ intent?: string | string[], escalate?: boolean, language?: string, includes?: string[], excludes?: string[], min_confidence?: number }} Expect
 * @typedef {{ id: string, text: string, expect?: Expect }} EvalCase
 * @typedef {{ id: string, ok: boolean, text?: string, escalate?: boolean, reason?: string | null, meta?: { intent?: string, confidence?: number, language?: string, facts_used?: string[] } | null, usage?: { input_tokens: number, output_tokens: number } | null, ms?: number, error?: string }} EvalResult
 */

/** @param {EvalCase} c @param {EvalResult} r @returns {{ pass: boolean, failures: string[] }} */
export function judgeCase(c, r) {
  const failures = [];
  if (!r || !r.ok) return { pass: false, failures: [`no answer: ${r?.error ?? "missing result"}`] };
  const text = String(r.text ?? "");
  const e = c.expect ?? {};
  // Always, whatever the case says: a price never leaves the receptionist.
  if (violatesNoPrices(text)) failures.push("quoted a price");
  if (!r.meta) failures.push("no record (intent/confidence) came back");
  if (e.intent !== undefined) {
    const want = Array.isArray(e.intent) ? e.intent : [e.intent];
    if (!want.includes(r.meta?.intent ?? ""))
      failures.push(`intent ${r.meta?.intent ?? "none"}, wanted ${want.join("|")}`);
  }
  if (e.escalate !== undefined && !!r.escalate !== e.escalate)
    failures.push(`escalate ${!!r.escalate}, wanted ${e.escalate}`);
  if (e.language !== undefined && r.meta?.language !== e.language)
    failures.push(`language ${r.meta?.language ?? "none"}, wanted ${e.language}`);
  for (const p of e.includes ?? []) if (!new RegExp(p, "i").test(text)) failures.push(`missing /${p}/`);
  for (const p of e.excludes ?? []) if (new RegExp(p, "i").test(text)) failures.push(`must not say /${p}/`);
  if (e.min_confidence !== undefined && !((r.meta?.confidence ?? 0) >= e.min_confidence))
    failures.push(`confidence ${r.meta?.confidence ?? "none"} < ${e.min_confidence}`);
  return { pass: failures.length === 0, failures };
}

/** A case set is well formed when every case can be judged. */
export function validateCases(cases) {
  const problems = [];
  const seen = new Set();
  if (!Array.isArray(cases) || !cases.length) return ["no cases"];
  for (const c of cases) {
    if (!c.id || typeof c.id !== "string") problems.push("a case has no id");
    else if (seen.has(c.id)) problems.push(`duplicate id ${c.id}`);
    else seen.add(c.id);
    if (typeof c.text !== "string" || !c.text.trim() || c.text.length > 500)
      problems.push(`${c.id}: text is empty or over 500 chars`);
    const e = c.expect ?? {};
    for (const p of [...(e.includes ?? []), ...(e.excludes ?? [])]) {
      try {
        new RegExp(p, "i");
      } catch {
        problems.push(`${c.id}: bad pattern ${p}`);
      }
    }
    if (e.min_confidence !== undefined && !(e.min_confidence >= 0 && e.min_confidence <= 1))
      problems.push(`${c.id}: min_confidence out of range`);
  }
  return problems;
}

/** One line per case, and a footer, for a terminal. */
export function formatReport(cases, results) {
  const lines = [];
  let passed = 0;
  let tokens = 0;
  for (const c of cases) {
    const r = results.find((x) => x.id === c.id);
    const j = judgeCase(c, r);
    if (j.pass) passed++;
    tokens += (r?.usage?.input_tokens ?? 0) + (r?.usage?.output_tokens ?? 0);
    const conf =
      r?.meta?.confidence !== undefined && r?.meta?.confidence !== null
        ? `${Math.round(r.meta.confidence * 100)}%`
        : "--";
    const head = `${j.pass ? " ok " : "FAIL"} ${c.id.padEnd(16)} ${(r?.meta?.intent ?? "-").padEnd(10)} ${conf.padStart(4)} ${String(r?.ms ?? "-").padStart(6)}ms`;
    lines.push(
      j.pass
        ? head
        : `${head}\n       ${j.failures.join("; ")}\n       said: ${String(r?.text ?? "")
            .replace(/\s+/g, " ")
            .slice(0, 160)}`,
    );
  }
  lines.push(`\n${passed}/${cases.length} passed · ${tokens.toLocaleString("en-US")} tokens`);
  return { text: lines.join("\n"), passed, total: cases.length };
}
