import "server-only";
import { z } from "zod";
import {
  LEAD_CLASSES,
  LEAD_CLASS_WORDS,
  LEAD_ENDING_WORDS,
  LEAD_LISTS,
  LEAD_SORTS,
  LeadsQuerySchema,
  leadSearchWords,
  leadsRoute,
  noteRows,
  toLeadPeekVM,
  toLeadRowVM,
  type LeadRowVM,
  type LeadSearchDto,
} from "@chanlytics/contracts";
import { toSearchDto, waitingQuestionOf } from "../../../leads/leads";
import { load } from "../../../readers";
import { lead as leadReader, leads as leadsReader } from "../../../readers/leads";
import { search as searchReader, searches } from "../../../readers/searches";
import { UUID, defineActions, readAction, str, unlessNotFound, unread, type ToolContext } from "../context";

/** A round's state in a word, for the model to say. The owner's own screen words are the strip's. */
const ROUND_WORDS: Record<string, string> = {
  queued: "queued",
  probing: "looking at a first few",
  waiting_on_owner: "waiting for an answer from you",
  running: "running",
  checking: "checking the emails it found",
  ended: "ended",
};

/** How many leads one read says: the Leads page reads five hundred of a view at a time, and the rest are counted. */
const LEADS_CAP = 25;

/** Cut to `n` characters: a long ask or a long listing cannot fill a turn. */
const cut = (v: string | null | undefined, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");

/** A search as leads.searches says it, and leads.search again: the rail's row, in the owner's own words. */
function searchLine(s: LeadSearchDto) {
  const r = s.round;
  // The page's round carries the question's sentence as the view held it (toSearchDto), so the one reader of a
  // waiting question says the same sentence; a search with no round has none.
  const q = r ? waitingQuestionOf(r) : null;
  return {
    id: s.id,
    name: cut(s.name),
    asked: cut(s.asked),
    asked_on: s.asked_on.slice(0, 10),
    state: r ? (ROUND_WORDS[r.state] ?? r.state) : "not started",
    ending: r?.ending ? (LEAD_ENDING_WORDS[r.ending] ?? null) : null,
    // No round yet: the view's own zeros.
    qualified: r?.qualified ?? 0,
    review: r?.review ?? 0,
    counted: r?.counted ?? 0,
    question: q ? cut(q) : null,
  };
}

/**
 * Every search this workspace has asked for, newest first, in the owner's own
 * words: what they asked, the day they asked it, where it is or how it ended,
 * the three counts, and, for a search that stopped to ask, its question (the
 * model answers it through propose_lead_search's amends); and beside them the
 * rail's six counts, as the Leads page shows them. Nothing is started by
 * reading it, and every string is cut to 120 characters so a long ask cannot
 * fill a turn.
 */
async function listLeadSearches(t: ToolContext): Promise<unknown> {
  // The Leads page's own read (readers/searches.ts), once a turn: every kept search with its latest round as the page
  // maps it, and the rail's counts read with them (ledger #12).
  const read = await load(t.rc, searches, undefined);
  const { searches: rows, counts } = read.data;
  // Every search it lists is a row an answer may cite, opened on Leads at that search: the reader's RowRefs.
  noteRows(t.read, read.rows);
  return {
    route: "clients/leads",
    counts: {
      all: counts.all,
      ready: counts.ready,
      nurture: counts.nurture,
      converted: counts.converted,
      said_no: counts.said_no,
      not_a_fit: counts.not_a_fit,
    },
    searches: rows.map(searchLine),
    note: "Counted is what came off this month's leads; a search with a question is waiting for the owner's answer.",
  };
}

/** A lead as the Leads page's row says it (contracts toLeadRowVM, handed its own search as the page hands it). */
function leadLine(vm: LeadRowVM, route: string) {
  return {
    lead_id: vm.id,
    route,
    name: cut(vm.name),
    kind: cut(vm.category) || null,
    area: cut(vm.area) || null,
    class: LEAD_CLASS_WORDS[vm.cls],
    fit: cut(vm.fitLabel) || null,
    stage: vm.stageLabel,
    email: vm.emailWord,
    rating: vm.rating || null,
    distance: vm.distance || null,
    found: vm.foundLine || null,
    search: cut(vm.searchName) || null,
    waits_on: vm.waitsOn ? cut(vm.waitsOn) : null,
    // The person this lead became, when it became one: People's row for them.
    contact_id: vm.contactId,
  };
}

/** The searches as the Leads page holds them, by id, to hand each row its own (legacy-bridge/leads.ts vmOf). */
const searchesById = async (t: ToolContext, why: string) =>
  new Map(
    ((await load(t.rc, searches, undefined).then((r) => r.data.searches, unread(t, why, "searches"))) ?? []).map(
      (s) => [s.id, s],
    ),
  );

/**
 * The leads themselves, as the Leads page's view lists them (readers/leads.ts, the page's own read of five hundred):
 * the view by its list, one search, a class and a sort, as the address and the member's view name them, then the
 * page's box -- its words matched on a lead's name, kind and area, over the rows the page holds, as the box matches
 * them. The rail's counts and, for a member who may find, the month ride with the first page.
 */
async function listLeads(
  t: ToolContext,
  input: { list?: string; search_id?: string; class?: string; sort?: string; words?: string; after?: string },
): Promise<unknown> {
  const searchId = str(input.search_id, 40);
  if (searchId && !UUID.test(searchId)) return { error: "search_id must be an id leads with action searches returned" };
  const [afterKey, afterId] = str(input.after, 130).split("|");
  const after = afterKey && afterId ? { after_key: afterKey, after_id: afterId } : {};
  if (input.after && !after.after_key) return { error: "after must be the next_page an earlier read returned" };
  const asked = LeadsQuerySchema.safeParse({
    list: input.list ?? "all",
    ...(searchId ? { search: searchId } : {}),
    ...(input.class ? { class: input.class } : {}),
    ...(input.sort ? { sort: input.sort } : {}),
    ...after,
  });
  if (!asked.success) return { error: "after must be the next_page an earlier read returned" };
  const q = asked.data;
  const [read, bySearch] = await Promise.all([load(t.rc, leadsReader, q), searchesById(t, "leads.leads")]);
  const page = read.data;
  const refs = new Map(read.rows.map((r) => [r.id, r]));
  const needle = str(input.words, 80).toLowerCase();
  const vms = page.rows
    .map((r) => toLeadRowVM(r, t.timezone, t.now, bySearch.get(r.search_id) ?? null))
    .filter(
      (l) =>
        !needle ||
        l.name.toLowerCase().includes(needle) ||
        (l.category || "").toLowerCase().includes(needle) ||
        (l.area || "").toLowerCase().includes(needle),
    );
  const shown = vms.slice(0, LEADS_CAP);
  // Every lead it says is a row an answer may cite, opened at its peek on this view: the reader's RowRefs.
  noteRows(
    t.read,
    shown.flatMap((l) => refs.get(l.id) ?? []),
  );
  return {
    route: leadsRoute({ searchId: q.search ?? null, list: q.list, cls: q.class ?? null }),
    ...(page.counts
      ? {
          counts: {
            all: page.counts.all,
            ready: page.counts.ready,
            nurture: page.counts.nurture,
            converted: page.counts.converted,
            said_no: page.counts.said_no,
            not_a_fit: page.counts.not_a_fit,
          },
        }
      : {}),
    ...(page.month ? { month: { used: page.month.used, left: page.month.left, renews_on: page.month.renewsOn } } : {}),
    matching: vms.length,
    leads: shown.map((l) => leadLine(l, refs.get(l.id)?.route ?? leadsRoute({ peek: l.id }))),
    next_page: page.next ? `${page.next.key}|${page.next.id}` : null,
  };
}

/**
 * One lead, as its peek on Leads shows it (readers/leads.ts lead, GET leads/[id]'s own read, then contracts
 * toLeadPeekVM with the lead's own search): the row's facts, and what the peek adds -- what the listing says, where and
 * when it is open, its rating, why it fits, the checks made, where it was found, and how to reach it.
 */
async function getLead(t: ToolContext, input: { lead_id: string; search_id?: string }): Promise<unknown> {
  const id = str(input.lead_id, 40);
  const searchId = str(input.search_id, 40);
  if (!UUID.test(id)) return { error: "lead_id must be an id leads with action leads returned" };
  if (searchId && !UUID.test(searchId)) return { error: "search_id must be an id leads with action searches returned" };
  const [read, bySearch] = await Promise.all([
    unlessNotFound(load(t.rc, leadReader, { id, ...(searchId ? { search: searchId } : {}) })),
    searchesById(t, "leads.lead"),
  ]);
  if (!read) return { error: "no such lead in this workspace" };
  const r = read.data.row;
  const own = bySearch.get(r.search_id) ?? null;
  const vm = toLeadRowVM(r, t.timezone, t.now, own);
  const peek = toLeadPeekVM(r, own, t.timezone, t.now);
  // The lead is a row an answer may cite, opened at its peek: the reader's RowRef.
  noteRows(t.read, read.rows);
  return {
    ...leadLine(vm, read.rows[0]?.route ?? leadsRoute({ peek: r.id })),
    about: peek.about ? cut(peek.about, 240) : null,
    where: peek.where ? cut(peek.where.line) : null,
    today: peek.today,
    rated: peek.rated ? `${peek.rated.score} from ${peek.rated.count} reviews` : null,
    why_it_fits: cut(peek.fit.sentence, 240) || null,
    checks: peek.checksSummary || null,
    found_at: peek.foundSummary || null,
    phone: peek.reach.phone ? peek.reach.phone.value : null,
    email_address: peek.reach.email.address,
    email_note: cut(peek.reach.email.note) || null,
    website: peek.links.website?.label ?? null,
  };
}

/**
 * One search, as Leads shows it at that search (readers/searches.ts search, GET lead-searches/[id]'s own read, through
 * the rail's own mapping): the row leads.searches says for it, what the owner asked in their words, and the round's
 * strip -- the emails checked, the leads with a phone, the qualified by fit and where to look next.
 */
async function getLeadSearch(t: ToolContext, input: { search_id: string }): Promise<unknown> {
  const id = str(input.search_id, 40);
  if (!UUID.test(id)) return { error: "search_id must be an id leads with action searches returned" };
  const read = await unlessNotFound(load(t.rc, searchReader, { id }));
  if (!read) return { error: "no such search in this workspace" };
  // A search removed from the rail is not on Leads: the page lists only the kept ones (lead-searches.ts).
  if (read.data.search.removed_at) return { error: "that search was removed from Leads" };
  const s = toSearchDto(read.data.search);
  noteRows(t.read, read.rows);
  const r = s.round;
  return {
    route: leadsRoute({ searchId: s.id }),
    ...searchLine(s),
    asked_line: cut(leadSearchWords(s, t.timezone).askedLine, 240),
    emails_checked: r?.emails_checked ?? 0,
    with_phone: r?.with_phone ?? 0,
    fits: r?.fits ?? { strong: 0, look: 0, long: 0 },
    look_next: (r?.nearby ?? []).map((a) => cut(a.label)),
  };
}

/**
 * The lead finder (D11): its searches (searches, once list_lead_searches); since Phase 4 the leads themselves (leads),
 * one lead (lead) and one search (search), each read as the Leads page reads it.
 */
export const leadsTool = defineActions({
  name: "leads",
  description: "The lead finder, as the Leads page reads it, by action.",
  tail: "Nothing here starts or changes because it was read, and every string is cut short.",
  actions: {
    searches: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading your searches",
      words:
        "Action searches takes nothing more and reads the workspace's lead searches, newest first, as the Leads page lists them: what was asked in the owner's words and when, its state or ending in words, how many qualified, need review and were counted, and, for a search that stopped to ask, its question; beside them, the rail's six counts of leads. Read it before proposing a search, so a plan is not repeated, and to answer about a search the person names. A search with a question is waiting for the owner's answer: words that answer it are propose_lead_search with amends set to that search's id, the same plan with the answer applied; to carry on unchanged or stop it, the owner presses Yes, keep going or Stop here on Leads.",
      run: listLeadSearches,
    }),
    leads: readAction({
      input: z.object({
        list: z.enum(LEAD_LISTS).optional(),
        search_id: z.string().optional(),
        class: z.enum(LEAD_CLASSES).optional(),
        sort: z.enum(LEAD_SORTS).optional(),
        words: z.string().optional(),
        after: z.string().optional(),
      }),
      examples: [{ list: "ready", sort: "rating" }],
      label: "Reading your leads",
      words: `Action leads reads the businesses the searches found, as a view of the Leads page lists them: list is all (the default), ready, nurture (contacted), converted (talking), said_no or not_a_fit; search_id keeps one search's leads, class keeps qualified, review (needs review) or excluded (left out), sort orders them by fit (the default), found, distance, business, rating or stage, and words keeps the ones whose name, kind or area has them, as the page's box does. Each lead says its kind, area, class, fit or why it was left out, stage, email, rating, when it was found and its search; with the view's first page come the rail's six counts and, for an owner or a partner, this month's leads used and left. Call it for who the leads are or to find one, and action lead for one lead's details. It returns at most ${LEADS_CAP} leads, matching counting the view's first five hundred (words match within those) before the cap, and next_page, passed back as after, for the next five hundred.`,
      run: listLeads,
    }),
    lead: readAction({
      input: z.object({ lead_id: z.string(), search_id: z.string().optional() }),
      examples: [{ lead_id: "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f" }],
      label: "Reading the lead",
      words:
        "Action lead takes lead_id, the id action leads returned, and an optional search_id to read it as that search found it, and reads one lead as its peek on Leads shows it: its row, what its listing says about it, where it is and whether it is open today, its rating, why it fits, the checks made, where it was found, its phone, email and website. Call it when one lead's details are needed; a lead the workspace does not hold is an error, said in words.",
      run: getLead,
    }),
    search: readAction({
      input: z.object({ search_id: z.string() }),
      examples: [{ search_id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e" }],
      label: "Reading the search",
      words:
        "Action search takes search_id, the id action searches returned, and reads one search as Leads shows it at that search: its row as action searches says it, what the owner asked in their words and what the plan leaves out, how many emails were checked and how many leads have a phone, the qualified by fit (strong, look, long), and where to look next when it ran dry. Call it when one search is named or is the one on screen; a search the workspace does not hold, or one removed from Leads, is an error, said in words.",
      run: getLeadSearch,
    }),
  },
});
