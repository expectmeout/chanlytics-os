/**
 * Campaigns, the home (canvas A, "Lifecycle", approved 2 Oct 2026): what goes out on its own as a customer reaches a moment,
 * and what you send yourself. A head with the Library and New message; the rail of five moments around a customer with the
 * campaigns that are not one of them under it; and three tiles, who can hear you, what is coming and what came back. A moment
 * pressed opens its playbook in a sheet from the side; New message opens the composer in one. The old Playbooks list is this
 * page, and the Broadcasts and Templates pages are its rooms (Sent and the Library).
 *
 * Every word and number is the view model's (contracts campaignsHomeOf, over the surfaces the Playbooks and Broadcasts pages
 * read); the page composes it and presses. A real workspace draws its own surfaces; a demo session draws the samples; without
 * either, nothing. The toast host is the page's, so a toast outlives the sheet that raised it (a send closes the composer in
 * the same breath, and the toast that offers to stop it must not go with it).
 */
import type { ReactNode } from "react";
import { LIFECYCLE_TOAST } from "@chanlytics/contracts";
import type { LifecycleAct, LifecycleHome } from "@chanlytics/contracts";
import { canDo, gate, routeDoor, navigate, useLegacyToast } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { playbooks as verbs } from "../playbooks/verbs";
import { CmDot, CmHead } from "../parts/head";
import { useCmPhone } from "../parts/split";
import type { PlaybookCardVM } from "../playbooks/surface";
import { ReachOutSheet } from "../reach-out/sheet";
import { composeRoute, momentRoute, parseHome } from "./address";

import { MomentDrawer } from "./drawer";
import { NewMessageLabel } from "./new-label";
import { NewMessage } from "./new-message";
import { PhoneRail, Rail } from "./rail";
import type { RailActs } from "./rail";
import { SentenceParts } from "./sentence";
import { ComingBlock, PhoneReach, ReachBlock, ResultsBlock } from "./tiles";
import { useHomeData, useHomeNav, useReopenDrafts } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];

/**
 * The head's line: the page's numbers in the page's emphasis, and a quiet line while offers by email are paused. Where
 * the workspace stands on its channels is drawn where it is seen, at the rail's head (and in the phone's reach tile): the
 * frame's head is a screen reader's line under Glass, clipped to a point on a desk and gone on a phone, so the channels'
 * doors drawn in it were links nobody could see and every Tab still landed on.
 */
function sentenceOf(home: LifecycleHome): ReactNode {
  const { sentence, pausedLine } = home.head;
  return (
    <>
      <SentenceParts parts={sentence} />
      {pausedLine ? (
        <>
          <CmDot />
          <span data-testid="cmh-paused">{pausedLine}</span>
        </>
      ) : null}
    </>
  );
}

/** The head's two acts: the Library, which is the Templates page now, and New message, the page's one primary act. */
function headActs(home: LifecycleHome, newMessage: () => void) {
  const { library } = home.head;
  return (
    <>
      <Button size="sm" className="cmh-library" {...routeDoor("messages")} data-testid="cmh-library">
        <Icon name="content" size={13} /> <span className="cmh-library-word">{library.label}</span>
        {library.count !== null ? <span className="cmh-n tabular">{library.count}</span> : null}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={newMessage}
        data-testid="cmh-new"
        {...gate("approve", "send a message")}
      >
        <Icon name="plus" size={12} /> <NewMessageLabel />
      </Button>
    </>
  );
}

/** What a press on a stage, a line, a run or a button does. Starting or resuming a playbook is the role's; every page of it is. */
function useActs(
  home: LifecycleHome,
  nav: ReturnType<typeof useHomeNav>,
  flash: Flash,
): { onAct: (act: LifecycleAct) => void; onCopy: (phrase: string) => void } {
  const nameOf = (id: string) =>
    home.rail.stages.find((s) => s.playbookId === id)?.name ??
    home.strips.find((s) => s.id === id)?.name ??
    LIFECYCLE_TOAST.nameless;
  const resume = async (id: string) => {
    const name = nameOf(id);
    const r = await verbs.resume(id, {
      onAccepted: () => flash({ tone: "ok", msg: <SentenceParts parts={LIFECYCLE_TOAST.resumed(name)} /> }),
    });
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  const onAct = (act: LifecycleAct) => {
    if (act.kind === "open") nav.push(momentRoute(act.playbookId));
    else if (act.kind === "turn_on") nav.push(composeRoute("every", { moment: act.moment }));
    else if (act.kind === "resume") void resume(act.playbookId);
    else navigate(act.route);
  };
  // A browser that will not copy (no clipboard on an insecure page, or a refusal) says the phrase, to be typed or copied by hand.
  const onCopy = (phrase: string) => {
    const refused = () => flash({ tone: "warn", msg: <>{LIFECYCLE_TOAST.copyFailed(phrase)}</> });
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      refused();
      return;
    }
    void navigator.clipboard.writeText(phrase).then(() => flash({ msg: <>{LIFECYCLE_TOAST.phraseCopied}</> }), refused);
  };
  return { onAct, onCopy };
}

/** What the composer says once the server took a playbook. */
const composerDone = (flash: Flash) => (d: { name?: string }, changed: boolean) => {
  const name = d.name ?? LIFECYCLE_TOAST.nameless;
  flash({
    msg: <SentenceParts parts={changed ? LIFECYCLE_TOAST.changed(name) : LIFECYCLE_TOAST.running(name)} />,
  });
};

interface CampaignsHomeProps {
  /** The address's param, `campaigns/<param>`: a moment open, or the composer. */
  param: string | null;
  /** The clock the page is read at, for a test; the moment it draws otherwise. */
  nowMs?: number;
}

export function CampaignsHome({ param, nowMs }: CampaignsHomeProps) {
  const { playbooks, broadcasts, reachOuts, home } = useHomeData(nowMs);
  const address = parseHome(param);
  const nav = useHomeNav(address);
  const [toastNode, flash] = useLegacyToast();
  const phone = useCmPhone();
  // Who may start, change or run a playbook, or send: the role store's answer, View-as included.
  const canAct = !!canDo("approve");
  useReopenDrafts(address, playbooks);
  const { onAct, onCopy } = useActs(home, nav, flash);
  if (!playbooks) return null;
  const acts: RailActs & { onCopy: (phrase: string) => void } = {
    onAct,
    onCopy,
    gated: gate("approve", "turn on, resume or start a playbook"),
  };
  const newMessage = () => nav.push(composeRoute("once"));
  // A change is pushed over the drawer that showed it, so Cancel, and Back, return to the detail.
  const changeAt = (id: string) => nav.push(composeRoute("every", { edit: id }));
  // A reach-out's change is its own sheet (the record sheet, which stands on the page and so cannot stand under the drawer's
  // modal), so the address that names one closes the drawer and opens that sheet in its place.
  const changing = address.compose && address.compose.mode === "every" ? address.compose.edit : null;
  const chain = changing && Array.isArray(reachOuts) ? (reachOuts.find((c) => c.root_id === changing) ?? null) : null;
  return (
    <div className="cmh" data-testid="campaigns-home" data-phone={phone ? "true" : undefined}>
      <CmHead title="Campaigns" quiet testid="cmh-head" sub={sentenceOf(home)} right={headActs(home, newMessage)} />
      {phone ? (
        <>
          <PhoneReach tile={home.reach} failed={home.failed.reach} channels={home.head.channels} />
          <PhoneRail home={home} acts={acts} />
          <ComingBlock tile={home.coming} failed={home.failed.coming} acts={acts} />
          <ResultsBlock tile={home.results} failed={home.failed} onOpen={navigate} />
        </>
      ) : (
        <>
          <Rail home={home} acts={acts} />
          <div className="cmh-grid">
            <ReachBlock tile={home.reach} failed={home.failed.reach} acts={acts} />
            <ComingBlock tile={home.coming} failed={home.failed.coming} acts={acts} />
            <ResultsBlock tile={home.results} failed={home.failed} onOpen={navigate} />
          </div>
        </>
      )}
      <MomentDrawer
        id={address.moment}
        home={home}
        playbooks={playbooks}
        reachOuts={reachOuts}
        canAct={canAct}
        flash={flash}
        onClose={nav.close}
        onEdit={(p: PlaybookCardVM) => changeAt(p.id)}
        onEditChain={(c) => changeAt(c.root_id)}
      />
      {chain && chain.search ? (
        <ReachOutSheet key={chain.root_id} search={chain.search} chain={chain} onClose={nav.close} onGo={nav.swap} />
      ) : null}
      <NewMessage
        compose={chain ? null : address.compose}
        home={home}
        playbooks={playbooks}
        broadcasts={broadcasts}
        reachOuts={reachOuts}
        flash={flash}
        onClose={nav.close}
        onYes={nav.swap}
        onKind={(mode) => nav.swap(composeRoute(mode))}
        onSaved={(d, changed) => {
          nav.close();
          composerDone(flash)(d, changed);
        }}
      />
      {toastNode}
    </div>
  );
}
