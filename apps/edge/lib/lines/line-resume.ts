/**
 * Which lines may be resumed, and taking one so that nobody else resumes it too.
 *
 * Split from provision.ts on purpose. That file runs the saga and tells people —
 * it reaches Twilio and Retell and holds the platform's mailbox. This one only
 * DECIDES: which stuck lines to pick up, whether a line is still owed an automatic
 * try, and the compare-and-swap that makes a resume exclusive. Everything that
 * reaches a provider is handed in, so these decisions run against a fake database
 * in the tests instead of being read off the page.
 *
 * THE RACE THIS CLOSES. A resume used to be "read the row, check it is stuck, run
 * the saga". Two callers could both read it stuck — the quarter-hourly sweep and an
 * owner pressing Retry, or an owner and support pressing at once — and both would
 * run the same saga against one row: two trunks and two credential lists at the
 * carrier, two writers racing on the row. The saga stamps `state_since` only when
 * it starts, so nothing on the row said "taken" until it was too late to matter.
 *
 * Now taking the row IS the check: one UPDATE whose filters name the state the
 * caller saw. Postgres applies it to whatever matches at the moment it runs, so the
 * second caller's filters match nothing and it learns, from an empty result, that
 * somebody else has it.
 */
import { PROVISIONING_DEADLINE_MS, LINE_STEP_WORDS, formatPhoneDisplay } from "../packages/contracts.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;
export type LineDbRow = Database["public"]["Tables"]["lines"]["Row"];

/** Who asked for a resume. The sweep is nobody; the other two are people. */
export type ResumedBy = "owner" | "support" | "sweep";

/**
 * How many times the sweep resumes one line on its own before handing it to a person.
 *
 * Without a ceiling, a line that can never finish inside its lambda — a carrier that
 * is slow every time, a step that always times out — would be resumed and killed every
 * quarter hour for ever, and each of those is a run of provider calls and, with the
 * alert below, an email. Three rides out a slow afternoon and still gets a real fault
 * to a person the same morning.
 */
export const MAX_AUTOMATIC_RESUMES = 3;

/**
 * Who pressed Retry, from what the dashboard sent.
 *
 * The owner's route names itself; anything unnamed came from somebody holding the
 * diagnostic key, which is support. The edge used to write "support" for every
 * retry, so an owner pressing the button on their own Setup page reached the
 * platform mailbox as "started by support" — a false account of who was waiting.
 */
export function retryRequestedBy(raw: unknown): "owner" | "support" {
  return raw === "owner" ? "owner" : "support";
}

/** A line's facts as an object to read or spread into a write: anything else stored there (null, an array) is none. */
export const factsOf = (row: Pick<LineDbRow, "facts">): Record<string, unknown> =>
  row.facts && typeof row.facts === "object" && !Array.isArray(row.facts)
    ? { ...(row.facts as Record<string, unknown>) }
    : {};

/** The automatic tries this line has had since a person last pressed Retry. */
export function automaticResumesOf(row: Pick<LineDbRow, "facts">): number {
  const n = Number(factsOf(row).automatic_resumes ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Take a line for a resume, or learn that somebody else just did.
 *
 * Returns the row as it is NOW — after the take — which is what the saga must start
 * from: a snapshot read a minute earlier can predate steps another run finished. Null
 * means it is not ours: already restarted, answering, or gone.
 *
 * Taking it sets `voice_state = 'provisioning'` and a fresh `state_since`, which is
 * what makes the take visible — a failed row flipped to provisioning, and a stuck one
 * given a new clock, match neither of the filters below for the next caller.
 *
 * A person's Retry clears the automatic count, because it is a fresh decision to try;
 * the sweep's own tries leave it where it is, because they are what it counts.
 */
export async function claimLineForResume(
  db: Db,
  row: Pick<LineDbRow, "id" | "voice_state" | "facts">,
  nowMs: number,
  by: ResumedBy,
): Promise<LineDbRow | null> {
  const values: Database["public"]["Tables"]["lines"]["Update"] = {
    voice_state: "provisioning",
    state_since: new Date(nowMs).toISOString(),
    last_error: null,
    ...(by === "sweep" ? {} : { facts: { ...factsOf(row), automatic_resumes: 0 } as Json }),
  };
  if (row.voice_state === "failed") {
    const { data, error } = await db
      .from("lines")
      .update(values)
      .eq("id", row.id)
      .eq("voice_state", "failed")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`claim_line: ${error.message}`);
    return data ?? null;
  }
  if (row.voice_state === "provisioning") {
    // The same deadline `lineStuckProvisioning` reads, as a filter: a saga that is
    // genuinely still running has a `state_since` inside it and is never taken.
    const cutoff = new Date(nowMs - PROVISIONING_DEADLINE_MS).toISOString();
    const { data, error } = await db
      .from("lines")
      .update(values)
      .eq("id", row.id)
      .eq("voice_state", "provisioning")
      .lt("state_since", cutoff)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`claim_line: ${error.message}`);
    return data ?? null;
  }
  return null;
}

/**
 * Count one automatic try against the line's bound, and hand back the row as it
 * now reads.
 *
 * Two callers resume a failed or stuck line on their own -- this file's sweep
 * and the ledger's handler (line-provision-job.ts) -- and only one of them used
 * to count, so `MAX_AUTOMATIC_RESUMES` bounded the sweep and bounded nothing on
 * the ledger path. The count is the whole of the bound, so it lives in one
 * function that both call rather than in a comment claiming they match.
 *
 * A refusal is returned rather than thrown, and a caller that gets one must NOT
 * run the saga: an uncounted try is how a line is resumed for ever. The row
 * keeps `provisioning` with a fresh `state_since`, which holds it off until the
 * deadline passes.
 */
export async function countAutomaticResume(
  db: Db,
  row: LineDbRow,
): Promise<{ ok: true; row: LineDbRow } | { ok: false; error: string }> {
  const facts = { ...factsOf(row), automatic_resumes: automaticResumesOf(row) + 1 } as Json;
  const { error } = await db.from("lines").update({ facts }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: { ...row, facts } };
}

export interface StuckSweepDeps {
  /** Run the saga on a line this sweep has taken. The route wires `provisionLine`. */
  resume: (tenant: { id: string; name: string }, row: LineDbRow) => Promise<{ ok: boolean }>;
  /** The platform mailbox. */
  alert: (subject: string, body: string) => Promise<unknown>;
  /**
   * Everything a line failing tells people — the workspace's bell, the platform, the
   * ledger. The route wires `reportLineFailed`, the same function a saga's own
   * returned failure goes through, so giving up on a line and a line refusing are
   * told in one voice.
   */
  reportFailed: (tenant: { id: string; name: string }, row: LineDbRow, error: string) => Promise<unknown>;
  now: () => number;
  log: Pick<Logger, "info" | "error">;
}

export interface StuckSweepResult {
  /** Rows past the deadline that this tick looked at. */
  stuck: number;
  resumed: number;
  failed: number;
  /** Past the automatic ceiling: marked failed and handed to a person. */
  gaveUp: number;
  /** Somebody else took it between this sweep's read and its take. */
  skipped: number;
  unreadable: number;
}

/**
 * Resume what the lambda killed, a few at a time, and say so.
 *
 * WHY THE PLATFORM IS TOLD HERE. The Setup row for a stuck line used to say "We have
 * been told" — and nothing had been. The saga's failure email only fires when a saga
 * RETURNS a failure; a saga that is killed returns nothing, which is the whole defect.
 * So the moment this sweep first picks a line up is the first moment anything in the
 * product knows it is stuck, and that is when the mailbox hears. Once, on the first
 * try: later tries go to the ledger, and a person hears again only if the line is
 * handed to them.
 */
export async function sweepStuckLines(db: Db, deps: StuckSweepDeps, limit: number): Promise<StuckSweepResult> {
  const cutoff = new Date(deps.now() - PROVISIONING_DEADLINE_MS).toISOString();
  // Oldest first, so a backlog drains in the order it built up.
  const { data: rows, error } = await db
    .from("lines")
    .select("*")
    .eq("voice_state", "provisioning")
    .lt("state_since", cutoff)
    .order("state_since", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`lines_sweep_read: ${error.message}`);

  const out: StuckSweepResult = {
    stuck: (rows ?? []).length,
    resumed: 0,
    failed: 0,
    gaveUp: 0,
    skipped: 0,
    unreadable: 0,
  };
  for (const row of rows ?? []) {
    // The workspace first, and only then the take: a line whose workspace cannot be
    // read is left untouched for the next tick rather than taken and abandoned.
    const t = await db.from("tenants").select("id, name").eq("id", row.tenant_id).maybeSingle();
    if (t.error || !t.data) {
      out.unreadable += 1;
      deps.log.error("lines_sweep_no_workspace", {
        line_id: row.id,
        tenant_id: row.tenant_id,
        error: t.error?.message ?? "not found",
      });
      continue;
    }

    let taken: LineDbRow | null;
    try {
      taken = await claimLineForResume(db, row, deps.now(), "sweep");
    } catch (e) {
      out.failed += 1;
      deps.log.error("lines_sweep_claim_failed", {
        line_id: row.id,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (!taken) {
      // A person's Retry, or support's, got there between this sweep's read and now.
      out.skipped += 1;
      continue;
    }

    const tries = automaticResumesOf(taken);
    const shown = formatPhoneDisplay(taken.e164) ?? taken.e164 ?? "(no number)";
    const at = LINE_STEP_WORDS[taken.step ?? ""] ?? taken.step ?? "setting up";

    if (tries >= MAX_AUTOMATIC_RESUMES) {
      // Handed to a person. `failed` is the state the owner's Retry, support's Retry
      // and every page already know what to do with — and a returned failure is
      // exactly what this is now, just returned by the sweep instead of the saga.
      const why = `Setting up stopped while ${at}, and ${MAX_AUTOMATIC_RESUMES} automatic tries did not finish it. Retry picks up where it stopped.`;
      const { error: failErr } = await db
        .from("lines")
        .update({ voice_state: "failed", last_error: why, state_since: new Date(deps.now()).toISOString() })
        .eq("id", taken.id);
      if (failErr) {
        out.failed += 1;
        deps.log.error("lines_sweep_give_up_unwritten", { line_id: taken.id, error: failErr.message });
        continue;
      }
      await deps.reportFailed(t.data, { ...taken, voice_state: "failed", last_error: why }, why);
      out.gaveUp += 1;
      continue;
    }

    const counted = await countAutomaticResume(db, taken);
    if (!counted.ok) {
      // Not counting a try is how a line gets resumed for ever. Leave it taken — its
      // fresh `state_since` keeps it off the next tick for five minutes — and say so.
      out.failed += 1;
      deps.log.error("lines_sweep_count_unwritten", { line_id: taken.id, error: counted.error });
      continue;
    }

    if (tries === 0) {
      await deps.alert(
        `Line stuck · ${t.data.name}`,
        `${t.data.name} (${t.data.id}) — line ${taken.id} for ${shown} stopped while ${at} and was never marked failed: its setup was cut off mid-run, most likely by the 60-second limit on a slow afternoon at the provider.\n\nIt is being resumed automatically, try 1 of ${MAX_AUTOMATIC_RESUMES}. You hear again only if those do not finish it.`,
      );
    }

    try {
      const r = await deps.resume(t.data, counted.row);
      if (r.ok) out.resumed += 1;
      else out.failed += 1;
    } catch (e) {
      // Died outside its own error handling. The try is counted and the row keeps
      // `provisioning`, so the next tick after the deadline takes it again.
      out.failed += 1;
      deps.log.error("lines_sweep_resume_threw", {
        line_id: taken.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}
