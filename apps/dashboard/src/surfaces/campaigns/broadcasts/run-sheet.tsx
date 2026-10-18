/**
 * Chanlytics, Broadcasts: a run waiting on you, opened -- its approval sheet (moved from legacy/pages/broadcasts-run.jsx,
 * decision 0015), with the two things the sheet shares with the report beside it: one person's line, and what each stop
 * asks and promises.
 */
import { Fragment } from "react";
import {
  BROADCAST_STATE_LABELS,
  CONSENT_CHANNELS,
  LIFECYCLE_WORDS,
  messageAboutOfTrigger,
  runStopWords,
  runTitleOf,
} from "@chanlytics/contracts";
import type { ApprovalVM, BroadcastDetailDto, BroadcastDto, PreviewVersions, RunPersonVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import { gateTitle, navigate } from "../../legacy-verbs";
import { cmSplitWords, cmStandInOf } from "../parts/channels";
import { mpParts } from "../parts/message-preview";
import { cmOfferFoot, cmPreviewBy } from "../parts/preview-by";
import type { CmPreviewBy } from "../parts/preview-by";
import type { PlaybookCardVM } from "../playbooks/surface";

/**
 * A run waiting on you, as the page opens it (page/runs.tsx `sheetFor`): where it sits among the runs waiting (the
 * ledger's order), its playbook and its template for the words, and the acts -- which, when they land, open the next
 * run waiting, or the ledger.
 */
export interface BcSheetAsk {
  position: readonly [number, number] | null;
  canSend: boolean;
  playbook: PlaybookCardVM | null;
  /** The message: the words of the version the page holds, on its `channel`, and its email and text versions where it holds them (page/runs.tsx). */
  template: {
    body_preview: string | null;
    language: string;
    category: string | null;
    channel: string;
    versions?: PreviewVersions;
  } | null;
  businessName: string;
  /** Its postal address where the Business record holds one: an offer's email names it in its foot. */
  businessAddress: string | null;
  /** Whether the workspace is paused, from the page's readiness (ChannelsReady.paused); null where that was not read. */
  paused: boolean | null;
  armed: boolean;
  onArm: (on: boolean) => void;
  stopping: boolean;
  approving: boolean;
  approve: (words?: unknown) => void;
  skip: () => void;
}

// One person's line on a run: who, how it went, the words, their one door, and when. Where the run went by more than
// WhatsApp alone, the words open with the channel their message went by ("by email · sent 10:31 · delivered 10:32"); a
// person it never went to has the reason it did not, which is the news.
export const bcPersonRow = (p: RunPersonVM) => {
  const door = p.door;
  return (
    <div
      key={p.contact_id}
      className={`bc-person${p.attn ? " is-attn" : ""}${p.held ? " is-held" : ""}`}
      data-testid="bc-person"
    >
      <Face person={{ name: p.name, initials: p.initials }} size="sm" className="bc-person-who" />
      <LinkButton className="bc-person-name" onClick={() => navigate(`clients/${p.contact_id}`)}>
        {p.name}
      </LinkButton>
      <span
        className={`pill${p.pill.tone && p.pill.tone !== "plain" ? ` pill-${p.pill.tone}` : ""} bc-person-pill`}
        data-tone={p.pill.tone}
      >
        {p.pill.label}
      </span>
      <span className="bc-person-words">{p.channel && !p.held ? `${p.channel} · ${p.words}` : p.words}</span>
      {door && (
        <LinkButton className="bc-person-door" onClick={() => navigate(door.to)}>
          {door.label}
        </LinkButton>
      )}
      <span className="bc-person-at mono">{p.at || "—"}</span>
    </div>
  );
};
// A run waiting on you, opened: the sheet the canvas draws for the phone -- "approving from the sofa" -- in the pane
// beside the list, whose head says its name, its policy and where it sits among those waiting (below), since a run that
// has not gone has no report to read. What it reaches, by the rules that made its list (a run records how many it
// enrolled and nothing about the rest, so no "of 312"); the words as its first person reads them; and the act alone at
// the foot, pinned, with the skip and the list beside it. The words are the contracts' (toApprovalVM, through
// `broadcasts.approval`); the acts are the page's, and when one lands the next run waiting opens, so a queue of two is
// two presses.
// A part of a bar, as a width: never under a sliver for a part that exists, so one person out of three hundred still shows.
const bcShare = (n: number, of: number) => (of > 0 ? Math.max(1.5, Math.round((n / of) * 1000) / 10) : 0);

/**
 * What the pane's head says under a waiting run's name: that it waits for your approval, and where it sits among those
 * waiting ("Waiting for your approval · 1 of 2"). It was the sheet's own top, with a back button the pane's head now holds.
 */
export function bcSheetSub(sheet: BcSheetAsk) {
  const pos = sheet.position;
  return (
    <span data-testid="bc-sheet-pos">
      {pos && pos[1] > 1
        ? `${BROADCAST_STATE_LABELS.pending_approval} · ${pos[0]} of ${pos[1]}`
        : BROADCAST_STATE_LABELS.pending_approval}
    </span>
  );
}

/**
 * Who it reaches out of everyone its moment named, as the run counted them when it was drawn: green reaches, amber
 * waits only for time, grey was left out -- and a line for each reason, the most first. A run made before runs kept
 * that count says the rules that made its list instead, which are true of everyone on it.
 */
function bcSheetReach(avm: ApprovalVM) {
  const by = avm.byChannel;
  // Which channel each of them gets it on, where it is not WhatsApp alone: the run counted it when it was drawn, less the
  // people the month's allowance holds (they are in the held line, never in the people it reaches).
  const split = by
    ? cmSplitWords(
        { reached: avm.will, byChannel: by, held: 0, heldBy: {} },
        CONSENT_CHANNELS.filter((c) => by[c] > 0),
      )
    : null;
  return (
    <div className="bc-sheet-reach" data-testid="bc-sheet-reach">
      <div className="bc-sheet-n">
        <span className="bc-sheet-v tabular">{avm.will}</span>
        <span className="bc-sheet-will">
          {avm.of ? (
            <>
              {"will get it, of "}
              <span className="tabular" data-testid="bc-sheet-pool">
                {avm.of.pool}
              </span>
            </>
          ) : (
            "will get it"
          )}
        </span>
      </div>
      {split && (
        <div className="bc-reach-by" data-testid="bc-sheet-by">
          {split}
        </div>
      )}
      {avm.of ? (
        <>
          <div className="bc-sheet-bar is-parts" aria-hidden="true">
            {avm.will > 0 && (
              <span className="bc-sheet-bar-will" style={{ width: `${bcShare(avm.will, avm.of.pool)}%` }} />
            )}
            {avm.of.held > 0 && (
              <span className="bc-sheet-bar-held" style={{ width: `${bcShare(avm.of.held, avm.of.pool)}%` }} />
            )}
            {avm.of.pool - avm.will - avm.of.held > 0 && <span className="bc-sheet-bar-rest" />}
          </div>
          {avm.of.lines.length > 0 && (
            <ul className="bc-sheet-why" data-testid="bc-sheet-why">
              {avm.of.lines.map((l) => {
                const door = l.door;
                return (
                  <li key={l.words}>
                    <span className="cm-reach-dot" data-tone={l.tone} aria-hidden="true" />
                    <span>{l.words}</span>
                    {door && (
                      <LinkButton
                        className="bc-sheet-door"
                        onClick={() => navigate(door.to)}
                        data-testid="bc-sheet-door"
                      >
                        {door.words}
                      </LinkButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="bc-sheet-bar" aria-hidden="true">
            <span />
          </div>
          {avm.rules.length > 0 && (
            <div className="bc-sheet-rules">
              {avm.rules.map((r) => (
                <div key={r}>{r}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The message as the run's reader reads it, on the channel their message goes by: that channel's own version (an email's subject
 * and words, a text's words and the STOP line the sender adds), else WhatsApp's template. Where that version is not in hand
 * WhatsApp's words stand under no channel's name, with the note that says so (parts/preview-by.ts): the same preview the
 * composers draw, never another channel's words under this one's. The channel is named wherever the run goes by more than
 * WhatsApp, or its reader is not on WhatsApp.
 */
function bcSheetSays(tpl: NonNullable<BcSheetAsk["template"]>, avm: ApprovalVM, sheet: BcSheetAsk): CmPreviewBy {
  const by = avm.byChannel;
  const labelled =
    avm.readerChannel !== "whatsapp" || (!!by && CONSENT_CHANNELS.some((c) => c !== "whatsapp" && by[c] > 0));
  return cmPreviewBy({ body: tpl.body_preview, header: null, footer: null, buttons: null }, avm.readerChannel, {
    versions: tpl.versions,
    language: tpl.language,
    business: sheet.businessName,
    address: sheet.businessAddress,
    labelled,
    standIn: cmStandInOf(tpl),
    // An offer's email reads with the offer's foot, which owes the postal address: with none the preview says so. A run's
    // moment says what its message is about (the business's news is an offer by email too, decision D2).
    ...cmOfferFoot(tpl.category, messageAboutOfTrigger(sheet.playbook?.trigger)),
  });
}

/** Words with their slots marked: what varies by person, as the sheet shows the first person's. */
function bcSheetMarked(words: string | null | undefined, values: readonly string[]) {
  return mpParts(words, values).map((x, i) =>
    x.kind === "slot" ? (
      <span key={i} className="bc-sheet-slot">
        {x.text}
      </span>
    ) : (
      <Fragment key={i}>{x.text}</Fragment>
    ),
  );
}

/** The words as its first person reads them on their own channel, with the slots marked, and who reads them. */
function bcSheetWords(says: CmPreviewBy, avm: ApprovalVM) {
  // "by email", under the reader's name: the quiet label the composers' previews carry (contracts PREVIEW_CHANNEL_WORDS).
  const via = says.via ? `${says.via.charAt(0).toLowerCase()}${says.via.slice(1)}` : null;
  return (
    <div className="bc-sheet-words" data-testid="bc-sheet-words" data-channel={avm.readerChannel}>
      {says.mail?.subject ? (
        <p className="bc-approval-subject" data-testid="bc-sheet-subject">
          {bcSheetMarked(says.mail.subject, avm.values)}
        </p>
      ) : null}
      <p className="bc-sheet-quote">“{bcSheetMarked(says.body, avm.values)}”</p>
      {says.footer ? <p className="bc-approval-says">{says.footer}</p> : null}
      {says.note ? (
        <p className="bc-approval-says" data-testid="bc-sheet-version-note">
          {says.note}
        </p>
      ) : null}
      <div className="bc-sheet-reader">
        {avm.reader && (
          <span data-testid="bc-sheet-reader">
            as {avm.reader} reads it{via ? ` · ${via}` : ""}
          </span>
        )}
        {avm.hiThere > 0 && (
          <span className="bc-sheet-hi" data-testid="bc-sheet-hi">
            {avm.hiThere} {avm.hiThere === 1 ? "gets" : "get"} “Hi there” — no name on file
          </span>
        )}
      </div>
    </div>
  );
}

/** The act, pinned to the foot while the list above it scrolls. */
function bcSheetActs(p: {
  b: BroadcastDto;
  avm: ApprovalVM;
  sheet: BcSheetAsk;
  seeAll: boolean;
  onSeeAll: () => void;
}) {
  const { b, avm, sheet, seeAll, onSeeAll } = p;
  const stop = runStopWords("pending_approval");
  return (
    <div className="bc-sheet-acts bc-approval-acts" data-testid="bc-sheet-acts">
      {avm.expired && (
        <p className="bc-sheet-expired" data-testid="bc-sheet-expired">
          {avm.expired}
        </p>
      )}
      {sheet.canSend && avm.approve && !sheet.armed && (
        <Button
          variant="primary"
          className="bc-approve"
          disabled={sheet.approving}
          onClick={sheet.approve}
          data-testid="bc-sheet-approve"
        >
          <Icon name="check" size={16} /> {sheet.approving ? "Approving…" : avm.approve}
        </Button>
      )}
      {sheet.armed && sheet.canSend ? (
        <Confirm
          question={stop.question({ name: runTitleOf(b) })}
          detail={stop.detail}
          yes={stop.yes}
          danger
          busy={sheet.stopping}
          onYes={sheet.skip}
          onNo={() => sheet.onArm(false)}
          testid="bc-sheet-skip"
        />
      ) : (
        <div className="bc-sheet-pair">
          {sheet.canSend && (
            <Button className="bc-second" onClick={() => sheet.onArm(true)} data-testid="bc-sheet-skip">
              {LIFECYCLE_WORDS.ledger.skip}
            </Button>
          )}
          <Button className="bc-second" aria-expanded={seeAll} onClick={onSeeAll} data-testid="bc-sheet-see">
            {seeAll ? "Hide the list" : `See the ${avm.will}`}
          </Button>
        </div>
      )}
      <span className="bc-sheet-note">{sheet.canSend ? avm.skip : gateTitle("approve", "approve or skip a run")}</span>
    </div>
  );
}

/** What the dock and the menu read of the sheet. */
interface BcSheetActsAsk {
  b: BroadcastDto;
  avm: ApprovalVM;
  sheet: BcSheetAsk;
  seeAll: boolean;
  onSeeAll: () => void;
}

/**
 * The acts on a phone, docked at the screen's foot as a sequence's are (its Approve in the record's dock): Approve, and who
 * gets it, an equal pair; Skip's question in their place once the menu asks it. A run too late to approve has Skip there
 * instead, with why. On a phone the band of acts stood after the words, a solid slab halfway down the screen.
 */
export function bcSheetDock({ b, avm, sheet, seeAll, onSeeAll }: BcSheetActsAsk) {
  const stop = runStopWords("pending_approval");
  if (sheet.armed && sheet.canSend)
    return (
      <div className="bc-approval-foot" data-foot-pair="" data-testid="bc-sheet-acts">
        <Confirm
          question={stop.question({ name: runTitleOf(b) })}
          detail={`${stop.detail} ${avm.skip}`}
          yes={stop.yes}
          danger
          busy={sheet.stopping}
          onYes={sheet.skip}
          onNo={() => sheet.onArm(false)}
          testid="bc-sheet-skip"
        />
      </div>
    );
  const why = avm.expired ?? (sheet.canSend ? null : gateTitle("approve", "approve or skip a run"));
  return (
    <div className="bc-approval-foot" data-foot-pair="" data-testid="bc-sheet-acts">
      {why ? (
        <span className="bc-sheet-expired" data-testid="bc-sheet-expired">
          {why}
        </span>
      ) : null}
      {sheet.canSend && avm.approve ? (
        <Button variant="primary" disabled={sheet.approving} onClick={sheet.approve} data-testid="bc-sheet-approve">
          <Icon name="check" size={16} /> {sheet.approving ? "Approving…" : avm.approve}
        </Button>
      ) : null}
      {sheet.canSend && !avm.approve ? (
        <Button onClick={() => sheet.onArm(true)} data-testid="bc-sheet-skip">
          {LIFECYCLE_WORDS.ledger.skip}
        </Button>
      ) : null}
      <Button aria-expanded={seeAll} onClick={onSeeAll} data-testid="bc-sheet-see">
        {seeAll ? "Hide the list" : `See the ${avm.will}`}
      </Button>
    </div>
  );
}

/** The head's menu on a phone, as a sequence's record has one: Skip, which asks in the dock. None for a role that may not. */
export function BcSheetMore({ b, avm, sheet }: Pick<BcSheetActsAsk, "b" | "avm" | "sheet">) {
  // A run too late to approve has Skip in the dock already.
  if (!sheet.canSend || !avm.approve) return null;
  const name = runTitleOf(b);
  return (
    <Menu
      label={`More for ${name}`}
      trigger={
        <Button variant="quiet" size="touch" iconOnly aria-label={`More for ${name}`} data-testid="bc-sheet-more">
          <Icon name="more" size={18} />
        </Button>
      }
      groups={[
        {
          header: name,
          items: [
            {
              label: `${LIFECYCLE_WORDS.ledger.skip}…`,
              glyph: <Icon name="ban" size={13} />,
              tone: "danger",
              disabled: sheet.stopping || sheet.approving,
              onSelect: () => sheet.onArm(true),
            },
          ],
        },
      ]}
    />
  );
}

interface BcSheetProps {
  /** A phone's: the acts are the pane's docked foot (bcSheetDock) and Skip is in its head's menu (BcSheetMore), not here. */
  docked: boolean;
  d: BroadcastDetailDto;
  people: RunPersonVM[];
  avm: ApprovalVM;
  sheet: BcSheetAsk;
  seeAll: boolean;
  onSeeAll: () => void;
}

/** The sheet's body: the pane's head (run.tsx) says the run's name, its policy and its place in the queue. */
export function BcSheet({ d, people, avm, sheet, seeAll, onSeeAll, docked }: BcSheetProps) {
  const b = d.broadcast;
  const pb = sheet.playbook;
  const hint =
    pb && pb.triggerHint ? pb.triggerHint.charAt(0).toLowerCase() + pb.triggerHint.slice(1) : b.audience.label;
  const says = sheet.template && sheet.template.body_preview ? bcSheetSays(sheet.template, avm, sheet) : null;
  return (
    <div className="bc-sheet bc-approval" data-testid="bc-sheet">
      <div className="bc-sheet-body bc-approval-body">
        <div className="bc-sheet-sub">
          Campaign · {hint} · {avm.goes}
        </div>
        {bcSheetReach(avm)}
        {says && bcSheetWords(says, avm)}
      </div>
      {seeAll && (
        <section className="bc-touched bc-sheet-people bc-approval-people" data-testid="bc-sheet-people">
          <div className="bc-touched-head">
            <span className="bc-card-title">Who gets it</span>
          </div>
          {people.map(bcPersonRow)}
        </section>
      )}
      {docked ? null : bcSheetActs({ b, avm, sheet, seeAll, onSeeAll })}
    </div>
  );
}
