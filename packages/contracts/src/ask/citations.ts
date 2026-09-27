/**
 * Ask's citation grammar: the kinds a citation may name, the rule that keeps one honest (a row the tools returned this
 * turn, or a page) and where each opens. Read by ask.ts's message, the answer's normaliser (ask-answer.ts) and the
 * format the model writes (answer-format.ts). Pure; it imports nothing.
 */

/* ----------------------------------------------------------- the citation */

export const ASK_CITATION_KINDS = ["thread", "conversation", "call", "person", "page"] as const;
export type AskCitationKind = (typeof ASK_CITATION_KINDS)[number];

export interface AskCitation {
  kind: AskCitationKind;
  /** A conversation, call or contact id; for a page, its route. */
  id: string;
  label: string;
}

/* --------------------------------------------------------------- grounding */

/** What the tools returned this turn, by kind: the only rows a citation may name. */
export type AskReadSet = Record<Exclude<AskCitationKind, "page">, Set<string>>;

export function emptyReadSet(): AskReadSet {
  return { thread: new Set(), conversation: new Set(), call: new Set(), person: new Set() };
}

/** The pages a citation or a navigate target may point at without a read. */
export const ASK_PAGE_ROUTES = [
  "today",
  "inbox",
  "clients",
  "clients/leads",
  "segments",
  "conversations",
  "live",
  "calendar",
  "outbound",
  "broadcasts",
  "messages",
  "reports",
  "start",
  "admin/workspace",
  "admin/team",
  "admin/autonomy",
  "admin/notifications",
  "admin/integrations",
  "admin/billing",
  "admin/activity",
  "admin/profile",
] as const;

const PAGE_PREFIX =
  /^(today|inbox|clients|segments|conversations|live|calendar|outbound|broadcasts|messages|reports|start|admin)(\/[A-Za-z0-9:_-]+)?$/;

/**
 * Drop every citation that names a row the tools did not return this turn.
 * A model that read nothing cannot cite anything; a model that read the
 * Inbox can cite only the threads it saw. Pages are always allowed, because
 * a page is not a claim.
 */
export function groundCitations(citations: AskCitation[], read: AskReadSet): { kept: AskCitation[]; dropped: number } {
  const kept: AskCitation[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const c of citations) {
    const ok = c.kind === "page" ? PAGE_PREFIX.test(c.id) : read[c.kind].has(c.id);
    const key = `${c.kind}:${c.id}`;
    if (!ok || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, dropped };
}

/** Where a citation opens. The same routes the pages use for the same rows. */
export function citationRoute(c: AskCitation): string {
  switch (c.kind) {
    case "thread":
      return `inbox/th-${c.id}`;
    case "conversation":
      return `conversations/${c.id}`;
    case "call":
      return `conversations/cv-${c.id}`;
    case "person":
      return `clients/${c.id}`;
    default:
      return c.id;
  }
}
