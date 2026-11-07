/**
 * POST /api/admin/support/report — a member pressed Send on Get help (decisions 0066 and 0067), and the support inbox
 * hears about it, with what they needed: a question, help setting up, billing, or something that isn't working (the
 * Console's Health's).
 *
 * The dashboard keeps the report first (support_reports, R-1001 and up), so a mail that fails loses nothing: the
 * Console's Support shows the row, marked as not in the inbox. This sends the one thing Postgres cannot: a mail to
 * SUPPORT_TO (the platform's LEAD_TO while it is unset), from LEAD_FROM, with the member's own address as its Reply-To,
 * so answering it in the inbox answers them.
 *
 * The report is read here by its id and the member the token names, never taken from the body: what the mail says is
 * what the row holds, and a token for one member opens no other member's report. Nothing of their customers is in it:
 * their words, the page, the last error the page hit, their workspace. Signed admin token only.
 */
import { json, refuse } from "../shared/http.js";
import { personFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";
import { platformFrom, platformTo, postMail } from "../shared/alerts/notify.js";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { reportToMail } from "@chanlytics/db/console";
import { oneLine } from "@chanlytics/channels/email";
import { CONSOLE_PATH, SUPPORT_KIND_WORDS, UUID, pageWords, reportCode } from "@chanlytics/contracts";

/** The support inbox: SUPPORT_TO, one address or several separated by commas; the platform's mailbox while unset. */
function supportTo(): string[] {
  const set = (env.SUPPORT_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return set.length ? set : platformTo();
}

/** A report as the mail tells it. */
interface ReportToMail {
  number: number;
  kind: string;
  email: string | null;
  page: string | null;
  error_id: string | null;
  error_name: string | null;
  error_message: string | null;
  words: string;
  created_at: string;
  tenant: { slug: string; name: string } | null;
}

/** What the member needed, as the team says it: a report kept before the pick existed reads as a question. */
const kindWords = (kind: string): string =>
  kind in SUPPORT_KIND_WORDS ? SUPPORT_KIND_WORDS[kind as keyof typeof SUPPORT_KIND_WORDS] : SUPPORT_KIND_WORDS.how_to;

/** The mail: the report's number, what they needed and the workspace in the subject, the words first, then the page. */
function supportMail(reportToMail: ReportToMail, origin: string): { subject: string; text: string } {
  const code = reportCode(reportToMail.number);
  const need = kindWords(reportToMail.kind);
  const screen = reportToMail.kind === "wrong" ? "health" : "support";
  const where = reportToMail.tenant ? `${reportToMail.tenant.name} (${reportToMail.tenant.slug})` : "No workspace";
  const error = reportToMail.error_id
    ? `${reportToMail.error_id} · ${[reportToMail.error_name, reportToMail.error_message].filter(Boolean).join(": ") || "an error"}`
    : "None caught";
  const sentence = oneLine(reportToMail.words);
  return {
    subject: oneLine(`${code} · ${need} · ${where} · ${sentence.length > 60 ? `${sentence.slice(0, 59)}…` : sentence}`),
    text:
      `${code}, ${need.toLowerCase()}, from ${reportToMail.email ?? "a member"} in ${where}.\n\n` +
      `What they wrote:\n${reportToMail.words}\n\n` +
      `Page: ${pageWords(reportToMail.page)}\n` +
      (reportToMail.kind === "wrong" || reportToMail.error_id ? `Last error: ${error}\n` : "") +
      `Sent: ${reportToMail.created_at}\n\n` +
      `Reply to this mail to answer them, within one business day. It is in the Console: ${origin}${CONSOLE_PATH}/${screen}\n`,
  };
}

export async function mailSupportReport(
  auth: Admitted,
  body: { report_id?: unknown },
  send: typeof postMail = postMail,
): Promise<Response> {
  const log = logger();
  const from = platformFrom();
  const to = supportTo();
  if (!from || !to.length) return refuse(503, "no_platform_mailbox");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const user = personFor(auth, null);
  const id = typeof body.report_id === "string" ? body.report_id.trim() : "";
  if (!user || !UUID.test(id)) return refuse(400, "bad_request", "a report_id, sent for the member who wrote it");
  const { data, error } = await reportToMail(db, id, user);
  if (error) return refuse(503, "read_failed", error.message);
  if (!data) return refuse(404, "not_found", "no such report");
  const { subject, text } = supportMail(data, dashboardOrigin());
  const sent = await send({ from, to, subject, text, replyTo: data.email });
  log.info("support_report_mailed", { tenant_id: data.tenant_id, report: reportCode(data.number), sent });
  return json(sent ? 200 : 502, { ok: sent });
}
