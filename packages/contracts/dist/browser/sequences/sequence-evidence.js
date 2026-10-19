import { plural } from "../shared/words.js";
export const EVIDENCE_DAYS = 90;
const batches = (n) => plural(n, "batch", "batches");
function wentWords(e) {
  const own = e.went - e.approved;
  if (e.approved === e.went) return `${batches(e.went)} went, ${e.went === 1 ? "after" : "each after"} your OK`;
  if (e.approved === 0) return `${batches(e.went)} went on ${e.went === 1 ? "its" : "their"} own`;
  return `${batches(e.went)} went: ${e.approved} after your OK, ${own} on ${own === 1 ? "its" : "their"} own`;
}
export function evidenceWords(e) {
  if (!e) return null;
  const parts = [
    e.went > 0 ? wentWords(e) : "",
    e.stopped > 0 ? `you stopped ${e.stopped}` : "",
    e.skipped > 0 ? `${e.skipped} skipped: nobody answered in time` : ""
  ].filter(Boolean);
  if (parts.length === 0) return `No batch in the last ${EVIDENCE_DAYS} days`;
  return `Last ${EVIDENCE_DAYS} days: ${parts.join(" \xB7 ")}`;
}
export function evidenceOf(rows, sequenceId) {
  if (!rows) return null;
  const r = rows.find((x) => x.sequence_id === sequenceId);
  return r ?? { went: 0, approved: 0, stopped: 0, skipped: 0 };
}
function classEvidenceOf(rows, cls) {
  const of = (rows ?? []).filter((r) => r.policy_class === cls);
  if (of.length === 0) return null;
  return of.reduce(
    (a, r) => ({
      went: a.went + r.went,
      approved: a.approved + r.approved,
      stopped: a.stopped + r.stopped,
      skipped: a.skipped + r.skipped,
      sequences: a.sequences + 1
    }),
    { went: 0, approved: 0, stopped: 0, skipped: 0, sequences: 0 }
  );
}
export function classEvidenceLine(rows, cls) {
  const e = classEvidenceOf(rows, cls);
  const w = evidenceWords(e);
  return e && w ? `${plural(e.sequences, "sequence", "sequences")} \xB7 ${w}` : null;
}
