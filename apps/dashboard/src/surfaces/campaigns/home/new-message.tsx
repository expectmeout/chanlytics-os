/**
 * Campaigns' New message (canvas L3): one door for a message written once, with a choice at its head between the two
 * things it can be. Send once is the send screen (broadcasts/broadcasts-page.tsx BroadcastSend: who, what and when, held
 * by the Broadcasts page's own state, so what is kept in the tab, the channels, the preview and the one Send are the
 * page's); Write to leads (00426, canvas B) is where a reach-out starts (reach-out/sources.tsx), whose search, chosen, is
 * the page's to open the reach-out sheet over (`onWrite`). Each is hosted as it is, in the kit's sheet from the side.
 *
 * Every time a moment comes went (the closed-loop audit of 17 Oct 2026, G): a moment's sequence is made in New sequence
 * (sequences/new.tsx), on the moment a door asks for, and changed on its own record. Its addresses land there (contracts
 * sequenceLandingOf). A reach-out's change (`new:edit:<root>`) is the reach-out's own sheet (sheets.tsx); this sheet only
 * says so while the chains it opens on are read, or that they could not be.
 *
 * The address says what is open (`campaigns/new`, `new:to:<audience>`, `new:leads`), so a "message these people" lands on
 * the audience it named. The send screen draws nothing until the broadcasts it is made of are read, and says so (it
 * reads, or it could not), never a sheet with nothing in it. Its toasts are the sheets', so one that offers to stop a send
 * outlives the sheet, which closes the moment the send is made.
 */
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import { Segmented } from "../../kit/segmented/segmented";
import { BroadcastSend } from "../broadcasts/broadcasts-page";
import type { Flash } from "../broadcasts/page/types";
import type { BroadcastsSurface } from "../broadcasts/surface";
import { WriteToLeads } from "../reach-out/sources";
import type { ReachOutsSurface } from "../reach-out/surface";
import type { ReachOutStart } from "../reach-out/sources";
import type { HomeAddress } from "./address";
import { HomeFailed, HomeReading } from "./failed";
import { PaneSheet, useKept } from "./pane-sheet";

type Compose = NonNullable<HomeAddress["compose"]>;

interface NewMessageProps {
  /** What the address asks for, or null while the composer is closed. */
  compose: Compose | null;
  /** The broadcasts: undefined before they are read, null where they could not be. */
  broadcasts: BroadcastsSurface | null | undefined;
  /** The reach-outs' chains a change waits on: undefined before they are read, null where they could not be. */
  chains: ReachOutsSurface | undefined;
  /** The sheets' toast host: it stays while the sheet closes over what a send says. */
  flash: Flash;
  onClose: () => void;
  /** The send screen's door to where their yes is got: the sheet's address is replaced by the section's, never closed past. */
  onYes: (route: string) => void;
  /** The choice at the head: Send once or Write to leads (the address is replaced, never pushed). */
  onKind: (mode: "once" | "leads") => void;
  /** Write to leads' search, chosen: the page opens the reach-out sheet over it in this sheet's place. */
  onWrite: (start: ReachOutStart) => void;
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

/** A reach-out's change while the chains it opens on are out, or could not be read: its own sheet takes over once they are. */
function ChainWaiting({ chains }: { chains: ReachOutsSurface | undefined }) {
  if (chains === undefined) return <HomeReading testid="cmh-composer-reading" />;
  return chains === null ? (
    <HomeFailed failed={LIFECYCLE_WORDS.compose.chainFailed} testid="cmh-composer-failed" />
  ) : null;
}

export function NewMessage(p: NewMessageProps) {
  const compose = useKept(p.compose);
  if (compose === null) return null;
  const W = LIFECYCLE_WORDS.compose;
  if (compose.mode === "change")
    return (
      <PaneSheet open={p.compose !== null} title={W.edit} onClose={p.onClose} wide testid="cmh-composer">
        <ChainWaiting chains={p.chains} />
      </PaneSheet>
    );
  return (
    <PaneSheet
      open={p.compose !== null}
      title={W.title}
      onClose={p.onClose}
      askFirst
      wide
      testid="cmh-composer"
      tools={
        <Segmented
          label={W.kind}
          value={compose.mode}
          onValueChange={p.onKind}
          options={[
            { value: "once", label: W.once, testid: "cmh-kind-once" },
            { value: "leads", label: W.leads, testid: "cmh-kind-leads" },
          ]}
        />
      }
    >
      {compose.mode === "leads" ? <WriteToLeads onWrite={p.onWrite} /> : <SendOnce {...p} compose={compose} />}
    </PaneSheet>
  );
}
