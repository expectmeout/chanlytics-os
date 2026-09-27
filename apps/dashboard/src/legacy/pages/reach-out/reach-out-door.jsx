/* global React, Icon */
// Chanlytics -- the Leads door to a reach-out (Reach out, Part 4 PR 6; F10): on a search, "Write to the 44 ready" opens
// the reach-out sheet over it; a search that has its chain already opens that chain's Playbooks row (one chain per
// search); none ready says "Write to the 12 unconfirmed", which opens the sheet with them included; none of either
// draws nothing. The search's reach is read through the bridge (window.__reachOuts.reach, held until the next write),
// and every word is contracts' (reachOutDoorOf). Writing is the page's primary act, so a role that may not (a viewer,
// or an owner viewing as one) is shown it gated by the one role table (window.gate("approve")), and told why at the
// control, never offered a sheet it could not save. On a phone it is the sticky full-width button over the rows.
// Saved, the sheet stays open to say what the run did (R14); the door reads its search again behind it.

const useReachOutReach = (searchId, version) => {
  const [reach, setReach] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    if (searchId && window.__reachOuts) window.__reachOuts.reach(searchId).then((r) => { if (live) setReach(r); });
    else setReach(null);
    return () => { live = false; };
  }, [searchId, version]);
  return reach;
};

const ReachOutDoor = ({ search, phone = false }) => {
  const [version, setVersion] = React.useState(0);
  const reach = useReachOutReach(search ? search.id : null, version);
  const [open, setOpen] = React.useState(null);
  const W = window.__reachOuts && window.__reachOuts.words;
  const door = W && search ? W.reachOutDoorOf(reach) : null;
  if (!door && !open) return null;
  const press = () => (door.kind === "open" ? window.CHANLY && window.CHANLY.nav(`outbound/${door.rootId}`) : setOpen({ include: door.include }));
  const gated = door && door.kind === "write" ? window.gate("approve", "write to these leads") : {};
  return (
    <>
      {door && (
        <button type="button" className={`btn btn-primary ro-door${phone ? " ph-big ro-door-phone" : " btn-sm"}`} onClick={press} {...gated} data-testid="leads-write" data-kind={door.kind}>
          <Icon name={door.kind === "open" ? "external" : "mail"} size={12} /> {door.label}
        </button>
      )}
      {open && window.ReachOutSheet && (
        <window.ReachOutSheet
          search={{ id: search.id, name: search.name }}
          includeUnconfirmed={open.include}
          onClose={() => setOpen(null)}
          onDone={() => setVersion((n) => n + 1)}
        />
      )}
    </>
  );
};

Object.assign(window, { ReachOutDoor });
