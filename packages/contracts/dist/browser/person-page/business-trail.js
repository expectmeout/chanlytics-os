export function businessTrailOf(row) {
  if (row.nameSource === "lead" || !row.worksAt || row.worksAt.gone || !row.worksAt.name) return null;
  return row.worksAt.name;
}
