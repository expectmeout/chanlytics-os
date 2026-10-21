/**
 * New's draft (decision 0065; the New canvas's rows B, D and E): one sentence of who and when, every choice in it a word to
 * press, who it reaches, its steps on the rail, what Ask checked, how it runs, and the one act it is set up for. What
 * stops or bends it is a card over the sentence (a part left out, a twin, no one to hear it, a WhatsApp version still with
 * Meta). A change Ask need not make again is made here (new-model.ts); a change of kind or audience is Ask's, drafted again
 * from the same line (`redraft`), the draft standing in its new shape with Undo while Ask writes it. Send now asks first;
 * leaving a changed draft asks too (the page's). On a wide pane what Ask checked and how it runs stand beside the steps
 * (the canvas's desk board). Every word is contracts' (new-words.ts).
 */
import { useState, type ReactNode } from "react";
import {
  CAMPAIGNS_PAUSED_WORDS,
  CHANNELS_DOOR,
  GET_YES_ROUTE,
  NEW_WORDS as W,
  clockHour,
  localHour,
  sequenceRoute,
  zonedInputValue,
  type ConsentChannel,
  type NewAudience,
  type NewDraftDto,
  type NewKind,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { Switch } from "../../../kit/switch/switch";
import { gate, routeDoor } from "../../../legacy-verbs";
import { CmPane } from "../../parts/split";
import { MessageSheet, WordsSheet, type LibraryReads } from "./new-message-sheets";
import * as M from "./new-model";
import { AudienceToggle, CaseNote, ChecksList, ReachLine, SaidLine, WhoCaption, WordPick } from "./new-parts";
import { DraftRail, OnceMessage, type RailActs } from "./new-rail";
import { AddStepSheet } from "./add-step";
import {
  ChannelsSheet,
  Choice,
  FromSheet,
  HourSelect,
  KindSheet,
  OkSheet,
  PickSheet,
  TimingSheet,
  WhenSheet,
  WhoSheet,
  type NewSheet,
  type WhoReads,
} from "./new-sheets";

/** What the draft reads beside itself: who it could be for, the Library, the channels connected, and the business's clock. */
export interface DraftReads {
  who: WhoReads;
  library: LibraryReads | null;
  ready: readonly ConsentChannel[];
  /** The workspace is paused for billing: nothing sends, so Send and Start wait and say why first. */
  paused: boolean;
  /** Today by the business's clock ("YYYY-MM-DD"), where a one-off's day starts. */
  today: string;
  /** The business's zone: when a sequence's first batch is, and when a one-off sent now goes. */
  timezone: string;
  /** What a changed draft is counted again against (decision 0065 step 7): Campaigns' counts and what runs. */
  recount: M.RecountReads;
}

/** What the foot reads of the workspace now: whether it's paused, the business's day and time, what it sends on. */
const footReadsOf = (reads: DraftReads): M.FootReads => ({
  paused: reads.paused,
  localNow: zonedInputValue(Date.now(), reads.timezone),
  ready: reads.ready,
});

/** What the draft's parts ask of the page. */
interface DraftActs {
  change: (next: NewDraftDto) => void;
  /** A change of kind or audience: Ask drafts it again from the same line (by hand, the page rebuilds it). */
  redraft: (fixed: { kind?: NewKind; audience?: NewAudience }) => void;
  /** Ask's drafting again let go: the draft as it was. */
  undo: () => void;
  again: () => void;
  discard: () => void;
  make: (start: boolean) => void;
  close: () => void;
}

/** What the sentence says a choice is, and whether it is made. */
function whoWords(d: NewDraftDto): { lead: string; label: string; empty: boolean } {
  const who = d.who;
  if (d.audience === "leads")
    return { lead: W.draft.toBusinesses, label: who?.label ?? W.draft.pickSearch, empty: !who };
  if (d.kind === "once") return { lead: W.draft.to, label: who?.label ?? W.draft.pickWho, empty: !who };
  if (who?.kind === "list") return { lead: W.draft.toEveryoneWho, label: W.draft.joins(who.label), empty: false };
  return { lead: W.draft.toEveryone, label: who?.label ?? W.draft.pickWhen, empty: !who };
}

/** Who and when, as one sentence: the kind, who, and the hour, the moment it goes or where it sends from. */
function WhoSentence({ draft, open }: { draft: NewDraftDto; open: (s: NewSheet) => void }) {
  const who = whoWords(draft);
  const channels = M.channelsSaidOf(draft.channels, " or ");
  const from = draft.mailbox?.owner_sends ? W.sheets.youSend : (draft.mailbox?.label ?? W.sheets.noMailbox);
  return (
    <p className="sq-nw-sentence" data-testid="sq-nw-sentence">
      <WordPick big label={W.draft.kind[draft.kind]} onPick={() => open({ kind: "kind" })} testid="sq-nw-kind-pick" />{" "}
      {who.lead}{" "}
      <WordPick big label={who.label} empty={who.empty} onPick={() => open({ kind: "who" })} testid="sq-nw-who-pick" />{" "}
      {draft.audience === "leads" ? (
        <>
          {W.draft.from} <WordPick big label={from} onPick={() => open({ kind: "from" })} testid="sq-nw-from-pick" />
        </>
      ) : draft.kind === "once" ? (
        <>
          <WordPick
            big
            label={draft.at ? M.atWords(draft.at) : W.draft.now}
            onPick={() => open({ kind: "when" })}
            testid="sq-nw-when-pick"
          />{" "}
          {W.draft.by}{" "}
          <WordPick
            big
            label={channels || W.draft.pickHow}
            empty={!channels}
            onPick={() => open({ kind: "channels" })}
            testid="sq-nw-channels-pick"
          />
        </>
      ) : (
        <>
          {W.draft.at}{" "}
          <WordPick
            big
            label={clockHour(draft.run_hour)}
            onPick={() => open({ kind: "hour" })}
            testid="sq-nw-hour-pick"
          />
        </>
      )}
    </p>
  );
}

/** The one door that cures why nobody can hear it (M.nobodyOf): their yes, a channel to connect, or how it goes. */
function NobodyDoor({ door, open }: { door: M.NobodyDoor; open: (s: NewSheet) => void }) {
  if (!door) return null;
  if (door.kind === "yes")
    return (
      <Button size="sm" {...routeDoor(GET_YES_ROUTE)} data-testid="sq-nw-nobody-yes">
        {W.reach.getYes}
      </Button>
    );
  if (door.kind === "connect")
    return (
      <Button size="sm" {...routeDoor(CHANNELS_DOOR)} data-testid="sq-nw-nobody-connect">
        {W.reach.connect(door.channel)}
      </Button>
    );
  return (
    <Button size="sm" onClick={() => open({ kind: "channels" })} data-testid="sq-nw-nobody-how">
      {W.sheets.channels}
    </Button>
  );
}

/**
 * No one to send a one-off to yet (D4), said by why (decision 0065 step 7, the send screen's sentences): nobody said the
 * yes it needs, those who did can't be reached, no channel it goes by can carry it, or everyone heard from you this week.
 * One door that cures it at most, and who it goes to beside it: never Get their yes for people who already gave it.
 */
function NobodyCase(p: { said: NonNullable<ReturnType<typeof M.nobodyOf>>; open: (s: NewSheet) => void }) {
  return (
    <CaseNote
      tone="warn"
      title={W.reach.nobody}
      words={p.said.words}
      acts={
        <>
          <NobodyDoor door={p.said.door} open={p.open} />
          <Button size="sm" onClick={() => p.open({ kind: "who" })} data-testid="sq-nw-nobody-who">
            {W.sheets.goesTo}
          </Button>
        </>
      }
      testid="sq-nw-nobody"
    />
  );
}

/**
 * What stops or bends the draft, over its sentence: a paused workspace, a part left out, a twin, no one to hear it,
 * Meta's review.
 */
function DraftCases(p: {
  draft: NewDraftDto;
  ready: readonly ConsentChannel[];
  paused: boolean;
  busy: boolean;
  open: (s: NewSheet) => void;
  keep: () => void;
}) {
  const { draft } = p;
  const cards: ReactNode[] = [];
  // Paused for billing, nothing sends whatever the draft says: said first, as the send screen's foot did.
  if (p.paused)
    cards.push(
      <CaseNote key="paused" tone="warn" title={W.paused.lead} words={CAMPAIGNS_PAUSED_WORDS} testid="sq-nw-paused" />,
    );
  if (draft.cannot) {
    const c = M.cannotParts(draft.cannot);
    cards.push(<CaseNote key="cannot" tone="warn" title={c.title} words={c.words} testid="sq-nw-cannot" />);
  }
  if (draft.twin)
    cards.push(
      <CaseNote
        key="twin"
        tone="warn"
        title={W.checks.twin(draft.twin.name)}
        words={W.checks.twinDetail}
        acts={
          <Button size="sm" {...routeDoor(sequenceRoute(draft.twin.id))} data-testid="sq-nw-twin-open">
            {W.twin.open}
          </Button>
        }
        testid="sq-nw-twin"
      />,
    );
  // A one-off goes to whoever can hear it now, so with nobody there is nothing to send (D4); a sequence runs on.
  const nobody = M.nobodyOf(draft, p.ready);
  if (nobody) cards.push(<NobodyCase key="nobody" said={nobody} open={p.open} />);
  // A WhatsApp version Ask wrote goes to Meta as it is filed (D5): sent before Meta approves it, it goes by the rest; kept,
  // it is filed now and waits under Drafts while Meta reviews it.
  const review = M.reviewOf(draft);
  if (review)
    cards.push(
      <CaseNote
        key="review"
        tone="warn"
        title={W.review.title}
        words={W.review.words(review.others, review.only)}
        acts={
          <Button size="sm" onClick={p.keep} disabled={p.busy} data-testid="sq-nw-review-keep">
            {W.review.keep}
          </Button>
        }
        testid="sq-nw-review"
      />,
    );
  return cards.length ? <div className="sq-nw-cases">{cards}</div> : null;
}

/** How a sequence runs: Your OK, as its sheet names the way picked. */
function HowItRuns({ draft, open }: { draft: NewDraftDto; open: (s: NewSheet) => void }) {
  if (draft.kind === "once") return null;
  const ok =
    draft.audience === "leads" && draft.mode === "ask" ? W.okLeads : draft.mode ? W.okSaid[draft.mode] : W.okSaid.ask;
  return (
    <>
      <p className="sq-nw-cap">{W.draft.runs}</p>
      <div className="sq-nw-rows">
        <Choice
          glyph="check"
          name={W.draft.yourOk}
          said={ok}
          onPick={() => open({ kind: "ok" })}
          testid="sq-nw-yourok"
        />
      </div>
    </>
  );
}

/** What To leads changes, said while Ask drafts it again for businesses (F1). */
function ToLeadsNote() {
  return (
    <>
      <p className="sq-nw-cap">{W.toLeads.title}</p>
      <ul className="sq-nw-checks" data-testid="sq-nw-to-leads">
        {W.toLeads.rows.map((r) => (
          <li key={r.lead} className="sq-nw-check">
            <Icon name="check" size={12} />
            <span>
              {r.lead}
              <small>{r.sub}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="sq-nw-note">{W.toLeads.note}</p>
    </>
  );
}

/** What the foot says before its act: what still stops it, or who it reaches and when. */
function footLineOf(d: NewDraftDto, tz: string, at: M.FootReads): { lead: string; sub: string | null; quiet: boolean } {
  const stop = M.notReady(d, at);
  if (stop) return { ...stop, quiet: false };
  // A sequence's line only says when it begins, which a phone's foot leaves to its two acts (the canvas's phone boards).
  if (d.kind === "sequence")
    return {
      lead:
        d.audience === "leads"
          ? W.draft.leadsWait
          : W.draft.firstBatch(M.firstBatchWords(d.run_hour, localHour(tz, new Date()))),
      sub: null,
      quiet: true,
    };
  const n = d.reach?.can ?? null;
  if (d.audience === "leads")
    return n === null
      ? { lead: W.draft.leadsWait, sub: null, quiet: false }
      : { lead: W.draft.businesses(n), sub: W.draft.leadsWait, quiet: false };
  const review = M.reviewOf(d);
  if (review && review.only > 0)
    return { lead: W.review.goes(review.can, review.others), sub: W.review.leftOut(review.only), quiet: false };
  const when = d.at ? W.draft.goesAt(M.atWords(d.at)) : M.goesSoonWords(tz, Date.now());
  return n === null ? { lead: when, sub: null, quiet: false } : { lead: W.draft.people(n), sub: when, quiet: false };
}

/** The one act a draft is set up for: Start a sequence, Send now or Schedule a one-off, Send one to leads. */
function actOf(d: NewDraftDto, onMake: (start: boolean) => void, onSendNow: () => void) {
  if (d.kind === "sequence")
    return { label: W.draft.start, glyph: "play", go: () => onMake(true), testid: "sq-nw-start" };
  if (d.audience === "leads") return { label: W.draft.send, glyph: null, go: () => onMake(true), testid: "sq-nw-send" };
  if (d.at) return { label: W.draft.schedule, glyph: null, go: () => onMake(true), testid: "sq-nw-schedule" };
  return { label: W.draft.sendNow, glyph: null, go: onSendNow, testid: "sq-nw-send-now" };
}

/**
 * The foot: what it reaches and when, then its act. A sequence keeps Keep as a draft beside Start, the house's pair on a
 * phone; a one-off has its one act, and is kept as a draft by leaving it (the page's ask). A twin holds Start back: two
 * would send twice. While Ask drafts it again, the foot says so and its act waits. Paused, Start waits and Keep stays:
 * keeping sends nothing.
 */
function DraftFoot(p: {
  draft: NewDraftDto;
  tz: string;
  at: M.FootReads;
  busy: boolean;
  doing: string | null;
  onMake: (start: boolean) => void;
  onSendNow: () => void;
}) {
  const { draft } = p;
  const busy = p.busy || !!p.doing;
  const stop = p.doing ? { lead: p.doing, sub: null } : M.notReady(draft, p.at);
  const line = p.doing ? { lead: p.doing, sub: null, quiet: false } : footLineOf(draft, p.tz, p.at);
  const act = actOf(draft, p.onMake, p.onSendNow);
  // Keep beside Start once nothing but a pause stops it.
  const pair = draft.kind === "sequence" && !p.doing && !M.notReady(draft, { ...p.at, paused: false });
  return (
    <div className="sq-nw-foot" data-foot-pair={pair ? "" : undefined}>
      <p className={line.quiet ? "sq-nw-foot-line is-quiet" : "sq-nw-foot-line"}>
        <b>{line.lead}</b>
        {line.sub ? <small>{line.sub}</small> : null}
      </p>
      {pair ? (
        <Button onClick={() => p.onMake(false)} disabled={busy} data-testid="sq-nw-keep">
          {W.draft.keep}
        </Button>
      ) : null}
      <Button
        variant="primary"
        onClick={act.go}
        disabled={busy || !!stop || (draft.kind === "sequence" && !!draft.twin)}
        data-testid={act.testid}
        {...gate("approve")}
      >
        {act.glyph ? <Icon name={act.glyph} size={13} /> : null}
        {act.label}
      </Button>
    </div>
  );
}

/** Who a one-off sent now reaches on each channel ("180 by WhatsApp, 34 by email"), where the workspace counted it. */
function byWords(d: NewDraftDto): string {
  // With WhatsApp's version still at Meta it goes by the others alone, which the question's count already says.
  if (M.reviewOf(d)) return "";
  const by = d.reach?.by ?? {};
  return d.channels
    .flatMap((c) => ((by[c] ?? 0) > 0 ? [W.reach.byChannel(by[c] ?? 0, M.channelsSaidOf([c], ""))] : []))
    .join(", ");
}

/** Send now asks first, where it was pressed: who and how, when it goes with its Stop, and that delivered is delivered. */
function ConfirmSend(p: { draft: NewDraftDto; tz: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  const review = M.reviewOf(p.draft);
  // Who it reaches where the workspace counted it; asked without a number where nothing counts it (news to a list).
  const n = review ? review.can : (p.draft.reach?.can ?? null);
  const goes = M.sendsAt(p.tz, Date.now());
  const when = goes.moved ? W.confirm.opens(goes.time) : W.confirm.at(goes.time);
  const detail = [byWords(p.draft), when, W.confirm.after].filter(Boolean).join(". ");
  return (
    <Confirm
      question={n === null ? W.confirm.titleNow(p.draft.name) : W.confirm.title(p.draft.name, n)}
      detail={`${detail}.`}
      yes={W.confirm.yes}
      no={W.confirm.no}
      busy={p.busy}
      onYes={p.onYes}
      onNo={p.onNo}
      testid="sq-nw-send"
    />
  );
}

/** The sheet a press opened, over the draft. */
function DraftSheets(p: {
  sheet: NewSheet | null;
  blank: boolean;
  opens: number;
  draft: NewDraftDto;
  reads: DraftReads;
  acts: DraftActs;
  set: (s: NewSheet | null) => void;
  write: (i: number) => void;
}) {
  const { sheet, draft, reads, acts } = p;
  const close = () => p.set(null);
  const change = (d: NewDraftDto) => acts.change(d);
  const i = sheet && "i" in sheet ? sheet.i : 0;
  return (
    <>
      <KindSheet
        open={sheet?.kind === "kind"}
        kind={draft.kind}
        onKind={(k) => {
          close();
          if (k !== draft.kind) acts.redraft({ kind: k });
        }}
        onClose={close}
      />
      <WhoSheet
        open={sheet?.kind === "who"}
        draft={draft}
        reads={reads.who}
        onWho={(w) => {
          change(M.setWho(draft, w));
          close();
        }}
        onAudience={(a) => {
          close();
          if (a !== draft.audience) acts.redraft({ audience: a });
        }}
        onClose={close}
      />
      <WhenSheet
        open={sheet?.kind === "when"}
        at={draft.at}
        tz={reads.timezone}
        onAt={(at) => change(M.setAt(draft, at))}
        onClose={close}
      />
      <PickSheet
        open={sheet?.kind === "hour"}
        title={W.sheets.hour}
        onClose={close}
        testid="sq-nw-hour-sheet"
        foot={
          <Button variant="primary" onClick={close}>
            {W.sheets.done}
          </Button>
        }
      >
        <HourSelect hour={draft.run_hour} onHour={(h) => change(M.setHour(draft, h))} />
      </PickSheet>
      <ChannelsSheet
        open={sheet?.kind === "channels"}
        draft={draft}
        ready={reads.ready}
        onChannels={(c) => change(M.setChannels(draft, c))}
        onClose={close}
      />
      <MessageSheet
        open={sheet?.kind === "message"}
        draft={draft}
        i={i}
        library={reads.library}
        onMessage={(m) => {
          change(M.setMessage(draft, i, m, reads.ready));
          close();
        }}
        onWrite={() => p.write(i)}
        onClose={close}
      />
      <WordsSheet
        open={sheet?.kind === "words"}
        draft={draft}
        i={i}
        blank={p.blank}
        opens={p.opens}
        onMessage={(m) => change(M.setMessage(draft, i, m, reads.ready))}
        onEmail={(e) => change(M.setEmail(draft, i, e))}
        onClose={close}
      />
      <TimingSheet
        open={sheet?.kind === "timing"}
        draft={draft}
        i={i}
        onWait={(days) => change(M.setWait(draft, i, days))}
        onOnly={(only) => change(M.setOnlyIf(draft, i, only.filter(M.isCondition)))}
        onHour={(h) => change(M.setHour(draft, h))}
        onClose={close}
      />
      <AddStepSheet
        open={sheet?.kind === "add"}
        after={draft.steps.length}
        onAdd={(does) => {
          change(M.addStep(draft, does));
          close();
        }}
        onClose={close}
      />
      <OkSheet open={sheet?.kind === "ok"} draft={draft} onMode={(m) => change(M.setMode(draft, m))} onClose={close} />
      <FromSheet
        open={sheet?.kind === "from"}
        draft={draft}
        onOwnerSends={(on) => change(M.setOwnerSends(draft, on))}
        onClose={close}
      />
    </>
  );
}

/** The draft's head: its name, said in place and changed there, and its state. */
function DraftName({ draft, change }: { draft: NewDraftDto; change: (d: NewDraftDto) => void }) {
  return (
    <span className="sq-nw-name">
      <Field
        shape="title"
        aria-label={W.sheets.title}
        value={draft.name}
        onValueChange={(v) => change(M.setName(draft, v))}
        maxLength={80}
        spellCheck={false}
        data-testid="sq-nw-name"
      />
      <Icon name="pencil" size={13} />
    </span>
  );
}

const subOf = (d: NewDraftDto): string =>
  d.kind === "once" ? (d.at ? W.draft.subSchedule : W.draft.subOnce) : d.said ? W.draft.sub : W.draft.subHand;

/** Who and when, its notes, and the steps: the draft's own column. */
function DraftBody(p: {
  draft: NewDraftDto;
  ready: readonly ConsentChannel[];
  paused: boolean;
  busy: boolean;
  open: (s: NewSheet) => void;
  rail: RailActs;
  acts: DraftActs;
  redrafting: boolean;
}) {
  const { draft, acts } = p;
  return (
    <>
      <DraftCases
        draft={draft}
        ready={p.ready}
        paused={p.paused}
        busy={p.busy}
        open={p.open}
        keep={() => acts.make(false)}
      />
      <WhoCaption>
        <AudienceToggle audience={draft.audience} onAudience={(a) => acts.redraft({ audience: a })} />
      </WhoCaption>
      <div className="sq-nw-who">
        <WhoSentence draft={draft} open={p.open} />
        <ReachLine reach={draft.reach} audience={draft.audience} list={draft.who?.kind === "list"} />
      </div>
      {p.redrafting ? null : (
        <>
          {draft.kind === "sequence" && draft.who?.kind === "list" ? (
            <p className="sq-nw-note">{W.draft.lineFirst(draft.reach?.of ?? draft.reach?.can ?? null)}</p>
          ) : null}
          {draft.kind === "sequence" && draft.audience === "leads" && draft.who?.kind === "search" ? (
            <div className="sq-nw-switchrow">
              <span>{W.draft.joinsAsFound}</span>
              <Switch
                checked={draft.adds_new}
                onCheckedChange={(on) => acts.change(M.setAddsNew(draft, on))}
                label={W.draft.joinsAsFound}
              />
            </div>
          ) : null}
          {draft.kind === "once" ? (
            <OnceMessage draft={draft} acts={p.rail} />
          ) : (
            <DraftRail draft={draft} acts={p.rail} />
          )}
          {!draft.said ? (
            <p className="sq-nw-note">
              {W.draft.orSay}{" "}
              <Button size="sm" variant="quiet" onClick={acts.again} data-testid="sq-nw-say-it">
                {W.draft.sayIt}
              </Button>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

/** New's draft, every choice a press, in New's pane. */
export function DraftView(p: {
  draft: NewDraftDto;
  reads: DraftReads;
  acts: DraftActs;
  busy: boolean;
  /** What Ask is doing with the line (drafting it again), where it is; Undo lets it go. */
  doing: string | null;
  /** The audience it is being drafted again for, where that changed: To leads says what it changes (F1). */
  redraftingFor: NewAudience | null;
  /** The ask on leaving a changed draft, in place of the foot (the page's). */
  leaving: ReactNode;
}) {
  const { draft, reads, acts } = p;
  const [sheet, setSheet] = useState<NewSheet | null>(null);
  const [blank, setBlank] = useState(false);
  // Each opening counted, so a sheet that edits words starts from the draft as it stands (it may be drafted again since).
  const [opens, setOpens] = useState(0);
  const [confirming, setConfirming] = useState(false);
  // Send now's question is about the draft as it was asked: any change, or a sheet opened to make one, puts it away, so
  // it never asks about "now" over a time picked since, or a count that has moved.
  const acted: DraftActs = {
    ...acts,
    change: (d) => {
      setConfirming(false);
      acts.change(d);
    },
    // Drafted again as the other kind or audience (the body's toggle), or Ask's drafting let go: asked again, or not at all.
    redraft: (fixed) => {
      setConfirming(false);
      acts.redraft(fixed);
    },
    undo: () => {
      setConfirming(false);
      acts.undo();
    },
  };
  const change = acted.change;
  const redrafting = !!p.doing;
  const open = (s: NewSheet) => {
    setConfirming(false);
    setBlank(false);
    setOpens((n) => n + 1);
    setSheet(s);
  };
  const write = (i: number) => {
    setBlank(true);
    setOpens((n) => n + 1);
    setSheet({ kind: "words", i });
  };
  const rail: RailActs = {
    open,
    write,
    typed: (i, at, v) => change(M.setTyped(draft, i, at, v)),
    hand: (i, words) => change(M.setHand(draft, i, words)),
    does: (i, does) => change(M.setDoes(draft, i, does)),
    remove: (i) => change(M.removeStep(draft, i)),
  };
  return (
    <CmPane
      title={<DraftName draft={draft} change={change} />}
      sub={subOf(draft)}
      tools={
        <Button size="sm" variant="quiet" onClick={acts.discard} data-testid="sq-nw-discard">
          {W.draft.discard}
        </Button>
      }
      onClose={acts.close}
      testid="sq-new"
      foot={
        p.leaving ??
        (confirming ? (
          <ConfirmSend
            draft={draft}
            tz={reads.timezone}
            busy={p.busy}
            onYes={() => {
              setConfirming(false);
              acts.make(true);
            }}
            onNo={() => setConfirming(false)}
          />
        ) : (
          <DraftFoot
            draft={draft}
            tz={reads.timezone}
            at={footReadsOf(reads)}
            busy={p.busy}
            doing={p.doing}
            onMake={acts.make}
            onSendNow={() => setConfirming(true)}
          />
        ))
      }
    >
      <div className="sq-nw" aria-busy={redrafting ? true : undefined}>
        <div className="sq-nw-cols">
          <div className="sq-nw-col">
            {draft.said ? (
              <SaidLine
                said={draft.said}
                doing={p.doing}
                onAgain={redrafting ? acted.undo : acts.again}
                again={redrafting ? W.say.undo : undefined}
              />
            ) : null}
            <div className="sq-nw-col" inert={redrafting}>
              <DraftBody
                draft={draft}
                ready={reads.ready}
                paused={reads.paused}
                busy={p.busy}
                open={open}
                rail={rail}
                acts={acted}
                redrafting={redrafting}
              />
            </div>
          </div>
          <div className="sq-nw-col is-side" inert={redrafting}>
            {redrafting ? (
              p.redraftingFor === "leads" ? (
                <ToLeadsNote />
              ) : null
            ) : (
              <>
                <ChecksList checks={draft.checks} />
                <HowItRuns draft={draft} open={open} />
              </>
            )}
          </div>
        </div>
      </div>
      <DraftSheets
        sheet={sheet}
        blank={blank}
        opens={opens}
        draft={draft}
        reads={reads}
        acts={acted}
        set={setSheet}
        write={write}
      />
    </CmPane>
  );
}
