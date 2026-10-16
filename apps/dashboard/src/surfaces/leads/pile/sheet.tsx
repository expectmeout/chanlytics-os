/**
 * The pile on a phone (the lead workbench, canvas B v2: "decide at half height, read at full"): the kit's sheet with two
 * rests over the rows. At half it holds the lead's card (card.tsx): the reason, what it rests on, how they can be
 * reached and the first email they would get. Pulled up, or its handle pressed, it reads in five tabs (Why, Reach,
 * Emails, About, Activity), drawn from the peek's own parts and acts, never a second copy of them. The rail stays at
 * its foot at both rests, with how far through it is and Undo, so a decision is one thumb away on every tab; a decision
 * turns the card and brings it back to half. Pulled down from half, or its Close, it leaves the pile.
 *
 * Where it stands and which tab is open are this sheet's own, for the lead that is up; the pile, the card and the acts
 * are the page's, handed down (page-pile.tsx, scope.tsx).
 */
import { useState } from "react";
import {
  LEAD_CARD_TABS,
  LEAD_CARD_WORDS,
  LEAD_PILE_WORDS,
  LEAD_SHEET_WORDS,
  type LeadCardTab,
  type LeadPeekVM,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import type { SheetRest } from "../../kit/sheet/rests";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { LeadDraftPane } from "../peek/draft-pane";
import { LeadPeekAbout } from "../peek/head";
import { LeadPeekParts } from "../peek/info";
import { LeadPeekCompany, LeadPeekPeople } from "../peek/people";
import type { DraftState, PeekActs, PeekMode } from "../peek/types";
import { LeadCardEmail, LeadCardHead, LeadCardMail, LeadCardParts, LeadCardWho, type LeadCardFacts } from "./card";
import { PileEnd, PileProgress, PileRail, PileTargets, type PileViewProps } from "./pile";

/** What the sheet is handed: the pile's view, and the peek's acts and state its tabs share. */
export interface PileSheetProps {
  view: PileViewProps;
  /** The peek's acts for the lead that is up (scope.tsx peekActsOf); null before its view model is read. */
  acts: PeekActs | null;
  mode: PeekMode | null;
  draft: DraftState | null;
  busy: boolean;
}

/** Why: the reason with where it came from written out, every check with its mark and source, and the people there. */
const whyOf = (card: LeadCardFacts, vm: LeadPeekVM, on: PeekActs) => (
  <>
    {card.reason ? (
      <div className="ld-now-reason" data-testid="lead-sheet-why">
        <p className={`ld-now-why ${card.reason.how}`}>{card.reason.text}</p>
        <p className="ld-now-note">{card.reason.from}</p>
      </div>
    ) : null}
    {vm.groups.length ? <div className="pk-checks-open">{LeadPeekParts.checks(vm)}</div> : null}
    <LeadPeekCompany key={`${vm.id}-company`} company={vm.company} lead={vm} on={on} />
    <LeadPeekPeople lead={vm} on={on} />
  </>
);

/** Emails: email 1 as they would read it, then each email after it in the same thread. */
const emailsOf = (card: LeadCardFacts) =>
  card.email ? (
    <>
      <LeadCardEmail email={card.email} />
      {card.steps.slice(1).map((s) => (
        <section key={s.id} className="ld-now-mail" aria-label={s.label} data-testid="lead-sheet-step">
          <p className="ld-now-mail-head">{s.after ? `${s.label} · ${s.after}` : s.label}</p>
          <div className="ld-now-mail-body">
            <LeadCardParts parts={s.body} />
          </div>
        </section>
      ))}
    </>
  ) : card.firstPile ? (
    <LeadCardMail card={card} />
  ) : (
    <p className="ld-now-note">{LEAD_CARD_WORDS.noEmails}</p>
  );

/** The tab open at full height, from the peek's parts and acts. */
function paneOf(tab: LeadCardTab, p: PileSheetProps, card: LeadCardFacts) {
  const vm = card.peek;
  const on = p.acts;
  if (tab === "emails") return emailsOf(card);
  if (!vm || !on) return null;
  if (tab === "why") return whyOf(card, vm, on);
  if (tab === "reach")
    return p.mode === "draft" ? (
      <LeadDraftPane vm={vm} draft={p.draft} busy={p.busy} on={on} />
    ) : (
      <>
        {LeadPeekParts.reach(vm, on)}
        {LeadPeekParts.others(vm)}
      </>
    );
  if (tab === "about")
    return (
      <>
        <LeadPeekAbout vm={vm} />
        {LeadPeekParts.week(vm)}
        {LeadPeekParts.links(vm)}
      </>
    );
  return (
    <>
      {on.reachOut}
      {LeadPeekParts.found(vm)}
    </>
  );
}

/** Full height: who, the five tabs, and the open one. */
const fullOf = (up: LeadRowVM, card: LeadCardFacts, p: PileSheetProps, tab: LeadCardTab, pick: (t: string) => void) => (
  <div className="ld-now-full" data-testid="lead-sheet-full">
    <LeadCardWho up={up} />
    <SubTabs
      label={LEAD_SHEET_WORDS.tabs}
      value={tab}
      tabs={LEAD_CARD_TABS.map((t) => ({ id: t.id, label: t.label, testid: `lead-sheet-tab-${t.id}` }))}
      onSelect={pick}
      dense
    />
    <div className="ld-now-pane" role="tabpanel" aria-label={tab} data-testid={`lead-sheet-pane-${tab}`}>
      {paneOf(tab, p, card)}
    </div>
  </div>
);

/** The pile as a sheet over the rows, with its two rests. */
export function LeadPileSheet(p: PileSheetProps) {
  const { view } = p;
  const { up, card, pile } = view;
  // Full height and the tab are the lead's that is up: a decision turns the card, and the next one comes up at half.
  const [raised, setRaised] = useState<string | null>(null);
  const [tab, setTab] = useState<{ lead: string | null; tab: LeadCardTab }>({ lead: null, tab: "why" });
  const upId = up ? up.id : null;
  const rest: SheetRest = upId !== null && raised === upId ? "full" : "half";
  const open: LeadCardTab = tab.lead === upId ? tab.tab : "why";
  const pick = (t: string) => {
    const found = LEAD_CARD_TABS.find((x) => x.id === t);
    if (found) setTab({ lead: upId, tab: found.id });
  };
  return (
    <Sheet
      open
      onClose={pile.stop}
      title={LEAD_PILE_WORDS.head(view.searchName)}
      kicker
      close={{ label: LEAD_PILE_WORDS.leave, glyph: <Icon name="x" size={13} /> }}
      rest={{
        at: rest,
        onRest: (at) => setRaised(at === "full" ? upId : null),
        turn: { up: LEAD_SHEET_WORDS.raise, down: LEAD_SHEET_WORDS.lower },
      }}
      foot={
        <>
          {up ? <PileRail p={view} l={up} /> : null}
          <PileProgress p={view} />
        </>
      }
      testid="lead-pile-sheet"
    >
      <PileTargets p={view} />
      {up && card ? (
        rest === "full" ? (
          fullOf(up, card, p, open, pick)
        ) : (
          <article key={up.id} className="ld-pile-now" aria-label={up.name} data-testid="lead-pile-lead">
            <LeadCardHead up={up} card={card} />
            <LeadCardMail card={card} />
          </article>
        )
      ) : (
        <PileEnd p={view} />
      )}
    </Sheet>
  );
}
