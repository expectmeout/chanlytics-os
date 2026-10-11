/**
 * Campaigns' home, a moment open (canvas L2): the playbook's own detail (card-detail.tsx PlaybookPane: its sentence, who it
 * reaches, the message as a customer reads it, its runs, Pause and Edit), or a reach-out's (reach-out/row.tsx ReachOutPane),
 * in the kit's sheet from the side over the home. The detail is the page's own and unchanged; what is new is where it stands.
 * The address says which is open (`campaigns/moment:<id>`), so a bell row, an email link or a bookmark that names a playbook
 * lands here. A reach-out's chains are their own read: a link to one before they are read says it is reading, and one whose
 * read failed says so with its Retry, never a sheet with nothing in it. Edit closes the drawer and opens the composer or the
 * reach-out's sheet at an address of its own (home-page.tsx), over this one, so Back returns here.
 */
import { useRef } from "react";
import { LIFECYCLE_WORDS, lifecycleKicker } from "@chanlytics/contracts";
import type { LifecycleHome, ReachOutChainDto } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import { PlaybookPane } from "../playbooks/card-detail";
import type { Flash } from "../playbooks/card-detail";
import type { PlaybookCardVM, PlaybooksSurface } from "../playbooks/surface";
import { ReachOutPane } from "../reach-out/row";
import { HomeFailed, HomeReading } from "./failed";
import { PaneSheet } from "./pane-sheet";

/** The last thing a part of the page showed, kept while it leaves: a sheet is on its way out after its address has gone. */
export function useKept<T>(value: T | null): T | null {
  const kept = useRef<T | null>(value);
  if (value !== null) kept.current = value;
  return value ?? kept.current;
}

interface DrawerProps {
  /** The playbook or reach-out the address names, or null while none is open. */
  id: string | null;
  home: LifecycleHome;
  playbooks: PlaybooksSurface | undefined;
  /** The chains; undefined before they are read, null where they could not be. */
  reachOuts: readonly ReachOutChainDto[] | null | undefined;
  canAct: boolean;
  flash: Flash;
  onClose: () => void;
  onEdit: (p: PlaybookCardVM) => void;
  /** Open the message a playbook sends in its own drawer, over the home, pushed so Back returns here. */
  onMessage: (name: string) => void;
  /** Change a reach-out: its sheet is the page's, at an address of its own. */
  onEditChain: (c: ReachOutChainDto) => void;
}

/** What a moment's id is in the sheet: a playbook, a reach-out's chain, or what its chains' read says it cannot yet be told. */
function DrawerBody({
  id,
  home,
  playbooks,
  reachOuts,
  canAct,
  flash,
  onClose,
  onEdit,
  onMessage,
  onEditChain,
}: DrawerProps & { id: string }) {
  const row = playbooks ? (playbooks.rows.find((p) => p.id === id) ?? null) : null;
  if (row) {
    return (
      <PlaybookPane p={row} canAct={canAct} onEdit={onEdit} onMessage={onMessage} flash={flash} onClose={onClose} />
    );
  }
  const chain = reachOuts ? (reachOuts.find((c) => c.root_id === id) ?? null) : null;
  if (chain) return <ReachOutPane chain={chain} canAct={canAct} flash={flash} onClose={onClose} onEdit={onEditChain} />;
  // What is no playbook waits on the chains: unread, it is not yet known to be missing; failed, it cannot be told.
  if (reachOuts === undefined) return <HomeReading testid="cmh-drawer-reading" />;
  if (reachOuts === null) {
    return home.failed.chains ? <HomeFailed failed={home.failed.chains} testid="cmh-drawer-failed" /> : null;
  }
  return playbooks ? (
    <EmptyState kind="line" title={LIFECYCLE_WORDS.gone.title} body={LIFECYCLE_WORDS.gone.body} testid="pb-gone" />
  ) : null;
}

/** A moment, a list's playbook or a reach-out, open beside the page. */
export function MomentDrawer(p: DrawerProps) {
  const id = useKept(p.id);
  if (id === null) return null;
  return (
    <PaneSheet open={p.id !== null} title={lifecycleKicker(p.home, id)} onClose={p.onClose} testid="cmh-drawer">
      <DrawerBody {...p} id={id} />
    </PaneSheet>
  );
}
