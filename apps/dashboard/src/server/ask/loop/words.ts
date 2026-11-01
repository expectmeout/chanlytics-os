import "server-only";
import { waitingSearchWords, type AskReadSet } from "@chanlytics/contracts";
import type { BuiltContext, SearchResultBlock } from "../context";
import { withSkillGuides } from "../cross-page";
import { turnWords } from "../prompt";
import { aboveRoleWords } from "../tools";
import type { TurnInput } from "../loop";

/**
 * This turn's words, as the text block before the question (prompt.ts turnWords): who is asking, where, when, the row
 * their words point at and whether the read set holds it, and -- while the question still carries it (`dataDropped`
 * false) -- that the data before them is read already: the page's, the reads made for another page, the scope's row.
 * A live turn's also say what happened since (D8). Made once the read set holds every read before the model's. The guide
 * of a skill the question asks for follows them (cross-page.ts withSkillGuides).
 */
export function wordsBlock(
  input: TurnInput,
  now: Date,
  rode: { built: BuiltContext | null; crossBlocks: SearchResultBlock[]; scopedRow: unknown; read: AskReadSet },
) {
  const focus = input.context?.focus;
  // A focus is a scope: a run is cited, and so read, as its broadcast; a page is never a row, and an ad has no read
  // until the Ads read lands (decision 0049), so neither is looked for in the read set.
  const kind = focus?.kind === "run" ? "broadcast" : focus?.kind === "ad" ? "page" : focus?.kind;
  const facts = {
    role: input.role,
    personLabel: input.personLabel,
    scope: input.scope,
    surface: input.surface,
    timezone: input.timezone,
    closures: input.facts.closures,
    focus,
    focusRead: !!focus && !!kind && kind !== "page" && rode.read[kind].has(focus.id),
    // A reach-out's drawer: the page they are on, at its address (contracts scopeFromRoute), whose row the page holds.
    scopeOnPage: input.scope?.kind === "page" && input.scope.id === input.context?.route,
    now,
    spoken: input.spoken ?? false,
    column: input.column ?? null,
    style: input.style ?? "",
    above: aboveRoleWords(input.role),
  };
  // The search card waiting in this thread for its press, said whole as find would take its plan (contracts
  // waitingSearchWords), so a change said to Ask is that plan changed only there, never planned again from its title.
  const searchCard = waitingSearchWords(input.waiting ?? []);
  const words = (live: boolean, dataDropped: boolean) => ({
    type: "text" as const,
    text: [
      turnWords({
        ...facts,
        since: live ? input.chain?.since : undefined,
        replayedAt: live ? input.chain?.readAt : undefined,
        context: !dataDropped && (rode.built?.blocks.length ?? 0) > 0,
        crossPage: !dataDropped && rode.crossBlocks.length > 0,
        scopeRead: !dataDropped && !!rode.scopedRow,
      }),
      ...(searchCard ? [searchCard] : []),
    ].join("\n"),
  });
  return withSkillGuides(words, input.text);
}
