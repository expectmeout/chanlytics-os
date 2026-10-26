/**
 * The deal sheet's foot (the canvas "Pipeline deal sheet", 20 Oct 2026): one act leads, by how the deal stands, and its
 * caret holds the deal's other moves and the proposal where it lives, one pill split by a hairline (Ruben, 20 Oct 2026:
 * a menu rides its pill, never ⋯ beside it); then Message and Call, bare in the foot's glass, one layer (21 Oct). A client's foot
 * leads with Message, the only next thing a client asks. While a pass is asked, the question stands in the foot's place,
 * its reasons one press each (the Pipeline's own pass, people-detail.ts passDeals), as a selection's is.
 *
 * Every act is a door that already exists: a send opens their thread with the words in its box (pdRun), a move the one
 * deal sheet, Message their thread or a new conversation with them, Call their page's Call (it rings from the member's
 * phone and asks how it went, never a bare tel: link). Nothing for a member who may not record, nor before the person is
 * read: what to press is the card's, and the card reads them.
 */
import type { ReactElement } from "react";
import { NEW_CONVERSATION_WORDS, shortName } from "@chanlytics/contracts";
import type { DealActId, PipelineSheetAct } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu, type MenuItem } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import { openNewConversation } from "../../inbox/new-conversation/store";
import { pdRun } from "../deal/person-deal";
import { passDeals } from "../people-detail";
import { CallAct, type CallCtx } from "../person/call";
import { P } from "./pipe";
import type { DealSheetCtx } from "./peek-parts";

const S = P.words.sheet;

/** Each move's glyph in the caret's menu, so the eye finds it before the words. */
const GLYPH: Partial<Record<DealActId, ReactElement>> = {
  won: <Icon name="check" size={16} />,
  lost: <Icon name="ban" size={16} />,
  edit: <Icon name="pencil" size={16} />,
  ended: <Icon name="stop" size={16} />,
  again: <Icon name="repeat" size={16} />,
  propose: <Icon name="plus" size={16} />,
};

/** What the deal's acts gate on, as the deal sheet's own Save does. */
const DEAL_GATE = gate("approve", "record a deal");

/** Run an act of the sheet: a pass is asked here, in the foot; every other act is the card's own (pdRun). */
function runAct(c: DealSheetCtx, a: PipelineSheetAct): void {
  if (!c.person) return;
  if (a.act.id === "lost") {
    c.onPass();
    return;
  }
  pdRun(c.person, a.act, a.dealId, c.onCompose);
}

/** Whether a message may go to them at all: not after a stop, nor on do-not-contact (their page's own rule). */
const mayMessage = (c: DealSheetCtx): boolean => !!c.person && !c.person.stopped && !c.person.consent.dnc;

/** Their thread, the words box empty; or a new conversation with them where they have none. */
function messageThem(c: DealSheetCtx): void {
  if (!c.person) return;
  if (c.person.openThread) c.onCompose(null);
  else openNewConversation(c.person.id);
}

/**
 * The proposal where it lives, opened in a new tab, its host said at the item's end: the sheet's one door to it (its
 * link is copied on their page; a send carries it already).
 */
function proposalItem(c: DealSheetCtx): MenuItem[] {
  const link = c.sheet.card ? c.sheet.card.link : null;
  if (!link) return [];
  return [
    {
      label: S.openProposal,
      glyph: <Icon name="external" size={16} />,
      hint: link.host,
      title: link.url,
      onSelect: () => {
        window.open(link.url, "_blank", "noopener,noreferrer");
      },
    },
  ];
}

/**
 * The caret's menu: the moves the lead does not hold, each with its glyph, the proposal where it lives, and a new
 * proposal apart under a hairline (it moves no deal of these); on a phone the kit's sheet, headed by what it is about:
 * the service and who.
 */
function caretOf(c: DealSheetCtx, trigger: ReactElement): ReactElement | null {
  const { more } = c.sheet;
  if (!more.length) return null;
  const item = (m: PipelineSheetAct): MenuItem => ({
    label: m.act.label,
    glyph: GLYPH[m.act.id],
    onSelect: () => runAct(c, m),
    gate: m.act.id === "lost" ? gate("approve", "mark a deal as passed") : DEAL_GATE,
  });
  const fresh = (m: PipelineSheetAct) => m.act.id === "propose" && m.dealId === null;
  const moves = [...more.filter((m) => !fresh(m)).map(item), ...proposalItem(c)];
  const another = more.filter(fresh).map(item);
  const header = c.phone ? `${c.row.service ?? c.vm.sub} · ${c.vm.name}` : undefined;
  const groups = moves.length
    ? [{ header, items: moves }, ...(another.length ? [{ items: another }] : [])]
    : [{ header, items: another }];
  return <Menu label={S.more(c.vm.sub)} groups={groups} trigger={trigger} />;
}

/**
 * The foot's buttons: a thumb's height on a phone; on a desk the large size a page's head act takes (the person page's
 * Open the thread), since a pointer needs no 44px and the pane stood with a 44px coral bar under 300px of deal.
 */
const footSize = (c: DealSheetCtx): "touch" | "lg" => (c.phone ? "touch" : "lg");

/** The one act, its caret beside it in the same pill; a client's is Message; with neither, the caret alone as More. */
function leadPill(c: DealSheetCtx): ReactElement | null {
  const { lead, card } = c.sheet;
  const more = S.more(c.vm.sub);
  const caret = (
    <Button
      variant="primary"
      iconOnly
      size={footSize(c)}
      className="pipe-deal-lead-more"
      aria-label={more}
      data-testid="pipeline-peek-more"
    >
      <Icon name="chevron-down" size={16} />
    </Button>
  );
  const message = !lead && !!card && card.stage === "won" && mayMessage(c);
  if (!lead && !message) {
    return caretOf(
      c,
      <Button size={footSize(c)} className="pipe-deal-lead-alone" data-testid="pipeline-peek-more">
        {more} <Icon name="chevron-down" size={14} />
      </Button>,
    );
  }
  const press = lead ? () => runAct(c, lead) : () => messageThem(c);
  const label = lead ? lead.act.label : S.message;
  return (
    <span className="pipe-deal-lead" data-testid="pipeline-peek-lead">
      <Button
        variant="primary"
        size={footSize(c)}
        className="pipe-deal-lead-act"
        title={lead?.act.hint || undefined}
        onClick={press}
        data-testid="pipeline-peek-bar-act"
        {...(lead ? DEAL_GATE : gate("approve", NEW_CONVERSATION_WORDS.gate))}
      >
        {label}
      </Button>
      {caretOf(c, caret)}
    </span>
  );
}

/**
 * Why they passed, in the foot's place: the Pipeline's own question and its reasons (contracts pipelinePassMany over
 * this one row), a press each, said as a selection's pass is said (pipelinePassDone). The sheet then stands on the deal
 * as it is now: passed, with Propose again.
 */
function PassAsk({ c, onDone }: { c: DealSheetCtx; onDone: () => void }) {
  const { row } = c;
  const vm = P.passMany([{ ...row.person, deal: row.deal ?? row.person.deal, rowId: row.id }]);
  const go = async (reason: (typeof vm.reasons)[number]["code"]) => {
    const r = await passDeals(vm.deals, reason);
    const said = P.passDone(r.passed.length, r.changed.length, r.failed.length);
    c.flash({ tone: said.tone, msg: said.words });
    onDone();
  };
  const question = S.passAsk(shortName(c.vm.name));
  return (
    <div data-foot-acts>
      <div className="pipe-deal-pass" role="group" aria-label={question} data-testid="pipeline-peek-pass">
        <div className="pipe-deal-pass-head">
          <span className="pipe-deal-pass-q">{question}</span>
          <Button variant="quiet" size="sm" onClick={onDone} data-testid="pipeline-peek-pass-cancel">
            {P.words.pass.cancel}
          </Button>
        </div>
        <div className="pipe-deal-pass-reasons">
          {vm.reasons.map((x) => (
            <Button
              key={x.code}
              onClick={() => void go(x.code)}
              data-testid={`pipeline-peek-pass-${x.code}`}
              {...gate("approve", "mark a deal as passed")}
            >
              {x.words}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The foot: the lead and its caret, Message and Call; or the pass asked in its place. Nothing for a viewer, nor before the read. */
export function dealFoot(c: DealSheetCtx, call: CallCtx, passing: boolean, endPass: () => void): ReactElement | null {
  if (!c.person || !c.canRecord) return null;
  if (passing) return <PassAsk c={c} onDone={endPass} />;
  const lead = leadPill(c);
  const leadIsMessage = !c.sheet.lead && !!c.sheet.card && c.sheet.card.stage === "won";
  return (
    <div className="pipe-deal-acts" data-foot-acts data-testid="pipeline-peek-bar">
      {lead}
      {!leadIsMessage && mayMessage(c) ? (
        <Button
          iconOnly
          size={footSize(c)}
          variant="quiet"
          className="pipe-deal-circle"
          aria-label={S.message}
          title={S.message}
          onClick={() => messageThem(c)}
          data-testid="pipeline-peek-message"
          {...gate("approve", NEW_CONVERSATION_WORDS.gate)}
        >
          <Icon name="chat" size={17} />
        </Button>
      ) : null}
      <CallAct c={call} dock round={!c.phone} className="pipe-deal-circle" />
    </div>
  );
}
