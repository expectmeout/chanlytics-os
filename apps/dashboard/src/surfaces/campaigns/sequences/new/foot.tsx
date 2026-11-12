/**
 * The draft's foot (out of new-draft.tsx: Send now's question on 9 Nov 2026, the foot itself on 11 Nov): what it reaches
 * and when, then the one act it is set up for; and Send now's question in its place, since a one-off pressed to go now asks
 * first who it reaches and how, when it goes with its Stop, and that delivered is delivered. Every word is contracts'
 * (new-words.ts).
 */
import { NEW_WORDS as W, localHour, type NewDraftDto } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { Icon } from "../../../kit/icon/icon";
import { gate } from "../../../frame-verbs";
import { cmFootAsk } from "../../parts/split";
import * as M from "./new-model";

/** Who a one-off sent now reaches on each channel ("180 by WhatsApp, 34 by email"), where the workspace counted it. */
function byWords(draft: NewDraftDto): string {
  // With WhatsApp's version still at Meta it goes by the others alone, which the question's count already says.
  if (M.reviewOf(draft)) return "";
  const by = draft.reach?.by ?? {};
  return draft.channels
    .flatMap((c) => ((by[c] ?? 0) > 0 ? [W.reach.byChannel(by[c] ?? 0, M.channelsSaidOf([c], ""))] : []))
    .join(", ");
}

/** What Send now's question is asked about, and its two answers. */
interface ConfirmSendProps {
  draft: NewDraftDto;
  /** The business's zone, which says when it goes. */
  tz: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}

/**
 * Send now, asked where it was pressed. It is the foot (cmFootAsk: the kit's pair, its answers each half the foot on a
 * phone, the capsule rounded round its rows), and its answer takes focus where it stands: on a phone the foot is docked at
 * the screen's edge, and a plain focus there moved the page to its end (9 Nov 2026).
 */
function ConfirmSend({ draft, tz, busy, onYes, onNo }: ConfirmSendProps) {
  const review = M.reviewOf(draft);
  // Who it reaches where the workspace counted it; asked without a number where nothing counts it (news to a list).
  const reaches = review ? review.can : (draft.reach?.can ?? null);
  const goes = M.sendsAt(tz, Date.now());
  const when = goes.moved ? W.confirm.opens(goes.time) : W.confirm.at(goes.time);
  const detail = [byWords(draft), when, W.confirm.after].filter(Boolean).join(". ");
  return cmFootAsk(
    <Confirm
      question={reaches === null ? W.confirm.titleNow(draft.name) : W.confirm.title(draft.name, reaches)}
      detail={`${detail}.`}
      yes={W.confirm.yes}
      no={W.confirm.no}
      busy={busy}
      onYes={onYes}
      onNo={onNo}
      docked
      testid="sq-nw-send"
    />,
  );
}

/** What the foot says before its act: what still stops it, or who it reaches and when. */
function footLineOf(
  draft: NewDraftDto,
  tz: string,
  at: M.FootReads,
): { lead: string; sub: string | null; quiet: boolean } {
  const stop = M.notReady(draft, at);
  if (stop) return { ...stop, quiet: false };
  // A sequence's line only says when it begins, which a phone's foot leaves to its two acts (the canvas's phone boards).
  if (draft.kind === "sequence")
    return {
      lead:
        draft.audience === "leads"
          ? W.draft.leadsWait
          : W.draft.firstBatch(M.firstBatchWords(draft.run_hour, localHour(tz, new Date()))),
      sub: null,
      quiet: true,
    };
  const count = draft.reach?.can ?? null;
  if (draft.audience === "leads")
    return count === null
      ? { lead: W.draft.leadsWait, sub: null, quiet: false }
      : { lead: W.draft.businesses(count), sub: W.draft.leadsWait, quiet: false };
  const review = M.reviewOf(draft);
  if (review && review.only > 0)
    return { lead: W.review.goes(review.can, review.others), sub: W.review.leftOut(review.only), quiet: false };
  const when = draft.at ? W.draft.goesAt(M.atWords(draft.at)) : M.goesSoonWords(tz, Date.now());
  return count === null
    ? { lead: when, sub: null, quiet: false }
    : { lead: W.draft.people(count), sub: when, quiet: false };
}

/** A draft to leads with no mailbox to send it: the foot's one act is the way to one. */
const needsMailbox = (d: NewDraftDto): boolean => d.audience === "leads" && !!d.mailbox && !d.mailbox.label;

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
function ActFoot(props: {
  draft: NewDraftDto;
  tz: string;
  at: M.FootReads;
  busy: boolean;
  doing: string | null;
  onMake: (start: boolean) => void;
  onSendNow: () => void;
  onConnect: () => void;
}) {
  const { draft } = props;
  const busy = props.busy || !!props.doing;
  const stop = props.doing ? { lead: props.doing, sub: null } : M.notReady(draft, props.at);
  const line = props.doing ? { lead: props.doing, sub: null, quiet: false } : footLineOf(draft, props.tz, props.at);
  const act = actOf(draft, props.onMake, props.onSendNow);
  // Keep beside Start once nothing but a pause stops it.
  const pair = draft.kind === "sequence" && !props.doing && !M.notReady(draft, { ...props.at, paused: false });
  return (
    <div className="sq-nw-foot" data-foot-pair={pair ? "" : undefined}>
      <p className={line.quiet ? "sq-nw-foot-line is-quiet" : "sq-nw-foot-line"}>
        <b>{line.lead}</b>
        {line.sub ? <small>{line.sub}</small> : null}
      </p>
      {pair ? (
        <Button onClick={() => props.onMake(false)} disabled={busy} data-testid="sq-nw-keep">
          {W.draft.keep}
        </Button>
      ) : null}
      {needsMailbox(draft) ? (
        <Button
          variant="primary"
          onClick={props.onConnect}
          disabled={busy}
          data-testid="sq-nw-connect"
          {...gate("settings", "connect a mailbox")}
        >
          {W.sheets.connect}
        </Button>
      ) : (
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
      )}
    </div>
  );
}

/**
 * The draft's foot as the pane draws it: its act with what it reaches and when, or, while Send now is asked, its
 * question in the act's place.
 */
export function DraftFoot(props: {
  draft: NewDraftDto;
  tz: string;
  at: M.FootReads;
  busy: boolean;
  doing: string | null;
  /** Send now's question is asked: it stands in the act's place until it is answered or put away. */
  confirming: boolean;
  onConfirming: (asked: boolean) => void;
  onMake: (start: boolean) => void;
  onConnect: () => void;
}) {
  if (props.confirming)
    return (
      <ConfirmSend
        draft={props.draft}
        tz={props.tz}
        busy={props.busy}
        onYes={() => {
          props.onConfirming(false);
          props.onMake(true);
        }}
        onNo={() => props.onConfirming(false)}
      />
    );
  return (
    <ActFoot
      draft={props.draft}
      tz={props.tz}
      at={props.at}
      busy={props.busy}
      doing={props.doing}
      onMake={props.onMake}
      onSendNow={() => props.onConfirming(true)}
      onConnect={props.onConnect}
    />
  );
}
