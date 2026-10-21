/**
 * The row over the Sequences list's search, as Pipeline's stands over its (Ruben, 21 Oct 2026, for parity): at its left the
 * view, every sequence or one of its groups with how many it holds ("All sequences 21 ⌄"); at its right quiet words, as
 * Pipeline's Select, Sort and Export stand: Type, which keeps one type of sequence (to your customers, cold email to leads,
 * one-off sends) and says the type picked in its place, and Sort, how each group's rows are ordered. Each is the kit's Menu,
 * a sheet on a phone. Type is the outer filter and the view the inner one: the views count what the type keeps.
 */
import {
  SEQUENCE_GROUPS,
  SEQUENCE_SORTS,
  SEQUENCE_TYPES,
  SEQUENCE_LIST_WORDS as L,
  SEQUENCE_WORDS as W,
  sequenceGroupOf,
  sequenceTwinOf,
  type SequenceGroup,
  type SequenceRowDto,
  type SequenceSort,
  type SequenceTwin,
  type SequenceType,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";

/** A group of the list and its rows, each with the twin it is sent beside. */
type Grouped = { group: SequenceGroup; rows: { row: SequenceRowDto; twin: SequenceTwin | null }[] };

/** Which the list shows: every sequence, or one group. */
export type SequencesView = "all" | SequenceGroup;

/** Which type it keeps: every type, or one. */
export type SequencesType = "all" | SequenceType;

/**
 * The rows in their groups, in the order they are given (the sort's), each group that holds one; a twin is read against
 * every sequence of the workspace, whatever the type keeps.
 */
export function groupedOf(rows: readonly SequenceRowDto[], every: readonly SequenceRowDto[]): Grouped[] {
  const by = new Map<SequenceGroup, Grouped["rows"]>();
  for (const row of rows) {
    const twin = sequenceTwinOf(every, row);
    const g = sequenceGroupOf(row, twin);
    by.set(g, [...(by.get(g) ?? []), { row, twin }]);
  }
  return SEQUENCE_GROUPS.flatMap((g) => (by.get(g)?.length ? [{ group: g, rows: by.get(g) ?? [] }] : []));
}

/** What the row reads and writes: the view and its groups, the type and how many of each, and the sort. */
interface ListBarProps {
  view: SequencesView;
  groups: readonly Grouped[];
  onView: (view: SequencesView) => void;
  type: SequencesType;
  /** How many sequences of each type the workspace has. */
  types: Readonly<Record<SequenceType, number>>;
  onType: (type: SequencesType) => void;
  sort: SequenceSort;
  onSort: (sort: SequenceSort) => void;
}

const tick = () => <Icon name="check" size={13} />;

/** The view: its name and how many it holds, and the menu of every view with its count. A group that is empty is no view. */
function ViewPick(p: ListBarProps) {
  const total = p.groups.reduce((n, g) => n + g.rows.length, 0);
  const options = [
    { value: "all", label: W.views.all, hint: String(total) },
    ...p.groups.map((g) => ({ value: g.group, label: W.groups[g.group], hint: String(g.rows.length) })),
  ];
  const picked = options.find((o) => o.value === p.view) ?? options[0];
  return (
    <Menu
      align="start"
      label={W.views.label}
      trigger={
        <Button variant="plain" size="sm" className="sq-view-pick" data-testid="sq-view">
          <span className="sq-view-words">{picked?.label}</span>
          <span className="sq-view-count" data-testid="sq-view-count">
            {picked?.hint}
          </span>
          <Icon name="chevron-down" size={11} />
        </Button>
      }
      groups={[
        {
          choose: {
            value: picked?.value ?? "all",
            onChoose: (v) => p.onView(SEQUENCE_GROUPS.find((g) => g === v) ?? "all"),
            tick: tick(),
            options,
          },
        },
      ]}
    />
  );
}

/**
 * Type: every type, then each the workspace has with how many; its word is the type picked once one is. Drawn where the
 * workspace has more than one type, or one is picked: a filter that keeps everything says nothing.
 */
function TypePick(p: ListBarProps) {
  const total = SEQUENCE_TYPES.reduce((n, t) => n + p.types[t], 0);
  const present = SEQUENCE_TYPES.filter((t) => p.types[t] > 0);
  if (present.length < 2 && p.type === "all") return null;
  const options = [
    { value: "all", label: L.types.all, hint: String(total) },
    ...present.map((t) => ({ value: t, label: L.types[t], hint: String(p.types[t]) })),
  ];
  return (
    <Menu
      align="end"
      label={L.types.label}
      trigger={
        <Button
          variant="plain"
          size="sm"
          className="sq-view-act"
          data-on={p.type === "all" ? undefined : ""}
          data-testid="sq-type"
        >
          {p.type === "all" ? L.types.label : L.types[p.type]}
        </Button>
      }
      groups={[
        {
          choose: {
            value: p.type,
            onChoose: (v) => p.onType(SEQUENCE_TYPES.find((t) => t === v) ?? "all"),
            tick: tick(),
            options,
          },
        },
      ]}
    />
  );
}

/** Sort: how each group's rows are ordered, the newest made first as the list is read. */
function SortPick(p: ListBarProps) {
  return (
    <Menu
      align="end"
      label={L.sorts.label}
      trigger={
        <Button variant="plain" size="sm" className="sq-view-act" data-testid="sq-sort">
          {L.sorts.label}
        </Button>
      }
      groups={[
        {
          choose: {
            value: p.sort,
            onChoose: (v) => p.onSort(SEQUENCE_SORTS.find((s) => s === v) ?? "newest"),
            tick: tick(),
            options: SEQUENCE_SORTS.map((s) => ({ value: s, label: L.sorts[s] })),
          },
        },
      ]}
    />
  );
}

/** The row: the view at its left, Type and Sort at its right. */
export function ListBar(p: ListBarProps) {
  return (
    <div className="sq-view-bar">
      <ViewPick {...p} />
      <div className="sq-view-acts">
        <TypePick {...p} />
        <SortPick {...p} />
      </div>
    </div>
  );
}
