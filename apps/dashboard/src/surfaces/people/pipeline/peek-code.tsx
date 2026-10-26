/**
 * The Pipeline's deal sheet (peek.tsx), as a chunk of its own, as People's peek is (peek/peek-code.tsx): the sheet draws
 * the person page's Call, their last words and its walk, which no first draw of the Pipeline's rows needs and which put
 * People's page over its ceiling (#1765's bundle check, 20 Oct 2026: +101 KB gzipped). Fetched with People's peek once
 * the list is idle (people-route.tsx), and as a pick asks for it before that; on a desk the sheet's place is held, empty,
 * while it lands. What it reads of the module is named, so the dead-exports check (knip) sees the use.
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import type { PipelinePeekProps } from "./peek";
import { usePeekLeaves } from "../peek/peek-leaves";

export const dealSheetCode = codeOnce(() => import("./peek").then(({ PipelinePeek }) => ({ PipelinePeek })));

export function PipelinePeekWhenRead(p: PipelinePeekProps) {
  // On a desk the sheet leaves as a side sheet does, as this mount goes (peek/peek-leaves.ts).
  const asideRef = usePeekLeaves();
  const Sheet = useCode(dealSheetCode, !!p.vm).loaded?.PipelinePeek;
  if (Sheet) return <Sheet {...p} asideRef={asideRef} />;
  if (!p.vm || p.phone) return null;
  return <aside ref={asideRef} className="pk pl-peek pipe-peek" aria-label={p.vm.name} aria-busy="true" />;
}
