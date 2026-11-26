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
import type { TenantId } from "@chanlytics/contracts";
import { notify, recordNotification } from "../shared/alerts/notify.js";
import { recordActivation } from "@chanlytics/db/events";
import {
  FIRST_RUN_ROUTE,
  formatPhoneDisplay,
  lineCredentialFailure,
  LINE_CREDENTIALS_SENTENCE,
} from "@chanlytics/contracts";
import { runLineSaga, type LineRow } from "@chanlytics/channels/lines";
import { linePorts, LINE_STEP_WORDS, type LineProviderChoice } from "./lines.js";
import type { ResumedBy } from "./resume.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { logger } from "../shared/log.js";
import { logAndGoOn } from "@chanlytics/log";

/**
 * A line stopped: tell the workspace's bell and the platform's mailbox. The ledger's line.failed is the row's own move
 * to failed (00721 lines_tell_their_moves), whichever write made it.
 *
 * One function, because a line fails two ways — a saga returns a failure, or the
 * sweep gives up on one that kept being cut off — and the owner and support
 * must not be able to tell those apart by the wording.
 */
export async function reportLineFailed(
  tenant: { id: TenantId; name: string },
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
    title: "Setting up your phone line stopped · Chanlytics is on it",
    body: credentials
      ? `Setting up ${shown} stopped at ${LINE_CREDENTIALS_SENTENCE}. Trying again can’t help until Chanlytics restores them. Chanlytics has been told, and will finish it with you.`
      : `Setting up ${shown} stopped while ${at}. You can try again from Setup. Chanlytics has been told, and will finish it with you if that doesn’t work.`,
    route: FIRST_RUN_ROUTE,
    about: { type: "line", id: line.id },
  });
  await notify(
    { tenantId: null, notifications: null },
    {
      kind: "alert",
      subject: `Line failed · ${tenant.name}`,
      body: `${tenant.name} (${tenant.id}) — line ${line.id} for ${line.e164 ?? "no number"} stopped at step "${at}" (started by ${by}).\n\n${error}\n\nRetry: in the Console, open this workspace's Setup and lines and press Retry setting up.`,
    },
  );
}

export async function provisionLine(
  db: SupabaseClient<Database>,
  choice: LineProviderChoice,
  cfg: { apiKey: string },
  secrets: { fnSecret: string | null },
  tenant: { id: TenantId; name: string },
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
  // Who started this run rides on the line's facts, so the row's move to answering or failed says so on the ledger
  // (00721 lines_tell_their_moves). A fact that could not be kept leaves the event without it, never the run undone.
  const started: LineRow = { ...line, facts: { ...line.facts, started_by: by } };
  const ports = linePorts(db, cfg, secrets, tenant, started, choice);
  await ports.store.save({ facts: started.facts }).catch(logAndGoOn("keeping who started the line's run"));
  const result = await runLineSaga(started, { ...ports, timeLeft });
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
      body: `AI answers calls on ${shown}. Call it from your own phone to hear it. The Live page shows the call as it happens. Texting starts once it’s approved.`,
      route: FIRST_RUN_ROUTE,
      about: { type: "line", id: line.id },
    });
    // line.answering is the row's own: its move to answering wrote it (00721 lines_tell_their_moves).
    // The workspace's first line that answers: the funnel's first milestone (a WhatsApp connection is the other door).
    await recordActivation(db, tenant.id, "line_live", "phone").catch(() => false);
  } else {
    await reportLineFailed(tenant, result.line, result.step, result.error, by);
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
