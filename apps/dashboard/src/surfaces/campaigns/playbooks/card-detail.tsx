/**
 * Campaigns: one playbook's detail, which a moment, a line or a row of Coming up opens into (moved from
 * legacy/pages/playbook-card.jsx, decision 0015; Reach out Part 2.5). Campaigns' home draws it in a sheet from the side
 * (home/drawer.tsx); it was the pane beside the Playbooks list, which the home replaced (3 Oct 2026).
 *
 * One playbook: what starts it, what it sends, its clock, its mode, what its runs earned, and the verbs. A run that
 * waits for a person is approved or skipped right here, the same doors as on Today and Broadcasts.
 */
import { useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  DELIVERY_RECEIPTS_TIP,
  LIFECYCLE_TOAST,
  LIFECYCLE_WORDS,
  MESSAGE_GONE_WORDS,
  PLAYBOOK_DELETE_WORDS,
  appointmentWordOf,
  appointmentWords,
  pipelineRoute,
  poolWords,
} from "@chanlytics/contracts";
import type { AppointmentWord, ConsentChannel } from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { pageClock } from "@/legacy-bridge/zone";
import { canRestoreList, gate, gatedProps, navigate, restoreList } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import type { MenuItem } from "../../kit/menu/menu";
import { StatePill } from "../../kit/pill/state-pill";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { useSurface } from "../../use-surface";
import { bcRunOffer, bcWhenWords } from "../broadcasts/when-words";
import { askAboutItem } from "../home/ask-on-campaigns";
import { SentenceParts } from "../home/sentence";
import { MessagePreview } from "../parts/message-preview";
import { CmLine, CmLines } from "../parts/lines";
import { CmPane, useCmPhone } from "../parts/split";
import { CardVia, cardViaOf, goesBySaid } from "./card-channels";
import type { PlaybookCardVM, PlaybookTriggerOption, PlaybooksSurface } from "./surface";
import { playbooks as V } from "./verbs";
import {
  PB_NONE,
  pbDay,
  pbFooter,
  pbIcon,
  pbLangWords,
  pbMessage,
  pbNoNumberWords,
  pbPeople,
  pbReach,
  pbReachDoor,
  pbReachWords,
  pbReplyTip,
  pbSentWhen,
  pbStatus,
  pbTitle,
  pbWrongSlot,
} from "./words";

/** What the toast raises (the shell's one flash). */
export type Flash = (flash: { tone?: string; msg: ReactNode }) => void;

/** A playbook as the surface holds it. */
type PlaybookRow = PlaybookCardVM;

type Waiting = NonNullable<PlaybookCardVM["totals"]["waiting"]>;
type History = PlaybookCardVM["totals"]["history"][number];

/** What an act's verb answers: the API's own, a refusal carrying the sentence for the toast. */
type Outcome<D> = { ok: true; data: D } | { ok: false; message: string };

interface CardProps {
  p: PlaybookRow;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  flash: Flash;
}

/** The trigger the surface offers for a playbook's moment, or null when the surface has no such one. */
function triggerOption(surface: PlaybooksSurface | undefined, id: string): PlaybookTriggerOption | null {
  return ((surface && surface.triggers) || PB_NONE).find((t) => t.id === id) || null;
}

/**
 * The trigger's list, on People (a smart list's own view); `segments/<id>` would land there too, one hop later. A
 * follow-up's is the Pipeline's own view of the proposals waiting (contracts pipelineRoute).
 */
function cardListRoute(p: PlaybookRow, trig: PlaybookTriggerOption | null): string {
  return p.trigger === "saved_list" && p.list_key
    ? `clients/seg:${p.list_key}`
    : p.trigger === "saved_list" && p.list_id
      ? `clients/list:${p.list_id}`
      : trig && trig.list
        ? `clients/seg:${trig.list}`
        : trig && trig.kind === "deal"
          ? pipelineRoute({ view: "waiting" })
          : "clients/seg:opted_in";
}

/** What the card reads of its playbook and of the surface, worked out once as it draws. */
function cardRead(p: PlaybookRow, surface: PlaybooksSurface | undefined) {
  const waiting = p.totals.waiting;
  const status = pbStatus(p);
  const trig = triggerOption(surface, p.trigger);
  // What its runs send. Templates that could not be read are said once, over the cards; one not among the approved, here.
  const templates = surface?.templates;
  const businessName = surface?.businessName;
  const message = Array.isArray(templates) ? pbMessage(p, templates, businessName) : null;
  const templateGone = Array.isArray(templates) && !message;
  const wrongSlot = message ? pbWrongSlot(p, message.template, surface?.triggers) : null;
  const reach = pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting });
  const reachWords = pbReachWords(reach);
  // Everyone its moment names, as the tile reads it: whether anybody on it said the yes decides the door and the count.
  const named = p.named || (trig && trig.named) || null;
  const reachDoor = pbReachDoor(reach, named);
  const noNumber = pbNoNumberWords(p, named);
  return {
    waiting,
    status,
    trig,
    businessName,
    message,
    templateGone,
    wrongSlot,
    reachWords,
    reachDoor,
    noNumber,
    named,
    // A workspace paused for billing: an approval is refused (402), so the card says so where Approve would be.
    paused: surface?.ready?.paused === true,
    listRoute: cardListRoute(p, trig),
    // The offered message its row is one version of (the surface's own reading, with the channels it holds): what the
    // composer reads for its Send by row.
    via: cardViaOf(
      p,
      surface,
      Array.isArray(templates) && message ? (templates.find((t) => t.id === message.template.id) ?? null) : null,
    ),
  };
}

interface ActsIn {
  p: PlaybookRow;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setSure: Dispatch<SetStateAction<boolean>>;
  setSkipSure: Dispatch<SetStateAction<boolean>>;
  flash: Flash;
  /** The pane's own close: a campaign deleted leaves the screen before its toast says so. */
  onGone: () => void;
}

/**
 * The verbs a card presses. An act is said the moment the server takes it, from what it answered (`onAccepted`), not once
 * the playbooks and the broadcasts are read again behind it; the card repaints from that re-read, and its buttons wait
 * for it -- a Run now pressed twice before the first run's rows had landed would be two runs.
 */
function cardActs({ p, busy, setBusy, setSure, setSkipSure, flash, onGone }: ActsIn) {
  const act = async <D,>(
    fn: (o: { onAccepted: (d: D) => void }) => Promise<Outcome<D>>,
    said: (d: D) => ReactNode,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    let done = false;
    const say = (d: D) => {
      done = true;
      flash({ tone: "ok", msg: said(d) });
    };
    const r = await fn({ onAccepted: say });
    setBusy(false);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else if (!done) say(r.data);
  };
  const toggle = () =>
    act(
      (o) => (p.state === "paused" ? V.resume(p.id, o) : V.pause(p.id, o)),
      () =>
        p.state === "paused" ? (
          <>
            <b>{p.name}</b> resumed — next run {p.next === "paused" ? "at its hour" : p.next}
          </>
        ) : (
          <>
            <b>{p.name}</b> paused — nothing runs until you resume it
          </>
        ),
    );
  const runNow = () =>
    act(
      (o) => V.runNow(p.id, o),
      (d: Output<"POST playbooks/[id]/run">) =>
        d.outcome === "sent" ? (
          <>
            <b>{p.name}</b> — {pbPeople(d.eligible)}, {pbSentWhen(d)}
          </>
        ) : d.outcome === "held" ? (
          <>
            <b>{p.name}</b> — {pbPeople(d.eligible)} waiting for your approval
          </>
        ) : (
          <>
            <b>{p.name}</b> — nobody new to send to right now
          </>
        ),
    );
  // The server may move the run to nine o'clock: the receipt says when it really goes (broadcasts/when-words.ts bcWhenWords).
  const approve = (waiting: Waiting) =>
    act(
      (o) => V.approveRun(waiting.id, o),
      (d: Output<"POST broadcasts/[id]/approve">) => (
        <SentenceParts
          parts={LIFECYCLE_TOAST.approved(p.name, d.recipient_count || waiting.recipient_count, bcWhenWords(d))}
        />
      ),
    );
  const skip = (waiting: Waiting) => {
    setSkipSure(false);
    return act(
      (o) => V.skipRun(waiting.id, o),
      // What the server stopped, by what the run was when it did (Sent's own receipt, contracts runStoppedWords).
      (d: Output<"POST broadcasts/[id]/cancel">) => <SentenceParts parts={LIFECYCLE_TOAST.skipped(p.name, d.was)} />,
    );
  };
  const remove = () => {
    setSure(false);
    void act(
      // Closed once the server has taken it and the rows are read again without it, then said: a sheet left saying the
      // campaign "isn't here any more" was the page talking about what it had just done (spec 2026-10-09 §4.3). Closed
      // at the server's word, before the re-read, the drawer gave the focus back to the row it was about, still drawn,
      // and the re-read took it to the body; closed after it, the focus comes home to the row now in its place, as a
      // reach-out's Remove does (reach-out/row.tsx).
      async () => {
        const r = await V.remove(p.id);
        if (r.ok) onGone();
        return r;
      },
      () => (
        <>
          <b>{p.name}</b> {PLAYBOOK_DELETE_WORDS.done}
        </>
      ),
    );
  };
  // One channel switched in the drawer: the channels it keeps now are sent, alone (verbs.ts `channels`). The server
  // judges them against the playbook as it stands and writes nothing else, and the page says so the moment it takes
  // them. A run that already waits keeps the channels it was made with, and the receipt says that too.
  const channels = (next: readonly ConsentChannel[]) => {
    if (next.length === 0) return Promise.resolve();
    return act(
      (o) => V.channels(p.id, [...next], o),
      () => goesBySaid(p.name, next, !!p.totals.waiting),
    );
  };
  return { act, toggle, runNow, approve, skip, remove, channels };
}

/** Everything the card's sections read. */
interface CardCtx extends ReturnType<typeof cardRead> {
  p: PlaybookRow;
  /** What the workspace calls an appointment (the playbooks surface's shape): the drawer says the page's one word. */
  word: AppointmentWord;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  /** Open its message in a drawer of its own, where the home offers one. */
  onMessage?: (name: string) => void;
  /** Close the pane, the way its sheet closes (the home's drawer: Back, or the home's address). */
  onClose: () => void;
  busy: boolean;
  sure: boolean;
  skipSure: boolean;
  setSure: Dispatch<SetStateAction<boolean>>;
  setSkipSure: Dispatch<SetStateAction<boolean>>;
  acts: ReturnType<typeof cardActs>;
}

/**
 * What it sends, as a customer reads it, and under it which message and in which language: a door to that message, which
 * opens over the home in a drawer of its own (`onMessage`, the home's `message:<name>`), where it is read and changed;
 * the Library's page where no drawer is offered.
 */
function cardWords(c: CardCtx) {
  const { p, message, businessName, onMessage } = c;
  return (
    message && (
      <div className="ob-words" data-testid="pb-words">
        <MessagePreview
          from={businessName}
          body={message.body}
          values={message.values}
          header={message.template.header}
          footer={pbFooter(message.template)}
          buttons={message.template.buttons}
          compact
        />
        <LinkButton
          className="ob-words-name"
          onClick={() => (onMessage ? onMessage(p.template_name) : navigate("messages"))}
          data-testid="pb-template-name"
        >
          {pbTitle(p.template_name)} <span className="dim">&middot; {pbLangWords(p.template_language)}</span>
          <Icon name="chevron" size={11} />
        </LinkButton>
      </div>
    )
  );
}

/**
 * Who its moment reaches, as a link that opens them, and who of them wait: nothing where the server could not count.
 * The trigger's own hint is the head's line, so the count stands alone here.
 */
function whoWords(c: CardCtx): ReactNode {
  const { p, trig, noNumber, named, listRoute, word } = c;
  if (named === null || p.candidates === null || p.held === null) return null;
  return (
    <>
      <LinkButton
        className="ob-link"
        data-tip={
          trig && trig.kind === "visit"
            ? `Everyone with a recorded yes — the day's ${appointmentWords(word).many} are picked from them · click to open them in People`
            : trig && trig.kind === "deal"
              ? "The proposals waiting with nothing back — before their links, their follow-ups and the week's breath · click to open them in the Pipeline"
              : "The list this campaign watches — before the gap and the week's breath · click to open it in People"
        }
        onClick={() => navigate(listRoute)}
        data-testid="pb-audience"
      >
        {noNumber ||
          `${pbPeople(p.candidates)} ${trig && trig.kind === "deal" ? poolWords(p.trigger, word) : "on the list"} said yes`}
      </LinkButton>
      {/* Why a list with people on it can still offer nobody: one message per person per week, across playbooks. */}
      {p.held > 0 ? <>, {pbPeople(p.held)} more wait this week</> : null}
    </>
  );
}

/** A playbook whose list was archived says so, and offers to bring the list back to a role that may. */
function sentenceArchived(c: CardCtx) {
  const { p, canAct, acts } = c;
  return (
    <>
      Paused &mdash; its list, <b>{p.triggerLabel}</b>, is archived.
      {canAct && canRestoreList() ? (
        <>
          {" "}
          <LinkButton
            className="ob-link"
            onClick={() =>
              acts.act(
                () => restoreList(p.list_id),
                () => (
                  <>
                    <b>{p.triggerLabel}</b> is back; resume the campaign when you want it running
                  </>
                ),
              )
            }
            data-testid="pb-list-restore"
          >
            Bring the list back
          </LinkButton>
          , or edit the campaign to run on another.
        </>
      ) : null}
    </>
  );
}

/**
 * When it runs next, as its line says it: the hour and who that run reaches ("Today 9:00 AM · 7 people"), with the door
 * that mends a run reaching nobody; or why it runs nothing (off, its list archived, paused).
 */
function nextWords(c: CardCtx): ReactNode {
  const { p, reachWords, reachDoor } = c;
  if (p.listArchived) return sentenceArchived(c);
  if (p.state === "paused") return <>Paused &mdash; nothing runs until you resume it</>;
  const at = p.next.charAt(0).toUpperCase() + p.next.slice(1);
  return (
    <>
      <b>{at}</b>
      {reachWords ? <> &middot; {reachWords}</> : null}
      {reachDoor ? (
        <>
          {" "}
          &middot;{" "}
          <LinkButton className="ob-link" onClick={() => navigate(reachDoor.to)} data-testid="pb-reach-door">
            {reachDoor.label}
          </LinkButton>
        </>
      ) : null}
    </>
  );
}

/**
 * What stops it, said over the lines: why it runs nothing (a follow-up where deals are off: no next run to say), the
 * message gone, or a slot that reads wrong (Edit, for a role that may).
 */
function cardWarnings(c: CardCtx) {
  const { p, canAct, onEdit, templateGone, wrongSlot } = c;
  return (
    <>
      {p.off && (
        <p className="bc-excl-hint" data-testid="pb-off">
          {p.off}
        </p>
      )}
      {templateGone && (
        <p className="bc-excl-hint warn" data-testid="pb-template-gone">
          {MESSAGE_GONE_WORDS.card}
        </p>
      )}
      {wrongSlot && (
        <p className="bc-excl-hint warn" data-testid="pb-slot-wrong">
          Its message reads wrong: {wrongSlot}
          {canAct ? (
            <>
              {" "}
              <LinkButton className="ob-link" onClick={() => onEdit(p)} data-testid="pb-slot-wrong-edit">
                Edit it
              </LinkButton>
              , and each slot takes what it should.
            </>
          ) : null}
        </p>
      )}
    </>
  );
}

/**
 * The facts, a line each (parts/lines.tsx; Ruben, 11 Oct 2026, where one sentence held them all): when it runs next, who
 * said yes, its clock, the channels it goes by (switched in place: card-channels.tsx), and the row of Autonomy it runs
 * under.
 */
function cardLines(c: CardCtx) {
  const { p, canAct, busy, via, acts, reachWords } = c;
  return (
    <CmLines testid="pb-facts">
      <CmLine word="Next run" testid="pb-next">
        {p.off ? null : (
          <span className="ob-line-words" data-testid={reachWords ? "pb-reach" : undefined}>
            {nextWords(c)}
          </span>
        )}
      </CmLine>
      <CmLine word="Who" testid="pb-who-line">
        {whoWords(c)}
      </CmLine>
      <CmLine word="When" testid="pb-when-line">
        {p.schedule}
      </CmLine>
      <CmLine word={LIFECYCLE_WORDS.channels.goesBy} testid="pb-goes-by">
        <CardVia p={p} canAct={canAct} busy={busy} via={via} onChannels={(next) => void acts.channels(next)} bare />
      </CmLine>
      <CmLine word="Rules" testid="pb-rules-line">
        {p.policy_class ? <PolicyChip cls={p.policy_class} /> : null}
      </CmLine>
    </CmLines>
  );
}

/** One run, a line that opens as itself on Sent (broadcasts/run:<id>), read by its id however old it is. */
function historyRow(h: History) {
  return (
    <LinkButton
      key={h.id}
      className="ob-history-row"
      onClick={() => navigate(`broadcasts/run:${h.id}`)}
      data-testid="pb-run-open"
    >
      <span className="ob-history-day tabular">
        {pbDay(h.run_for || (h.scheduled_for ? h.scheduled_for.slice(0, 10) : ""))}
      </span>
      <span className="ob-history-said">
        {h.state === "sent" ? (
          <>
            {h.sent} sent
            {h.held > 0 ? ` · ${h.held} held` : ""}
            {h.replied > 0 ? ` · ${h.replied} replied` : ""}
          </>
        ) : h.state === "pending_approval" ? (
          `Waiting for you · ${h.recipient_count} people`
        ) : h.state === "sending" ? (
          `Sending · ${h.sent} so far`
        ) : h.state === "scheduled" ? (
          `Scheduled · ${h.recipient_count} people`
        ) : (
          h.state
        )}
      </span>
      <Icon name="chevron" size={11} />
    </LinkButton>
  );
}

/**
 * Its runs: one line of what they earned in all ("38 runs · 212 sent · 208 delivered · 41 replied", each number with its
 * tip), and the newest of them, a line each, newest first, from the same rows the totals are summed over. One run says
 * itself once, on its row, with when it ran over it (the sum and the row disagreed about which numbers to show); a
 * campaign that never ran says so in the line's place.
 */
function cardHistory(c: CardCtx) {
  const { p } = c;
  const t = p.totals;
  const runs = t.history && t.history.length > 0 ? t.history : null;
  return (
    <section className="ob-runs" data-testid="pb-history">
      <p className="ob-runs-head" data-testid={t.runs > 1 ? "pb-results" : undefined}>
        {t.runs > 1 ? (
          <>
            <span className="tabular">{t.runs}</span> {t.runs === 1 ? "run" : "runs"} &middot;{" "}
            <span className="tabular">{t.sent}</span> sent &middot;{" "}
            <span className="tabular" data-tip={DELIVERY_RECEIPTS_TIP}>
              {t.delivered}
            </span>{" "}
            delivered &middot;{" "}
            <span className="tabular" data-tip={pbReplyTip()}>
              {t.replied}
            </span>{" "}
            replied
            {t.held > 0 ? (
              <>
                {" "}
                &middot; <span className="tabular">{t.held}</span> held back
              </>
            ) : null}
          </>
        ) : p.last_run_for ? (
          <>Last ran {pbDay(p.last_run_for)}</>
        ) : (
          <>It has not run yet</>
        )}
      </p>
      {runs ? <CmLines>{runs.map((h) => historyRow(h))}</CmLines> : null}
      {runs && t.runs > runs.length ? (
        <span className="ob-history-more" data-testid="pb-history-more">
          The newest {runs.length} of {t.runs} runs
        </span>
      ) : null}
    </section>
  );
}

/** A run waiting on a person: Approve, the card's one filled act, for every role (it says who may), and Skip, which asks. */
function cardWaitActs(c: CardCtx) {
  const { p, canAct, busy, skipSure, setSkipSure, waiting, paused, acts } = c;
  if (!waiting) return null;
  const W = LIFECYCLE_WORDS.coming.approval;
  // What the card may offer is the one reading's (contracts waitingRunOffer, by the business's clock: when-words.ts
  // bcRunOffer), which Coming up's line reads too. The run is this playbook's, and its day and moment are the run's own
  // (the list read's). Where the verb would refuse an approval now (its day has passed, a visit's run would go a day
  // late, or the workspace is paused) the button says why instead of answering 409 or 402, and Skip is the act left.
  const offer = bcRunOffer(
    { playbook_id: p.id, run_for: waiting.run_for, audience: { trigger: waiting.trigger } },
    { paused, known: true },
  );
  const refusal = offer.kind === "skip" ? offer.why : null;
  if (canAct && skipSure) {
    return (
      <Confirm
        question={W.question(p.name)}
        detail={W.detail}
        yes={W.yes}
        danger
        busy={busy}
        onYes={() => acts.skip(waiting)}
        onNo={() => setSkipSure(false)}
        testid="pb-skip"
      />
    );
  }
  return (
    <>
      {canAct && (
        <Button size="sm" disabled={busy} onClick={() => setSkipSure(true)} data-testid="pb-skip">
          {LIFECYCLE_WORDS.ledger.skip}
        </Button>
      )}
      <Button
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={() => (refusal ? undefined : void acts.approve(waiting))}
        data-testid="pb-approve"
        {...(!canAct ? gate("approve", "approve a run") : refusal ? gatedProps(refusal) : {})}
      >
        <Icon name="check" size={12} /> {LIFECYCLE_WORDS.ledger.approve(waiting.recipient_count)}
      </Button>
    </>
  );
}

/**
 * What a role that may change it does to it, at the head of its pane: Pause or Resume and Edit in words, and behind the
 * kit's menu Ask about this campaign (the moment spec, A1: the drawer closes, and Ask opens on the campaign by its name),
 * then the two that are pressed least and cost most -- Run now, and Delete, which asks first. They were five buttons in
 * a row under the card, the red Delete among them. A viewer asks from the shell's ✦, on the drawer's address.
 */
function cardOwnActs(c: CardCtx, phone = false) {
  const { p, canAct, busy, sure, setSure, waiting, acts, onEdit, onClose } = c;
  if (!canAct) return null;
  const hours = pageClock().hours;
  const pauseItem: MenuItem = {
    label: p.state === "paused" ? "Resume" : "Pause",
    glyph: <Icon name={p.state === "paused" ? "play" : "pause"} size={13} />,
    disabled: busy,
    onSelect: () => void acts.toggle(),
  };
  // On a phone the pane's head is a capsule a thumb wide: its acts are the menu's, as a thread's Actions are, but Pause or
  // Resume, which the docked foot holds while no run waits (PlaybookPane); a run waiting holds the foot, and it stays here.
  const words: MenuItem[] =
    phone && waiting
      ? [
          pauseItem,
          { label: "Edit", glyph: <Icon name="pencil" size={13} />, disabled: busy, onSelect: () => onEdit(p) },
        ]
      : [];
  // Ask first on a desk; on a phone after the menu's own acts, so its first item stays the act the drawer is for.
  const more: MenuItem[] = [
    ...words,
    askAboutItem(p, onClose),
    ...(p.state === "running" && !waiting
      ? [
          {
            label: "Run now",
            glyph: <Icon name="bolt" size={13} />,
            title: `Runs it now, at your request — sends unless its class is set to Never; outside ${hours.range} it goes at ${hours.first}`,
            disabled: busy,
            onSelect: () => void acts.runNow(),
          },
        ]
      : []),
    {
      label: "Delete…",
      glyph: <Icon name="x" size={13} />,
      tone: "danger",
      disabled: busy,
      onSelect: () => setSure(true),
    },
  ];
  return (
    <>
      {phone ? null : (
        <>
          <Button size="sm" disabled={busy} onClick={() => void acts.toggle()} data-testid="pb-pause">
            <Icon name={p.state === "paused" ? "play" : "pause"} size={12} />{" "}
            {p.state === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => onEdit(p)} data-testid="pb-edit">
            Edit
          </Button>
        </>
      )}
      {sure ? null : (
        <Menu
          label={`More for ${p.name}`}
          trigger={
            <Button variant="quiet" size="sm" iconOnly aria-label={`More for ${p.name}`} data-testid="pb-more">
              <Icon name="more" size={14} />
            </Button>
          }
          groups={[{ items: more }]}
        />
      )}
    </>
  );
}

/** Delete, asked: the one question, where the acts were. */
function cardDeleteAsk(c: CardCtx) {
  const { p, canAct, busy, sure, setSure, acts } = c;
  if (!canAct || !sure) return null;
  return (
    <Confirm
      question={`Delete ${p.name}?`}
      detail={PLAYBOOK_DELETE_WORDS.detail}
      yes="Yes, delete"
      danger
      busy={busy}
      onYes={acts.remove}
      onNo={() => setSure(false)}
      testid="pb-delete"
    />
  );
}

/**
 * What the card says, down one column (Ruben, 11 Oct 2026: the drawer said what the campaign does three times, in its head,
 * a chip and a paragraph): what is wrong with it, if anything; its facts, a line each; what it sends, as a customer reads
 * it; then its runs, newest first.
 */
function cardBody(c: CardCtx) {
  return (
    <>
      {cardWarnings(c)}
      {cardLines(c)}
      {cardWords(c)}
      {cardHistory(c)}
    </>
  );
}

/** A playbook's state and verbs, held once for the pane it is open in (Campaigns' home draws it in a sheet). */
function useCard({
  p,
  canAct,
  onEdit,
  onMessage,
  flash,
  onClose,
}: CardProps & { onClose: () => void; onMessage?: (name: string) => void }): CardCtx {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  // Skip asks first, as it does on Broadcasts, with a question of its own apart from the delete's.
  const [skipSure, setSkipSure] = useState(false);
  const surface = useSurface("playbooks");
  const read = cardRead(p, surface);
  const acts = cardActs({ p, busy, setBusy, setSure, setSkipSure, flash, onGone: onClose });
  // The workspace's word, from the surface the card reads; unread, the one derivation over nothing known.
  const word = surface ? surface.shape.word : appointmentWordOf({ stored: null, sellsBy: null });
  return { ...read, p, word, canAct, onEdit, onMessage, onClose, busy, sure, skipSure, setSure, setSkipSure, acts };
}

interface PaneProps {
  p: PlaybookRow;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  /** Open the message it sends, by its name, in a drawer of its own (the home's `message:<name>`). */
  onMessage?: (name: string) => void;
  flash: Flash;
  onClose: () => void;
}

/**
 * The playbook open, in the pane beside the list (parts/split.tsx), as a thread opens beside the Inbox's: its mark, name,
 * state and what starts it, with Pause, Edit and the rest at the head; what it sends, its sentence and its runs in the
 * body; and a run waiting on you, or a delete asked, in the foot. It opened under its own row, which pushed every row
 * after it down by the card's height, the list's columns over a card that had none.
 */
export function PlaybookPane({ p, canAct, onEdit, onMessage, flash, onClose }: PaneProps) {
  const c = useCard({ p, canAct, onEdit, onMessage, flash, onClose });
  const phone = useCmPhone();
  const { status, waiting } = c;
  const asking = cardDeleteAsk(c);
  // On a phone the foot's acts are the kit's equal pair (kit.css `data-foot-pair`), as every phone foot's are, but while
  // a question stands there; and with no run waiting the foot holds Edit and Pause or Resume, the head's words on a desk,
  // a thumb's reach from where the menu kept them (spec 2026-10-09 §4.4; Edit joined Pause there on 11 Oct 2026, where
  // one button stood alone across the foot and Edit hid in the menu).
  const foot = asking ? (
    <div className="pb-pane-foot">{asking}</div>
  ) : waiting ? (
    <div className="pb-pane-foot" data-foot-pair={c.skipSure ? undefined : ""}>
      <span className="pb-pane-foot-say" data-testid="pb-waiting">
        This run waits on you
      </span>
      {cardWaitActs(c)}
    </div>
  ) : phone && canAct ? (
    <div className="pb-pane-foot" data-foot-pair="">
      <Button size="sm" disabled={c.busy} onClick={() => void c.acts.toggle()} data-testid="pb-pause-foot">
        <Icon name={p.state === "paused" ? "play" : "pause"} size={12} /> {p.state === "paused" ? "Resume" : "Pause"}
      </Button>
      <Button size="sm" disabled={c.busy} onClick={() => onEdit(p)} data-testid="pb-edit-foot">
        <Icon name="pencil" size={12} /> Edit
      </Button>
    </div>
  ) : null;
  return (
    <CmPane
      testid="pb-pane"
      className="pb-pane"
      // A phone's head is a line a thumb wide: the moment's glyph is the kicker's word over it there.
      mark={
        phone ? null : (
          <span className="mark pb-row-mark" aria-hidden="true">
            <Icon name={pbIcon(p.trigger)} size={13} />
          </span>
        )
      }
      title={p.name}
      badge={
        <StatePill
          kind="playbook"
          value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"}
        />
      }
      sub={p.triggerHint}
      tools={cardOwnActs(c, phone)}
      foot={foot}
      onClose={onClose}
    >
      <div className="ob-card-detail" data-testid="pb-detail" data-state={status}>
        {cardBody(c)}
      </div>
    </CmPane>
  );
}
