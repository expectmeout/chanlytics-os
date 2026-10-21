export const SEQUENCE_LIST_WORDS = {
  types: {
    label: "Type",
    all: "All types",
    customers: "Sequences",
    leads: "Cold email",
    once: "One-off sends"
  },
  sorts: {
    label: "Sort",
    newest: "Newest first",
    sent: "Last sent",
    people: "Most people in it",
    name: "Name, A to Z"
  }
};
export const SEQUENCE_TYPES = ["customers", "leads", "once"];
export const sequenceTypeOf = (row) => row.starts === "date" ? "once" : row.starts === "leads" ? "leads" : "customers";
export const SEQUENCE_SORTS = ["newest", "sent", "people", "name"];
export function sortedSequences(rows, sort) {
  const by = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    sent: (a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""),
    people: (a, b) => b.in_it - a.in_it,
    name: (a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" })
  };
  return [...rows].sort(by[sort]);
}
