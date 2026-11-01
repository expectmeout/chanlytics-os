/**
 * The Leads export: its columns and its pages. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import { LEAD_EMAIL_WORDS, LEAD_STAGE_WORDS, type LeadRowDto, type LeadsQuery } from "@chanlytics/contracts";
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
];

/** The file's text without its byte-order mark: the page that saves it adds one (kit downloadCsv), as every CSV it saves has. */
function leadsCsv(rows: LeadRowDto[]): string {
  const head = LEAD_CSV_COLUMNS.map(([name]) => name).join(",");
  const body = rows.map((r) => LEAD_CSV_COLUMNS.map(([, pick]) => csvCell(pick(r))).join(","));
  return `${[head, ...body].join("\r\n")}\r\n`;
}

/** How many pages of 500 an export will walk before it stops: the month's whole allowance, with room. */
const EXPORT_PAGES = 20;

/**
 * Every lead the view matches (its filters are the read's: the words, the criterion, the fit, a checked email or phone,
 * where the table asks them; 00500), as a CSV, and the ledger row that says a copy left the building. What it took is marked so the same lead is not charged
 * twice (§0.2), and a lead already charged is not charged again.
 *
 * The file is the answer's `csv` and its name, `file`, for the page to save: marking what it took moves the month's count,
 * so it is a POST (decision 0047, lane 6), and a POST answers the envelope like any other.
 */
export async function exportLeads(
  ctx: Pick<RouteContext, "supabase" | "userId" | "via" | "undoOf">,
  tenantId: string,
  view: Omit<LeadsQuery, "after_key" | "after_id" | "limit">,
): Promise<{ file: string; csv: string; rows: number }> {
  const rows: LeadRowDto[] = [];
  let after: { key: string; id: string } | null = null;
  // Every page, not the first: a CSV that stops at 500 is indistinguishable
  // from a complete one, on the download whose ledger row says a copy of the
  // list was taken.
  for (let page = 0; page < EXPORT_PAGES; page += 1) {
    const q: LeadsQuery = { ...view, limit: 500, ...(after ? { after_key: after.key, after_id: after.id } : {}) };
    const answer: LeadsPageAnswer = await leadsPage(ctx, tenantId, q);
    // Narrowed in the read, as the table is: only what leaves is marked and counted.
    rows.push(...answer.rows);
    if (!answer.next) break;
    after = answer.next;
  }
  const { data, error } = await ctx.supabase.rpc("lead_export_mark", {
    p_tenant_id: tenantId,
    p_ids: rows.map((r) => r.id),
  });
  if (error) throw new Error(`lead_export_mark: ${error.message}`);
  const { name, timezone } = await tenantFacts(ctx.supabase, tenantId);
  log.info("export.leads", {
    user: ctx.userId,
    tenant_id: tenantId,
    rows: rows.length,
    marked: typeof data === "number" ? data : 0,
  });
  // On the ledger, as the people export is: who took a copy, and when.
  await recordDecision(ctx, tenantId, "workspace", tenantId, "export", { what: "leads", rows: rows.length });
  return {
    file: `leads-${safeName(name)}-${dateTag(new Date(), timezone)}.csv`,
    csv: leadsCsv(rows),
    rows: rows.length,
  };
}
