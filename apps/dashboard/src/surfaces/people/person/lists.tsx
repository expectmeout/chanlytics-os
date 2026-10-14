/**
 * The person's saved lists (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): read from the People
 * surface (`useSurface("people")`, which the page redraws on when People lands, changes or fails); a change goes through the
 * list verbs and the surface is re-fetched, so the chips are the server's. Owner or operator may change them.
 *
 * Putting them on a list is one picker, the page's lists sheet (sheets/lists-sheet.tsx: a switch a list, the lists that
 * keep themselves, a new list made in place), which More's Add to a list opens too: the desk's "Add to a list" and a
 * phone's row open it (`onPick`), where each was a menu of its own and a person on no list was sent to People to make
 * one (the sheets as verbs, 14 Oct 2026).
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { PERSON_ABOUT_WORDS } from "@chanlytics/contracts";
import { isSurfaceFailed } from "@/legacy-bridge/surface-status";
import { FailedRead } from "../../kit/empty/empty";
import { Button } from "../../kit/button/button";
import { Press } from "../../kit/press";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { lists } from "../people-lists";
import type { PeopleSurface } from "../surface";
import { usePeopleSeam } from "./use-people";
import { clientSegRoute } from "../person-verbs";
import type { FlashFn } from "../person-verbs";

type SavedList = PeopleSurface["saved"][number];
type SmartChip = { id: string; label: string; why: string };

/** Why a smart list of the workspace's own has them, in its rule's words: the chip's line on hover and focus. */
function whyTip(s: SavedList, personId: string): string | undefined {
  const why = !s.byHand ? lists.why(s.id, personId) : null;
  return why ? `Because: ${why}` : undefined;
}

/** A chip's title: its rule's line, or where it opens. */
function whyTitle(s: SavedList, personId: string): string {
  const tip = whyTip(s, personId);
  return tip ? `${tip} — open it on People` : `Open ${s.name} on People`;
}

/** The lists that keep themselves current and have them on today (contracts PersonVM.smartLists): each opens on People. */
function smartChipsOf(smart: SmartChip[]): ReactNode[] {
  return smart.map((l) => (
    <span key={l.id} className="chip chip-wrap" data-testid="person-smart-chip">
      <a
        {...routeDoor(clientSegRoute(l.id))}
        title={l.why ? `Because: ${l.why} — open it on People` : `${l.label} keeps itself current — open it on People`}
        data-tip={l.why ? `Because: ${l.why}` : undefined}
      >
        {l.label}
      </a>
    </span>
  ));
}

/** A list of theirs: its name (a door to it on People) and, for a list kept by hand, the cross that takes them off it. */
function listChip(s: SavedList, o: { personId: string; canEdit: boolean; busy: boolean; who: string; change: Change }) {
  const { personId, canEdit, busy, who, change } = o;
  return (
    <span key={s.id} className="chip chip-wrap" data-testid="person-list-chip">
      <a
        {...routeDoor(`clients/list:${s.id}`)}
        title={whyTitle(s, personId)}
        data-tip={s.byHand ? undefined : whyTip(s, personId)}
        data-testid="person-list-open"
      >
        {s.name}
      </a>
      {canEdit && s.byHand && (
        <button
          type="button"
          className="chip-x"
          title={`Take ${who} off ${s.name}`}
          aria-label={`Take ${who} off ${s.name}`}
          disabled={busy}
          onClick={() =>
            void change(
              () => lists.drop(s.id, [personId]),
              <>
                <b>{who}</b> is off <b>{s.name}</b>
              </>,
            )
          }
        >
          <Icon name="x" size={9} />
        </button>
      )}
    </span>
  );
}

type Change = (fn: () => Promise<{ ok: boolean; message?: string }>, msg: ReactNode) => Promise<void>;

/**
 * A phone's Lists (canvas A, M2): one row, "On 3 lists" over their names, that opens the lists sheet to switch them on
 * and off, make one, or open the ones that keep themselves on People. Chips with × are a desk's.
 */
function listsRow(o: {
  personId: string;
  canEdit: boolean;
  saved: SavedList[];
  smart: SmartChip[];
  onPick: () => void;
}) {
  const { personId, canEdit, saved, smart, onPick } = o;
  const on = saved.filter((s) => s.ids.includes(personId));
  const names = [...smart.map((s) => s.label), ...on.map((s) => s.name)];
  const body = (
    <>
      <span className="cl-prof-reach-l">
        <span className="cl-prof-reach-v">{PERSON_ABOUT_WORDS.onLists(names.length)}</span>
        {names.length ? <span className="cl-prof-reach-src">{names.join(", ")}</span> : null}
      </span>
      {canEdit ? <Icon name="chevron" size={12} /> : null}
    </>
  );
  if (!canEdit)
    return (
      <div className="cl-prof-reach" data-testid="person-lists-row">
        {body}
      </div>
    );
  return (
    <Press className="cl-prof-reach" onClick={onPick} data-testid="person-lists-row">
      {body}
    </Press>
  );
}

/**
 * Their Lists group (canvas A, T-01): drawn only while they are on a list (kept by hand, or one that keeps itself), or
 * where their lists could not be read; a person on none has no group, and More's Add to a list puts them on one.
 */
export function ListsGroup(props: {
  personId: string;
  canEdit: boolean;
  first: string;
  flash: FlashFn;
  smart: SmartChip[];
  row: boolean;
  onPick: () => void;
}) {
  const people = usePeopleSeam();
  const on = !!people && (people.saved || []).some((s) => s.ids.includes(props.personId));
  const failed = people ? people.savedRead === false : isSurfaceFailed("people");
  if (!on && !failed && props.smart.length === 0) return null;
  return (
    <section className="cl-prof-rail-section" aria-labelledby="person-lists-title" data-testid="person-lists">
      <h3 className="cl-prof-rail-label" id="person-lists-title">
        {PERSON_ABOUT_WORDS.lists}
      </h3>
      <PersonLists {...props} />
    </section>
  );
}

/** The person's lists: chips for the ones that hold them, a quiet link that opens the picker. */
export function PersonLists({
  personId,
  canEdit,
  first,
  flash,
  smart = [],
  row = false,
  onPick,
}: {
  personId: string;
  canEdit: boolean;
  first: string;
  flash: FlashFn;
  smart?: SmartChip[];
  /** A phone's one row (canvas A), in place of the chips. */
  row?: boolean;
  /** The lists sheet, opened: the one place they are put on a list. */
  onPick: () => void;
}) {
  const people = usePeopleSeam();
  const [busy, setBusy] = useState(false);
  const saved = (people && people.saved) || [];
  const on = saved.filter((s) => s.ids.includes(personId));
  // A smart list's rule says who is on it: it is shown when it holds for them, and never offered to put them on.
  const off = saved.filter((s) => s.byHand && !s.ids.includes(personId));
  const who = first === "them" ? "This person" : first;
  const change: Change = async (fn, msg) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message || "Could not change the list."}</> });
      return;
    }
    flash({ msg });
  };
  // Lists that could not be read are not "no lists": the read failed, and the rest of the profile stands.
  if (people && people.savedRead === false) {
    return <FailedRead kind="line" what="their lists" surface="people" testid="person-lists-failed" />;
  }
  const smartChips = smartChipsOf(smart);
  // Not read yet is not "no lists": a profile opened straight from a link reads People after the person, and says so
  // until it lands (the surface moving redraws this), or that it failed. The smart lists are the person's own read's.
  if (!people) {
    const failed = isSurfaceFailed("people");
    return (
      <div className="cl-prof-lists">
        {smartChips.length > 0 && <div className="cl-tag-stack cl-prof-list-chips">{smartChips}</div>}
        {failed ? (
          <FailedRead kind="line" what="their lists" surface="people" testid="person-lists-failed" />
        ) : (
          <div className="cl-prof-aut-hint" role="status" aria-busy="true" data-testid="person-lists-reading">
            Reading…
          </div>
        )}
      </div>
    );
  }
  if (row && (saved.length > 0 || smart.length > 0)) return listsRow({ personId, canEdit, saved, smart, onPick });
  if (saved.length === 0) {
    // A list is made where they are, in the picker, with them on it (never a trip to People and back).
    return (
      <div className="cl-prof-lists">
        {smartChips.length > 0 && <div className="cl-tag-stack cl-prof-list-chips">{smartChips}</div>}
        <div className="cl-prof-aut-hint">
          {smartChips.length > 0 ? "No lists of your own yet." : "No lists yet."}{" "}
          {canEdit ? (
            <button type="button" className="cl-bucket-link" onClick={onPick} data-testid="person-lists-make">
              Make one <Icon name="arrow-right" size={10} />
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="cl-prof-lists">
      <div className="cl-tag-stack cl-prof-list-chips">
        {smartChips}
        {on.map((s) => listChip(s, { personId, canEdit, busy, who, change }))}
        {on.length === 0 && smartChips.length === 0 && <span className="cl-prof-aut-hint">On no list yet.</span>}
      </div>
      {/* A quiet link under the chips, as "Add an email" is, not a button among them: it opens the picker. */}
      {canEdit && off.length > 0 && (
        <Button
          variant="quiet"
          size="sm"
          className="cl-prof-rename is-plain cl-prof-list-add"
          title="Add to a list"
          onClick={onPick}
          data-testid="person-list-add"
        >
          <Icon name="plus" size={11} /> Add to a list
        </Button>
      )}
    </div>
  );
}
