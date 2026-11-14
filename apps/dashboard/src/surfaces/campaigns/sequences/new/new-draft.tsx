/**
 * New's draft (decision 0065; the New canvas's rows B, D and E): one sentence of who and when, every choice in it a word to
 * press, who it reaches, its steps on the rail, what Ask checked, how it runs, and the one act it is set up for. What
 * stops or bends it is a card over the sentence (a part left out, a twin, no one to hear it, a WhatsApp version still with
 * Meta). A change Ask need not make again is made here (new-model.ts); a change of kind or audience is Ask's, drafted again
 * from the same line (`redraft`), the draft standing in its new shape with Undo while Ask writes it. Any other change is
 * said: the line under the draft (decision 0129 step 2, change.ts) changes what it is told to and leaves the rest, and
 * what it changed is said on top, with Undo. Its foot, and Send now's question in it, are foot.tsx's;
 * leaving a changed draft asks too (the page's). On a wide pane what Ask checked and how it runs stand beside the steps
 * (the canvas's desk board). Every word is contracts' (new-words.ts).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CAMPAIGNS_PAUSED_WORDS,
  CHANNELS_DOOR,
  GET_YES_ROUTE,
  NEW_WORDS as W,
  clockHour,
  sequenceRoute,
  zonedInputValue,
  type ConsentChannel,
  type MailboxHistory,
  type NewAudience,
  type NewDraftDto,
  type NewKind,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Switch } from "../../../kit/switch/switch";
import { routeDoor, type refusalToast } from "../../../frame-verbs";
import { keepHistory } from "../../../settings/connections/history-choice";
import { connectMailbox } from "../../../settings/connections/mailbox-connect";
import { CmPane } from "../../parts/split";
import { CHANGE_WORDS } from "./change";
import { CHANGE_LINE, NewLine } from "./line";
import { MessageSheet, WordsSheet, type LibraryReads } from "./new-message-sheets";
import * as M from "./new-model";
import {
  AudienceToggle,
  CaseNote,
  ChecksList,
  DraftName,
  HowItRuns,
  ReachLine,
  SaidLine,
  ToLeadsNote,
  WhoCaption,
  WordPick,
} from "./new-parts";
import { DraftRail, OnceMessage, type RailActs } from "./new-rail";
import { AddStepSheet } from "./add-step";
import { DraftFoot } from "./foot";
import { DraftVoice } from "./new-voice";
import {
  ChannelsSheet,
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
  /** Ask's drafting again, or its changing, let go: the draft as it was. */
  undo: () => void;
  /** What the line under the draft says to change. */
  say: (words: string) => void;
  /** The line's last change undone: the draft as it stood before it. */
  back: () => void;
  discard: () => void;
  make: (start: boolean) => void;
  close: () => void;
  /** A press the server refused (Connect Google's): said as the page's toast, in its words. */
  refused: (r: Parameters<typeof refusalToast>[0]) => void;
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
  // Built by hand, what it sends from is not known here: said plainly, and the door says if there is none.
  const from = draft.mailbox ? draft.mailbox.label || W.sheets.noMailbox : W.draft.yourMailbox;
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
    cards.push(<CaseNote key="cannot" tone="warn" title={c.title} words={c.words} testid="sq-nw-cannot" live />);
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

/** To Google's consent with what the owner chose it brings in, and back to this draft, kept in the tab as it changes (new-page.tsx). */
const connectForNew = (history: MailboxHistory) => {
  keepHistory(history);
  return connectMailbox("google", null, "new", history);
};

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
        onConnect={(history) => void connectForNew(history).then((r) => (r.ok ? undefined : acts.refused(r)))}
        onClose={close}
      />
    </>
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
  /** The steps the line last changed, by their places. */
  changed: readonly number[];
  /** The steps whose words are still as Ask wrote them, by their places. */
  byAsk: readonly number[];
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
            <OnceMessage draft={draft} acts={p.rail} changed={p.changed} byAsk={p.byAsk} />
          ) : (
            <>
              <DraftRail draft={draft} acts={p.rail} changed={p.changed} byAsk={p.byAsk} />
              <DraftVoice draft={draft} again={() => acts.redraft({})} />
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * The page's acts, each putting Send now's question away first: it is about the draft as it was asked, so any change, a
 * draft drafted again or changed by the line, or Ask's work let go, never leaves it asking about "now" over a time picked
 * since, or a count that has moved.
 */
const puttingAway = (acts: DraftActs, away: () => void): DraftActs => ({
  ...acts,
  change: (next) => {
    away();
    acts.change(next);
  },
  redraft: (fixed) => {
    away();
    acts.redraft(fixed);
  },
  undo: () => {
    away();
    acts.undo();
  },
  say: (words) => {
    away();
    acts.say(words);
  },
});

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
  /** The line under the draft, as it is typed. */
  line: { words: string; onWords: (words: string) => void };
  /**
   * What stands on top: the line Ask is changing it by, or the last one with what it changed (`by`), where, and
   * whether there is anything to undo.
   */
  note: { said: string; by: string | null; steps: readonly number[]; undo: boolean } | null;
  /** The steps whose words are still as Ask wrote them, by their places: each says "By Ask" (change.ts placesByAsk). */
  byAsk: readonly number[];
}) {
  const { draft, reads, acts } = p;
  const [sheet, setSheet] = useState<NewSheet | null>(null);
  const [blank, setBlank] = useState(false);
  // Each opening counted, so a sheet that edits words starts from the draft as it stands (it may be drafted again since).
  const [opens, setOpens] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const acted = puttingAway(acts, () => setConfirming(false));
  // A change lands while the owner is at the line, under the draft: what it changed is brought into view, with its Undo.
  const top = useRef<HTMLDivElement>(null);
  const changedBy = p.note?.by ?? null;
  useEffect(() => {
    if (changedBy) top.current?.scrollIntoView?.({ block: "nearest" });
  }, [changedBy, p.note?.said]);
  const change = acted.change;
  const redrafting = !!p.doing;
  // Changed by the line, the draft stands whole while Ask works; drafted again as another kind or audience, it stands in
  // its new shape with its steps to come (F1). Whole, the page keeps its length, and the owner their place in it.
  const changing = redrafting && p.note?.by === null;
  const reshaping = redrafting && !changing;
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
      title={<DraftName draft={draft} change={change} held={redrafting} />}
      sub={subOf(draft)}
      tools={
        <Button size="sm" variant="quiet" onClick={acts.discard} data-testid="sq-nw-discard">
          {W.draft.discard}
        </Button>
      }
      onClose={acts.close}
      testid="sq-new"
      foot={
        p.leaving ?? (
          <DraftFoot
            draft={draft}
            tz={reads.timezone}
            at={footReadsOf(reads)}
            busy={p.busy}
            doing={p.doing}
            confirming={confirming}
            onConfirming={setConfirming}
            onMake={acts.make}
            onConnect={() => setSheet({ kind: "from" })}
          />
        )
      }
    >
      <div className="sq-nw" aria-busy={redrafting ? true : undefined}>
        <div className="sq-nw-cols">
          <div className="sq-nw-col">
            {p.note || draft.said ? (
              <div ref={top}>
                <SaidLine
                  said={p.note?.said ?? draft.said}
                  doing={p.doing}
                  by={p.note?.by}
                  onAgain={redrafting ? acted.undo : p.note?.undo ? acts.back : null}
                  again={changing ? W.say.stop : W.say.undo}
                />
              </div>
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
                redrafting={reshaping}
                changed={p.note?.steps ?? []}
                byAsk={p.byAsk}
              />
            </div>
          </div>
          <div className="sq-nw-col is-side" inert={redrafting}>
            {reshaping ? (
              p.redraftingFor === "leads" ? (
                <ToLeadsNote />
              ) : null
            ) : (
              <>
                <ChecksList checks={draft.checks} />
                <HowItRuns draft={draft} onOk={() => open({ kind: "ok" })} />
              </>
            )}
          </div>
        </div>
        <NewLine
          line={p.line.words}
          onLine={p.line.onWords}
          onDraft={acted.say}
          hint={CHANGE_WORDS.hint}
          says={CHANGE_LINE}
          busy={redrafting || p.busy}
        />
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
