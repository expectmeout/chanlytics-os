/**
 * Run the line saga on a row, then tell the workspace and the platform what happened.
 *
 * EXTRACTED so there is one of it. Two things provision a line: the owner pressing
 * Get a line (or Retry), and the sweep that resumes a line whose saga was killed
 * mid-run. A sweep that assembled its own version of "and then tell everybody" would
 * be a second answer to what a customer is told about their own phone number — and
 * the version the sweep is most likely to get wrong is the failure half, which is the
 * half that matters.
 *
 * So the bell row, the platform email and the ledger event live here, and every
 * caller gets them by construction rather than by remembering. `reportLineFailed` is
 * exported for the one place a line fails WITHOUT a saga returning — the sweep
 * handing a line to a person after its automatic tries run out — so that too is told
 * in the same words.
 */
import { notify, recordNotification } from "../ops/notify.js";
import { emitEvent } from "../packages/db.js";
import { formatPhoneDisplay, lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "../packages/contracts.js";
import { runLineSaga, type LineRow } from "../packages/channels.js";
import { linePorts, LINE_STEP_WORDS, type LineProviderChoice } from "./lines.js";
import type { ResumedBy } from "./line-resume.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { logger } from "../log.js";

/**
 * A line stopped: tell the workspace's bell, the platform's mailbox and the ledger.
 *
 * One function, because a line fails two ways — a saga returns a failure, or the
 * sweep gives up on one that kept being cut off — and the owner, support and the
 * ledger must not be able to tell those apart by the wording.
 */
export async function reportLineFailed(
  db: SupabaseClient<Database>,
  providerName: string,
  tenant: { id: string; name: string },
  line: { id: string; e164: string | null },
  step: string,
  error: string,
  by: ResumedBy,
): Promise<void> {
  const shown = formatPhoneDisplay(line.e164) ?? line.e164 ?? "your number";
  const at = LINE_STEP_WORDS[step] ?? step;
  // A failure at the vault is ours, not the carrier's: the bell does not offer a retry that cannot help.
  const credentials = lineCredentialFailure(error);
  await recordNotification(tenant.id, {
    kind: "alert",
    title: "Your phone line hit a snag — a person at Chanlytics has it",
    body: credentials
      ? `Setting up ${shown} stopped at ${LINE_CREDENTIALS_SENTENCE}. A retry cannot help until we restore them; we have been told and will finish it with you.`
      : `Setting up ${shown} stopped while ${at}. You can retry from Setup; we have been told and will finish it with you if the retry does not.`,
    route: "admin/setup",
    about: { type: "line", id: line.id },
  });
  await notify(
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      kind: "alert",
      subject: `Line failed · ${tenant.name}`,
      body: `${tenant.name} (${tenant.id}) — line ${line.id} for ${line.e164 ?? "no number"} stopped at step "${at}" (started by ${by}).\n\n${error}\n\nRetry: POST /api/admin/lines { "op": "retry", "tenant_id": "${tenant.id}", "line_id": "${line.id}" } (x-diag-key).`,
    },
  );
  await emitEvent(db, tenant.id, "line.failed", "line", line.id, {
    step,
    error: error.slice(0, 300),
    provider: providerName,
    by,
  }).catch(() => {});
}

export async function provisionLine(
  db: SupabaseClient<Database>,
  choice: LineProviderChoice,
  cfg: { apiKey: string },
  secrets: { fnSecret: string },
  tenant: { id: string; name: string },
  line: LineRow,
  /**
   * Who started this run, for the platform email: a person pressed something, or
   * nobody did. Required — it used to default to "owner", a default no caller ever
   * used, which is how the edge came to label every retry "support" without anything
   * in the type system noticing.
   */
  by: ResumedBy,
  /**
   * Epoch ms after which the saga starts no more provider calls (the job's deadline). Past it the run stops between
   * two calls with `later`, and the job hands the rest to the next one. Without it the run goes to the end.
   */
  deadline?: number,
) {
  const timeLeft = deadline === undefined ? undefined : () => deadline - Date.now();
  const result = await runLineSaga(line, { ...linePorts(db, cfg, secrets, tenant, line, choice), timeLeft });
  const shown = formatPhoneDisplay(result.line.e164) ?? result.line.e164 ?? "your number";
  if (result.ok && result.later) {
    // Nobody is told anything: the line is still setting up, and the next run goes on from its step.
    logger({ tenant_id: tenant.id }).info("line_saga_later", {
      line: line.id,
      step: result.step,
      provider: choice.name,
      by,
    });
    return result;
  }
  if (result.ok) {
    await recordNotification(tenant.id, {
      kind: "number",
      title: `Your phone line is ready: ${shown}`,
      body: `The receptionist answers calls on ${shown}. Call it from your own phone to hear it; the Live page shows the call as it happens. Texting arrives once the carriers register the line.`,
      route: "admin/setup",
      about: { type: "line", id: line.id },
    });
    await emitEvent(db, tenant.id, "line.answering", "line", line.id, {
      e164: result.line.e164,
      provider: choice.name,
      agent_id: result.line.retell_agent_id,
      by,
    }).catch(() => {});
  } else {
    await reportLineFailed(db, choice.name, tenant, result.line, result.step, result.error, by);
  }
  logger({ tenant_id: tenant.id }).info("line_saga", {
    line: line.id,
    ok: result.ok,
    step: result.ok ? null : result.step,
    provider: choice.name,
    by,
  });
  return result;
}
