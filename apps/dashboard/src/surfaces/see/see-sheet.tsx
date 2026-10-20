/**
 * A thing open over the page it was pressed on (`?see=<kind>:<id>`, the Campaigns wiring review's rule C, lane 3, 19 Oct
 * 2026), in the kit's sheet from the side (Campaigns' PaneSheet): a run, its one screen, as it stands at its home (its
 * decision while it waits, its Stop while it goes, its report once it went), or a message of the Library, its pane. The
 * page under it stays as it was left -- the Inbox's row, Today's queue, a person's campaigns -- and Back, Escape or the
 * sheet's Close put it away. Its strip holds the door to the thing's home, which goes there (`home`): the run under its
 * sequence, beside Sequences' list. To send, every email handed to its owner, opens so too, with no door home: it has no
 * page of its own (Ruben, 20 Oct 2026); a run opened from it opens over it, so Back comes back to the list.
 *
 * The page under the sheet may not draw what the thing is made of (the Inbox reads Sent's runs, a person's page none of
 * them): each read the thing needs and the page has not read is asked for as the sheet opens. An Approve that opens the
 * next run waiting moves the sheet to it in place; the toast host is the frame's (see-mount.tsx).
 */
import { SEE_WORDS, seeHomeOf, seeRefOfRoute, type SeeRef } from "@chanlytics/contracts";
import { closeSeeOver, openSeeOver } from "./see-over";
import { goToRoute } from "@/legacy-bridge/workspace";
import { Icon } from "../kit/icon/icon";
import { Button } from "../kit/button/button";
import type { useLegacyToast } from "../legacy-verbs";
import type { SurfaceKey } from "../surface-values";
import { useReadsHere } from "../use-surface";
import { BroadcastRun } from "../campaigns/broadcasts/broadcasts-page";
import { MessageInPlaceWhenRead } from "../campaigns/home/campaigns-code";
import { PaneSheet } from "../campaigns/home/pane-sheet";
import { ToSendPart } from "../waits/to-send-part";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** What each thing is drawn from: Sent's runs (where it sits among those waiting), its playbook, its message, the number. */
const READS: Record<SeeRef["kind"], readonly SurfaceKey[]> = {
  run: ["broadcasts", "playbooks", "settings", "channels"],
  message: ["playbooks", "settings", "channels"],
  "to-send": ["broadcasts"],
};

/** A run To send's list opens: over the list, as an entry of its own, so Back comes back to it. */
const openRunOverToSend = (to: string) => {
  const ref = seeRefOfRoute(to);
  if (ref) openSeeOver(ref, true);
  else goToRoute(to);
};

/** The door to the thing's home, which goes there whatever page the sheet is over. */
function HomeDoor({ seeRef }: { seeRef: SeeRef }) {
  return (
    <Button
      size="sm"
      className="see-home"
      onClick={() => goToRoute(seeHomeOf(seeRef), { home: true })}
      data-testid="see-home"
    >
      {SEE_WORDS.home} <Icon name="chevron" size={11} />
    </Button>
  );
}

export function SeeSheet({ seeRef, open, flash }: { seeRef: SeeRef; open: boolean; flash: Flash }) {
  // Each read the thing needs that the page under it has not made.
  useReadsHere(READS[seeRef.kind]);
  if (seeRef.kind === "to-send")
    return (
      <PaneSheet
        open={open}
        title={<span className="see-kicker">{SEE_WORDS.toSend}</span>}
        onClose={closeSeeOver}
        over
        testid="see-to-send"
      >
        {/* The sheet's body bleeds to its edges for a pane, which keeps its own gutter and scroll: the list keeps them here. */}
        <div className="see-to-send">
          <ToSendPart onOpenRun={openRunOverToSend} />
        </div>
      </PaneSheet>
    );
  const tools = <HomeDoor seeRef={seeRef} />;
  if (seeRef.kind === "message")
    return (
      <PaneSheet
        open={open}
        title={<span className="see-kicker">{SEE_WORDS.message}</span>}
        tools={tools}
        toolsInLine
        onClose={closeSeeOver}
        over
        testid="see-message"
      >
        <MessageInPlaceWhenRead name={seeRef.name} flash={flash} onClose={closeSeeOver} />
      </PaneSheet>
    );
  return (
    <PaneSheet
      open={open}
      title={<span className="see-kicker">{SEE_WORDS.run}</span>}
      tools={tools}
      toolsInLine
      onClose={closeSeeOver}
      wide
      over
      testid="see-run"
    >
      <BroadcastRun
        id={seeRef.id}
        flash={flash}
        // The next run waiting, after an Approve or a Skip, opens in this sheet; closing the run closes the sheet.
        over={{ go: (id) => (id ? openSeeOver({ kind: "run", id, sequenceId: null }) : closeSeeOver()) }}
      />
    </PaneSheet>
  );
}
