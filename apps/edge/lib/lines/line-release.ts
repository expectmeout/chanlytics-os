/**
 * Giving a number back: once by hand (the platform's `release` op, api/admin/lines.ts), and on its own for a workspace
 * whose subscription ended (the lines sweep, api/cron/lines.ts).
 *
 * WHY THE SWEEP. Nothing gave a number back. A workspace that cancelled kept its line, we paid the carrier for it
 * every month, and its receptionist went on answering "take a message" for a business that had left. The rule of
 * when is contracts' (lineReleaseStep): a grace after the subscription stopped paying, a warning a week before, and
 * never a release sooner than a week after the warning.
 *
 * WHY IT ONLY REPORTS BY DEFAULT. A release cannot be undone: the number goes back to the carrier's pool and to
 * somebody else. Until LINE_RELEASE_AFTER_DAYS is set, the sweep logs what it would do (line_release_report) and
 * touches nothing -- no warning either, since a warning names a day that would not come.
 *
 * ONLY NUMBERS WE BOUGHT. `kind = 'chanlytics'` alone. A ported or hosted number is the business's own; giving it
 * back would take a business's number away from it. A forwarded row is the owner's own phone, and is read only to
 * tell them to switch its forwarding off.
 */
import {
  BILLING_STATUSES,
  LINE_RELEASE_REPORT_DAYS,
  lineReleaseDay,
  lineReleaseStep,
  lineReleaseWarning,
  lineReleasedWords,
  receptionistOn,
  type EdgeErrorCode,
  type LineReleaseBilling,
  type LineReleaseWarned,
} from "../packages/contracts.js";
import { deletePhoneNumber, type RetellConfig } from "../packages/channels.js";
import { emitEvent } from "../packages/db.js";
import { releaseRoutingRows, rowToLine, type LineProviderChoice } from "./lines.js";
import { factsOf } from "./line-resume.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;
type LineDbRow = Database["public"]["Tables"]["lines"]["Row"];

/** A release that stopped: its code, what stopped it in `detail`, and what came off before it did. */
export type LineReleaseResult =
  | { ok: true; released: Record<string, unknown> }
  | { ok: false; status: 502 | 503; error: EdgeErrorCode; detail: string; released: Record<string, unknown> };

/**
 * Give one line's number back: Retell's copy of it, the number and the trunk at the carrier, the routing rows switched
 * off (never deleted: calls keep their history), the row forgotten, the ledger written. A step that fails stops it and
 * the row stays, so the next try finds what is left.
 */
export async function releaseLine(
  db: Db,
  choice: LineProviderChoice,
  retell: RetellConfig | null,
  tenantId: string,
  row: LineDbRow,
  event: Record<string, unknown> = {},
): Promise<LineReleaseResult> {
  const line = rowToLine(row);
  const released: Record<string, unknown> = {};
  try {
    // Retell first: it answers calls to this number, and in a month the number may be somebody else's.
    if (line.facts.retell_imported === true && line.e164) {
      if (!retell) throw new Error("the receptionist's key is not set, so its copy of the number cannot be taken off");
      const r = await deletePhoneNumber(retell, line.e164);
      if (!r.ok) throw new Error(`Retell delete-phone-number: HTTP ${r.status}`);
      released.retell_number = line.e164;
    }
    const creds = await db.rpc("get_line_credentials", { p_line_id: line.id });
    const token =
      creds.data && typeof creds.data === "object" && !Array.isArray(creds.data)
        ? (creds.data as { auth_token?: string }).auth_token
        : undefined;
    if (line.subaccount_sid && token) {
      const acct = { sid: line.subaccount_sid, token };
      // A NUMBER WE MAY OWN WITHOUT KNOWING. The row's `number_sid` is written
      // after the purchase answers, so a saga killed in that window leaves the
      // number bought and the row silent -- and this used to skip straight past
      // it and delete the row, so we paid for it every month with nothing left
      // pointing at it. `number_drift()` compares `lines` to `tenant_channels`
      // and never asks the provider, so nothing would ever have noticed.
      const sid =
        line.number_sid ?? (line.e164 ? ((await choice.provider.ownedNumber(acct, line.e164))?.sid ?? null) : null);
      if (sid) {
        await choice.provider.releaseNumber(acct, sid);
        released.number = sid;
        if (!line.number_sid) released.number_found_by_lookup = true;
      }
      if (line.trunk_sid) {
        await choice.provider.deleteTrunk(acct, line.trunk_sid);
        released.trunk = line.trunk_sid;
      }
    }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: "provider_refused",
      detail: `releasing at the provider: ${e instanceof Error ? e.message : String(e)}`,
      released,
    };
  }
  const rows = await releaseRoutingRows(db, tenantId, line);
  Object.assign(released, rows.released);
  if (!rows.ok) return { ok: false, status: 503, error: "write_failed", detail: rows.error, released };
  const del = await db.from("lines").delete().eq("id", line.id);
  if (del.error) return { ok: false, status: 503, error: "write_failed", detail: del.error.message, released };
  await emitEvent(db, tenantId, "line.released", "setup", "line", line.id, {
    e164: line.e164,
    provider: choice.name,
    ...released,
    ...event,
  } as Json).catch(() => {});
  return { ok: true, released };
}

/* ---------------------------------------------------------------- the sweep */

/** Stripe's words for a subscription that no longer pays: the receptionist is paused on each. */
const ENDED_STATUSES = BILLING_STATUSES.filter((s) => !receptionistOn(s));

/**
 * At most this many releases a tick: each is a Retell call and three carrier calls inside the sweep's 60 seconds, and
 * the stuck-lines half runs first. A backlog drains over the quarter hours.
 */
const MAX_RELEASES_PER_TICK = 2;
const MAX_WARNINGS_PER_TICK = 10;

interface EndedLinesPorts {
  release(tenantId: string, row: LineDbRow, endedAt: string): Promise<LineReleaseResult>;
  /** The bell and the workspace's alert addresses (notify). */
  tell(tenantId: string, msg: { subject: string; body: string }): Promise<boolean>;
  /** The platform's mailbox, for a release that failed. */
  alert(subject: string, body: string): Promise<unknown>;
  /** Where the workspace resumes: its Billing page. */
  billingUrl(slug: string): string;
  now(): number;
  log: Logger;
}

export interface EndedLinesResult {
  /** Lines of workspaces whose subscription no longer pays. */
  ended: number;
  /** Of those, past the grace (or past it against LINE_RELEASE_REPORT_DAYS, while only reporting). */
  due: number;
  warned: number;
  released: number;
  failed: number;
  report_only: boolean;
}

const BILLING_COLUMNS =
  "tenant_id, mode, status, trial_end, current_period_end, cancel_at, last_payment_failed_at, updated_at";

function warnedOf(row: LineDbRow): LineReleaseWarned | null {
  const w = factsOf(row).release_warning;
  if (!w || typeof w !== "object" || Array.isArray(w)) return null;
  const { at, ended_at } = w as Record<string, unknown>;
  return typeof at === "string" && typeof ended_at === "string" ? { at, ended_at } : null;
}

/**
 * One pass: each number of a workspace whose subscription ended is waited on, warned about, or given back, as
 * contracts' rule says. `afterDays` null only reports. Bounded per tick.
 */
export async function sweepEndedLines(
  db: Db,
  ports: EndedLinesPorts,
  afterDays: number | null,
): Promise<EndedLinesResult> {
  const out: EndedLinesResult = {
    ended: 0,
    due: 0,
    warned: 0,
    released: 0,
    failed: 0,
    report_only: afterDays === null,
  };
  const bills = await db
    .from("billing_accounts")
    .select(BILLING_COLUMNS)
    .eq("mode", "stripe")
    .in("status", [...ENDED_STATUSES]);
  if (bills.error) throw new Error(`reading billing: ${bills.error.message}`);
  const byTenant = new Map((bills.data ?? []).map((b) => [b.tenant_id, b as unknown as LineReleaseBilling]));
  if (!byTenant.size) return out;
  const ids = [...byTenant.keys()];
  const [tenants, lines] = await Promise.all([
    db.from("tenants").select("id, slug, status").in("id", ids),
    db.from("lines").select("*").in("tenant_id", ids).in("kind", ["chanlytics", "forwarded"]).order("created_at"),
  ]);
  if (tenants.error) throw new Error(`reading workspaces: ${tenants.error.message}`);
  if (lines.error) throw new Error(`reading lines: ${lines.error.message}`);
  const tenantOf = new Map((tenants.data ?? []).map((t) => [t.id, t]));
  const rows = (lines.data ?? []) as LineDbRow[];
  /** The owner's own number that forwards to this one, when one does. */
  const forwardedTo = (tenantId: string, e164: string | null) =>
    rows.find(
      (r) =>
        r.tenant_id === tenantId &&
        r.kind === "forwarded" &&
        r.forwarding_state !== "none" &&
        factsOf(r).destination_e164 === e164,
    )?.e164 ?? null;

  for (const row of rows) {
    if (row.kind !== "chanlytics") continue;
    const tenant = tenantOf.get(row.tenant_id);
    // A workspace put back on by hand (tenants.status) is somebody's decision to keep it answering: not ours to end.
    if (!tenant || tenant.status !== "paused") continue;
    out.ended += 1;
    const now = ports.now();
    const bill = byTenant.get(row.tenant_id);

    if (afterDays === null) {
      const step = lineReleaseStep(bill, LINE_RELEASE_REPORT_DAYS, null, now);
      if (step.step === "keep") continue;
      // Only a line that would go is named, each tick until the grace is set; the counts are in lines_sweep_done.
      if (now < step.releaseAt) continue;
      out.due += 1;
      ports.log.info("line_release_report", {
        tenant: row.tenant_id,
        line: row.id,
        ended_at: new Date(step.endedAt).toISOString(),
      });
      continue;
    }

    const step = lineReleaseStep(bill, afterDays, warnedOf(row), now);
    if (step.step === "keep" || step.step === "wait") continue;
    const words = {
      number: row.e164 ?? "",
      forwardedFrom: forwardedTo(row.tenant_id, row.e164),
      billingUrl: ports.billingUrl(tenant.slug),
    };

    if (step.step === "warn") {
      if (out.warned >= MAX_WARNINGS_PER_TICK) continue;
      const on = lineReleaseDay(step.releaseAt, now);
      // Kept before the owner is told, so a tick that dies between the two warns nobody twice.
      const up = await db
        .from("lines")
        .update({
          facts: {
            ...factsOf(row),
            release_warning: {
              at: new Date(now).toISOString(),
              ended_at: new Date(step.endedAt).toISOString(),
              on: new Date(on).toISOString(),
            },
          } as Json,
        })
        .eq("id", row.id);
      if (up.error) throw new Error(`keeping the warning: ${up.error.message}`);
      await ports.tell(row.tenant_id, lineReleaseWarning({ ...words, on }));
      out.warned += 1;
      ports.log.info("line_release_warned", { tenant: row.tenant_id, line: row.id, on: new Date(on).toISOString() });
      continue;
    }

    out.due += 1;
    if (out.released + out.failed >= MAX_RELEASES_PER_TICK) continue;
    // Read again, just before: a workspace that resumed a moment ago keeps its number.
    const fresh = await db
      .from("billing_accounts")
      .select(BILLING_COLUMNS)
      .eq("tenant_id", row.tenant_id)
      .maybeSingle();
    if (fresh.error) throw new Error(`reading billing: ${fresh.error.message}`);
    const again = lineReleaseStep(fresh.data as unknown as LineReleaseBilling | null, afterDays, warnedOf(row), now);
    if (again.step !== "release") continue;
    const r = await ports.release(row.tenant_id, row, new Date(again.endedAt).toISOString());
    if (!r.ok) {
      out.failed += 1;
      ports.log.error("line_release_failed", { tenant: row.tenant_id, line: row.id, error: r.error, detail: r.detail });
      await ports.alert(
        `A number could not be given back (workspace ${row.tenant_id})`,
        `The lines sweep tried to release line ${row.id} after its subscription ended, and it stopped: ${r.detail}\n\nWhat came off before it stopped: ${JSON.stringify(r.released)}. The row stays, and the next quarter hour tries again.`,
      );
      continue;
    }
    out.released += 1;
    await ports.tell(row.tenant_id, lineReleasedWords(words));
    ports.log.info("line_released_by_sweep", { tenant: row.tenant_id, line: row.id, ...r.released });
  }
  return out;
}
