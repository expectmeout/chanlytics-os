/**
 * The Sequences list (decision 0060; the phone review of 16 Oct 2026): every sequence, grouped as the page groups them
 * (what needs you first, a twin on a visit moment among it; then your customers, leads, dates, what is paused or off, and
 * the drafts: contracts SEQUENCE_GROUPS), each a row with its kind's glyph, its name and its line, a word at its end only
 * where its state is not the ordinary one (contracts sequenceRowState: a green On on every row said nothing). Over its search,
 * which view it shows (Ruben, 21 Oct 2026: Pipeline's "All deals ⌄" above its search, for parity): every sequence, or one of
 * its groups with how many it holds, the kit's Menu (a sheet on a phone, as Pipeline's views are); a search narrows either. A row opens its record beside the list. New is the head's act, beside the strip
 * of views (sequences-page.tsx), as Messages' New is. Every word is contracts' (sequence-words.ts); the list composes
 * them. First contact is no sequence (D7: the receptionist leaves the list), and the list says nothing of it (Ruben, 21 Oct
 * 2026: its foot line broke the group).
 */
import { useMemo, useState } from "react";
import {
  SEQUENCE_GROUPS,
  SEQUENCE_WORDS,
  sequenceGroupOf,
  onceDraftRoute,
  sequenceRoute,
  sequenceRowLine,
  sequenceRowState,
  sequenceTwinOf,
  type SequenceGroup,
  type SequenceRowDto,
  type SequenceTwin,
  type SequencesPageDto,
} from "@chanlytics/contracts";
import { ListRow } from "../../kit/list-row/list-row";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Button } from "../../kit/button/button";
import { Menu } from "../../kit/menu/menu";
import { Search } from "../../kit/search/search";
import { StatePill } from "../../kit/pill/state-pill";
import { routeDoor } from "../../legacy-verbs";
import { useRecordsAhead } from "./use-record";

/** The glyph a row's kind wears: a moment's, a list's, a date's, a lead's. */
const GLYPH: Record<SequenceRowDto["starts"], string> = {
  moment: "bell",
  list: "users",
  date: "send",
  leads: "globe",
};

interface SequencesListProps {
  page: SequencesPageDto;
  /** The sequence open beside the list, whose row is marked. */
  openId: string | null;
}

/** One row: its glyph, its name, its line (amber where it needs you), and its state's word where it is not On. */
function SequenceRow(p: {
  row: SequenceRowDto;
  twin: SequenceTwin | null;
  group: SequenceGroup;
  tz: string;
  open: boolean;
}) {
  const { row, twin, group, tz, open } = p;
  const state = sequenceRowState(row);
  return (
    <ListRow
      mark={<Icon name={GLYPH[row.starts]} size={14} />}
      name={row.name}
      end={(place) =>
        state ? <StatePill kind="tone" value={state.tone} label={state.label} className={place} /> : null
      }
      said={(place) => (
        <div className={group === "needs" ? `${place} sq-needs` : place}>
          {sequenceRowLine(row, tz, Date.now(), twin)}
        </div>
      )}
      aria-current={open ? "true" : undefined}
      data-testid={`sq-row-${row.id}`}
      // A one-off kept as a draft (00465) opens in New, where it is sent; every other row, its record.
      {...routeDoor(row.once ? onceDraftRoute(row.id) : sequenceRoute(row.id))}
    />
  );
}

/** A group of the list and its rows, each with the twin it is sent beside. */
type Grouped = { group: SequenceGroup; rows: { row: SequenceRowDto; twin: SequenceTwin | null }[] };

/** Which the list shows: every sequence, or one group. */
type SequencesView = "all" | SequenceGroup;

/** The sequences in their groups, in the list's order, each group that holds one. */
function groupedOf(sequences: readonly SequenceRowDto[]): Grouped[] {
  const by = new Map<SequenceGroup, Grouped["rows"]>();
  for (const row of sequences) {
    const twin = sequenceTwinOf(sequences, row);
    const g = sequenceGroupOf(row, twin);
    by.set(g, [...(by.get(g) ?? []), { row, twin }]);
  }
  return SEQUENCE_GROUPS.flatMap((g) => (by.get(g)?.length ? [{ group: g, rows: by.get(g) ?? [] }] : []));
}

/**
 * The view over the search, as Pipeline's "All deals ⌄" stands over its: the view's name and how many it holds, and its menu
 * of every view with its count (the kit's Menu, a sheet on a phone). A group that is empty is no view.
 */
function ViewBar(p: { view: SequencesView; all: readonly Grouped[]; onView: (view: SequencesView) => void }) {
  const total = p.all.reduce((n, g) => n + g.rows.length, 0);
  const options = [
    { value: "all", label: SEQUENCE_WORDS.views.all, hint: String(total) },
    ...p.all.map((g) => ({ value: g.group, label: SEQUENCE_WORDS.groups[g.group], hint: String(g.rows.length) })),
  ];
  const picked = options.find((o) => o.value === p.view) ?? options[0];
  return (
    <div className="sq-view-bar">
      <Menu
        align="start"
        label={SEQUENCE_WORDS.views.label}
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
              onChoose: (v) => p.onView(v === "all" ? "all" : (SEQUENCE_GROUPS.find((g) => g === v) ?? "all")),
              tick: <Icon name="check" size={13} />,
              options,
            },
          },
        ]}
      />
    </div>
  );
}

export function SequencesList({ page, openId }: SequencesListProps) {
  const [search, setSearch] = useState("");
  const [picked, setView] = useState<SequencesView>("all");
  // Ended sequences are history: folded at the list's foot, opened when asked for (a search shows them, and so does their view).
  const [endedOpen, setEndedOpen] = useState(false);
  const words = search.trim().toLowerCase();
  const all = useMemo(() => groupedOf(page.sequences), [page.sequences]);
  // A view whose group has emptied since it was picked (the last one that needed you, answered) is every sequence again.
  const view = picked === "all" || all.some((g) => g.group === picked) ? picked : "all";
  const groups = all
    .filter((g) => view === "all" || g.group === view)
    .map((g) => ({
      ...g,
      rows: words === "" ? g.rows : g.rows.filter(({ row }) => row.name.toLowerCase().includes(words)),
    }))
    .filter((g) => g.rows.length > 0);
  // The ended fold: shut at the list's foot until asked, open under a search or in Ended's own view.
  const folds = (group: SequenceGroup) => group === "ended" && words === "" && view !== "ended";
  // The rows shown, in their order, read ahead once the frame is idle so a press opens a record the tab holds (use-record.ts).
  // Ended ones, folded at the foot, are history: none is read ahead.
  useRecordsAhead(groups.flatMap(({ group, rows }) => (group === "ended" ? [] : rows.map(({ row }) => row.id))));
  return (
    <>
      <div className="sq-list-head">
        {all.length > 0 ? <ViewBar view={view} all={all} onView={setView} /> : null}
        <Search label={SEQUENCE_WORDS.search} value={search} onChange={setSearch} testid="sq-search" />
      </div>
      <div className="sq-list-rows" data-testid="sq-rows">
        {groups.map(({ group, rows }) => (
          <section key={group} className="sq-group" aria-label={SEQUENCE_WORDS.groups[group]}>
            {/* One group picked is said by the view over the search: its head would say it twice. */}
            {view === "all" ? (
              <h3 className="sq-group-name">
                {/* Its name its own, so a phone sets it as the Pipeline's section head sets its stage (sequences.css). */}
                <span className="sq-group-label">{SEQUENCE_WORDS.groups[group]}</span>
                <span className={group === "needs" ? "tally tally-warn" : "tally"}>{rows.length}</span>
                {folds(group) ? (
                  <LinkButton
                    className="sq-group-act"
                    onClick={() => setEndedOpen((v) => !v)}
                    aria-expanded={endedOpen}
                    data-testid="sq-ended-toggle"
                  >
                    {endedOpen ? SEQUENCE_WORDS.hideEnded : SEQUENCE_WORDS.showEnded(rows.length)}
                  </LinkButton>
                ) : null}
              </h3>
            ) : null}
            {(folds(group) && !endedOpen ? [] : rows).map(({ row, twin }) => (
              <SequenceRow
                key={row.id}
                row={row}
                twin={twin}
                group={group}
                tz={page.timezone}
                open={row.id === openId}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
