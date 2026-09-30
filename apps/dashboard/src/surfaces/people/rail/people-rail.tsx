/**
 * The rail (moved whole from legacy/pages/people.jsx, decision 0015). The switch between the scopes stands over it, the
 * page's own strip (PeopleScopeTabs), never in it; under Leads the rows are the Leads scope's (LeadsRailRows,
 * leads-scope.jsx), drawn with the same kit, so the smart lists and the lists kept by hand are People's alone.
 * `everyone` ({ count, active, onPick }) is the phone sheet's first row, the way back to everyone. Under the Pipeline the
 * rows are People's own lists, and a pick opens that list on People (pipeline-scope.jsx). `compact` is the phone's
 * sheet: one level of heading, and the empty lists said in a line, not drawn.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { stateOf } from "@chanlytics/contracts";
import type { ListRule } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { FailedRead } from "../../kit/empty/empty";
import { PL_DEFAULT_GROUPS, PL_NO_LISTS } from "../words";
import type { SavedList, SmartList } from "../types";
import { NewListRow } from "./new-list";
import { RailEmpty, RailGroup, RailRow, RailSection, railQuiet } from "./rail-kit";

type Group = { id: string; label: string };
type Archived = { id: string; name: string };

/** The smart lists section: each group with something in it, and on a phone's sheet the empty ones in one quiet line. */
function smartSection(p: {
  compact: boolean;
  lists: readonly SmartList[];
  groups: readonly Group[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  const { compact, lists, groups, active, onPick } = p;
  return (
    <RailSection label={compact ? null : "Smart lists"} icon="sparkle">
      {groups.map((g) => {
        const own = lists.filter((l) => (l.group || "reach") === g.id);
        if (own.length === 0) return null;
        const quiet = compact ? railQuiet(own, (l) => active === l.id) : [];
        // A group with nobody in any of its lists has nothing to draw but its name: the one line says them.
        if (quiet.length === own.length) return null;
        return (
          <RailGroup key={g.id} label={g.label} testid={`rail-group-${g.id}`}>
            {own
              .filter((l) => !quiet.includes(l))
              .map((l) => (
                // A list of people who need you counts in amber (the tone map decides which: warn); every other count is a total.
                <RailRow
                  key={l.id}
                  smart
                  label={l.label}
                  count={l.count}
                  active={active === l.id}
                  onPick={() => onPick(l.id)}
                  tip={l.tip || null}
                  className={stateOf("person", l.id).tone === "warn" ? "asks" : ""}
                />
              ))}
          </RailGroup>
        );
      })}
      {/* The sheet's one quiet line: every empty list, in the rail's own order (a line a group read as clutter). */}
      {compact ? (
        <RailEmpty labels={railQuiet(lists, (l) => active === l.id).map((l) => l.label)} testid="rail-empty" />
      ) : null}
    </RailSection>
  );
}

/** Archived lists (00169): off the rail, each one press from coming back, in one quiet line. */
function archivedLine(p: {
  archived: readonly Archived[];
  canEdit: boolean;
  onRestore: ((a: Archived) => void) | null;
}) {
  const { archived, canEdit, onRestore } = p;
  return (
    archived.length > 0 && (
      <p className="cl-rail-empty" data-testid="rail-archived">
        Archived:{" "}
        {archived.map((a, i) => (
          <Fragment key={a.id}>
            {i > 0 ? " · " : null}
            {canEdit && onRestore ? (
              <button
                type="button"
                className="cl-bucket-link"
                title={`Bring ${a.name} back`}
                onClick={() => onRestore(a)}
                data-testid="rail-restore"
              >
                {a.name}
              </button>
            ) : (
              a.name
            )}
          </Fragment>
        ))}
      </p>
    )
  );
}

/** The Saved section: lists kept by hand or by a rule, what could not be read, and the archived line. */
function savedSection(p: {
  compact: boolean;
  saved: readonly SavedList[];
  savedRead: boolean;
  archived: readonly Archived[];
  onRestore: ((a: Archived) => void) | null;
  activeSaved: string | null;
  onPickSaved: (id: string) => void;
  canEdit: boolean;
}) {
  const { compact, saved, savedRead, archived, onRestore, activeSaved, onPickSaved, canEdit } = p;
  return (
    <RailSection
      label={compact && savedRead && saved.length === 0 && archived.length === 0 ? null : "Saved"}
      testid="saved-lists"
    >
      {/* Lists that could not be read are not "no lists": the read failed, and the people above stand. */}
      {!savedRead && <FailedRead kind="line" what="your saved lists" surface="people" testid="people-lists-failed" />}
      {saved
        .filter(
          (s) =>
            !(
              compact &&
              railQuiet(
                saved.filter((x) => !x.unknown),
                (x) => activeSaved === x.id,
              ).includes(s)
            ),
        )
        .map((s) => (
          // A list that can't be counted here draws a dash and says why on hover: can't tell is not nobody.
          <RailRow
            key={s.id}
            smart={!s.byHand}
            label={s.name}
            count={s.unknown ? "—" : s.count}
            active={activeSaved === s.id}
            onPick={() => onPickSaved(s.id)}
            tip={s.tip}
            testid={s.byHand ? undefined : "saved-smart"}
          />
        ))}
      {/* Each name opens its list: an empty list is still renamed, deleted and filled from its own page. */}
      {compact ? (
        <RailEmpty
          labels={railQuiet(
            saved.filter((x) => !x.unknown),
            (x) => activeSaved === x.id,
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              className="cl-bucket-link"
              onClick={() => onPickSaved(s.id)}
              data-testid="saved-empty-open"
            >
              {s.name}
            </button>
          ))}
          testid="saved-empty"
        />
      ) : null}
      {savedRead && saved.length === 0 && !compact && (
        <div className="cl-rail-hint">
          No lists yet. Keep one by hand — regulars, one staff member's customers — or describe who, and it keeps itself
          current.
        </div>
      )}
      {/* Archived lists (00169): off the rail, each one press from coming back, in one quiet line. */}
      {archivedLine({ archived, canEdit, onRestore })}
    </RailSection>
  );
}

export function PeopleRail({
  scope = "people",
  everyone = null,
  children = null,
  lists = PL_NO_LISTS,
  groups = PL_DEFAULT_GROUPS,
  active,
  onPick,
  saved = [],
  savedRead = true,
  archived = PL_NO_LISTS,
  onRestore = null,
  activeSaved = null,
  onPickSaved = () => undefined,
  canEdit = false,
  onCreateList = null,
  newListSignal = 0,
  compact = false,
}: {
  scope?: string;
  everyone?: { count: number; active: boolean; onPick: () => void } | null;
  children?: ReactNode;
  lists?: readonly SmartList[];
  groups?: readonly Group[];
  active: string | null;
  onPick: (id: string) => void;
  saved?: readonly SavedList[];
  savedRead?: boolean;
  archived?: readonly Archived[];
  onRestore?: ((a: Archived) => void) | null;
  activeSaved?: string | null;
  onPickSaved?: (id: string) => void;
  canEdit?: boolean;
  onCreateList?: ((name: string, rule: ListRule | null) => Promise<ApiResult<unknown>>) | null;
  newListSignal?: number;
  compact?: boolean;
  /** Passed by the sheet's caller; the rail does not read it. */
  onScope?: unknown;
}) {
  return (
    <aside className="cl-rail">
      {scope === "leads" ? (
        children
      ) : (
        <>
          {/* The way back to everyone, first, where a phone looks for it: a desktop's is Show everyone on the list's title
              line, which a phone does not draw. */}
          {everyone && (
            <div className="cl-rail-section cl-rail-everyone">
              <RailRow
                label="Everyone"
                count={everyone.count}
                active={everyone.active}
                onPick={everyone.onPick}
                testid="rail-everyone"
              />
            </div>
          )}
          {smartSection({ compact, lists, groups, active, onPick })}
          {/* On a phone's sheet an empty list of the workspace's own is a word in the quiet line, as a smart list's is (one
              that can't be counted keeps its row and its dash); and a sheet with none of its own draws no Saved over nothing. */}
          {savedSection({ compact, saved, savedRead, archived, onRestore, activeSaved, onPickSaved, canEdit })}
          {canEdit && onCreateList && <NewListRow onCreate={onCreateList} openSignal={newListSignal} />}
        </>
      )}
    </aside>
  );
}
