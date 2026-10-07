/**
 * A sentence of the view model's, in parts (contracts LifecycleSentence): a part with `b` is the page's emphasis, and any other
 * is the words. The head's line and the toasts say their names and numbers this way, so the page draws a sentence and never
 * builds one.
 */
import type { LifecycleSentence } from "@chanlytics/contracts";

export function SentenceParts({ parts }: { parts: LifecycleSentence }) {
  return <>{parts.map((part, i) => (typeof part === "string" ? part : <b key={i}>{part.b}</b>))}</>;
}
