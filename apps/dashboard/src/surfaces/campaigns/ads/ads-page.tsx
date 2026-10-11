/**
 * Campaigns › Ads (MOCKUP): paid ads on Facebook and Instagram, Google and TikTok, measured in conversations and appointments.
 * Drawn in a demo session only (campaigns/home/route.tsx), from a sample until the wiring lane reads real ads; every press goes
 * through the store's verbs (store.ts) and says its answer in a toast, and nothing leaves the browser. A quiet "Example" pill
 * (also the Menu that chooses the example) says so, always.
 *
 * The store holds the read once, and the page hands `read` and `verbs` down: the drawer and New ad keep no copy of an ad. Ten
 * examples (examples.ts): ads running (the default), ads that need the owner, finished ones, no calendar link, one being made,
 * a connected account with no ad yet, an account to choose, nothing connected (v0), and the accounts being read or unreadable.
 * On a desk: the frame's head (the sentence, Ask, New ad), the money-calm line, the pane line (the window, the Example pill, the
 * three platforms), a line under it for an account that could not be read, four figures with their one quiet line and its
 * doors (how it is counted, Results), the Ask line, the ledger by what an ad asks people to do or by platform, and three tiles.
 * On a phone: the sentence the frame's head leaves out, the muted lines, the pane line, and one list with the Ask line last
 * (ledger/phone.tsx). An ad opens in its drawer (drawer/drawer.tsx), New ad in its composer (new/new-ad.tsx) and Results in its
 * sheet (results/results-sheet.tsx), all always mounted and open by the address, so Back closes them. The ledger takes the keys
 * Messages' does (parts/ledger-keys.ts): J and K or the arrows walk a cursor, Enter opens the row, focus comes home to the row a
 * drawer was opened from, and an ad just turned on is scrolled to once the composer has gone.
 */
// The page's own rules, loaded with it: the page is loaded on demand (campaigns/home/route.tsx), so no other page pays for
// them (as the Inbox's new-conversation sheet loads sheet.css). Results' rules load with the sheet (results/results.css).
import "./ads.css";
import "./drawer/drawer.css";
import "./new/new.css";
import { useMemo, useState } from "react";
import { ADS_WORDS, adRoute, newAdRoute, parseAds } from "@chanlytics/contracts";
import type { AdPlatform, AdsAddress } from "@chanlytics/contracts";
import {
  CHOOSE,
  GATE,
  HEAD,
  NEW_AD,
  PLATFORM_OWNER,
  REVIEW_WITHIN,
  adFollowOn,
  adsModel,
} from "@chanlytics/contracts/ads-page";
import type { AdDraft, AdsGroupBy, AdsVM, AskVM, HeadVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { afterMove, askAbout, gate, useLegacyToast } from "../../legacy-verbs";
import { CmHead } from "../parts/head";
import {
  pressRowOpener,
  useArrivalLands,
  useFocusComesHome,
  useLedgerCursor,
  useLedgerKeys,
  useRowMarks,
} from "../parts/ledger-keys";
import { useCmPhone } from "../parts/split";
import { AskLine } from "./ask-line";
import { AdDrawer } from "./drawer/drawer";
import { Figures } from "./figures";
import { ChooseCards, NoAdsCard, V0Page } from "./hero";
import { AdsLedger } from "./ledger/ledger";
import { AdsPhone } from "./ledger/phone";
import { NewAd } from "./new/new-ad";
import { ResultsSheet } from "./results/results-sheet";
import { PaneLine, ReadNotes } from "./standing";
import { tellOf, useAdsStore } from "./store";
import { CameBackBlock, ComingBlock, WaitingBlock } from "./tiles";
import { useAdsNav, useGroupBy } from "./use-ads";

/** What puts a proposal off for the session: the Ask line speaks again when it has something else to say. */
const askKey = (ask: AskVM): string => `${ask.kind}:${ask.adId}`;

/** A key with nothing to let go of: Ads' ledger has no search and no filter. */
const nothing = (): void => undefined;

/** The head's line: the page's numbers in the page's emphasis. The frame draws it beside the name on a desk. */
function HeadSentence({ head }: { head: HeadVM }) {
  return (
    <>
      {head.strong ? <b>{head.strong}</b> : null}
      {head.rest}
    </>
  );
}

/** The head's acts: Ask (quiet) and New ad, the page's one primary, which is the owner's press. Nothing to create in v0. */
function HeadActs({ mode, onNew }: { mode: AdsVM["mode"]; onNew: () => void }) {
  // Ask opens on this page, so its answer is about the ads and not about nothing.
  const onAsk = () => askAbout({ about: { kind: "page", id: "campaigns/ads", label: ADS_WORDS.adsTab } });
  return (
    <>
      <Button variant="quiet" size="sm" className="cmh-ask" onClick={onAsk} data-testid="ads-ask-door">
        <Icon name="sparkle" size={13} /> {HEAD.ask}
      </Button>
      {mode === "v0" ? null : (
        <Button
          variant="primary"
          size="sm"
          onClick={onNew}
          data-testid="ads-head-new"
          {...gate("approve", GATE.turnOn)}
        >
          <Icon name="plus" size={12} /> {HEAD.newAd}
        </Button>
      )}
    </>
  );
}

/** What a press on the page does. */
interface PageActs {
  /** Open an Ads address over the page (an ad's drawer, the composer, Results), pushed so Back closes it. */
  push: (route: string) => void;
  onNew: () => void;
  onYes: (ask: AskVM) => void;
  onNo: (ask: AskVM) => void;
  /** The owner picked one of an account's choices (its platform, the platform's id for it, and its name). */
  onChoose: (platform: AdPlatform, externalId: string, name: string) => void;
  onGroupBy: (next: AdsGroupBy) => void;
}

interface BodyProps {
  vm: AdsVM;
  phone: boolean;
  /** The Ask line, if it has something true to say and was not put off. */
  ask: AskVM | null;
  /** The ad just turned on, if any. */
  arrived: string | null;
  /** The row the keys' cursor is on, if any. */
  cursor: string | null;
  acts: PageActs;
}

/** Under the head, on a desk the money-calm line; on a phone the sentence, the muted line, then the money-calm line. */
function AdsUnder({ vm, phone }: { vm: AdsVM; phone: boolean }) {
  return (
    <>
      {phone ? (
        <>
          <p className="ads-lead" data-testid="ads-lead">
            <HeadSentence head={vm.head} />
          </p>
          {vm.phone ? (
            <p className="ads-muted" data-testid="ads-muted">
              {vm.phone.line1}
            </p>
          ) : null}
        </>
      ) : null}
      {vm.head.money ? (
        <p className="ads-money" data-testid="ads-money">
          {vm.head.money}
        </p>
      ) : null}
    </>
  );
}

/** Ads running, on a desk: the figures, the Ask line, the ledger, and the three tiles. */
function DeskRunning({ vm, ask, arrived, cursor, acts }: BodyProps) {
  const tiles = vm.tiles;
  return (
    <>
      {vm.counted ? <Figures figures={vm.figures} counted={vm.counted} link={vm.link} onOpen={acts.push} /> : null}
      {ask ? <AskLine key={askKey(ask)} ask={ask} onYes={() => acts.onYes(ask)} onNo={() => acts.onNo(ask)} /> : null}
      <AdsLedger
        groups={vm.groups}
        onOpen={acts.push}
        arrived={arrived}
        cursor={cursor}
        groupBy={vm.groupBy}
        onGroupBy={acts.onGroupBy}
      />
      {tiles ? (
        <div className="cmh-grid">
          <WaitingBlock tile={tiles.waiting} />
          <ComingBlock tile={tiles.coming} onOpen={acts.push} />
          <CameBackBlock tile={tiles.cameBack} link={vm.link} />
        </div>
      ) : null}
    </>
  );
}

/** The page's body: v0, an account to choose, the first ad's card, or the ads. */
function AdsBody(p: BodyProps) {
  const { vm, phone, ask, arrived, acts } = p;
  if (vm.v0) return <V0Page v0={vm.v0} />;
  if (vm.noAds) {
    return vm.noAds.choose.length > 0 ? (
      <ChooseCards choose={vm.noAds.choose} onChoose={acts.onChoose} />
    ) : (
      <NoAdsCard noAds={vm.noAds} onSetUp={acts.onNew} />
    );
  }
  if (!phone) return <DeskRunning {...p} />;
  return (
    <AdsPhone
      vm={vm}
      ask={ask}
      onOpen={acts.push}
      onYes={acts.onYes}
      onNo={() => {
        if (ask) acts.onNo(ask);
      }}
      arrived={arrived}
    />
  );
}

/**
 * The ledger's keys, as Messages' are: a cursor over the rows the screen shows (J and K, the arrows; Enter opens the row), focus
 * home to the row a drawer was opened from as it closes, and an ad just turned on scrolled to and washed once, once no sheet
 * stands over the page.
 */
function useAdsLedgerKeys(vm: AdsVM, address: AdsAddress) {
  const sheetOpen = address.ad !== null || address.compose !== null || address.results;
  const marks = useRowMarks(sheetOpen);
  const ids = vm.groups.flatMap((g) => g.rows.map((r) => r.id));
  const cursor = useLedgerCursor(ids);
  useLedgerKeys({
    ids,
    cursor: cursor.cursor,
    move: cursor.move,
    open: pressRowOpener,
    narrowed: false,
    clearOne: nothing,
    sheetOpen,
  });
  useFocusComesHome(address.ad, ids);
  useArrivalLands(marks.mark, ids);
  const arrived = marks.mark && marks.mark.kind === "arrived" ? marks.mark.id : null;
  return { arrive: marks.arrive, arrived, cursor: cursor.cursor };
}

interface AdsPageProps {
  /** The address's param, `campaigns/<param>`: `ads`, an ad open, the composer or Results. */
  param: string;
}

export function AdsPage({ param }: AdsPageProps) {
  const address = parseAds(param);
  const nav = useAdsNav(address);
  const { read, config, example, setExample, verbs, readAgain } = useAdsStore();
  const [toastNode, flash] = useLegacyToast();
  const phone = useCmPhone();
  const [groupBy, setGroupBy] = useGroupBy();
  const [hushed, setHushed] = useState<string | null>(null);
  const vm = useMemo(() => adsModel(read, config, groupBy), [read, config, groupBy]);
  const keys = useAdsLedgerKeys(vm, address);
  const ask = vm.ask && askKey(vm.ask) !== hushed ? vm.ask : null;
  const acts: PageActs = {
    push: nav.push,
    onNew: () => nav.push(newAdRoute()),
    // A proposal that fixes opens the ad it names; the others do what they say, said by a toast with an Undo.
    onYes: (a) => {
      if (a.kind === "fix") nav.push(adRoute(a.adId));
      else flash(tellOf(verbs.answerAsk(a), a.toast));
    },
    onNo: (a) => setHushed(askKey(a)),
    onChoose: (platform, externalId, name) =>
      flash(tellOf(verbs.chooseAccount(platform, externalId), CHOOSE.done(name))),
    onGroupBy: setGroupBy,
  };
  // Turn on: New ad closes itself into this. The composer raises no toast of its own; the page closes it, lands the row and
  // says that the platform will check it, with an Undo that pauses the row (nothing is spent while it is checked). A draft that
  // asked for the Google ad as well goes on to it once the composer has gone.
  const turnOn = (draft: AdDraft, maxMinor: number | null): boolean => {
    const out = verbs.turnOn(draft, maxMinor);
    if (!out.ok) {
      flash(tellOf(out, ""));
      return false;
    }
    const then = out.id ? adFollowOn(draft, out.id) : null;
    if (then === null) nav.close();
    else afterMove(nav.close, () => nav.push(then));
    if (out.id) keys.arrive(out.id);
    flash({
      msg: NEW_AD.turnOnToast({ owner: PLATFORM_OWNER[draft.platform], within: REVIEW_WITHIN[draft.platform] }),
      undo: () => {
        out.undo();
        flash({ msg: NEW_AD.undone });
      },
    });
    return true;
  };
  return (
    <div
      className="cmh ads"
      data-testid="campaigns-ads"
      data-phone={phone ? "true" : undefined}
      data-example={example}
      data-ad={address.ad ?? undefined}
    >
      <CmHead
        title="Campaigns"
        quiet
        allowance={false}
        testid="ads-head"
        sub={<HeadSentence head={vm.head} />}
        right={<HeadActs mode={vm.mode} onNew={acts.onNew} />}
      />
      <AdsUnder vm={vm} phone={phone} />
      <PaneLine
        said={vm.pane}
        standing={vm.standing}
        showStanding={vm.mode !== "v0"}
        example={example}
        onExample={setExample}
      />
      <ReadNotes failed={vm.failed} onAgain={readAgain} />
      <AdsBody vm={vm} phone={phone} ask={ask} arrived={keys.arrived} cursor={keys.cursor} acts={acts} />
      <AdDrawer
        id={address.ad}
        read={read}
        config={config}
        verbs={verbs}
        onClose={nav.close}
        flash={flash}
        onGo={nav.push}
      />
      <NewAd
        compose={address.compose}
        read={read}
        config={config}
        onClose={nav.close}
        onTurnOn={turnOn}
        flash={flash}
      />
      <ResultsSheet open={address.results} read={read} config={config} onClose={nav.close} />
      {toastNode}
    </div>
  );
}
