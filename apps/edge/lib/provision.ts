/**
 * Run the line saga on a row, then tell the workspace and the platform what happened.
 *
 * EXTRACTED so there is one of it. Two things now provision a line: the owner
 * pressing Get a line (or Retry), and the sweep that resumes a line whose saga was
 * killed mid-run. A sweep that assembled its own version of "and then tell
 * everybody" would be a second answer to what a customer is told about their own
 * phone number — and the version the sweep is most likely to get wrong is the
 * failure half, which is the half that matters.
 *
 * So the bell row, the platform email and the ledger event all live here, and both
 * callers get them by construction rather than by remembering.
 */
import { notify, recordNotification } from "./notify.js";
import { emitEvent } from "./workspace/db.js";
import { formatPhoneDisplay } from "./workspace/contracts.js";
import { runLineSaga, type LineRow } from "./workspace/channels.js";
import { linePorts, LINE_STEP_WORDS, type LineProviderChoice } from "./lines.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";

export async function provisionLine(
  db: SupabaseClient<Database>,
  choice: LineProviderChoice,
  cfg: { apiKey: string },
  secrets: { fnSecret: string },
  tenant: { id: string; name: string },
  line: LineRow,
  /** How this run was started, for the platform email — a person pressed something, or nobody did. */
  by: "owner" | "support" | "sweep" = "owner",
) {
  const result = await runLineSaga(line, linePorts(db, cfg, secrets, tenant, line, choice));
  const shown = formatPhoneDisplay(result.line.e164) ?? result.line.e164 ?? "your number";
  if (result.ok) {
    await recordNotification(tenant.id, {
      kind: "number",
      title: `Your phone line is ready: ${shown}`,
      body: `The receptionist answers calls on ${shown}. Call it from your own phone to hear it; the Live page shows the call as it happens. Texting arrives once the carriers register the line.`,
      route: "admin/setup",
      about: { type: "line", id: line.id },
    });
    await emitEvent(db, tenant.id, "line.answering", "setup", "line", line.id, { e164: result.line.e164, provider: choice.name, agent_id: result.line.retell_agent_id, by }).catch(() => {});
  } else {
    const at = LINE_STEP_WORDS[result.step] ?? result.step;
    await recordNotification(tenant.id, {
      kind: "alert",
      title: "Your phone line hit a snag — a person at Chanlytics has it",
      body: `Setting up ${shown} stopped while ${at}. You can retry from Setup; we have been told and will finish it with you if the retry does not.`,
      route: "admin/setup",
      about: { type: "line", id: line.id },
    });
    await notify(
      { tenantId: null, notifications: null, isEnvDefault: true },
      {
        kind: "alert",
        subject: `Line failed · ${tenant.name}`,
        body: `${tenant.name} (${tenant.id}) — line ${line.id} for ${result.line.e164 ?? "no number"} stopped at step "${at}" (started by ${by}).\n\n${result.error}\n\nRetry: POST /api/admin/lines { "op": "retry", "tenant_id": "${tenant.id}", "line_id": "${line.id}" } (x-diag-key).`,
      },
    );
    await emitEvent(db, tenant.id, "line.failed", "setup", "line", line.id, { step: result.step, error: result.error.slice(0, 300), provider: choice.name, by }).catch(() => {});
  }
  console.log("line_saga", JSON.stringify({ tenant: tenant.id, line: line.id, ok: result.ok, step: result.ok ? null : result.step, provider: choice.name, by }));
  return result;
}
