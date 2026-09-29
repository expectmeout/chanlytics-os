/**
 * Ask's citation grammar: the kinds a citation may name, the rule that keeps one honest (a row a reader returned this
 * turn, or a page) and where each opens. Read by ask.ts's message, the answer's normaliser (ask-answer.ts) and the
 * format the model writes (answer-format.ts). Pure; it imports nothing.
 */

/* ----------------------------------------------------------- the citation */

/**
 * Thirteen names (the spec, 5.7): a page, and the twelve kinds of row a reader returns. A Broadcasts row cites as a
 * broadcast: `run` is the word its address and a scope spell (ask.ts ASK_SCOPE_KINDS), never a citation's.
 */
export const ASK_CITATION_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "deal",
  "list",
  "broadcast",
  "playbook",
  "template",
  "domain",
] as const;
export type AskCitationKind = (typeof ASK_CITATION_KINDS)[number];

/** The rows an answer's items may name, in words: said once, by the prompt's rules and the format's items alike. */
export const ASK_ROW_WORDS =
  "people, threads, calls, leads, searches, deals, lists, broadcasts, playbooks, templates, domains";

export interface AskCitation {
  kind: AskCitationKind;
  /** A row's id as its reader gave it (a People list's is its name, `quiet`); for a page, its route. */
  id: string;
  label: string;
}

/* --------------------------------------------------------------- grounding */

/**
 * A row a reader returned: its kind and id, where it opens as its page opens it -- a deal at its person's page, a
 * template on Templates, a list at `clients/list:<id>` or `clients/seg:<id>`, a domain on Connections -- and its name.
 * The server's readers return these (server/readers RowRef), and the read set keeps them.
 */
export interface AskRowRef {
  kind: AskCitationKind;
  id: string;
  route: string;
  label: string;
}

/** What the tools and the page returned this turn, by kind and id, each with its RowRef: the rows a citation may name. */
export type AskReadSet = Record<Exclude<AskCitationKind, "page">, Map<string, AskRowRef>>;

export function emptyReadSet(): AskReadSet {
  return Object.fromEntries(
    ASK_CITATION_KINDS.filter((k) => k !== "page").map((k) => [k, new Map<string, AskRowRef>()]),
  ) as AskReadSet;
}

/** Rows read, into the read set by kind and id as their readers gave them. A page needs no read, and is not kept. */
export function noteRows(read: AskReadSet, refs: Iterable<AskRowRef>): void {
  for (const r of refs) if (r.kind !== "page") read[r.kind].set(r.id, r);
}

/**
 * The pages a citation or a navigate target may point at without a read: every page the palette jumps to (askPages;
 * the Pipeline and the back office only where the workspace and the person have them), and People's lists.
 */
export const ASK_PAGE_ROUTES = [
  "today",
  "inbox",
  "clients",
  "clients/leads",
  "clients/pipeline",
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
  "admin/partner",
  "admin/platform",
] as const;

// A list of the workspace's own is a row (`clients/list:<id>`, its reader's route), so its address is no page; a People
// list's `clients/seg:<id>` is People's own view, and stays one.
const PAGE_PREFIX =
  /^(?!clients\/list:)(today|inbox|clients|segments|conversations|live|calendar|outbound|broadcasts|messages|reports|start|admin)(\/[A-Za-z0-9:_-]+)?$/;

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

/** The rows that open at one route whoever read them: the kinds a citation named before the read set held routes. */
const OWN_ROUTES: Partial<Record<AskCitationKind, (id: string) => string>> = {
  thread: (id) => `inbox/th-${id}`,
  conversation: (id) => `conversations/${id}`,
  call: (id) => `conversations/cv-${id}`,
  person: (id) => `clients/${id}`,
};

/**
 * Where a citation opens: a page at its route; a row at the route its reader gave it, the RowRef the read set holds,
 * never one derived here (a deal opens its person's page, a template Templates). A citation stored without its `to`
 * was made before answers kept one, when a row was a thread, a conversation, a call or a person: it opens where the
 * pages open those. A row of another kind the read set does not hold opens nowhere: "".
 */
export function citationRoute(c: AskCitation, read?: AskReadSet): string {
  if (c.kind === "page") return c.id;
  return read?.[c.kind].get(c.id)?.route ?? OWN_ROUTES[c.kind]?.(c.id) ?? "";
}
