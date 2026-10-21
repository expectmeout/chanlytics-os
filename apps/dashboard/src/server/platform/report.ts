import "server-only";

/**
 * Get help (decisions 0066 and 0067): a member's words to Chanlytics, what they need (a question, help setting up,
 * something that isn't working, billing), the page they were on and, for something not working, the last error it hit,
 * from anywhere in the app. A sheet that named no kind is judged by its error: one caught means something wasn't
 * working, and goes to Health; anything else is Support's.
 *
 * The row first, then the mail. support_reports keeps the report (numbered R-1001 and up) before anything is sent, so
 * the Console's Support has it whatever the mail does; the edge then mails the support inbox with the member's address
 * as its Reply-To (apps/edge/lib/support.ts), reading the row by its id, and the row says whether it left. A deployment
 * that reaches no provider (a preview, a laptop) keeps the row and says it sent nothing.
 *
 * The workspace is the one the tab named, taken only when the member belongs to it, so a report cannot be filed under
 * someone else's. Written on the service role: the table is the platform's, and no member reads it.
 */
import { fileReport, markReportMailed } from "@chanlytics/db";
import {
  AppError,
  reportCode,
  reportKindOf,
  supportMeanwhile,
  supportTopicOf,
  type ReportProblemInputDto,
} from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memberContext, type RouteContext } from "../with-route";
import { callEdge, edgeAnswered, edgeConfigured, edgeRefusalWords } from "../edge";
import { deployment } from "../env";
import { serviceDb } from "../service-db";
import { log } from "@/server/log";

/** The mail gives up after this; the row is kept either way. */
const REPORT_MAIL_TIMEOUT_MS = 8000;

/** What a sent report answers: its number, whether the inbox has it, and the one line that helps until a person answers. */
interface ReportFiled {
  code: string;
  mailed: boolean;
  meanwhile: string | null;
}

/** The workspace the tab named, when the member belongs to it; null otherwise, and never a refusal. */
async function reportedFrom(ctx: RouteContext, workspace: string | null): Promise<string | null> {
  if (!workspace) return null;
  return memberContext(ctx, workspace).then(
    (m) => m.tenantId,
    () => null,
  );
}

export async function fileProblemReport(
  ctx: RouteContext,
  input: ReportProblemInputDto,
  db: SupabaseClient<Database> = serviceDb(),
): Promise<ReportFiled> {
  const tenantId = await reportedFrom(ctx, input.workspace);
  const kind = reportKindOf(input.kind, input.error);
  const meanwhile = kind === "wrong" ? null : supportMeanwhile(supportTopicOf(input.words, input.page, kind));
  const { data, error } = await fileReport(db, {
    tenant_id: tenantId,
    kind,
    user_id: ctx.userId,
    email: ctx.email ?? null,
    page: input.page,
    // The error is a bug's: with a question it says nothing the person answering needs.
    error_id: kind === "wrong" ? (input.error?.id ?? null) : null,
    error_name: kind === "wrong" ? input.error?.name || null : null,
    error_message: kind === "wrong" ? input.error?.message || null : null,
    words: input.words,
  });
  if (error || !data)
    throw new AppError("internal", "Your report could not be kept just now. Try again in a moment.", 503);
  const code = reportCode(data.number);

  if (!deployment.providersLive || !edgeConfigured()) {
    await markReportMailed(db, data.id, { error: "This deployment sends no mail." });
    return { code, mailed: false, meanwhile };
  }
  const r = await callEdge(
    "/api/admin/support/report",
    { report_id: data.id },
    { workspace: tenantId, user: ctx.userId, timeoutMs: REPORT_MAIL_TIMEOUT_MS },
  );
  const mailed = edgeAnswered(r);
  if (!mailed) log.error("support_report_mail_failed", { tenant_id: tenantId, status: r.status, error: r.body?.error });
  const kept = await markReportMailed(
    db,
    data.id,
    mailed ? { at: new Date().toISOString() } : { error: edgeRefusalWords(r.body) ?? `The edge answered ${r.status}.` },
  );
  if (kept.error) log.error("support_report_mail_failed", { tenant_id: tenantId, error: kept.error.message });
  return { code, mailed, meanwhile };
}
