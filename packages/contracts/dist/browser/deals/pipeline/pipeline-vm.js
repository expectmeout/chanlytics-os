export const PIPELINE_GROUPS = ["consultations", "proposals", "clients", "closed"];
export function pipelineRowId(personId, dealKey) {
  return dealKey === null ? personId : `${personId}_${dealKey}`;
}
export function pipelineRowNow(vm, rowId) {
  const rows = vm.groups.flatMap((g) => g.rows);
  if (rows.some((row) => row.id === rowId)) return rowId;
  const at = rowId.indexOf("_");
  const deal = at < 0 ? null : rowId.slice(at + 1);
  return deal && rows.find((row) => row.deal?.id === deal)?.id || null;
}
export function pipelinePersonOf(rowId) {
  const at = rowId.indexOf("_");
  return at < 0 ? rowId : rowId.slice(0, at);
}
