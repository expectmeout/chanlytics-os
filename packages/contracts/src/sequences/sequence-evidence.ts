/**
 * What a sequence's batches did, said as evidence (decision 0064, step 5): how many went, how many of those after your OK,
 * how many you stopped, and how many were skipped because nobody answered before their day ended. Said on a sequence's
 * How it runs, under "Before each batch", and under each Autonomy row for its class, so the owner moves a mode on what
 * happened. Nothing here suggests a mode or moves one (the decision's "a sequence never moves itself to Send it").
 *
 * The counts are the database's (00462 sequence_evidence, over EVIDENCE_DAYS); pure words here.
 */
import { plural } from "../shared/words";

/** How far back a sequence's evidence reaches: the database function's own default. */
export const EVIDENCE_DAYS = 90;

/** One sequence's batches over EVIDENCE_DAYS, as 00462 sequence_evidence counts them. */
export interface SequenceEvidenceDto {
  sequence_id: string;
  /** Its first step's class: the Autonomy row it is counted under. */
  policy_class: string;
  /** Batches that went (sending or sent). */
  went: number;
  /** Of those, how many went after a member's OK: an Approve, or a Run now. */
  approved: number;
  /** Batches a member stopped before they went. */
  stopped: number;
  /** Batches the night skipped because nobody answered before their day ended. */
  skipped: number;
}

export type SequenceEvidence = Pick<SequenceEvidenceDto, "went" | "approved" | "stopped" | "skipped">;

const batches = (n: number) => plural(n, "batch", "batches");

/** How the batches that went went: each after your OK, on their own, or some of each. */
function wentWords(e: SequenceEvidence): string {
  const own = e.went - e.approved;
  if (e.approved === e.went) return `${batches(e.went)} went, ${e.went === 1 ? "after" : "each after"} your OK`;
  if (e.approved === 0) return `${batches(e.went)} went on ${e.went === 1 ? "its" : "their"} own`;
  return `${batches(e.went)} went: ${e.approved} after your OK, ${own} on ${own === 1 ? "its" : "their"} own`;
}

/**
 * The evidence in one line: "Last 90 days: 12 batches went: 11 after your OK, 1 on its own · you stopped 1 · 2 skipped:
 * nobody answered in time", or that no batch was made. Null where it could not be read.
 */
export function evidenceWords(e: SequenceEvidence | null | undefined): string | null {
  if (!e) return null;
  const parts = [
    e.went > 0 ? wentWords(e) : "",
    e.stopped > 0 ? `you stopped ${e.stopped}` : "",
    e.skipped > 0 ? `${e.skipped} skipped: nobody answered in time` : "",
  ].filter(Boolean);
  if (parts.length === 0) return `No batch in the last ${EVIDENCE_DAYS} days`;
  return `Last ${EVIDENCE_DAYS} days: ${parts.join(" · ")}`;
}

/** One sequence's evidence from the workspace's, or none counted: a sequence with no batch is all zeros. */
export function evidenceOf(
  rows: readonly SequenceEvidenceDto[] | null | undefined,
  sequenceId: string,
): SequenceEvidence | null {
  if (!rows) return null;
  const r = rows.find((x) => x.sequence_id === sequenceId);
  return r ?? { went: 0, approved: 0, stopped: 0, skipped: 0 };
}

/**
 * The evidence of every sequence of a class, summed, and how many sequences it is over; null where it could not be read
 * or the class has no sequence with a batch.
 */
function classEvidenceOf(
  rows: readonly SequenceEvidenceDto[] | null | undefined,
  cls: string,
): (SequenceEvidence & { sequences: number }) | null {
  const of = (rows ?? []).filter((r) => r.policy_class === cls);
  if (of.length === 0) return null;
  return of.reduce(
    (a, r) => ({
      went: a.went + r.went,
      approved: a.approved + r.approved,
      stopped: a.stopped + r.stopped,
      skipped: a.skipped + r.skipped,
      sequences: a.sequences + 1,
    }),
    { went: 0, approved: 0, stopped: 0, skipped: 0, sequences: 0 },
  );
}

/** Under an Autonomy row: "3 sequences · Last 90 days: …"; null where nothing of the class is counted. */
export function classEvidenceLine(rows: readonly SequenceEvidenceDto[] | null | undefined, cls: string): string | null {
  const e = classEvidenceOf(rows, cls);
  const w = evidenceWords(e);
  return e && w ? `${plural(e.sequences, "sequence", "sequences")} · ${w}` : null;
}
