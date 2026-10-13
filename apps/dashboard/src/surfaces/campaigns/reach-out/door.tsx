/**
 * The Leads door to a reach-out (moved from legacy/pages/reach-out/reach-out-door.jsx, decision 0015; Reach out, Part 4
 * PR 6; F10): on a search, "Write to the 44 ready" opens the reach-out sheet over it; a search that has its chain already
 * opens that chain's Playbooks row (one chain per search); none ready says "Write to the 12 unconfirmed", which opens the
 * sheet with them included; none of either draws nothing. The search's reach is read through the bridge
 * (`reachOuts.reach`, held until the next write), and every word is contracts' (reachOutDoorOf). Writing is the page's
 * primary act, so a role that may not (a viewer, or an owner viewing as one) is shown it gated by the one role table
 * (gate("approve")), and told why at the control, never offered a sheet it could not save. On a phone it is an accent word
 * at the end of the search's line, under its counts (a full-width coral bar pinned over the rows, then a second coral button, until 10 Oct 2026). Saved, the sheet stays open to say what the run did (R14); the door reads its search
 * again behind it. Its reach-out opens at who is in it (`moment:<id>:people`, 00423). On a desk, a list that feeds its
 * reach-out offers Add to its reach-out first: Leads, with that reach-out where the next pile's adds go, as the drawer's
 * Add leads does.
 */
import { useEffect, useState } from "react";
import { REACH_OUT_ADD_WORDS, isLeadList, reachOutPeopleRoute, type ReachOutReachDto } from "@chanlytics/contracts";
import { gate, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { addLeadsTo } from "./people";
import { ReachOutSheet } from "./sheet";
import { reachOuts } from "./surface";

function useReachOutReach(searchId: string | null, version: number) {
  const [reach, setReach] = useState<ReachOutReachDto | null>(null);
  useEffect(() => {
    let live = true;
    if (searchId)
      void reachOuts.reach(searchId).then((r) => {
        if (live) setReach(r);
      });
    else setReach(null);
    return () => {
      live = false;
    };
  }, [searchId, version]);
  return reach;
}

interface DoorProps {
  /** The open search; its `via` says whether it is a list its owner adds to. */
  search?: { id: string; name: string; via?: string | null } | null;
  phone?: boolean;
}

export function ReachOutDoor({ search, phone = false }: DoorProps) {
  const [version, setVersion] = useState(0);
  const reach = useReachOutReach(search ? search.id : null, version);
  const [open, setOpen] = useState<{ include: boolean } | null>(null);
  const W = reachOuts.words;
  const door = search ? W.reachOutDoorOf(reach) : null;
  if (!door && !open) return null;
  // The button that presses is drawn only where there is a door to press.
  const press = () => {
    if (!door) return;
    return door.kind === "open" ? navigate(reachOutPeopleRoute(door.rootId)) : setOpen({ include: door.include });
  };
  const gated = door && door.kind === "write" ? gate("approve", "write to these leads") : {};
  // A list that feeds its reach-out takes more (00423): on a desk, adding comes first and opening it beside.
  const adds = door && door.kind === "open" && !phone && isLeadList(search) ? door.rootId : null;
  return (
    <>
      {adds && (
        <Button
          variant="primary"
          size="sm"
          className="ro-door"
          onClick={() => addLeadsTo(adds)}
          {...gate("approve", "add leads to a reach-out")}
          data-testid="leads-add-to"
        >
          <Icon name="plus" size={12} /> {REACH_OUT_ADD_WORDS.door}
        </Button>
      )}
      {door && (
        <Button
          variant={phone ? "plain" : adds ? "secondary" : "primary"}
          size="sm"
          className={`ro-door${phone ? " ro-door-phone" : ""}`}
          onClick={press}
          {...gated}
          data-testid="leads-write"
          data-kind={door.kind}
        >
          <Icon name={door.kind === "open" ? "external" : "mail"} size={12} /> {door.label}
          {phone ? <Icon name="chevron" size={11} /> : null}
        </Button>
      )}
      {open && search && (
        <ReachOutSheet
          search={{ id: search.id, name: search.name }}
          includeUnconfirmed={open.include}
          onClose={() => setOpen(null)}
          onDone={() => setVersion((n) => n + 1)}
        />
      )}
    </>
  );
}
