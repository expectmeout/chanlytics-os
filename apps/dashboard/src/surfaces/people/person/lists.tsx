/**
 * The person's saved lists (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): read from the People
 * surface (`useSurface("people")`, which the page redraws on when People lands, changes or fails); a change goes through the
 * list verbs and the surface is re-fetched, so the chips are the server's. Owner or operator may change them.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { isSurfaceFailed } from "@/legacy-bridge/surface-status";
import { FailedRead } from "../../kit/empty/empty";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { Icon } from "../../kit/icon/icon";
import { navigate } from "../../legacy-verbs";
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
      <button
        type="button"
        onClick={() => navigate(clientSegRoute(l.id))}
        title={l.why ? `Because: ${l.why} — open it on People` : `${l.label} keeps itself current — open it on People`}
        data-tip={l.why ? `Because: ${l.why}` : undefined}
      >
        {l.label}
      </button>
    </span>
  ));
}

/** A list of theirs: its name (a door to it on People) and, for a list kept by hand, the cross that takes them off it. */
function listChip(s: SavedList, o: { personId: string; canEdit: boolean; busy: boolean; who: string; change: Change }) {
  const { personId, canEdit, busy, who, change } = o;
  return (
    <span key={s.id} className="chip chip-wrap" data-testid="person-list-chip">
      <button
        type="button"
        onClick={() => navigate(`clients/list:${s.id}`)}
        title={whyTitle(s, personId)}
        data-tip={s.byHand ? undefined : whyTip(s, personId)}
        data-testid="person-list-open"
      >
        {s.name}
      </button>
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

/** The person's lists: chips for the ones that hold them, a quiet link to the ones they could be put on. */
export function PersonLists({
  personId,
  canEdit,
  first,
  flash,
  smart = [],
}: {
  personId: string;
  canEdit: boolean;
  first: string;
  flash: FlashFn;
  smart?: SmartChip[];
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
  if (saved.length === 0) {
    // The lists live on People: the door lands there with the New list box open (clients/new-list).
    return (
      <div className="cl-prof-lists">
        {smartChips.length > 0 && <div className="cl-tag-stack cl-prof-list-chips">{smartChips}</div>}
        <div className="cl-prof-aut-hint">
          {smartChips.length > 0 ? "No lists of your own yet." : "No lists yet."}{" "}
          <button
            type="button"
            className="cl-bucket-link"
            onClick={() => navigate("clients/new-list")}
            data-testid="person-lists-make"
          >
            Make one on People <Icon name="arrow-right" size={10} />
          </button>
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
      {/* A quiet link under the chips, as "Add an email" is, not a button among them. Its menu escapes the card
          (MoreMenu escape): the card clips what crosses its rounded edge, and the menu opened cut off at its foot. It
          hangs from the link's left edge, and above it where the window has more room there. */}
      {canEdit && off.length > 0 && (
        <MoreMenu
          btnClass="cl-prof-rename is-plain cl-prof-list-add"
          label={
            <>
              <Icon name="plus" size={11} /> Add to a list
            </>
          }
          title="Add to a list"
          align="left"
          escape
          testid="person-list-add"
          items={[
            ...off.map((s) => ({
              label: s.name,
              icon: "filter",
              onClick: () =>
                void change(
                  () => lists.add(s.id, [personId]),
                  <>
                    <b>{who}</b> is on <b>{s.name}</b>
                  </>,
                ),
            })),
          ]}
        />
      )}
    </div>
  );
}
