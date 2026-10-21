/**
 * POST /api/admin/support/report — a member pressed Send on Report a problem (decision 0066), and the support inbox
 * hears about it.
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
import { json, refuse } from "./http.js";
import { personFor, type Admitted } from "./admin-auth.js";
import { pg } from "./pg.js";
import { platformFrom, platformTo, postMail } from "./ops/notify.js";
import { dashboardOrigin } from "./dashboard-origin.js";
import { env } from "./env.js";
import { logger } from "./log.js";
import { reportToMail } from "./packages/db.js";
import { CONSOLE_PATH, UUID, pageWords, reportCode } from "./packages/contracts.js";

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
  email: string | null;
  page: string | null;
  error_id: string | null;
  error_name: string | null;
  error_message: string | null;
  words: string;
  created_at: string;
  tenant: { slug: string; name: string } | null;
}

/** Text a member or an owner typed, as one line: a subject holds no line break, whatever they wrote. */
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The mail: the report's number and workspace in the subject, the words first, then what the page said. */
function supportMail(r: ReportToMail, origin: string): { subject: string; text: string } {
  const code = reportCode(r.number);
  const where = r.tenant ? `${r.tenant.name} (${r.tenant.slug})` : "No workspace";
  const error = r.error_id
    ? `${r.error_id} · ${[r.error_name, r.error_message].filter(Boolean).join(": ") || "an error"}`
    : "None caught";
  const said = oneLine(r.words);
  return {
    subject: oneLine(`${code} · ${where} · ${said.length > 60 ? `${said.slice(0, 59)}…` : said}`),
    text:
      `${code}, from ${r.email ?? "a member"} in ${where}.\n\n` +
      `What they wrote:\n${r.words}\n\n` +
      `Page: ${pageWords(r.page)}\n` +
      `Last error: ${error}\n` +
      `Sent: ${r.created_at}\n\n` +
      `Reply to this mail to answer them. The report is in the Console: ${origin}${CONSOLE_PATH}/support\n`,
  };
}

export async function mailSupportReport(
  auth: Admitted,
  body: { report_id?: unknown },
  send: typeof postMail = postMail,
): Promise<Response> {
  const L = logger();
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
  L.info("support_report_mailed", { tenant_id: data.tenant_id, report: reportCode(data.number), sent });
  return json(sent ? 200 : 502, { ok: sent });
}
