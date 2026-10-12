/**
 * Campaigns, the home (canvas A, "Lifecycle", approved 2 Oct 2026; its ledger, option A of 9 Oct): what goes out on its own
 * as a customer reaches a moment, and what you send yourself. A head with the Library and New message; the rail of moments
 * around a customer, and under it in the same pane the ledger, every campaign in one place, grouped by moment, narrowed by a
 * card, a tab, a search or a key, and decided where it stands; then three tiles, who can hear you, what is coming and what
 * came back. On a phone the moments are the one list's spine. A campaign's name opens it in a sheet from the side; New
 * message opens the composer in one. The old Playbooks list is this page, and the Broadcasts and Templates pages are its
 * rooms (Sent and the Library).
 *
 * Every word and number is the view model's (contracts campaignsHomeOf); the page composes it and presses. The ledger's
 * view is held here, once (ledger/use-ledger-view.ts), where Ask's door reads the rows on screen. The toast host is the
 * page's, so a toast outlives the sheet that raised it (a send closes the composer in the same breath, and the toast that
 * offers to stop it must not go with it).
 */
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { LIFECYCLE_TOAST } from "@chanlytics/contracts";
import type { LifecycleAct, LifecycleHome, LifecycleRow } from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { canDo, gate, routeDoor, navigate, useLegacyToast } from "../../legacy-verbs";
import type { RouteDoor } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { bcWhenWords } from "../broadcasts/when-words";
import { playbooks as verbs } from "../playbooks/verbs";
import { CmDot, CmHead } from "../parts/head";
import { useCmPhone } from "../parts/split";
import type { PlaybookCardVM } from "../playbooks/surface";
import { ReachOutSheet } from "../reach-out/sheet";
import { composeRoute, messageRoute, momentRoute, parseHome } from "./address";
import { AskDoor, SetUpAsk, useLedgerOnScreen } from "./ask-on-campaigns";
import type { HomeAddress } from "./address";
import { MomentDrawer } from "./drawer";
import { MessageDrawer } from "./message-drawer";
import { Ledger } from "./ledger/ledger";
import type { LedgerActs, LedgerApproval } from "./ledger/ledger-acts";
import {
  pressRowOpener,
  useArrivalLands,
  useFocusComesHome,
  useLedgerCursor,
  useLedgerKeys,
  useLetGo,
  useRowMarks,
} from "../parts/ledger-keys";
import { LedgerPhone } from "./ledger/ledger-phone";
import { useLedgerView } from "./ledger/use-ledger-view";
import { NewMessageLabel } from "./new-label";
import { NewMessage } from "./new-message";
import { Rail } from "./rail";
import type { RailActs } from "./rail";
import { SentenceParts } from "./sentence";
import { ComingBlock, ReachBlock, ResultsBlock } from "./tiles";
import { useHomeData, useHomeNav, useKeptGroup, useReopenDrafts } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];
type Nav = ReturnType<typeof useHomeNav>;
type Door = (act: LifecycleAct) => RouteDoor | null;

/**
 * The head's line: the page's numbers in the page's emphasis, and a quiet line while offers by email are paused. Where
 * the workspace stands on its channels is drawn where it is seen, at the rail's head (in the Moments head on a phone): the
 * frame's head is a screen reader's line under Glass, clipped to a point on a desk and gone on a phone.
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

/**
 * The head's acts: the Library, which is the Templates page now, Ask's door (ask-on-campaigns.tsx), and New message, the
 * page's one primary act.
 */
function headActs(home: LifecycleHome, newMessage: () => void) {
  const { library } = home.head;
  return (
    <>
      <Button size="sm" className="cmh-library" {...routeDoor("messages")} data-testid="cmh-library">
        <Icon name="content" size={13} /> <span className="cmh-library-word">{library.label}</span>
        {library.count !== null ? <span className="cmh-n tabular">{library.count}</span> : null}
      </Button>
      <AskDoor />
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

/**
 * What a press on a moment, a row, a line or a button does. A door to a campaign is its drawer, pushed so Back closes
 * it; a door to a page is a link the app's way. Starting or resuming a campaign is the role's. `onDecided`: a campaign
 * resumed where it stood settles there.
 */
function useActs(home: LifecycleHome, nav: Nav, flash: Flash, onDecided: (id: string) => void) {
  const nameOf = (id: string) =>
    home.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.name ??
    home.rail.stages.find((s) => s.playbookId === id)?.name ??
    LIFECYCLE_TOAST.nameless;
  const resume = async (id: string) => {
    const name = nameOf(id);
    const r = await verbs.resume(id, {
      onAccepted: () => {
        onDecided(id);
        flash({ tone: "ok", msg: <SentenceParts parts={LIFECYCLE_TOAST.resumed(name)} /> });
      },
    });
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  // A route of the home's own (`campaigns/message:<name>`, the call's text's message) is a sheet over it, pushed so Back
  // closes it; any other is a page.
  const homes = (route: string) => route.startsWith("campaigns/");
  const onAct = (act: LifecycleAct) => {
    if (act.kind === "open") nav.push(momentRoute(act.playbookId));
    else if (act.kind === "turn_on") nav.push(composeRoute("every", { moment: act.moment }));
    else if (act.kind === "resume") void resume(act.playbookId);
    else if (homes(act.route)) nav.push(act.route);
    else navigate(act.route);
  };
  const door: Door = (act) => {
    if (act.kind === "open") return routeDoor(momentRoute(act.playbookId), nav.push);
    if (act.kind === "route") return routeDoor(act.route, homes(act.route) ? nav.push : undefined);
    return null;
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
  return { onAct, onCopy, door };
}

/**
 * A moment's card's name, the door to its lead's drawer: pushed as a row's name is, and said to be the card's, so the
 * drawer gives the focus back to the card as it closes, never to the campaign's row under it (ledger-keys.ts
 * useFocusComesHome). Any other door is the page's own.
 */
function cardDoor(home: LifecycleHome, door: Door, nav: Nav, fromCard: (id: string, stage: string) => void): Door {
  return (act) => {
    if (act.kind !== "open") return door(act);
    const stage = home.rail.stages.find((s) => s.playbookId === act.playbookId);
    return routeDoor(momentRoute(act.playbookId), (to) => {
      if (stage) fromCard(act.playbookId, stage.id);
      nav.push(to);
    });
  };
}

/**
 * A waiting run approved or skipped on its row (the broadcast's own doors, playbooks/verbs.ts): one at a time, each said
 * the moment the server takes it, from what it answered -- how many, and when it really goes, since the server moves an
 * approval outside the sending hours to the next nine o'clock (broadcasts/when-words.ts). The row keeps its place and
 * settles; the page repaints from the re-read behind it; a refusal is the server's own words.
 */
function useApproval(flash: Flash, canAct: boolean, onDecided: (id: string) => void): LedgerApproval {
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  // A second press before the first has drawn its busy state would be a second request: the ref holds it at once.
  const working = useRef(false);
  const answer = async <D,>(
    row: LifecycleRow,
    runId: string,
    send: (o: { onAccepted: (d: D) => void }) => Promise<{ ok: true; data: D } | { ok: false; message: string }>,
    said: (d: D) => ReactNode,
  ): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setBusy(runId);
    let done = false;
    const say = (d: D) => {
      done = true;
      onDecided(row.id);
      flash({ tone: "ok", msg: said(d) });
    };
    try {
      const r = await send({ onAccepted: say });
      if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
      else if (!done) say(r.data);
    } finally {
      // Whatever the send did, the next press is taken; and the question this press answered closes, never one asked
      // on another row while this was with the server.
      working.current = false;
      setBusy(null);
      setAsking((open) => (open === runId ? null : open));
    }
  };
  const onApprove = async (row: LifecycleRow): Promise<void> => {
    const w = row.waiting;
    if (!w || w.refusal || !canAct) return;
    await answer(
      row,
      w.runId,
      (o) => verbs.approveRun(w.runId, o),
      (d: Output<"POST broadcasts/[id]/approve">) => (
        <SentenceParts parts={LIFECYCLE_TOAST.approved(row.name, d.recipient_count || w.people, bcWhenWords(d))} />
      ),
    );
  };
  const onSkip = async (row: LifecycleRow): Promise<void> => {
    const w = row.waiting;
    if (!w || !canAct) return;
    await answer(
      row,
      w.runId,
      (o) => verbs.skipRun(w.runId, o),
      // What the server stopped, by what the run was when it did: one a teammate approved a moment before is going.
      (d: Output<"POST broadcasts/[id]/cancel">) => <SentenceParts parts={LIFECYCLE_TOAST.skipped(row.name, d.was)} />,
    );
  };
  return { busy, asking, onAsk: setAsking, onApprove, onSkip, canAct, gated: gate("approve", "approve a run") };
}

/**
 * The ledger as the page holds it, once: its view (what the screen shows, and what Ask is told is on screen:
 * ask-on-campaigns.tsx), the row marks (a row decided in place keeps its place until the filter changes, and settles; an
 * arrival is washed), the keys over the rows the screen shows, and focus coming back to the row, or the card, a sheet
 * was opened from.
 */
function useLedgerPage(
  home: LifecycleHome,
  address: HomeAddress,
  at: { group: string | null; nav: Nav; phone: boolean },
) {
  // A sheet over the ledger: the drawer, a message's, or a composer (a reach-out's sheet among them, at the composer's address).
  const sheetOpen = address.moment !== null || address.message !== null || address.compose !== null;
  const marks = useRowMarks(sheetOpen);
  const settled = marks.mark && marks.mark.kind === "settled" ? marks.mark.id : null;
  const view = useLedgerView(home.ledger, { group: at.group, onGroup: at.nav.narrow, phone: at.phone, keep: settled });
  useLedgerOnScreen(view);
  useLetGo(`${view.status}|${view.group ?? ""}|${view.query}`, marks.clear);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const ids = view.visibleRows.map((r) => r.id);
  const cursor = useLedgerCursor(ids);
  useLedgerKeys({
    ids,
    cursor: cursor.cursor,
    move: cursor.move,
    open: pressRowOpener,
    focusSearch: () => searchRef.current?.focus(),
    narrowed: view.filtered,
    clearOne: view.clearOne,
    sheetOpen,
  });
  // The rows the screen shows, so focus has a row to go to when the opener is gone (the row now at its index, else the
  // last, else the search).
  const fromCard = useFocusComesHome(
    address.moment ??
      // A message's drawer was opened from the call's text, whose row the focus comes home to.
      (address.message !== null ? "call_text" : null) ??
      (address.compose && address.compose.mode === "every" ? address.compose.edit : null),
    ids,
  );
  // A campaign just made has no row until the playbooks are read again: it is scrolled to when its row is drawn.
  useArrivalLands(marks.mark, ids);
  return { marks, view, searchRef, cursor: cursor.cursor, fromCard };
}

/** What the composer says once the server took a playbook. */
const composerDone = (flash: Flash) => (d: { name?: string }, changed: boolean) => {
  const name = d.name ?? LIFECYCLE_TOAST.nameless;
  flash({
    msg: <SentenceParts parts={changed ? LIFECYCLE_TOAST.changed(name) : LIFECYCLE_TOAST.running(name)} />,
  });
};

interface CampaignsHomeProps {
  /** The address's param, `campaigns/<param>`: the group the ledger shows, a moment open, or the composer. */
  param: string | null;
  /** The clock the page is read at, for a test; the moment it draws otherwise. */
  nowMs?: number;
}

export function CampaignsHome({ param, nowMs }: CampaignsHomeProps) {
  const { playbooks, broadcasts, reachOuts, home } = useHomeData(nowMs);
  const address = parseHome(param);
  const group = useKeptGroup(address);
  const nav = useHomeNav(address, group);
  const [toastNode, flash] = useLegacyToast();
  const phone = useCmPhone();
  // Who may start, change or run a campaign, or send: the role store's answer, View-as included.
  const canAct = !!canDo("approve");
  useReopenDrafts(address, playbooks, nav.swap);
  const ledger = useLedgerPage(home, address, { group, nav, phone });
  const { onAct, onCopy, door } = useActs(home, nav, flash, ledger.marks.settle);
  const approval = useApproval(flash, canAct, ledger.marks.settle);
  if (!playbooks) return null;
  const acts: RailActs & { onCopy: (phrase: string) => void } = {
    onAct,
    onCopy,
    door: cardDoor(home, door, nav, ledger.fromCard),
    gated: gate("approve", "turn on, resume or start a campaign"),
    chosen: ledger.view.group,
    onChoose: ledger.view.setGroup,
  };
  const ledgerActs: LedgerActs = { door, onAct, gated: acts.gated, approval };
  // The first day (no campaign yet): "Set up my campaigns" beside the hinted Turn on, for a role that may approve what
  // Ask proposes; the rail draws it on a desk and the phone's list where there is no rail.
  const firstDayDoor = canAct && home.ledger.counts.all === 0 ? <SetUpAsk /> : null;
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
          <LedgerPhone
            home={home}
            view={ledger.view}
            acts={ledgerActs}
            mark={ledger.marks.mark}
            searchRef={ledger.searchRef}
            firstDayDoor={firstDayDoor}
          />
          <ComingBlock tile={home.coming} failed={home.failed.coming} acts={acts} />
          <ResultsBlock tile={home.results} failed={home.failed} onOpen={navigate} />
        </>
      ) : (
        <>
          <Rail home={home} acts={acts} firstDayDoor={firstDayDoor}>
            <Ledger
              ledger={home.ledger}
              failed={home.failed}
              view={ledger.view}
              acts={ledgerActs}
              cursor={ledger.cursor}
              mark={ledger.marks.mark}
              searchRef={ledger.searchRef}
            />
          </Rail>
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
        onMessage={(name) => nav.push(messageRoute(name))}
        onEditChain={(c) => changeAt(c.root_id)}
      />
      {/* A message open in its own drawer: the call's text's, or the one a campaign's drawer names. */}
      <MessageDrawer name={address.message} flash={flash} onClose={nav.close} />
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
          // Held until no sheet stands (useRowMarks): a change made from a drawer closes back to it first.
          if (d.id) ledger.marks.arrive(d.id);
        }}
      />
      {toastNode}
    </div>
  );
}
