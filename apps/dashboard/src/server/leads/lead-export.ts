/**
 * The Leads export: its columns and its chunks (decision 0103). Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it. A file of any size: one answer holds as much of it as a response may, says where the next begins, and the
 * page asks until none is left, joins them and saves one file (surfaces/leads/export-walk.ts).
 */
import {
  LEAD_EMAIL_WORDS,
  LEAD_FIT_WORDS,
  LEAD_STAGE_WORDS,
  SECOND_MS,
  leadAddresseeOf,
  leadClaimedWord,
  leadOutcomeWord,
  leadSizeOf,
  leadSourceWord,
  milesLabel,
  type LeadRowDto,
  type LeadsQuery,
} from "@chanlytics/contracts";
import { csvCell, dateTag, safeName } from "../export/export";
import { leadsPage, type LeadsPageAnswer } from "./lead-page";
import { tenantFacts } from "../tenant";
import { recordDecision } from "../verbs";
import type { RouteContext } from "../with-route";
import { log } from "@/server/log";

/* ------------------------------------------------------------- the export */

/** The columns a download carries, in the owner's words. Nothing here names whoever fetched the listing. */
const LEAD_CSV_COLUMNS: ReadonlyArray<readonly [string, (r: LeadRowDto) => string | number | null]> = [
  ["Business", (r) => r.business_name],
  ["What they do", (r) => r.category],
  ["Street", (r) => r.street],
  ["City", (r) => r.city],
  ["State", (r) => r.state],
  ["ZIP", (r) => r.postal_code ?? null],
  ["Phone", (r) => r.phone],
  ["Email", (r) => r.email],
  ["Mailbox", (r) => LEAD_EMAIL_WORDS[r.email_state]],
  ["Website", (r) => r.website],
  ["About", (r) => r.about ?? null],
  ["Facebook", (r) => r.facebook_url ?? null],
  ["LinkedIn", (r) => r.linkedin_url ?? null],
  ["Google Maps", (r) => r.maps_url ?? null],
  ["Rating", (r) => r.rating],
  ["Reviews", (r) => r.reviews],
  ["Stage", (r) => LEAD_STAGE_WORDS[r.stage]],
  ["Why", (r) => r.member.reason],
  ["Search", (r) => r.search_name ?? null],
  ["Found", (r) => r.found_at],
  // Added at the end, so a sheet made from the file before keeps its columns where they were.
  ["Phone checked", (r) => (!r.phone ? null : r.phone_wrong ? "Wrong" : r.phone_agrees ? "Yes" : "No")],
  ["Sequence", (r) => r.place?.name ?? null],
  ["Last contacted", (r) => r.contacted_at],
  ["Last outcome", (r) => leadOutcomeWord(r.last_outcome)],
  ["Last note", (r) => r.last_note],
  ["Contact", (r) => leadAddresseeOf(r)?.name ?? null],
  ["Contact title", (r) => leadAddresseeOf(r)?.title ?? null],
  ["Company size", (r) => leadSizeOf(r)],
  ["Claimed listing", (r) => leadClaimedWord(r.claimed)],
  ["Instagram", (r) => r.instagram],
  ["TikTok", (r) => r.tiktok_url ?? null],
  ["Fit", (r) => (r.member.class === "qualified" && r.member.fit ? LEAD_FIT_WORDS[r.member.fit] : null)],
  ["Distance", (r) => milesLabel(r.member.distance_m) || null],
  ["Source", (r) => leadSourceWord(r)],
  ["Exported", (r) => r.exported_at],
];

/** The file's heading, which its first chunk alone holds. */
const leadsCsvHead = (): string => LEAD_CSV_COLUMNS.map(([name]) => name).join(",");

/** A lead's line of the file, without its line's end. */
const leadCsvLine = (r: LeadRowDto): string => LEAD_CSV_COLUMNS.map(([, pick]) => csvCell(pick(r))).join(",");

/**
 * How much one answer holds, by its text and by the time it took. A response holds at most 4.5 MB (Vercel): the page that
 * passes the budget is the last, and a page of 500 lines is under 1 MB. A read that has grown slow stops early and the page
 * asks for the rest, so a large view never runs into the function's own limit.
 */
const EXPORT_CHUNK: ExportBudget = { bytes: 3_000_000, ms: 8 * SECOND_MS };

/** What a chunk may hold before it stops at the end of a page. */
export interface ExportBudget {
  bytes: number;
  ms: number;
}

/** Where a read got to, as GET leads answers it. */
type ExportCursor = NonNullable<LeadsPageAnswer["next"]>;

/** A chunk of the file: its leads and their lines, where the next begins, and how many the view keeps (with its first page). */
interface ExportChunk {
  ids: string[];
  lines: string[];
  next: ExportCursor | null;
  matching: number | null;
}

/** Pages of 500, read from `after`, until the file's text passes the budget, the time is up or the view ends. */
export async function exportChunk(
  read: (after: ExportCursor | null) => Promise<Pick<LeadsPageAnswer, "rows" | "next" | "view">>,
  after: ExportCursor | null,
  budget: ExportBudget = EXPORT_CHUNK,
): Promise<ExportChunk> {
  const began = Date.now();
  const chunk: ExportChunk = { ids: [], lines: [], next: after, matching: null };
  let bytes = 0;
  do {
    const page = await read(chunk.next);
    chunk.matching ??= page.view?.matching ?? null;
    for (const r of page.rows) {
      const line = leadCsvLine(r);
      chunk.ids.push(r.id);
      chunk.lines.push(line);
      bytes += Buffer.byteLength(line, "utf8");
    }
    chunk.next = page.next;
  } while (chunk.next && bytes < budget.bytes && Date.now() - began < budget.ms);
  return chunk;
}

/**
 * Every lead the view matches, a chunk at an answer (its filters are the read's: the words, the criterion, the fit, a checked
 * email or phone, where the table asks them; lead_view_rows), as CSV, one line a lead. What each chunk took is marked, so only
 * what left is marked and the same lead is not charged twice (§0.2), and a lead already charged is not charged again. The
 * first chunk holds the file's heading and writes the ledger row that says a copy left the building, once.
 *
 * The file is the answer's `csv` and its name, `file`, for the page to save: marking what it took moves the month's count,
 * so it is a POST (decision 0047, lane 6), and a POST answers the envelope like any other.
 */
export async function exportLeads(
  ctx: Pick<RouteContext, "supabase" | "userId" | "via" | "undoOf">,
  tenantId: string,
  input: Omit<LeadsQuery, "limit">,
): Promise<{ file: string; csv: string; rows: number; next: ExportCursor | null; matching?: number }> {
  const { after_key, after_id, ...view } = input;
  const from = after_key && after_id ? { key: after_key, id: after_id } : null;
  const { ids, lines, next, matching } = await exportChunk(
    (after) =>
      leadsPage(
        ctx,
        tenantId,
        { ...view, limit: 500, ...(after ? { after_key: after.key, after_id: after.id } : {}) },
        { month: false },
      ),
    from,
  );
  const { data, error } = await ctx.supabase.rpc("lead_export_mark", { p_tenant_id: tenantId, p_ids: ids });
  if (error) throw new Error(`lead_export_mark: ${error.message}`);
  const { name, timezone } = await tenantFacts(ctx.supabase, tenantId);
  log.info("export.leads", {
    user: ctx.userId,
    tenant_id: tenantId,
    rows: ids.length,
    marked: typeof data === "number" ? data : 0,
    more: next !== null,
  });
  // On the ledger, as the people export is: who took a copy, and when. Once, with the first chunk: a walk is one copy.
  if (!from) {
    await recordDecision(ctx, tenantId, "workspace", tenantId, "export", {
      what: "leads",
      rows: ids.length,
      ...(matching === null ? {} : { matching }),
    });
  }
  const text = [...(from ? [] : [leadsCsvHead()]), ...lines];
  return {
    file: `leads-${safeName(name)}-${dateTag(new Date(), timezone)}.csv`,
    csv: text.length ? `${text.join("\r\n")}\r\n` : "",
    rows: ids.length,
    next,
    ...(matching === null ? {} : { matching }),
  };
}
