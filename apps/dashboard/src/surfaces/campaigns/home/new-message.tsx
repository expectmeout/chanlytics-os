/**
 * Campaigns' home, New message (canvas L3): one door for everything a person writes, with a choice at its head between the two
 * things it can be. Send once is the send screen (broadcasts/broadcasts-page.tsx BroadcastSend: who, what and when, held by
 * the Broadcasts page's own state, so what is kept in the tab, the channels, the preview and the one Send are the page's);
 * Every time a moment comes is the playbook composer (playbooks/composer.tsx). Both are hosted as they are, in the kit's
 * sheet from the side; their insides are not changed here.
 *
 * The address says what is open (`campaigns/new`, `new:to:<audience>`, `new:every`, `new:moment:<trigger>`,
 * `new:edit:<playbook>`), so a Turn on lands on the moment it was pressed for, a "message these people" on the audience it
 * named, and an Edit on the playbook the drawer showed. Changing a playbook is not choosing a kind: the choice is drawn only
 * for a new message. The send screen draws nothing until the broadcasts it is made of are read, and says so (it reads, or it
 * could not), never a sheet with nothing in it. Its toasts are the home's, so one that offers to stop a send outlives the
 * sheet, which closes the moment the send is made.
 */
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { LifecycleHome, ReachOutChainDto } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import { Segmented } from "../../kit/segmented/segmented";
import { BroadcastSend } from "../broadcasts/broadcasts-page";
import type { Flash } from "../broadcasts/page/types";
import type { BroadcastsSurface } from "../broadcasts/surface";
import { PlaybookComposer } from "../playbooks/composer";
import type { PlaybookCardVM, PlaybooksSurface } from "../playbooks/surface";
import type { HomeAddress } from "./address";
import { useKept } from "./drawer";
import { HomeFailed, HomeReading } from "./failed";
import { PaneSheet } from "./pane-sheet";

type Compose = NonNullable<HomeAddress["compose"]>;

interface NewMessageProps {
  /** What the address asks for, or null while the composer is closed. */
  compose: Compose | null;
  home: LifecycleHome;
  playbooks: PlaybooksSurface | undefined;
  /** The broadcasts: undefined before they are read, null where they could not be. */
  broadcasts: BroadcastsSurface | null | undefined;
  /** The chains: a change to one is its own sheet (home-page.tsx), so an id that is no playbook's waits on them. */
  reachOuts: readonly ReachOutChainDto[] | null | undefined;
  /** The home's toast host: it stays while the sheet closes over what a send says. */
  flash: Flash;
  onClose: () => void;
  /** The send screen's door to where their yes is got: the sheet's address is replaced by the section's, never closed past. */
  onYes: (route: string) => void;
  /** The choice at the head: Send once, or Every time a moment comes (the address is replaced, never pushed). */
  onKind: (mode: "once" | "every") => void;
  /** The server took a playbook: its id and name, and whether it was changed. */
  onSaved: (d: { id?: string; name?: string }, changed: boolean) => void;
}

/** The send screen, once the broadcasts it is made of are read: reading while they are out, said when they could not be. */
function SendOnce({ compose, broadcasts, flash, onClose, onYes }: NewMessageProps & { compose: Compose }) {
  if (broadcasts) {
    return (
      <BroadcastSend
        data={broadcasts}
        initialSegment={compose.mode === "once" ? compose.to : null}
        flash={flash}
        onDone={onClose}
        onYes={onYes}
      />
    );
  }
  if (broadcasts === undefined) return <HomeReading testid="cmh-composer-reading" />;
  return <HomeFailed failed={LIFECYCLE_WORDS.compose.failed} testid="cmh-composer-failed" />;
}

/** The change to a playbook the address names, where no playbook is: waiting on the chains it may be one of, or gone. */
function NotAPlaybook({ reachOuts, home }: Pick<NewMessageProps, "reachOuts" | "home">) {
  if (reachOuts === undefined) return <HomeReading testid="cmh-composer-reading" />;
  if (reachOuts === null) {
    return home.failed.chains ? <HomeFailed failed={home.failed.chains} testid="cmh-composer-failed" /> : null;
  }
  return (
    <EmptyState kind="line" title={LIFECYCLE_WORDS.gone.title} body={LIFECYCLE_WORDS.gone.body} testid="pb-gone" />
  );
}

/** What the composer holds: the send screen, or the playbook composer on a moment or on the playbook being changed. */
function Held(p: NewMessageProps & { compose: Compose }) {
  const { compose, playbooks, onClose, onSaved } = p;
  if (compose.mode === "once") return <SendOnce {...p} />;
  if (!playbooks) return null;
  const editing = compose.edit ? (playbooks.rows.find((r: PlaybookCardVM) => r.id === compose.edit) ?? null) : null;
  if (compose.edit && !editing) return <NotAPlaybook reachOuts={p.reachOuts} home={p.home} />;
  return (
    <PlaybookComposer
      key={editing ? editing.id : (compose.moment ?? "new")}
      data={playbooks}
      editing={editing}
      initialTrigger={compose.moment}
      onCancel={onClose}
      onDone={onSaved}
    />
  );
}

export function NewMessage(p: NewMessageProps) {
  const compose = useKept(p.compose);
  if (compose === null) return null;
  const W = LIFECYCLE_WORDS.compose;
  return (
    <PaneSheet
      open={p.compose !== null}
      title={W.title}
      onClose={p.onClose}
      askFirst
      wide
      testid="cmh-composer"
      tools={
        compose.mode === "every" && compose.edit ? undefined : (
          <Segmented
            label={W.kind}
            value={compose.mode}
            onValueChange={p.onKind}
            options={[
              { value: "once", label: W.once, testid: "cmh-kind-once" },
              { value: "every", label: W.every, testid: "cmh-kind-every" },
            ]}
          />
        )
      }
    >
      <Held {...p} compose={compose} />
    </PaneSheet>
  );
}
