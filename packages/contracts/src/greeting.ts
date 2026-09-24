/**
 * The opening line, with the business named only when we know which it is.
 *
 * Composed here rather than typed into Retell's dashboard, so the business
 * NAME does not become a third hand-kept copy of a fact the product already
 * owns -- a rename would otherwise leave the phone greeting saying the old one.
 *
 * A whole sentence, not the name on its own: Retell leaves a variable it
 * cannot fill in the prompt verbatim, and "Thank you for calling
 * {{business_name}}" read down a phone line is worse than any wording. When
 * the business is unknown this simply greets nobody by name, which is never
 * wrong -- and is the shell's own default, below, so the two are one sentence.
 *
 * Both disclosures -- recording, and that this is an automated assistant --
 * live here rather than in the agent's config, because they are promises the
 * product makes and should not be editable by whoever last opened Retell.
 *
 * Contracts' since the first run shows the owner the sentence their receptionist
 * will say (first-run.ts); the voice shell (packages/channels voice-shell.ts)
 * re-exports it, so the phone and the page say one sentence.
 */
export function greetingFor(name: string | null): string {
  const who = name ? ` ${name}` : "";
  return `Thank you for calling${who}! This call may be recorded. I'm the automated assistant — how can I help you today?`;
}

/**
 * The greeting with no business named -- never wrong, never a placeholder. Marked pure so a bundle that never says it
 * (db, core, jobs bundle contracts) leaves it out.
 */
export const GREETING_DEFAULT = /* @__PURE__ */ greetingFor(null);
