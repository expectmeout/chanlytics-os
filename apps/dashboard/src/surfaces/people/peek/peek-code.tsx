/**
 * The person peeked at beside People's rows (person-peek.tsx), as a chunk of its own: the peek draws the person page's
 * hero, business and next step, which no first draw of People's list needs and which put People's page over its ceiling
 * (the loadability review, 19 Oct 2026). Fetched once People's list is idle (people-route.tsx), so a pick finds it in, and
 * as a pick asks for it before that; the peek's place is held, empty, while it lands. What it reads of the module is named,
 * so the dead-exports check (knip) sees the use.
 */
import { PERSON_PEEK_WORDS } from "@chanlytics/contracts";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import type { PersonPeekProps } from "./person-peek";

export const peekCode = codeOnce(() => import("./person-peek").then(({ PersonPeek }) => ({ PersonPeek })));

export function PersonPeekWhenRead(p: PersonPeekProps) {
  const Peek = useCode(peekCode, true).loaded?.PersonPeek;
  if (Peek) return <Peek {...p} />;
  const name = p.person?.head.name ?? p.row?.name ?? "";
  return <aside className="pk pl-peek pp-peek" aria-label={PERSON_PEEK_WORDS.label(name)} aria-busy="true" />;
}
